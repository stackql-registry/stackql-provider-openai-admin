# `openai_admin` provider for [`stackql`](https://github.com/stackql/stackql)

This repository generates and documents the `openai_admin` provider for StackQL, enabling SQL-based query and provisioning operations against the OpenAI organization/administration API surface - usage (per-capability bucketed token counts), costs (daily USD buckets), projects (and their users, service accounts, API keys, and rate limits), organization users and invites, groups and roles, admin API keys, audit logs, and certificates. The provider is built using the `@stackql/provider-utils` package.

**Applicability note**: the admin surface exists for organizations. Admin API keys (`sk-admin-...`) are created by organization owners in the OpenAI platform console; individual/default accounts may lack this surface entirely. A standard API key (`sk-...`) cannot call these endpoints, and an admin key cannot call the standard platform endpoints - the two key classes are disjoint. The platform surface available to standard keys is the sibling [`openai`](https://github.com/stackql-registry/stackql-provider-openai) provider.

## Design Principles

- **Pinned vendor spec, filtered to the admin surface** - the source artifact is `openapi.yaml` from [`openai/openai-openapi`](https://github.com/openai/openai-openapi) (branch `main`) - the same canonical artifact the sibling `openai` provider build pins, pinned independently here in `provider-dev/config/spec_pin.json`. `provider-dev/scripts/clean_specs.mjs` filters the spec TO the organization/administration surface (the inverse of the sibling's filter); every path is dispositioned with a keep or removal code in `provider-dev/config/filter_report.csv`. Refreshes are reviewed diffs, never silent regenerations (`npm run fetch-spec -- --check` detects drift).
- **Scope boundary** - everything under `/organization/...` maps here, plus the six `/projects/{project_id}` role/group paths that carry the same admin key class (dispatched to this provider by the sibling build's filter). Nothing else does.
- **Fixed server, admin-key bearer auth** - `https://api.openai.com/v1` with `Authorization: Bearer $OPENAI_ADMIN_KEY`.
- **Two pagination idioms** - the usage and cost endpoints are bucketed time series (`start_time`/`end_time`, `bucket_width`, `group_by`, `page` request parameter with a `next_page` token in the response); the directory-style resources (projects, users, invites, keys, audit logs) use the standard OpenAI list envelope with the derived cursor (`after` fed from the previous page's `last_id`). Both idioms are classified per resource in `provider-dev/config/endpoint_inventory.csv`.
- **`group_by` is the flagship parameter** - usage grouped by `project_id`, `api_key_id`, and `model` is what makes the FinOps queries work.
- **Buckets project as rows** - usage and cost responses nest results inside time buckets; rows project one-per-bucket (`start_time`, `end_time`, `results` as a JSON column), with group breakdowns fanned out via `json_each`.
- **Reads and writes** - the usage, cost, and audit surfaces are read-only; writes are governance: project create/update/archive, project user and service-account management, project API key deletion, rate-limit updates, invite create/delete, group and role management, admin key lifecycle. Usage and cost are read, never generated - nothing in this provider consumes tokens.

## Build Pipeline

Deterministic and re-runnable throughout; every script validates and fails without writing. Node.js 20+ required.

### 0. Fetch, pin and filter the spec

```bash
npm run fetch-spec              # download openapi.yaml at the pinned ref, validate, pin
npm run fetch-spec -- --check   # drift check against the pin (CI)
npm run clean-specs             # filter TO the admin surface -> openapi_cleaned.yaml + filter_report.csv
npm run build-inventory         # endpoint inventory over the filtered spec
```

### 1. Split into service specs

Tag-discriminated; the spec's fine-grained tags (15 on the admin surface, plus the untagged admin_api_keys family stamped and `/organization/costs` re-tagged in `clean_specs.mjs`) consolidate to 10 services through `provider-dev/config/service_names.json`:

```bash
npm run split -- \
  --provider-name openai_admin \
  --api-doc provider-dev/downloaded/openapi_cleaned.yaml \
  --output-dir provider-dev/source \
  --svc-discriminator tag \
  --svc-name-overrides "$(cat provider-dev/config/service_names.json | tr -d ' \n')" \
  --overwrite
```

Produces 10 service specs in `provider-dev/source/`: `usage` (8 per-capability bucketed resources), `costs`, `projects` (projects, api_keys, service_accounts, users, rate_limits, groups, group_role_assignments, user_role_assignments), `users` (users, role_assignments), `invites`, `groups` (groups, users, role_assignments), `roles` (roles, project_roles), `admin_api_keys`, `audit_logs`, `certificates` (certificates, project_certificates).

### 2. Generate mappings

```bash
rm -f provider-dev/config/all_services.csv   # analyze appends to an existing CSV
npm run generate-mappings -- \
  --provider-name openai_admin \
  --input-dir provider-dev/source \
  --output-dir provider-dev/config
npm run map-operations                        # populate stackql_* columns from the endpoint inventory
```

`map_operations.mjs` joins `all_services.csv` to `endpoint_inventory.csv` by operationId - one deterministic source of truth for the mapping - and validates coverage in both directions, unique method keys, unique path-param signatures per SQL verb, and object keys on every list method. 81 operations map: 37 `SELECT`, 15 `INSERT`, 8 `UPDATE`, 16 `DELETE`, 5 `EXEC` (project archive, certificate activate/deactivate at both scopes); nothing is skipped.

### Live evidence runbook (blocked on keys)

`node provider-dev/scripts/live_evidence.mjs` captures the phase 1 wire evidence - the key-class check (admin key accepted, standard key rejected), the bucketed `group_by` traversal, the derived-cursor traversal, the audit-log filter pass-through, and (with `--lifecycle`) the `stackql-smoke-<stamp>` project governance lifecycle. It requires `OPENAI_ADMIN_KEY` (and optionally `OPENAI_API_KEY` for the rejection evidence) and writes redacted captures to `provider-dev/evidence/`.
