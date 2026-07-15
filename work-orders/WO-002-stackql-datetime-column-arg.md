# WO-002 - stackql: `date()` / `datetime()` / `typeof()` return 0 for a bare column argument

- **Repo**: `stackql/stackql`
- **Type**: bug
- **Raised from**: `stackql-registry/stackql-provider-openai-admin`, 2026-07-16
- **Version**: stackql v0.10.542 (`2a0297b`), sqlite3 backend, local file registry
- **Impact**: epoch-timestamp columns cannot be converted with the obvious function; silent wrong answers, not errors

## Summary

`datetime(<column>, 'unixepoch')` evaluates to `0` instead of the timestamp. The same call with a literal argument works, and the same column wrapped in any expression works. So the function and the modifier are fine - a **bare column reference in the first argument position** is not being resolved for this small set of functions. It fails silently (`0` / `null`), which makes it a wrong-answer bug rather than a loud one.

## Reproduction

Any provider with an integer column. Below is `openai_admin.costs.costs`, where `start_time` is Unix epoch seconds (`1781481600`). Each expression was run in **its own query** - see "Contagion" below for why that matters.

```sql
SELECT datetime(start_time, 'unixepoch') AS v
FROM openai_admin.costs.costs
WHERE start_time = 1781481600 AND "limit" = 180;
```

| expression | result | |
|---|---|---|
| `start_time` | `1781481600` | the raw column |
| `datetime(1781481600, 'unixepoch')` | `2026-06-15 00:00:00` | literal arg - correct |
| `datetime(start_time, 'unixepoch')` | **`0`** | bare column - **wrong** |
| `date(start_time, 'unixepoch')` | **`0`** | bare column - **wrong** |
| `typeof(start_time)` | **`0`** | bare column - **wrong** (expected `integer`) |
| `datetime(start_time + 0, 'unixepoch')` | `2026-06-15 00:00:00` | column in an expression - correct |
| `strftime('%Y-%m-%d', start_time, 'unixepoch')` | `2026-06-15` | column in arg 2 - correct |

The defect is narrow. A bare column in argument 1 is resolved correctly by every other function tried:

| expression | result |
|---|---|
| `abs(start_time)` | `1781481600` |
| `max(start_time, 0)` | `1781481600` |
| `coalesce(start_time, 0)` | `1781481600` |
| `upper(object)` | `BUCKET` |
| `length(object)` | `6` |
| `json_extract(results, '$[0].line_item')` | `gpt-4o` |

So it is not "arg 1 columns are broken" generally, and not the `'unixepoch'` modifier: it is `date` / `datetime` / `typeof` specifically, only when the argument is a bare `ColName`.

## Contagion (makes it worse than it looks)

An affected call does not only break its own column - it nulls out **other computed columns in the same projection**. In one SELECT carrying `date(start_time,'unixepoch')`, `datetime(start_time,'unixepoch')` and `strftime('%Y-%m-%d', start_time,'unixepoch')`, the `strftime` column returned `null` despite returning `2026-06-15` when selected on its own. Adding `typeof(start_time)` to a projection nulled every other computed column in it, including a `datetime()` call with a literal argument that was correct without it.

So a single bad call silently corrupts neighbouring, otherwise-correct columns. That is how this was found: the failure looked like `json_extract` being broken, when `json_extract` was fine and a neighbouring `date()` was the cause.

## Expected

`datetime(start_time, 'unixepoch')` returns `2026-06-15 00:00:00`, matching both `datetime(1781481600, 'unixepoch')` and `datetime(start_time + 0, 'unixepoch')`. Likewise `date()` and `typeof()`. Failing that, an error - never a silent `0`, and never nulling a neighbouring column.

## Investigation notes (starting points, not a diagnosis)

- **The functions are stock SQLite, not ours.** `date`, `datetime`, `strftime` and `typeof` are SQLite builtins reached through the vendored driver (`stackql-go-sqlite3`); `sqlite-ext-functions` vendors `regexp`, `json_equal`, `split_part` and `aws_policy_equal`, none of which touch these. Stock SQLite evaluates `datetime(<column>, 'unixepoch')` correctly, so the implementation is not the suspect - what reaches it is.
- The projection path runs `*sqlparser.FuncExpr` through `GetASTFuncRewriter().RewriteFunc(node)` (`internal/stackql/astanalysis/earlyanalysis/ast_expand.go:1150`). The rewriters (`internal/stackql/astfuncrewrite/astfuncrewrite.go`) are dialect shims - `nop` and `postgres`/`json_extract` - with nothing date-specific, so the rewrite layer looks unlikely on the sqlite3 backend. No pushdown allowlist gates which functions are eligible.
- The sharpest clue is that `datetime(start_time + 0, ...)` succeeds where `datetime(start_time, ...)` fails: a bare `ColName` argument takes a different path from an expression-wrapped one. Dumping the SQL actually issued to SQLite for `abs(<ColName>)` (works) versus `datetime(<ColName>, ...)` (fails) should isolate it immediately - the expectation is that the column reference is not being carried into the rendered projection for the failing case.
- The contagion suggests the failure happens while building the projection for the whole select, not per column.

## Acceptance criteria

- `datetime(<int column>, 'unixepoch')`, `date(<int column>, 'unixepoch')` and `typeof(<column>)` return correct values.
- A projection mixing these with `strftime` / `json_extract` returns every column correctly - no contagion.
- Regression test over a projection with a bare-column date conversion alongside other computed columns.

## Downstream state while this is open

`openai_admin` documents `strftime('%Y-%m-%d', <epoch column>, 'unixepoch')` for bucket timestamps, which is correct today and stays correct after a fix. `datetime(<column> + 0, 'unixepoch')` is the equivalent workaround where a datetime is wanted. No provider change is needed when this lands.
