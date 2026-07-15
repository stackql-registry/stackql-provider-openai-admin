# Engineering Notes

Working notes for the `openai_admin` provider. Each item records what was investigated, the evidence, and what remains open. The archetype and closest peer is the sibling `openai` build (`../stackql-provider-openai`) - same spec source, toolchain, pipeline stages, and layout; its findings are reused, not re-derived (spec pin, list envelope, derived-cursor engine analysis, blocked-on-key pattern, normalize/generate mechanics). Other siblings: anthropic_admin (the admin surface shape - report row projection, array-param behaviour, cursor policies), openrouter (key-class documentation treatment), keycloak (REPLACE-vs-UPDATE warning).

## 1. Credential status and the blocked-on-key posture (tasks 3, 4, 8)

Neither `OPENAI_ADMIN_KEY` nor `OPENAI_API_KEY` is present on this machine (process, user, and machine env scopes checked; no `.env` here or in the sibling repos beyond anthropic's own key - re-confirming the openai build's section 1 finding from the same day). The nvidia/vsphere blocked-on-key pattern applies: every offline phase is complete and proven; the live legs are encoded as one deterministic runbook, `provider-dev/scripts/live_evidence.mjs`, which exits `BLOCKED` today and executes unchanged once keys land. Its probes:

1. **key-class** (task 3) - admin key against `GET /organization/projects` (expect 200); standard key against the same endpoint (expect 401, error captured for the docs' key-class treatment per the openrouter pattern); admin key against `GET /models` (expect 401 - the classes are disjoint in both directions).
2. **bucketed** (task 4a) - `/organization/usage/completions` with `start_time` (30 days back), `bucket_width=1d`, `group_by=project_id&group_by=model` (the form-explode array encoding), `limit=7`; `next_page` traversal to exhaustion; bucket shape captured; a bracketed `group_by[]=` negative control recorded alongside.
3. **directory** (task 4b) - `/organization/projects?limit=1`, `after` fed from the prior page's `last_id`, terminal-page shape captured.
4. **audit-filter** - `effective_at[gt]` and `event_types[]` pass-through on `/organization/audit_logs`.
5. **lifecycle** (task 8, `--lifecycle` opt-in) - create `stackql-smoke-<stamp>` project -> add a service account -> archive the project, all within the run; archive-based disposal (no project delete exists in the API).

Captures land in `provider-dev/evidence/` with credentials redacted. Nothing in the runbook consumes tokens.

## 2. Spec pin and the inverse filter (task 2)

**Pin.** `openai/openai-openapi` at ref `a3276900e58b8b2a92e0cb087cd2e6e005f58458` (2026-07-14) - the same ref and sha256 (`74cbcf73...d4f5f8b`) the sibling openai build pins, recorded independently in `provider-dev/config/spec_pin.json`. openapi 3.1.0, info.version 2.3.0, 162 paths / 242 operations; swagger-parser 12.x validates clean. `npm run fetch-spec -- --check` is the drift hook.

**Filter** (`clean_specs.mjs`, keep-rules-first, every path dispositioned in `filter_report.csv`): 162 paths / 242 ops -> **52 paths / 81 ops**.

- kept `organization-subtree`: 46 paths / 71 ops
- kept `admin-key-class-outside-organization`: 6 paths / 10 ops - the `/projects/{project_id}` role/group family (see Open 2)
- removed `platform-surface` 59 paths / 100 ops (the sibling's kept set), `data-plane-inference` 38/47, `binary-transfer` 6/6, `beta-ui-surface` 5/6, `alpha-unstable` 2/2

The partition reconciles exactly against the sibling's `filter_report.csv`: our kept set equals its `org-admin-surface` bucket, our `platform-surface` equals its kept set, and the jointly-excluded categories match path-for-path. The validator fails the run if any keep rule matches nothing, if any `/organization` path is removed, or if any non-admin path survives.

Two deterministic tag repairs before split: the 4 untagged `admin_api_keys` ops are stamped `Admin API Keys`, and `GET /organization/costs` is re-tagged `Usage` -> `Costs` (costs is its own service in the agreed split).

## 3. Key class (task 3) - spec and docs evidence; wire proof owed

The pinned spec's securitySchemes declare bearer auth; the vendor's admin endpoints document the admin key class (`sk-admin-...`), created by organization owners, disjoint from standard keys (`sk-...`). The provider config will be `auth: {type: bearer, credentialsenvvar: OPENAI_ADMIN_KEY}` (the sibling uses the same mechanism with `OPENAI_API_KEY`). The docs treatment follows openrouter: one env var, the key class explained plainly, the applicability note (organizations, not individual accounts) up front. The live accept/reject pair is runbook probe 1 - recorded as owed evidence, not assumed.

## 4. Pagination: two idioms, two configs (task 4)

**Bucketed (usage and costs - 9 list operations).** Envelope from the pin: `{object: "page", data: [bucket], has_more, next_page}`, all four properties required at the top level; each bucket is `{object: "bucket", start_time, end_time, results: []}` (all required). Request params: `start_time` (required, epoch seconds), `end_time`, `bucket_width` (`1m|1h|1d`, default `1d`; costs allows only `1d`), scope filters (`project_ids`, `api_key_ids`, ..., plain non-bracketed arrays), `group_by`, `limit` (bucket count per page), `page` (the continuation token). The config is the anthropic_admin cursor shape exactly:

```yaml
x-stackQL-config:
  pagination:
    requestToken:
      key: page
      location: query
    responseToken:
      key: $.next_page
      location: body
```

The stackql engine mechanics were verified by the sibling openai build (its NOTES section 3, reused): `requestToken` is applied verbatim as a query param, `responseToken` extracts by JSONPath, and termination fires on empty/`<nil>` extraction - a null or absent `next_page` on the last page terminates cleanly with no overshoot (this idiom carries a real next-token field, unlike the derived cursor). anthropic_admin's usage/cost reports run the same `page`/`next_page` shape in production with pagination config on - the policy transfers. Wire traversal is runbook probe 2.

**Cursor-derived (the classic OpenAI list envelope - 11 list operations).** Envelope from the pin: `{object: "list", data, first_id, last_id, has_more}` with `limit`/`after` request params (audit_logs adds `before`; projects adds `include_archived`). No dedicated next-token field - the derived cursor is the sibling's finding, reused not re-derived: `requestToken: {key: after, location: query}` fed from `responseToken: {key: $.last_id, location: body}`; `has_more` is not consumable by the engine (any-sdk `responseTerminator` exists in config vocabulary but nothing in the stackql loop reads it); termination happens via one empty overshoot request per full listing (`data: []`, `last_id` null/absent -> token extraction yields `<nil>`/`""` -> loop ends). Accepted cost, documented; the engine ticket for `responseTerminator` is the sibling's follow-up. Applies to: projects (projects, api_keys, service_accounts, users, rate_limits), users.users, invites, admin_api_keys, audit_logs, certificates (both resources).

**Cursor-next (the RBAC family - 9 list operations) - a third idiom, corrected from the phase 1 draft.** The initial pass classified every non-bucketed list as one "directory" idiom on the presence of `has_more`. That was wrong, and the generate stage surfaced it: the RBAC family returns `{object: "list", data, has_more, next}` - **no `first_id`/`last_id`** - where `next` is documented as "Cursor to fetch the next page of results, or `null` if there are no more results" and is fed back through the same `after` request param. This is a better contract than the derived cursor: an explicit token that nulls out on the last page, so traversal terminates with **no overshoot request**. Config: `requestToken: {key: after, location: query}`, `responseToken: {key: $.next, location: body}`. Applies to: groups (groups, users, role_assignments), roles (roles, project_roles), projects (groups, group_role_assignments, user_role_assignments), users.role_assignments.

The idiom is now derived structurally in `build_inventory.mjs` from the response envelope's cursor field (`next_page` -> bucketed, `last_id` -> cursor-derived, `next` -> cursor-next), never from a hand list, and a list envelope carrying none of the three fails the run rather than silently shipping as first-page-only. Per operation in `endpoint_inventory.csv` (`idiom` column): 9 bucketed, 11 cursor-derived, 9 cursor-next, 52 single/action.

**Config placement: service-level default, method-level override.** Two services mix idioms - `projects` (5 cursor-derived resources + 3 cursor-next) and `users` (users cursor-derived, role_assignments cursor-next) - so a single service-level config cannot cover them. any-sdk resolves pagination config through a chain: **operation -> resource -> service -> providerService -> provider** (`internal/anysdk/operation_store.go:600-660` at `eff549b`, each level falling through to the next when unset), and an operation's config is the `config:` key on the method in `x-stackQL-resources` (`standardOpenAPIOperationStore.StackQLConfig`, yaml key `config`, `operation_store.go:177`). So `post_process.mjs` stamps the dominant idiom's config at service level (`x-stackQL-config`) and the deviating methods' config at method level, driven by the inventory's `idiom` column - 6 method-level overrides against this pin. Provider-level inheritance is not used (broken in any-sdk - the standing finding). Wire traversal for all three idioms is owed on key (runbook probes 2 and 3).

## 5. Bucket projection: row per bucket, results as JSON (task 5)

Decided on two pieces of evidence, applied uniformly across all 9 usage/costs resources:

1. **The result items carry no time fields.** From the pin: `UsageCompletionsResult` projects `object, input_tokens, input_cached_tokens, output_tokens, input_audio_tokens, output_audio_tokens, num_model_requests` plus the group-by dimensions (`project_id, user_id, api_key_id, model, batch, service_tier`, populated only when grouped); `CostsResult` projects `object, amount {value, currency}, line_item, project_id, api_key_id, quantity`. Neither carries `start_time`/`end_time` - those live only on the enclosing bucket.
2. **objectKey cannot flatten parent fields onto child rows.** anthropic_admin resolved this empirically on its identically-shaped reports (its resolved question (a), reused): `$.data[*].results[*]` does produce a row per bucket x group and auto-pagination still walks, but the rows lose the bucket's time fields - which are the x-axis of every usage and cost query.

So the flattened-result-row projection contemplated in CLAUDE.md is not expressible at the objectKey layer without losing the time axis; the honest projection is **`objectKey: $.data` - one row per time bucket** (`start_time`, `end_time`, `results` as a JSON column), with group breakdowns fanned out in SQL via `json_each(results)`. This is also exactly the anthropic_admin shape, which keeps the four-way flagship union symmetric. A phase 2 convenience view per usage resource (bucket fields joined onto fanned-out results - the anthropic `vw_model_capabilities` mechanism) is the natural sugar on top; recorded as the docs-phase plan, not a phase 1 gate.

## 6. `group_by` on the wire (task 4a, continued)

The flagship parameter is wire-named **`group_by`** - plain, no bracket suffix (the anthropic API's `group_by[]` spelling does not apply here; CLAUDE.md's `group_by[]` shorthand should be read as this parameter). Declared in the pin as a query array with default style/explode (form + explode=true -> `group_by=project_id&group_by=model`). Enum per resource: usage takes `project_id, user_id, api_key_id, model, batch` (+ `service_tier` on completions); costs takes `project_id, line_item, api_key_id`.

**The single-scalar constraint transfers.** anthropic_admin's resolved question (b): a stackql array-typed query param takes one scalar per query - a JSON-array value does not fan out (it arrives as the literal string). So `WHERE group_by = 'project_id'` reaches the wire correctly, but grouping by two dimensions in one SQL query is not expressible through a single scalar equality. This is the one place the SQL surface is narrower than the API. Posture, pending the live probe: document single-dimension grouping as the supported WHERE shape; whether a comma-joined or JSON-array value happens to be accepted by the OpenAI API (it tolerates some alternate encodings on other params) is captured by runbook probe 2's negative controls before the docs commit to more. The result items carry all group-by dimensions as nullable fields either way, so the flagship queries group by one dimension per leg and join in SQL when they need two.

Audit logs are the opposite case: their filter params are bracket-named on the wire (`effective_at[gt]`, `event_types[]`, `project_ids[]`, ...) - these pass through as-is and must be double-quoted in SQL (anthropic finding: backticks are a parser error for bracketed identifiers; double quotes parse and route).

## 7. Update semantics (keycloak warning) - spec evidence recorded, wire probes owed

All 8 update-POSTs are labelled `UPDATE`, none `REPLACE`. Body-schema evidence from the pin (recorded per op in `endpoint_inventory.csv`):

- **Partial by construction (zero required body properties):** `modify-project` (name, external_key_id, geography), `modify-user` (role), `modify-project-user` (role), `update-project-rate-limits` (six limit fields), `update-role`, `update-project-role`.
- **Rename-only (the body is exactly the field being set, required):** `update-group` (`{name}` required), `modifyCertificate` (`{name}` required). These cannot drop omitted fields because there are none to drop.

The OpenAI convention ("only fields provided are updated") matches the vendor's modify-* documentation. Wire-level omitted-field-preservation probes (the keycloak method: update one field, assert the others unchanged) fold into the blocked-on-key runbook for `projects.update` and `rate_limits.update` before generation ships.

## 8. Endpoint inventory and the service split (tasks 6, 7)

`build_inventory.mjs` over the filtered spec -> `endpoint_inventory.csv`: **81 operations, all mapped, none skipped; 29 resources across 10 services** (select 37, insert 15, update 8, delete 16, exec 5). The 5 execs are the lifecycle actions: `projects.archive`, certificate `activate`/`deactivate` at org and project scope. 9 ops carry `group_by`; 27 carry request bodies.

**Service split (recorded in `service_names.json`; CLAUDE.md candidates adjusted on subtree evidence):**

- `usage` (8): audio_speeches, audio_transcriptions, code_interpreter_sessions, completions, embeddings, images, moderations, vector_stores
- `costs` (1): costs
- `projects` (8): projects, api_keys, service_accounts, users, rate_limits, groups, group_role_assignments, user_role_assignments
- `users` (2): users, role_assignments
- `invites` (1): invites
- `groups` (3): groups, users, role_assignments
- `roles` (2): roles, project_roles
- `admin_api_keys` (1): admin_api_keys
- `audit_logs` (1): audit_logs
- `certificates` (2): certificates, project_certificates

Deltas from the CLAUDE.md candidate list, all evidence-driven: `groups` and `roles` added (the pin carries a full RBAC surface - org and project role definitions plus user/group role assignments at both scopes - absent from the candidate list); certificates confirmed exposed (10 ops, both scopes); the usage capabilities enumerate as 8, with audio split into speeches and transcriptions (not one `audio` resource) and no usage endpoints for requests/realtime/fine-tuning in this pin. The split is tag-discriminated: 15 fine-grained upstream tags (+1 stamped) consolidate through `service_names.json`; per-service op counts after split reconcile 1:1 with the inventory (81 total).

## 9. Pilot mapping - GREEN (task 8)

Split (10 services) -> `generate-mappings` (analyze; the keycloak "delete `all_services.csv` before re-run" carry-over applies) -> `map_operations.mjs`. The mapper's rule table IS `endpoint_inventory.csv` joined by operationId - one source of truth. All validations pass: coverage both directions, unique (service, resource, method), unique path-param signatures per (resource, SQL verb) (exec excluded), and `$.data` on every list.

- `usage` + `costs` (bucketed flagship): 9 SELECT-only resources, `$.data` object key per the section 5 decision, `group_by` documented pass-through, pagination config per section 4
- `projects` (directory idiom + the governance surface): full project lifecycle (`create`/`get`/`list`/`update` + `archive` EXEC - disposal is archive-based, no delete exists), service accounts (create returns the API key once - flagged), project users, api_keys (list/get/delete only - no create exists, keys come from service accounts or the console), rate_limits (list/update), project groups and the two role-assignment resources
- `audit_logs` (derived cursor + filter pass-through): single SELECT resource, bracketed filter params documented per section 6

The live governance lifecycle (create -> service account -> archive within the run) is runbook probe 5, blocked on key.

## 10. Zero-activity and skip-with-notice posture (task 9)

- **Zero-activity orgs**: usage/costs on an org with no historical API activity return `data: []` or buckets with empty `results` - both valid result sets (empty rows, not errors). The smoke asserts shape, not row counts. Live capture owed with the key.
- **Skip-with-notice**: where an org lacks a surface (e.g. certificates or the RBAC family not enabled for the account tier, or an individual account with no admin surface at all), smokes record the 401/403/404 evidence and skip with notice rather than fail - the anthropic_admin convention. The applicability note states this up front in README and docs.
- **Rate limits and pacing - nothing observed** (no live calls this session; blocked on key). Posture for the smoke design: <= 1 request/second, honor `Retry-After` on 429, never parallelize writes. To be replaced with observed numbers when the key lands.

## 11. The four-way token-spend flagship (docs acceptance artifact, draft)

Against this build's actual resource names; anthropic_admin's published names; openrouter and google legs marked where their resource names are finalized in their own repos. One row per vendor x project/workspace x model x day; cost legs and token legs are separate surfaces on the two admin providers, so the draft leads with the token-spend union and shows the cost join after.

```sql
-- LLM token spend by vendor, project/workspace, model, and day
SELECT
  'openai' AS vendor,
  json_extract(r.value, '$.project_id') AS project,
  json_extract(r.value, '$.model') AS model,
  date(u.start_time, 'unixepoch') AS usage_date,
  json_extract(r.value, '$.input_tokens') AS input_tokens,
  json_extract(r.value, '$.output_tokens') AS output_tokens
FROM openai_admin.usage.completions u, json_each(u.results) r
WHERE u.start_time = strftime('%s', date('now', '-30 days'))
  AND u.bucket_width = '1d'
  AND u.group_by = 'project_id'          -- one grouping dimension per leg (section 6)
UNION ALL
SELECT
  'anthropic' AS vendor,
  json_extract(r.value, '$.workspace_id') AS project,
  json_extract(r.value, '$.model') AS model,
  date(u.starting_at) AS usage_date,
  json_extract(r.value, '$.input_tokens') AS input_tokens,
  json_extract(r.value, '$.output_tokens') AS output_tokens
FROM anthropic_admin.usage.usage_reports u, json_each(u.results) r
WHERE u.starting_at = date('now', '-30 days')
  AND u.bucket_width = '1d'
  AND "group_by[]" = 'workspace_id'      -- anthropic wire spelling; double-quoted (bracketed identifier)
UNION ALL
SELECT
  'openrouter' AS vendor,
  NULL AS project,
  a.model AS model,
  a.date AS usage_date,
  a.prompt_tokens AS input_tokens,
  a.completion_tokens AS output_tokens
FROM openrouter.activity.activity a      -- daily per-model rows; names per the openrouter build
UNION ALL
SELECT
  'google' AS vendor,
  b.project_id AS project,
  b.sku_description AS model,            -- Gemini SKUs; the google billing leg's resource
  b.usage_date,                          -- names are finalized against the google provider's
  b.input_tokens, b.output_tokens        -- billing surface in the docs phase
FROM google_billing_gemini_leg b
ORDER BY usage_date, vendor, project, model;

-- cost (USD) sidecar for the openai leg: daily buckets from openai_admin.costs.costs,
-- json_each(results) -> json_extract('$.amount.value'), '$.line_item', '$.project_id',
-- grouped by project_id; joined to the usage leg on (project, usage_date) in SQL.
```

The openai_admin and anthropic_admin legs are concrete against generated resource names; the openrouter leg follows that build's phase 1 names; the google leg is the one placeholder, resolved when the Gemini billing surface is mapped. The acceptance run (all four legs live) is a docs-phase gate, blocked on the same keys as everything else here.

## Open

1. **Live runbooks blocked on `OPENAI_ADMIN_KEY` (+ `OPENAI_API_KEY` for the rejection pair)** - the section 1 runbook: key-class accept/reject, bucketed `group_by` traversal with array-encoding controls, directory derived-cursor traversal, audit filter pass-through, the `--lifecycle` governance run, update-POST field-preservation probes, rate-limit observation, zero-activity capture. All other phase 1 results are offline-proven; these execute unchanged when keys are present.
2. **The six `/projects/{project_id}` role/group paths** - outside the `/organization` subtree, but the same admin key class, and the sibling openai build's filter explicitly dispatches them here (its `filter_report.csv`, reason `org-admin-surface`). Kept, with their own keep code (`admin-key-class-outside-organization`) so a maintainer reversal is a one-line rule change. Excluding them would orphan the family - neither provider would carry it. Strike this item if the maintainer concurs; CLAUDE.md's scope sentence tightens to match either way.
3. **Multi-dimension `group_by` through stackql** - the API takes repeated `group_by` params; stackql array query params take one scalar per query (anthropic finding (b), expected to transfer). Single-dimension grouping is the documented posture; probe 2's negative controls (bracketed and JSON-array encodings) settle whether anything richer is honestly expressible. Low priority - the result items carry all dimensions, so two-dimension questions resolve with json_extract + SQL grouping.
4. **`service_tier` group-by is completions-only** - the enum on the other usage resources omits it. Documented per resource from the inventory; no decision needed.
5. **Convenience views for bucket fan-out** - one view per usage/costs resource projecting bucket time fields onto json_each'd result rows (the anthropic views mechanism, `generate --views-dir`). Docs-phase work; the base-table shape ships per section 5 regardless.
6. **openapi 3.1.0 through normalize/generate** - unexercised here as in the sibling (its Open 6); any breakage lands as deterministic downgrades in a `pre_normalize.mjs`. Phase 2.
7. **`analyze` appends to an existing `all_services.csv`** - keycloak carry-over, still true in provider-utils 0.7.6; delete before re-running `generate-mappings`. Candidate upstream fix.
