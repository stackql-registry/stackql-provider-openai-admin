## Project

This repository builds and documents the `openai_admin` provider for StackQL - SQL-based query and provisioning operations against the OpenAI organization/administration API surface: usage (per-capability bucketed token counts), costs (daily USD buckets), projects (and their users, service accounts, API keys, and rate limits), organization users and invites, admin API keys, audit logs, and certificates where exposed.

**This is the direct structural sibling of `anthropic_admin`** - the same split for the same reason: the admin surface uses a separate key class (admin keys, `sk-admin-...`) disjoint from standard API keys, and any-sdk auth is provider-scoped. Read the anthropic_admin repo's CLAUDE.md and NOTES.md before writing anything - its framing, applicability note, and findings transfer wholesale; this document records the OpenAI deltas.

**Applicability, stated plainly (the anthropic_admin convention)**: the admin surface exists for organizations - admin keys are created by organization owners, and individual/default accounts may lack the surface entirely. The README and docs state this up front; smoke behaviour degrades skip-with-notice where the surface is unavailable.

**Scope boundary**: everything under `/v1/organization/...` maps here; nothing else does. The platform surface (models, files, fine-tuning, batches, vector stores, assistants, evals) is the sibling `openai` provider, refreshed in its own repository from the same pinned spec source.

Build pipeline and repository pattern follow stackql-registry/stackql-provider-k8s (branch `feature/provider-dev`). Sibling findings reused, not re-derived - anthropic_admin (the whole shape), the openai next-gen build (spec source, envelope, derived cursor), openrouter (key-class documentation treatment), keycloak (REPLACE-vs-UPDATE warning).

## Positioning context

This provider is the second native leg of the LLM FinOps flagship: token usage and USD cost as rows, group-able by project, key, and model - alongside `anthropic_admin`, the `google` billing surfaces for Gemini, and `openrouter`. The flagship query (vendor, project/workspace, model, day, tokens in/out, cost USD - unioned across all four) is this build's acceptance artifact and leads the docs. Secondary leads: project and service-account governance, admin key hygiene, and the audit log as rows. Comparisons through capability statements and runnable examples, never editorializing.

## Spec source

The same canonical artifact as the sibling `openai` build (`openai/openai-openapi`, pinned independently in this repo): `bin/fetch-spec.sh` downloads, validates, pins - and `clean_specs.mjs` filters **to** the `/organization` subtree (the inverse of the sibling's filter), reason-coding everything else out. Refreshes are reviewed diffs, never silent regenerations.

## Design principles

- **Fixed server, admin-key bearer auth** - `https://api.openai.com/v1`; `Authorization: Bearer` with `OPENAI_ADMIN_KEY` (the admin key class - the docs explain creation by org owners and the class distinction per the openrouter key-class treatment; a standard key is expected to be rejected, and the rejection is recorded as evidence).
- **Two pagination idioms, classified per resource** - the usage and cost endpoints are bucketed time series taking `start_time`/`end_time`, `bucket_width`, `group_by[]`, and paginating via a `page` parameter with a `next_page` token in the response; the directory-style resources (projects, users, invites, keys, audit logs) use the standard OpenAI list envelope with the derived cursor (`after` from `$.last_id` - the sibling build's finding, reused). Both classified in the inventory, both proven in phase 1.
- **`group_by[]` is the flagship parameter** - usage grouped by project_id, api_key_id, and model is what makes the FinOps queries work; exposed as documented pass-through with the array encoding confirmed on the wire.
- **Buckets project as rows honestly** - usage/cost responses nest results inside time buckets; the projection (bucket fields flattened onto each result row) is decided on evidence in phase 1 and applied uniformly, with the shape documented plainly.
- **Reads and writes** - the usage/cost/audit surfaces are read-only; writes are governance: project create/archive/update, project user and service-account management, project API key deletion, rate-limit updates, invite create/delete, admin key lifecycle. Update semantics per the keycloak warning. Audit logs are append-only reads with rich filter pass-through.

## Toolchain, layout, pipeline, testing, publishing, docs, CI

Per the anthropic_admin repo with the deltas above; layout, script names, and the four test layers per the k8s reference. Specifics worth pinning:

- Candidate services (inventory decides): `usage` (per-capability usage resources: completions, embeddings, moderations, images, audio, vector_stores, code_interpreter_sessions), `costs`, `projects` (projects, project_users, service_accounts, project_api_keys, rate_limits), `users`, `invites`, `admin_api_keys`, `audit_logs`, `certificates` (if exposed)
- Pilots: `usage` + `costs` (the bucketed idiom, `group_by[]` on the wire, the flattening decision), `projects` (directory idiom, the governance write lifecycle - a project created, a service account added, archived within the run), `audit_logs` (filter pass-through, derived cursor)
- Integration mock asserts: the admin bearer key on every request, both pagination idioms traversed, `group_by[]` encoding, bucket flattening per the decision, a project governance lifecycle, and the standard-key rejection surface
- Smokes: against a real organization with an admin key - reads across the surface (usage/costs need historical activity; zero-activity orgs return empty buckets, which are valid rows); the governance lifecycle with `stackql-smoke-<stamp>` naming and archive-based disposal; skip-with-notice where the org lacks the surface. Nothing here consumes tokens.
- Docs microsite: `openai-admin-provider.stackql.io`; the docs lead with **the four-way token-spend flagship** - the union query across openai_admin costs/usage, anthropic_admin, google billing (Gemini SKUs), and openrouter - shown in full as the acceptance artifact, then per-project cost breakdowns, key-attribution queries, service-account and admin-key audits, and the audit-log examples.

## Writing conventions

Measured, precise, no hyperbole; third-person or passive descriptive framing; the applicability note stated once, up front; no em dashes (use `-`); `->` for arrows; QWERTY-only characters; k8s-README-style runnable examples.

## Non-negotiables

1. Latest `@stackql/provider-utils`, always
2. anthropic_admin is the structural reference; the k8s repo the pattern reference; findings reused, not re-derived
3. Only the `/organization` subtree maps here - the inverse filter is validated
4. The applicability note (organizations, not individual accounts) appears in the README and docs lead - never buried
5. Nothing in this provider consumes tokens - usage and cost are read, never generated
6. Deterministic scripts, never hand-edits to derived artifacts
7. Every regeneration is followed by the integration suite before commit