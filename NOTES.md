# Engineering Notes

Working notes for the `openai_admin` provider. Each item records what was investigated, the evidence, and what remains open. The archetype and closest peer is the sibling `openai` build (`../stackql-provider-openai`) - same spec source, toolchain, pipeline stages, and layout; its findings are reused, not re-derived (spec pin, list envelope, derived-cursor engine analysis, blocked-on-key pattern, normalize/generate mechanics). Other siblings: anthropic_admin (the admin surface shape - report row projection, array-param behaviour, cursor policies), openrouter (key-class documentation treatment), keycloak (REPLACE-vs-UPDATE warning).

## 1. Credential status and the blocked-on-key posture

Neither `OPENAI_ADMIN_KEY` nor `OPENAI_API_KEY` was present on this machine while the provider was built (process, user, and machine env scopes checked; no `.env` here or in the sibling repos beyond anthropic's own key). The nvidia/vsphere blocked-on-key pattern applies, and it constrained less than expected: everything except the actual API responses is proven, because a dummy key still exercises parse -> bind -> route -> send (section 9) and yields real wire captures (section 6).

**Proven without a key:** the spec pin and inverse filter; the endpoint inventory; the service split; the mapping; normalize; generation; offline resolution (`SHOW`/`DESCRIBE`); the meta-routes walk; the bucket projection through to generated columns; the `group_by` and bracketed-filter wire encodings; that all three pagination idioms parse, bind, route and send with the bearer header attached.

**Owed on a key** (what only real responses can settle): that the admin key is accepted and a standard key rejected; that each cursor config actually *traverses* multi-page data; the bucket payload shape and zero-activity behaviour; update-POST field preservation; observed rate limits; the governance lifecycle end to end. Two artifacts cover these, and both run unchanged the moment a key lands:

- **`tests/smoke_test.py`** - the provider-routed suite (section 10). This is the primary artifact now that the provider exists.
- **`provider-dev/scripts/live_evidence.mjs`** - raw-HTTP probes that capture evidence *below* the provider (redacted JSON into `provider-dev/evidence/`). Useful for documenting the API's own behaviour independently of stackql; the smoke suite is what gates the build. Its probes:

1. **key-class** - admin key against `GET /organization/projects` (expect 200); standard key against the same endpoint (expect 401, error captured for the docs' key-class treatment per the openrouter pattern); admin key against `GET /models` (expect 401 - the classes are disjoint in both directions).
2. **bucketed** - `/organization/usage/completions` with `start_time` (30 days back), `bucket_width=1d`, `group_by=project_id&group_by=model` (the repeated-param form the API itself accepts, which the provider cannot emit - see section 6), `limit=7`; `next_page` traversal to exhaustion; bucket shape captured.
3. **directory** - `/organization/projects?limit=1`, `after` fed from the prior page's `last_id`, terminal-page shape captured (the empty-overshoot page the engine relies on to terminate).
4. **audit-filter** - `effective_at[gt]` and `event_types[]` pass-through on `/organization/audit_logs`.
5. **lifecycle** (`--lifecycle` opt-in) - create `stackql-smoke-<stamp>` project -> add a service account -> archive the project, all within the run; archive-based disposal (no project delete exists in the API).

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

## 4. Pagination: three idioms, three configs

**Bucketed (usage and costs - 9 list operations).** *(Configured correctly per the spec, but auto-pagination is broken against the live API by an upstream token-encoding bug - see section 12b; keep windows inside one page with `limit`.)* Envelope from the pin: `{object: "page", data: [bucket], has_more, next_page}`, all four properties required at the top level; each bucket is `{object: "bucket", start_time, end_time, results: []}` (all required). Request params: `start_time` (required, epoch seconds), `end_time`, `bucket_width` (`1m|1h|1d`, default `1d`; costs allows only `1d`), scope filters (`project_ids`, `api_key_ids`, ..., plain non-bracketed arrays), `group_by`, `limit` (bucket count per page), `page` (the continuation token). The config is the anthropic_admin cursor shape exactly:

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

So the flattened-result-row projection contemplated in CLAUDE.md is not expressible at the objectKey layer without losing the time axis; the honest projection is **`objectKey: $.data` - one row per time bucket** (`start_time`, `end_time`, `results` as a JSON column), with group breakdowns fanned out in SQL via `json_each(results)`. This is also exactly the anthropic_admin shape, which keeps the four-way flagship union symmetric. A convenience view per usage resource (bucket fields joined onto fanned-out results - the anthropic views mechanism, `generate --views-dir`) is the natural sugar on top; recorded as follow-up work, not a ship gate.

**Confirmed through generation.** `DESCRIBE openai_admin.usage.completions` against the generated provider projects exactly four columns - `start_time` (integer), `end_time` (integer), `object` (string), `results` (array) - so the decision survives normalize and generate intact. The 9-member `oneOf` under `results.items` (the per-capability result variants) stays nested inside the JSON column, which is where it belongs: `lower_residual_variants.mjs` correctly leaves it alone because `results` itself carries no variant keyword at the column site, and normalize reports zero residual unions.

## 6. `group_by` on the wire (task 4a, continued)

The flagship parameter is wire-named **`group_by`** - plain, no bracket suffix (the anthropic API's `group_by[]` spelling does not apply here; CLAUDE.md's `group_by[]` shorthand should be read as this parameter). Declared in the pin as a query array with default style/explode (form + explode=true -> `group_by=project_id&group_by=model`). Enum per resource: usage takes `project_id, user_id, api_key_id, model, batch` (+ `service_tier` on completions); costs takes `project_id, line_item, api_key_id`.

**The single-scalar constraint transfers - now wire-confirmed, not inferred.** Captured against the generated provider with `stackql --http.log.enabled` and a dummy key (the request is built and sent before auth fails, so the URL is real evidence without a live key):

| SQL predicate | URL emitted |
|---|---|
| `group_by = 'project_id'` | `...?bucket_width=1d&group_by=project_id&start_time=...` |
| `group_by = '["project_id","model"]'` | `...?group_by=%5B%22project_id%22%2C%22model%22%5D&...` |
| `group_by = 'project_id,model'` | `...?group_by=project_id%2Cmodel&...` |
| `project_ids = 'proj_abc'` | `...?project_ids=proj_abc&...` |

A single scalar reaches the wire in the exact form the API documents (`group_by=project_id` - form-encoded, and note the OpenAI delta: the wire name is plain `group_by`, not anthropic's `group_by[]`). Neither a JSON-array nor a comma-joined value fans out into repeated params - each arrives as one literal string, which the strict enum on this parameter will reject. So anthropic_admin's resolved question (b) transfers exactly: **one grouping dimension per query** is the honest, supported WHERE shape, and it is what the docs state. The result items carry every dimension as a field regardless (`project_id`, `api_key_id`, `model`, `user_id`, `batch`), so two-dimension questions are answered by grouping in SQL over a single-dimension fetch. Live confirmation that the API rejects the non-fanned forms is a nice-to-have, not a gate - the provider never emits them.

Audit logs are the opposite case: their filter params are bracket-named on the wire, and `pre_normalize.mjs` also expands the object-typed `effective_at` into the same shape (section 7a). Wire-captured the same way: `WHERE "effective_at[gt]" = 1750000000 AND "event_types[]" = 'project.created'` emits `?effective_at%5Bgt%5D=1750000000&event_types%5B%5D=project.created` - URL-encoded brackets, which these APIs accept (the anthropic finding). Bracketed identifiers must be double-quoted in SQL; backticks are a stackql parser error for them.

## 7a. The object-typed `effective_at` filter (pre_normalize)

`GET /organization/audit_logs` declares `effective_at` as a **query parameter of `type: object`** with properties gt/gte/lt/lte, and no `style`. Two problems: an object-valued query parameter is not SQL-expressible as a column, and the OpenAPI default for an object query param (form + explode) would serialize it as `?gt=...` - not the `?effective_at[gt]=...` the API documents (deepObject semantics, which the spec never declares).

`pre_normalize.mjs` therefore lifts each property into a discrete scalar parameter named for its literal wire spelling - `effective_at[gt]`, `effective_at[gte]`, `effective_at[lt]`, `effective_at[lte]` - matching how the sibling array filters already ship (`project_ids[]`, `event_types[]`). The rule is generic (any object-typed query parameter is expanded), so a refresh that adds another filter of this shape needs no code change. Wire-verified in section 6. This is the only object-typed query parameter on the surface.

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

## 9. Mapping, normalize and generate - the provider builds

Split (10 services) -> `generate-mappings` (analyze; the keycloak "delete `all_services.csv` before re-run" carry-over applies) -> `map_operations.mjs`. The mapper's rule table IS `endpoint_inventory.csv` joined by operationId - one source of truth. All validations pass: coverage both directions, unique (service, resource, method), unique path-param signatures per (resource, SQL verb) (exec excluded), and `$.data` on every list.

- `usage` + `costs` (bucketed flagship): 9 SELECT-only resources, `$.data` object key per the section 5 decision, `group_by` pass-through, bucketed pagination per section 4
- `projects` (the governance surface): full project lifecycle (`create`/`get`/`list`/`update` + `archive` EXEC - disposal is archive-based, no delete exists), service accounts (create returns the API key once - flagged), project users, api_keys (list/get/delete only - no create exists; keys come from service accounts or the console), rate_limits (list/update), project groups and the two role-assignment resources
- `audit_logs`: single SELECT resource, bracketed filter params per sections 6 and 7a

**Normalize (stage 3).** `pre_normalize.mjs` (section 7a; org/project headers deliberately not injected - see below) -> `normalize` -> `lower_residual_variants.mjs`. Against this pin: 175 allOf flattened, 172 anyOf renamed (all the 3.1 nullable idiom, which resolves to the real type under the first-wins merge), 0 oneOf renamed, 4 opaque objects lowered to string columns, and **zero residual column-site unions** - the lowering pass finds nothing to do, and the only unions left in the tree are nested inside JSON columns where they belong (section 5). No 3.1 array-type nullable sites and no binary request bodies exist here, so both pre_normalize guards are inert against this pin and fail loudly if a refresh introduces either.

**Org/project headers: not injected (a deliberate delta from the sibling).** The sibling `openai` build injects optional `OpenAI-Organization` / `OpenAI-Project` headers on every operation. That is not carried over: an admin key is created by an owner within one organization and every path here is already `/organization/...`, so the key IS the org scope - there is no second organization to select, and no project-scoping semantic on an org-administration call. Project scope on this surface is a path parameter (`/organization/projects/{project_id}/...`).

**Generate (stage 4).** Bearer auth on `OPENAI_ADMIN_KEY`, fixed server `https://api.openai.com/v1` (a literal host - no server variables, so no WHERE server params), `--naive-req-body-translate` so INSERT/UPDATE columns are the native wire names. Then `post_process.mjs` stamps the pagination configs (section 4). The generator's `exec method skipped` log lines for the 5 EXEC methods are expected and benign: EXEC methods are excluded from the `sqlVerbs` routing table (which covers select/insert/update/delete) and dispatch by name - all 5 are present in the generated `methods` blocks and `SHOW METHODS` lists them.

**Offline validation.** The provider resolves with no network: `SHOW SERVICES IN openai_admin` -> 10; `DESCRIBE openai_admin.usage.completions` -> the 4 columns of section 5; `SHOW METHODS IN openai_admin.projects.projects` -> list/get/create/update (SELECT/SELECT/INSERT/UPDATE) + archive (EXEC). The meta-routes suite walks the whole provider clean: **10 services, 29 resources, 81 methods, 37 selectable, 0 non-selectable resources, 0 errors**.

**Routing proven without a live key.** With a dummy `OPENAI_ADMIN_KEY`, every query shape parses, binds its parameters, builds the request and reaches `api.openai.com`, failing only at auth (`401 Incorrect API key provided`) - which also proves the bearer header is being sent. Verified across all three pagination idioms (`projects.projects` cursor-derived, `roles.roles` cursor-next, `usage.completions` bucketed with `group_by`). The wire URLs captured this way are the evidence in section 6.

## 10. Tests

Three layers exist; the fourth (a mock-server integration suite) is the one gap.

1. **Offline validation** - `SHOW`/`DESCRIBE` against a file registry, no network, no key (section 9).
2. **Meta-routes** - `npm run test-meta-routes -- openai_admin`, walks every service/resource/method (section 9). Note: it connects on port 5444 by default; pass `--port` if something else holds it.
3. **Smoke** - `tests/smoke_test.py` (pystackql), live against a real organization, cost-free by default. Steps: resolution; **key-class evidence** (admin key accepted; the same query re-run through the provider with `custom_auth` pointed at `OPENAI_API_KEY` must be rejected - the disjointness proven through the provider, not a side-channel HTTP call); directory reads across the surface; project child reads; **the flagship** (usage buckets, `group_by = 'project_id'`, costs USD buckets, and all 8 usage capabilities answering); **pagination traversal** (a `limit = 1` read must return the same row count as an unbounded one - proves the cursor configs actually walk, for both the cursor-derived and cursor-next idioms); and the opt-in governance lifecycle. Skip-with-notice is built in: 401/403/404 on a family reports SKIP, not FAIL, because an org lacking a surface is an applicability fact rather than a provider defect. Zero-activity orgs pass with 0 buckets.
4. **Integration (mock server) - not built.** The sibling's mock layer has no equivalent here yet. The smoke suite plus the dummy-key routing captures cover most of what it would assert; a mock would add a deterministic, credential-free CI gate (both cursor idioms traversing multi-page, `$.data` unwrapping, the bearer header, `group_by` encoding). Follow-up.

**The governance lifecycle leaves a permanent breadcrumb - hence opt-in.** `--with-lifecycle` creates `stackql-smoke-<stamp>`, adds a service account, renames it, and archives it within the run. The API exposes **no project delete** - archive is terminal - so every lifecycle run leaves one archived project in the organization forever. It is cost-free but not sweepable, so it is off by default; `--cleanup-only` archives any *active* smoke-named leftovers.

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
  strftime('%Y-%m-%d', u.start_time, 'unixepoch') AS usage_date,
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
  u.starting_at AS usage_date,
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

## 12. Live findings from the first real run (2026-07-16)

The first run against a real organization surfaced three things. Two are defects that were fixed; one is an upstream interop bug with a documented workaround.

### 12a. SQL functions do not bind to request parameters - the docs were wrong

Every usage/cost example shipped with `WHERE start_time = strftime('%s', date('now', '-30 days'))`. **This silently sends no `start_time` at all.** Verified with `--http.log.enabled`: the predicate emits `GET /organization/costs?` - the parameter is dropped, not evaluated, and the API then rejects the call for a missing required parameter. StackQL does not evaluate SQL functions when binding HTTP request parameters; only literals bind. (Functions in the SELECT list are fine - they run client-side over the result set, which is why `date(c.start_time, 'unixepoch')` as an output column works.)

The examples were written but never run - the mistake the whole blocked-on-key posture was supposed to prevent, since a dummy key would have caught it in seconds. All examples now use literal epochs and say so. Nothing in the provider changes.

### 12b. Bucketed auto-pagination is broken upstream: the page token's `=` padding

A 30-day cost query paginates (see 12c) and the follow-up request fails:

```
GET /v1/organization/costs?group_by=project_id&start_time=1781481600
  -> 200  next_page: "page_AAAAAGpY30vJnSVZAAAAAGo4ewA="
GET /v1/organization/costs?group_by=project_id&page=page_AAAAAGpY30vJnSVZAAAAAGo4ewA%3D&start_time=1781481600
  -> 400  "The page token is invalid, have you modified the query parameters?"
```

The error message misdirects: the query parameters are **not** modified - `group_by` and `start_time` are carried through byte-identically. The only difference between the token minted and the token returned is its base64 `=` padding, sent as **`%3D`**.

Mechanism, traced through the source: any-sdk's `SetNextPage` clones the prior request, sets the token with `q.Set("page", token)`, then re-renders the query with `q.Encode()` (`internal/anysdk/http_armoury_params.go:114-122`). Go's `url.Values.Encode()` percent-escapes `=` in values to `%3D`. OpenAI's own SDK uses httpx, whose query quoter treats `=` as a safe character and sends it raw. Both are legal under RFC 3986 (`=` is permitted unescaped in a query value), but OpenAI's cursor parser evidently does not percent-decode the `page` value, so it receives a token that is not the one it issued.

Ruled out first, so this is not a provider defect (all against a purpose-built mock, `tests/integration/mock_admin_server.mjs`):

- **Config is correct** - the spec documents `page` as "a cursor... corresponding to the `next_page` field from the previous response", which is exactly the stamped `requestToken: page` / `responseToken: $.next_page`.
- **Parameters are preserved** - request 2 carries every parameter from request 1 plus `page`.
- **`page` is absent from request 1** - no empty-token first call.
- **Encoding is otherwise faithful** - a token seeded with `+`, `/` and `=` round-trips exactly (`page_ab+cd/ef==xy` -> `page_ab%2Bcd%2Fef%3D%3Dxy` -> decodes back identically). The escaping is correct HTTP; the server just will not take it.

**Workaround, applied everywhere: keep the window inside one page** by setting `limit` (see 12c), so the second request never happens. **Fix:** upstream in any-sdk - the token should be written into `RawQuery` without re-escaping, or `=` treated as safe in query values. Filed as follow-up; the directory idioms (`$.last_id`, `$.next`) are unaffected because their tokens are plain object ids with no padding.

The smoke suite now asserts the defect explicitly (forcing `limit = 1`): it reports SKIP while the 400 reproduces, and **PASS with "the upstream token bug appears FIXED"** if it ever stops - so the workaround is removed on evidence rather than left in forever.

### 12c. `limit` defaults to 7 buckets, so a week is the accidental page size

`limit` bounds *buckets per page*, and the pin defaults it to **7** on both usage and costs - so any window over a week paginates and, until 11b is fixed, fails. Maximums: `costs` 180; `usage` 31 at `bucket_width=1d`, 168 at `1h`, 1440 at `1m`. Stackql does not inject query-parameter defaults (only header defaults - the anthropic finding), so the server's own default applies. Every example and every smoke query now sets `limit` to cover its window.

### 12d. The live response carries `start_time_iso` / `end_time_iso`; the pinned spec does not

The wire trace shows each bucket returning `start_time_iso: "2026-06-15T00:00:00+00:00"` and `end_time_iso` alongside the epoch fields. The pinned spec's `UsageTimeBucket` declares only `object`, `start_time`, `end_time`, `results`, so these are **not** projected as columns and `strftime` over the epoch (12e) remains the way to get a date. The spec is behind its own API. Recorded as an open item rather than patched: adding undeclared fields to the schema is a deliberate deviation from "the spec is canonical" and should be a decision, not a drive-by. If they were declared, the ISO fields would be the obvious thing for the docs to select.

### 12e. `date()` / `datetime()` do not evaluate over a **column**; `strftime` does

The examples also converted bucket epochs with `date(c.start_time, 'unixepoch')`. That column comes back **`0`**. The first read of this was "date/datetime are broken", which is wrong - the maintainer's counter-example (`SELECT datetime(1576417943, 'unixepoch') FROM google.storage.buckets ...`) works fine. The distinction is the **argument**, not the function:

| expression | result |
|---|---|
| `datetime(1781481600, 'unixepoch')` - literal | `2026-06-15 00:00:00` |
| `date(1781481600, 'unixepoch')` - literal | `2026-06-15` |
| `datetime(start_time, 'unixepoch')` - column | `0` |
| `datetime(c.start_time, 'unixepoch')` - aliased column | `0` |
| `strftime('%Y-%m-%d', start_time, 'unixepoch')` - column | `2026-06-15` |
| `strftime('%Y-%m-%d', c.start_time, 'unixepoch')` - aliased column | `2026-06-15` |

So `date()` / `datetime()` evaluate constant-folded arguments but not column references, while `strftime()` handles columns correctly (aliased or not, and several in one projection). Their failure is also contagious within a projection: in a SELECT carrying both, a `strftime` column that returns `2026-06-15` on its own returned `null` sitting beside a `date()` call - so a single `date(column, ...)` can null out neighbouring expressions rather than just its own.

**Rule for this provider's docs: `strftime('%Y-%m-%d', <epoch column>, 'unixepoch')`.** All examples updated. `json_each` and `json_extract` were never implicated - the full flagship query returns real dates, project ids and amounts once `date()` is gone. The engine-side cause (a stackql function-resolution issue over projected columns, not a provider one) is not diagnosed here.

## Open

1. **The live smoke run.** `tests/smoke_test.py` with `OPENAI_ADMIN_KEY` set (plus `OPENAI_API_KEY` for the rejection leg). Partially exercised as of 2026-07-16 (section 12 came out of it - reads, the bucketed shape and the pagination defect are now real evidence). Still unsettled: admin-accept / standard-reject through the provider, cursor traversal on the two entity idioms, and the `--with-lifecycle` write path.
1a. **Upstream: the `%3D` page-token bug** (section 12b) - any-sdk re-escapes the base64 padding of a next-page token, which OpenAI's cursor parser rejects. Bucketed auto-pagination on usage/costs is unusable until this is fixed; `limit` covering the window is the workaround everywhere. The fix belongs in `SetNextPage` (write the token into `RawQuery` unescaped, or treat `=` as safe). File it, and drop the workaround when the smoke suite's explicit assertion flips to PASS.
2. **The six `/projects/{project_id}` role/group paths** - outside the `/organization` subtree, but the same admin key class, and the sibling openai build's filter explicitly dispatches them here (its `filter_report.csv`, reason `org-admin-surface`). Kept, with their own keep code (`admin-key-class-outside-organization`) so a maintainer reversal is a one-line rule change. Excluding them would orphan the family - neither provider would carry it. Strike this item if the maintainer concurs; CLAUDE.md's scope sentence tightens to match either way.
3. **Integration mock: started, not finished.** `tests/integration/mock_admin_server.mjs` exists (built to diagnose 11b) and serves all three idioms with request recording, a page-token contract, and bearer enforcement. What is missing is the harness around it: a runner that copies the provider to a temp dir, rewrites `servers:` to the mock, executes the assertions, and reports - the credential-free CI gate. The mock's own token contract is a *model* of the API's, and section 12b shows the real one differs (it accepts what the mock accepts, and the live API does not) - so the mock must not be treated as the source of truth on token validation.
4. **CI not wired.** No workflow yet: the intended shape is fetch + `--check` drift + clean + inventory + split + mappings + normalize + generate + post-process + offline validation + meta-routes on every push, with the smoke suite secret-gated, and a spec-drift job on a schedule. The sibling's `build-and-test.yml` is the model.
5. **Publish not done.** The provider is generated and validated locally but not pushed to `stackql-provider-registry`; `tests/smoke_test.py --registry public` is the post-publish verification and currently has nothing to pull. Netlify/Pages deployment for the microsite is likewise unwired (the sibling deploys via GitHub Actions; `website/static/CNAME` pins `openai-admin-provider.stackql.io`).
6. **Update-POST field preservation** (section 7) - spec-side evidence says partial-by-construction; the keycloak-method wire probes (update one field, assert the others unchanged) on `projects.update` and `rate_limits.update` fold into the live run.
7. **Convenience views for bucket fan-out** - one view per usage/costs resource projecting bucket time fields onto json_each'd result rows (the anthropic views mechanism, `generate --views-dir`). The base-table shape ships per section 5 regardless; the views are sugar that would make the flagship queries shorter.
8. **`service_tier` group-by is completions-only** - the enum on the other usage resources omits it. Documented per resource from the inventory; no decision needed.
8a. **`start_time_iso` / `end_time_iso` are on the wire but not in the spec** (section 12d) - the live buckets carry them; `UsageTimeBucket` does not declare them, so they are not columns. Options: leave it (spec is canonical; `strftime` over the epoch works - 12e), or add them in `pre_normalize.mjs` as an evidence-backed deviation with the wire capture as justification. Needs a decision, not a drive-by patch.
9. **`analyze` appends to an existing `all_services.csv`** - keycloak carry-over, still true in provider-utils 0.7.6; delete before re-running `generate-mappings` (the README does). Candidate upstream fix.
10. **Meta-routes default port collides.** The suite and `bin/start-server.sh` both default to 5444; a stackql server from a sibling repo (including one running under WSL) will answer instead, and the failure reads as "provider not found in registry" rather than a port clash. Pass `--port` / `--port` on both sides when working across repos.
