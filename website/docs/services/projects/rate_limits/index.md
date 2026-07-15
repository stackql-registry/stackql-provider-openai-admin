--- 
title: rate_limits
hide_title: false
hide_table_of_contents: false
keywords:
  - rate_limits
  - projects
  - openai_admin
  - infrastructure-as-code
  - configuration-as-data
  - cloud inventory
description: Query, deploy and manage openai_admin resources using SQL
custom_edit_url: null
image: /img/stackql-openai_admin-provider-featured-image.png
---

import CopyableCode from '@site/src/components/CopyableCode/CopyableCode';
import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Creates, updates, deletes, gets or lists a <code>rate_limits</code> resource.

## Overview
<table><tbody>
<tr><td><b>Name</b></td><td><CopyableCode code="rate_limits" /></td></tr>
<tr><td><b>Type</b></td><td>Resource</td></tr>
<tr><td><b>Id</b></td><td><CopyableCode code="openai_admin.projects.rate_limits" /></td></tr>
</tbody></table>

## Fields

The following fields are returned by `SELECT` queries:

<Tabs
    defaultValue="list"
    values={[
        { label: 'list', value: 'list' }
    ]}
>
<TabItem value="list">

Project rate limits listed successfully.

<table>
<thead>
    <tr>
    <th>Name</th>
    <th>Datatype</th>
    <th>Description</th>
    </tr>
</thead>
<tbody>
<tr>
    <td><CopyableCode code="id" /></td>
    <td><code>string</code></td>
    <td>The identifier, which can be referenced in API endpoints.</td>
</tr>
<tr>
    <td><CopyableCode code="batch_1_day_max_input_tokens" /></td>
    <td><code>integer</code></td>
    <td>The maximum batch input tokens per day. Only present for relevant models.</td>
</tr>
<tr>
    <td><CopyableCode code="max_audio_megabytes_per_1_minute" /></td>
    <td><code>integer</code></td>
    <td>The maximum audio megabytes per minute. Only present for relevant models.</td>
</tr>
<tr>
    <td><CopyableCode code="max_images_per_1_minute" /></td>
    <td><code>integer</code></td>
    <td>The maximum images per minute. Only present for relevant models.</td>
</tr>
<tr>
    <td><CopyableCode code="max_requests_per_1_day" /></td>
    <td><code>integer</code></td>
    <td>The maximum requests per day. Only present for relevant models.</td>
</tr>
<tr>
    <td><CopyableCode code="max_requests_per_1_minute" /></td>
    <td><code>integer</code></td>
    <td>The maximum requests per minute.</td>
</tr>
<tr>
    <td><CopyableCode code="max_tokens_per_1_minute" /></td>
    <td><code>integer</code></td>
    <td>The maximum tokens per minute.</td>
</tr>
<tr>
    <td><CopyableCode code="model" /></td>
    <td><code>string</code></td>
    <td>The model this rate limit applies to.</td>
</tr>
<tr>
    <td><CopyableCode code="object" /></td>
    <td><code>string</code></td>
    <td>The object type, which is always `project.rate_limit` (project.rate_limit)</td>
</tr>
</tbody>
</table>
</TabItem>
</Tabs>

## Methods

The following methods are available for this resource:

<table>
<thead>
    <tr>
    <th>Name</th>
    <th>Accessible by</th>
    <th>Required Params</th>
    <th>Optional Params</th>
    <th>Description</th>
    </tr>
</thead>
<tbody>
<tr>
    <td><a href="#list"><CopyableCode code="list" /></a></td>
    <td><CopyableCode code="select" /></td>
    <td><a href="#parameter-project_id"><code>project_id</code></a></td>
    <td><a href="#parameter-limit"><code>limit</code></a>, <a href="#parameter-after"><code>after</code></a>, <a href="#parameter-before"><code>before</code></a></td>
    <td></td>
</tr>
<tr>
    <td><a href="#update"><CopyableCode code="update" /></a></td>
    <td><CopyableCode code="update" /></td>
    <td><a href="#parameter-project_id"><code>project_id</code></a>, <a href="#parameter-rate_limit_id"><code>rate_limit_id</code></a></td>
    <td></td>
    <td></td>
</tr>
</tbody>
</table>

## Parameters

Parameters can be passed in the `WHERE` clause of a query. Check the [Methods](#methods) section to see which parameters are required or optional for each operation.

<table>
<thead>
    <tr>
    <th>Name</th>
    <th>Datatype</th>
    <th>Description</th>
    </tr>
</thead>
<tbody>
<tr id="parameter-project_id">
    <td><CopyableCode code="project_id" /></td>
    <td><code>string</code></td>
    <td>The ID of the project.</td>
</tr>
<tr id="parameter-rate_limit_id">
    <td><CopyableCode code="rate_limit_id" /></td>
    <td><code>string</code></td>
    <td>The ID of the rate limit.</td>
</tr>
<tr id="parameter-after">
    <td><CopyableCode code="after" /></td>
    <td><code>string</code></td>
    <td>A cursor for use in pagination. `after` is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, ending with obj_foo, your subsequent call can include after=obj_foo in order to fetch the next page of the list. </td>
</tr>
<tr id="parameter-before">
    <td><CopyableCode code="before" /></td>
    <td><code>string</code></td>
    <td>A cursor for use in pagination. `before` is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, beginning with obj_foo, your subsequent call can include before=obj_foo in order to fetch the previous page of the list. </td>
</tr>
<tr id="parameter-limit">
    <td><CopyableCode code="limit" /></td>
    <td><code>integer</code></td>
    <td>A limit on the number of objects to be returned. The default is 100. </td>
</tr>
</tbody>
</table>

## `SELECT` examples

<Tabs
    defaultValue="list"
    values={[
        { label: 'list', value: 'list' }
    ]}
>
<TabItem value="list">

Project rate limits listed successfully.

```sql
SELECT
id,
batch_1_day_max_input_tokens,
max_audio_megabytes_per_1_minute,
max_images_per_1_minute,
max_requests_per_1_day,
max_requests_per_1_minute,
max_tokens_per_1_minute,
model,
object
FROM openai_admin.projects.rate_limits
WHERE project_id = '{{ project_id }}' -- required
AND limit = '{{ limit }}'
AND after = '{{ after }}'
AND before = '{{ before }}'
;
```
</TabItem>
</Tabs>


## `UPDATE` examples

<Tabs
    defaultValue="update"
    values={[
        { label: 'update', value: 'update' }
    ]}
>
<TabItem value="update">

No description available.

```sql
UPDATE openai_admin.projects.rate_limits
SET 
max_requests_per_1_minute = {{ max_requests_per_1_minute }},
max_tokens_per_1_minute = {{ max_tokens_per_1_minute }},
max_images_per_1_minute = {{ max_images_per_1_minute }},
max_audio_megabytes_per_1_minute = {{ max_audio_megabytes_per_1_minute }},
max_requests_per_1_day = {{ max_requests_per_1_day }},
batch_1_day_max_input_tokens = {{ batch_1_day_max_input_tokens }}
WHERE 
project_id = '{{ project_id }}' --required
AND rate_limit_id = '{{ rate_limit_id }}' --required
RETURNING
id,
batch_1_day_max_input_tokens,
max_audio_megabytes_per_1_minute,
max_images_per_1_minute,
max_requests_per_1_day,
max_requests_per_1_minute,
max_tokens_per_1_minute,
model,
object;
```
</TabItem>
</Tabs>
