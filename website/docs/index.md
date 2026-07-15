---
title: openai_admin
hide_title: false
hide_table_of_contents: false
keywords:
  - openai_admin
  - openai
  - stackql
  - infrastructure-as-code
  - configuration-as-data
  - cloud inventory
  - finops
description: Query and manage the OpenAI organization and administration surface using SQL
custom_edit_url: null
image: /img/stackql-openai_admin-provider-featured-image.png
id: 'provider-intro'
---

import CopyableCode from '@site/src/components/CopyableCode/CopyableCode';

The OpenAI organization and administration surface - token usage and USD cost as rows, projects and their users, service accounts, API keys and rate limits, organization users, invites, groups and roles, admin API keys, audit logs and certificates - queried and managed with SQL.

:::note[Organization accounts]

This surface exists for organizations. Admin API keys (`sk-admin-...`) are created by organization owners in the OpenAI platform console; individual and default accounts may not have it. A standard API key cannot call these endpoints, and an admin key cannot call the standard platform endpoints - the two key classes are disjoint. For the platform surface available to standard keys (models, files, fine-tuning, batches, vector stores, assistants, evals), see the sibling [`openai`](https://openai-provider.stackql.io) provider.

:::

Nothing in this provider consumes tokens - usage and cost are read, never generated.


:::info[Provider Summary] 

total services: __10__  
total resources: __39__  

:::

See also:
[[` SHOW `]](https://stackql.io/docs/language-spec/show) [[` DESCRIBE `]](https://stackql.io/docs/language-spec/describe)  [[` REGISTRY `]](https://stackql.io/docs/language-spec/registry)
* * *

## Installation

To pull the latest version of the `openai_admin` provider, run the following command:

```bash
REGISTRY PULL openai_admin;
```
> To view previous provider versions or to pull a specific provider version, see [here](https://stackql.io/docs/language-spec/registry).

## Authentication

The following system environment variables are used for authentication by default:

- <CopyableCode code="OPENAI_ADMIN_KEY" /> - OpenAI **admin** API key, `sk-admin-...` (see <a href="https://platform.openai.com/settings/organization/admin-keys">Organization admin keys</a>)

These variables are sourced at runtime (from the local machine or as CI variables/secrets).

An admin key is created by an organization owner and is scoped to that organization - the key itself carries the organization, so there is no organization parameter on any query. Project scope, where it applies, is a path parameter (`project_id`). A standard API key (`sk-...`) is rejected by this surface with `401`; use the sibling [`openai`](https://openai-provider.stackql.io) provider for the standard-key platform surface.

<details>

<summary>Using different environment variables</summary>

To use different environment variables (instead of the defaults), use the `--auth` flag of the `stackql` program.  For example:

```bash

AUTH='{ "openai_admin": { "type": "bearer",  "credentialsenvvar": "OPENAI_ADMIN_KEY" }}'
stackql shell --auth="${AUTH}"

```
or using PowerShell:

```powershell

$Auth = "{ 'openai_admin': { 'type': 'bearer',  'credentialsenvvar': 'OPENAI_ADMIN_KEY' }}"
stackql.exe shell --auth=$Auth

```
</details>

## Token spend and cost as rows

Usage and cost are bucketed time series. Each row is one time bucket (`start_time`, `end_time`) and its `results` array holds the per-group breakdown, fanned out with `json_each` and read with `json_extract`.  

Token usage by project and model over a 30-day window (`1781481600` = 2026-06-15):

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
  json_extract(r.value, '$.project_id')          AS project_id,
  json_extract(r.value, '$.line_item')           AS line_item,
  json_extract(r.value, '$.amount.value')        AS amount_usd
FROM openai_admin.costs.costs c, json_each(c.results) r
WHERE c.start_time = 1781481600
  AND c.limit = 180
  AND c.group_by = 'project_id'
ORDER BY cost_date, amount_usd DESC;
```

A bucket with no activity comes back with `results: []`, so `json_each` yields no rows for it - an empty result set means no spend in that window. Select the buckets without the join to see them directly:

```sql
SELECT
  strftime('%Y-%m-%d', start_time, 'unixepoch') AS cost_date,
  results
FROM openai_admin.costs.costs
WHERE start_time = 1781481600
  AND "limit" = 180;
```

## Governance and audit

Projects, their service accounts, and their API keys as rows:

```sql
SELECT p.name AS project, p.status, sa.name AS service_account, sa.role, sa.created_at
FROM openai_admin.projects.projects p
JOIN openai_admin.projects.service_accounts sa ON sa.project_id = p.id
WHERE p.status = 'active'
ORDER BY p.name, sa.created_at;
```

Admin key hygiene - keys by age and last use:

```sql
SELECT name, created_at, last_used_at, owner
FROM openai_admin.admin_api_keys.admin_api_keys
ORDER BY created_at;
```

The audit log is append-only and filtered on the wire. Bracketed parameter names are addressed with double quotes:

```sql
SELECT id, type, effective_at, actor, project
FROM openai_admin.audit_logs.audit_logs
WHERE "effective_at[gt]" = 1750000000
  AND "event_types[]" = 'project.created';
```


## Services
<div class="row">
<div class="providerDocColumn">
<a href="/services/admin_api_keys/">admin_api_keys</a><br />
<a href="/services/audit_logs/">audit_logs</a><br />
<a href="/services/certificates/">certificates</a><br />
<a href="/services/costs/">costs</a><br />
<a href="/services/groups/">groups</a><br />
</div>
<div class="providerDocColumn">
<a href="/services/invites/">invites</a><br />
<a href="/services/projects/">projects</a><br />
<a href="/services/roles/">roles</a><br />
<a href="/services/usage/">usage</a><br />
<a href="/services/users/">users</a><br />
</div>
</div>
