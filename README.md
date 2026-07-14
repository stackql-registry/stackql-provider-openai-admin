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
