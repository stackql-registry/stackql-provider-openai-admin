# `openai_admin` provider for [`stackql`](https://github.com/stackql/stackql)

This repository generates and documents the `openai_admin` provider for StackQL, enabling SQL-based query and provisioning operations against the OpenAI organization and administration API surface - usage (per-capability bucketed token counts), costs (daily USD buckets), projects (and their users, service accounts, API keys, rate limits and groups), organization users and invites, groups and roles, admin API keys, audit logs, and certificates. The provider is built using the `@stackql/provider-utils` package.

**Applicability**: this surface exists for organizations. Admin API keys (`sk-admin-...`) are created by organization owners in the OpenAI platform console; individual and default accounts may not have it. A standard API key cannot call these endpoints, and an admin key cannot call the standard platform endpoints - the two key classes are disjoint. The platform surface available to standard keys is the sibling [`openai`](https://github.com/stackql-registry/stackql-provider-openai) provider.

Nothing in this provider consumes tokens - usage and cost are read, never generated.

## Design Principles

- **Pinned vendor spec, filtered to the admin surface** - the source artifact is `openapi.yaml` from [`openai/openai-openapi`](https://github.com/openai/openai-openapi) (branch `main`), the same canonical artifact the sibling `openai` build pins, pinned independently here in `provider-dev/config/spec_pin.json`. `provider-dev/scripts/clean_specs.mjs` filters the spec **to** the organization/administration surface (the inverse of the sibling's filter); every path is dispositioned with a keep or removal code in `provider-dev/config/filter_report.csv`, and the two reports reconcile against each other with no gaps or overlaps. Refreshes are reviewed diffs, never silent regenerations (`npm run fetch-spec -- --check` detects drift).
- **Scope boundary** - everything under `/organization/...` maps here, plus the six `/projects/{project_id}` role/group paths that carry the same admin key class (the sibling's filter dispatches them here). Nothing else does.
- **Fixed server, admin-key bearer auth** - `https://api.openai.com/v1` with `Authorization: Bearer $OPENAI_ADMIN_KEY`. The key is the organization scope: there is no organization parameter on any query, and project scope is a path parameter.
- **Three pagination idioms, classified structurally** - derived from each list's response envelope, never a hand list: **bucketed** (`page` -> `$.next_page`) on usage and costs; **cursor-derived** (`after` -> `$.last_id`) on the classic OpenAI list envelope; **cursor-next** (`after` -> `$.next`) on the RBAC family, which carries an explicit cursor that nulls out on the last page. Recorded per operation in `provider-dev/config/endpoint_inventory.csv` and stamped by `post_process.mjs`.
- **`group_by` is the flagship parameter** - usage grouped by `project_id`, `api_key_id` or `model` is what makes the FinOps queries work. One dimension per query (wire-verified); the result items carry every dimension as a field, so multi-dimension questions group in SQL over a single-dimension fetch.
- **Buckets project as rows** - usage and cost responses nest results inside time buckets. Rows are one-per-bucket (`start_time`, `end_time`, `results` as a JSON column), with breakdowns fanned out via `json_each`. The result items carry no time fields, so flattening them at the `objectKey` layer would lose the x-axis of every usage query - see NOTES.md section 5.
- **Reads and writes** - usage, cost and audit are read-only; writes are governance: project create/update/archive, project user and service-account management, project API key deletion, rate-limit updates, invite create/delete, group and role management, admin key lifecycle. Update-POSTs are partial by construction and map to `UPDATE`, never `REPLACE` (NOTES.md section 7).

## Build Pipeline

Deterministic and re-runnable throughout; every script validates and fails without writing. Node.js 20+ required.

### 0. Fetch, pin and filter the spec; build the inventory

```bash
npm run fetch-spec              # download openapi.yaml at the pinned ref, validate, pin
npm run fetch-spec -- --check   # drift check against the pin (CI)
npm run clean-specs             # filter TO the admin surface -> openapi_cleaned.yaml + filter_report.csv
npm run build-inventory         # endpoint inventory over the filtered spec
```

The filter keeps 52 paths / 81 operations of the pinned 162 / 242. `build_inventory.mjs` classifies every operation - service, resource, method, SQL verb, pagination idiom, `group_by` support, request body, update semantics - and gates on coverage, unique method keys, unique path-param signatures, `$.data` on every list, and a recognised cursor field on every list envelope.

### 1. Split into service specs

Tag-discriminated. The spec's 15 fine-grained admin tags (plus the untagged `admin_api_keys` family, tag-stamped in `clean_specs.mjs`, and `/organization/costs`, re-tagged there from `Usage` to `Costs`) consolidate to 10 services through `provider-dev/config/service_names.json`:

```bash
npm run split -- \
  --provider-name openai_admin \
  --api-doc provider-dev/downloaded/openapi_cleaned.yaml \
  --output-dir provider-dev/source \
  --svc-discriminator tag \
  --svc-name-overrides "$(cat provider-dev/config/service_names.json | tr -d ' \n')" \
  --overwrite
```

### 2. Generate mappings

```bash
rm -f provider-dev/config/all_services.csv   # analyze appends; always start clean
npm run generate-mappings -- --provider-name openai_admin --input-dir provider-dev/source --output-dir provider-dev/config
npm run map-operations
```

`map_operations.mjs` fills the `stackql_*` columns from the endpoint inventory joined by operationId - one deterministic rule table, no second source to drift - and gates on coverage both directions, unique method keys, unique path-param signatures per (resource, SQL verb), and object keys on every list.

### 3. Normalize the service specs

StackQL models providers as relational data sources, so `oneOf` / `anyOf` / `allOf` must be lowered to concrete schemas at the column-producing sites (request-body and 200-response roots and their direct properties). Polymorphism nested deeper lives inside JSON columns and is left alone.

```bash
npm run pre-normalize                                  # admin-specific source edits
npm run normalize -- --api-dir provider-dev/source     # generic allOf flatten + oneOf/anyOf lowering
npm run lower-residual-variants                        # lower any union left at a column site
```

**`pre_normalize.mjs`** expands object-typed query parameters into their bracketed wire parameters. `GET /organization/audit_logs` declares `effective_at` as `type: object` (gt/gte/lt/lte) with no `style`, so the OpenAPI default would serialize it as `?gt=...` rather than the `?effective_at[gt]=...` the API accepts - and an object value is not a SQL column anyway. Each property becomes a discrete parameter named for its literal wire spelling, matching how the sibling array filters already ship (`project_ids[]`, `event_types[]`). It also guards against the openapi 3.1.0 array-type nullable form and binary request bodies (neither present in this pin; the guards fail the run if a refresh introduces either).

The optional `OpenAI-Organization` / `OpenAI-Project` headers the sibling injects are deliberately **not** carried over here: the admin key is itself the organization scope, and project scope is a path parameter.

**`npm run normalize`** flattens composition at the column sites - against this pin: 175 `allOf` flattened, 172 `anyOf` renamed (all the 3.1 nullable idiom, which resolves to the real type under the first-wins merge), 4 opaque objects lowered to string columns. **`lower_residual_variants.mjs`** then finds zero residual column-site unions: the only unions left are nested inside JSON columns, notably the 9-member per-capability union under a usage bucket's `results`, which is exactly where it belongs.

### 4. Generate the provider

```bash
rm -rf provider-dev/openapi/src/openai_admin
npm run generate-provider -- \
  --provider-name openai_admin \
  --input-dir provider-dev/source \
  --output-dir provider-dev/openapi/src/openai_admin \
  --config-path provider-dev/config/all_services.csv \
  --servers '[{"url": "https://api.openai.com/v1"}]' \
  --provider-config '{"auth": {"type": "bearer", "credentialsenvvar": "OPENAI_ADMIN_KEY"}}' \
  --naive-req-body-translate \
  --overwrite

npm run post-process   # stamp the pagination configs
```

- **Fixed server** - `https://api.openai.com/v1` is a literal host with no server variables, so there are no `WHERE` server parameters and no host-routing configuration.
- **`--naive-req-body-translate`** makes `INSERT` / `UPDATE` body columns the native wire property names (`name`, `role`, `max_requests_per_1_minute`).
- **`post_process.mjs` rather than `--service-config`** - the generator's `--service-config` applies one config to every service, but this surface carries three pagination idioms and two services mix them (`projects`: 5 cursor-derived resources + 3 cursor-next; `users`: users cursor-derived, role_assignments cursor-next). any-sdk resolves pagination through an **operation -> resource -> service -> provider** fallback chain, so the script stamps each service's dominant idiom at service level and overrides the 4 deviating list methods at method level, then validates that all 29 lists resolve to their inventory idiom. See NOTES.md section 4.
- The generator's `exec method skipped` lines for the 5 EXEC methods are expected: EXEC is excluded from the `sqlVerbs` routing table and dispatches by name. All 5 are present and `SHOW METHODS` lists them.

### 5. Test the provider

**Validate offline** - resolves the provider with no network and no key:

```bash
REG_PATH="$(pwd)/provider-dev/openapi"
REG="{\"url\":\"file://${REG_PATH}\",\"localDocRoot\":\"${REG_PATH}\",\"verifyConfig\":{\"nopVerify\":true}}"

stackql --registry="$REG" exec "SHOW SERVICES IN openai_admin"
stackql --registry="$REG" exec "SHOW METHODS IN openai_admin.projects.projects"
stackql --registry="$REG" exec "DESCRIBE openai_admin.usage.completions"
```

**Meta-route suite** - walks every service, resource and method:

```bash
PROVIDER_REGISTRY_ROOT_DIR="$(pwd)/provider-dev/openapi"
npm run start-server -- --provider openai_admin --registry $PROVIDER_REGISTRY_ROOT_DIR
npm run test-meta-routes -- openai_admin --verbose
npm run stop-server
```

Current state: 10 services, 29 resources, 81 methods, 37 selectable, 0 non-selectable resources, 0 errors. Both the server and the suite default to port 5444 - pass `--port` to each if another stackql server holds it.

**Smoke tests** (`tests/smoke_test.py`, pystackql) - live against a real organization. Cost-free by default and token-free always. Set up a virtual environment:

```bash
python3 -m venv .venv

# activate the venv:
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\Activate.ps1       # Windows PowerShell
# .venv\Scripts\activate.bat       # Windows cmd

pip install -r tests/requirements.txt
```

Then run the smokes with the admin key in the environment:

```bash
export OPENAI_ADMIN_KEY='sk-admin-...'
export OPENAI_API_KEY='sk-...'        # optional: proves the standard key is rejected

python3 tests/smoke_test.py                     # local generated provider (default)
python3 tests/smoke_test.py --registry public   # published provider (post-publish verification)
python3 tests/smoke_test.py --with-lifecycle    # also run the governance write lifecycle
python3 tests/smoke_test.py --cleanup-only      # archive active stackql-smoke breadcrumbs
```

What it covers:

- **Key class** - the admin key is accepted, and the same query re-run through the provider with the auth config pointed at `OPENAI_API_KEY` must be rejected. The disjointness is proven through the provider, not a side-channel call.
- **Reads** - organization users, invites, admin keys, audit logs, groups, roles, certificates, and the project child surface (users, service accounts, API keys, rate limits).
- **The flagship** - usage buckets, `group_by = 'project_id'`, daily USD cost buckets, and all 8 usage capabilities answering.
- **Pagination traversal** - a `limit = 1` read must return the same row count as an unbounded one, proving the cursor configs actually walk (covers the cursor-derived and cursor-next idioms; the bucketed idiom is exercised by the usage reads).
- **Governance lifecycle** (`--with-lifecycle`) - create `stackql-smoke-<stamp>` -> get -> rename -> add a service account -> archive, within the run.

Two behaviours are deliberate. **Skip-with-notice**: where an organization lacks a family (certificates, RBAC), the API answers 401/403/404 and the step reports `SKIP` - an absent surface is an applicability fact, not a provider defect. **Zero activity is valid**: an org with no API history returns empty usage/cost buckets, which pass.

The governance lifecycle is opt-in because **the API exposes no project delete** - archive is terminal, so each run leaves one permanently archived project in the organization. It is cost-free but not sweepable; `--cleanup-only` archives any *active* smoke-named leftovers.

Without `OPENAI_ADMIN_KEY` the resolution check still passes and the live steps report `BLOCKED`, so the script is safe to run in any environment.

### 6. Publish the provider

Push the `openai_admin` directory to `providers/src` in a feature branch of [`stackql-provider-registry`](https://github.com/stackql/stackql-provider-registry) and follow the [registry release flow](https://github.com/stackql/stackql-provider-registry/blob/dev/docs/build-and-deployment.md). Verify against the dev registry:

```bash
export DEV_REG="{ \"url\": \"https://registry-dev.stackql.app/providers\" }"
stackql --registry="${DEV_REG}" shell
```

```sql
registry pull openai_admin;
```

Then re-run the smokes with `--registry public` as post-publish verification.

### 7. Generate web docs

The microsite (`website/`, Docusaurus 3.10, served at `openai-admin-provider.stackql.io`) follows the shared-config pattern: navbar/footer/theme configuration lives in [`stackql/docusaurus-config`](https://github.com/stackql/docusaurus-config), vendored into `.shared-config/` at build time (`vendor-config` runs automatically on `prestart`/`prebuild`). Site-local files are the provider identity (`website/provider.js`), thin wrappers, shared components under `src/`, and static assets including `static/CNAME`.

The landing content is authored in `headerContent1.txt` / `headerContent2.txt` under `provider-dev/docgen/provider-data/`.

```bash
npm run generate-docs -- \
  --provider-name openai_admin \
  --provider-dir ./provider-dev/openapi/src/openai_admin/v00.00.00000 \
  --output-dir ./website \
  --provider-data-dir ./provider-dev/docgen/provider-data

node provider-dev/docgen/sanitize_docs.mjs   # prefix OpenAI's relative /docs/ links

cd website
yarn install
yarn build      # vendor-config clones the shared config first; network to GitHub required
yarn serve
```

`sanitize_docs.mjs` prefixes the relative OpenAI doc links carried through from the spec descriptions with `https://platform.openai.com`, which serves a 301 to each page's current home.

## Service Coverage

10 services, 29 resources, 81 operations (select 37, insert 15, delete 16, update 8, exec 5).

| Service | Resources | Notes |
|---|---|---|
| `usage` | completions, embeddings, moderations, images, audio_speeches, audio_transcriptions, vector_stores, code_interpreter_sessions | bucketed token counts per capability; `group_by`, `bucket_width`, read-only |
| `costs` | costs | daily USD buckets; `group_by` project_id / line_item / api_key_id; read-only |
| `projects` | projects, api_keys, service_accounts, users, rate_limits, groups, group_role_assignments, user_role_assignments | the governance core; `archive` is `EXEC` (no delete exists); api_keys are list/get/delete only |
| `users` | users, role_assignments | organization membership and org role assignments |
| `invites` | invites | invite lifecycle |
| `groups` | groups, users, role_assignments | organization groups, their members and role assignments |
| `roles` | roles, project_roles | org and project role definitions |
| `admin_api_keys` | admin_api_keys | admin key lifecycle; the key value is returned once on create |
| `audit_logs` | audit_logs | append-only reads with bracketed filter pass-through |
| `certificates` | certificates, project_certificates | org and project scope; `activate` / `deactivate` are `EXEC` |

The platform surface available to standard API keys (models, files, fine-tuning, batches, vector stores, assistants, evals) is the sibling [`openai`](https://github.com/stackql-registry/stackql-provider-openai) provider.

## Example Queries

Usage and cost are bucketed time series: one row per time bucket, with the per-group breakdown in the `results` JSON column. Four conventions shape every such query (each wire-verified - NOTES.md section 12):

- **`start_time` takes a literal** epoch-seconds value; compute it for the window (`date -d '30 days ago' +%s`).
- **`limit` sets the bucket count and defaults to 7**; set it to cover the window - up to 180 on `costs`, 31 on `usage` at `bucket_width=1d`.
- **`group_by` takes one dimension per query**; the result items carry every dimension, so group in SQL over a single-dimension fetch.
- **Convert epochs with `strftime`** - `strftime('%Y-%m-%d', start_time, 'unixepoch')`.

Token usage by project and model over a 30-day window:

```sql
SELECT
  json_extract(r.value, '$.project_id')    AS project_id,
  json_extract(r.value, '$.model')         AS model,
  strftime('%Y-%m-%d', u.start_time, 'unixepoch') AS usage_date,
  json_extract(r.value, '$.input_tokens')  AS input_tokens,
  json_extract(r.value, '$.output_tokens') AS output_tokens
FROM openai_admin.usage.completions u, json_each(u.results) r
WHERE u.start_time = 1781481600
  AND u.bucket_width = '1d'
  AND u.limit = 31
  AND u.group_by = 'project_id'
ORDER BY usage_date, project_id;
```

Daily spend in USD by project:

```sql
SELECT
  strftime('%Y-%m-%d', c.start_time, 'unixepoch') AS cost_date,
  json_extract(r.value, '$.project_id')   AS project_id,
  json_extract(r.value, '$.line_item')    AS line_item,
  json_extract(r.value, '$.amount.value') AS amount_usd
FROM openai_admin.costs.costs c, json_each(c.results) r
WHERE c.start_time = 1781481600
  AND c.limit = 180
  AND c.group_by = 'project_id'
ORDER BY cost_date, amount_usd DESC;
```

A bucket with no activity returns `results: []`, so `json_each` yields nothing for it - an empty result set means no spend in the window, not a broken query. Drop the join (`SELECT start_time, results FROM ...`) to see the raw buckets.

Projects and their service accounts:

```sql
SELECT p.name AS project, p.status, sa.name AS service_account, sa.role, sa.created_at
FROM openai_admin.projects.projects p
JOIN openai_admin.projects.service_accounts sa ON sa.project_id = p.id
WHERE p.status = 'active'
ORDER BY p.name, sa.created_at;
```

Admin key hygiene:

```sql
SELECT name, created_at, last_used_at, owner
FROM openai_admin.admin_api_keys.admin_api_keys
ORDER BY created_at;
```

Audit log with wire filters (bracketed identifiers take double quotes):

```sql
SELECT id, type, effective_at, actor, project
FROM openai_admin.audit_logs.audit_logs
WHERE "effective_at[gt]" = 1750000000
  AND "event_types[]" = 'project.created';
```

## License

MIT

## Contributing

Contributions are welcome. Please open an issue or pull request.
