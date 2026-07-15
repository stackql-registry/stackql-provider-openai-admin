--- 
title: costs
hide_title: false
hide_table_of_contents: false
keywords:
  - costs
  - costs
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

Creates, updates, deletes, gets or lists a <code>costs</code> resource.

## Overview
<table><tbody>
<tr><td><b>Name</b></td><td><CopyableCode code="costs" /></td></tr>
<tr><td><b>Type</b></td><td>Resource</td></tr>
<tr><td><b>Id</b></td><td><CopyableCode code="openai_admin.costs.costs" /></td></tr>
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

Costs data retrieved successfully.

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
    <td><CopyableCode code="end_time" /></td>
    <td><code>integer</code></td>
    <td></td>
</tr>
<tr>
    <td><CopyableCode code="object" /></td>
    <td><code>string</code></td>
    <td> (bucket)</td>
</tr>
<tr>
    <td><CopyableCode code="results" /></td>
    <td><code>array</code></td>
    <td></td>
</tr>
<tr>
    <td><CopyableCode code="start_time" /></td>
    <td><code>integer</code></td>
    <td></td>
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
    <td><a href="#parameter-start_time"><code>start_time</code></a></td>
    <td><a href="#parameter-end_time"><code>end_time</code></a>, <a href="#parameter-bucket_width"><code>bucket_width</code></a>, <a href="#parameter-project_ids"><code>project_ids</code></a>, <a href="#parameter-api_key_ids"><code>api_key_ids</code></a>, <a href="#parameter-group_by"><code>group_by</code></a>, <a href="#parameter-limit"><code>limit</code></a>, <a href="#parameter-page"><code>page</code></a></td>
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
<tr id="parameter-start_time">
    <td><CopyableCode code="start_time" /></td>
    <td><code>integer</code></td>
    <td>Start time (Unix seconds) of the query time range, inclusive.</td>
</tr>
<tr id="parameter-api_key_ids">
    <td><CopyableCode code="api_key_ids" /></td>
    <td><code>array</code></td>
    <td>Return only costs for these API keys.</td>
</tr>
<tr id="parameter-bucket_width">
    <td><CopyableCode code="bucket_width" /></td>
    <td><code>string</code></td>
    <td>Width of each time bucket in response. Currently only `1d` is supported, default to `1d`.</td>
</tr>
<tr id="parameter-end_time">
    <td><CopyableCode code="end_time" /></td>
    <td><code>integer</code></td>
    <td>End time (Unix seconds) of the query time range, exclusive.</td>
</tr>
<tr id="parameter-group_by">
    <td><CopyableCode code="group_by" /></td>
    <td><code>array</code></td>
    <td>Group the costs by the specified fields. Support fields include `project_id`, `line_item`, `api_key_id` and any combination of them.</td>
</tr>
<tr id="parameter-limit">
    <td><CopyableCode code="limit" /></td>
    <td><code>integer</code></td>
    <td>A limit on the number of buckets to be returned. Limit can range between 1 and 180, and the default is 7. </td>
</tr>
<tr id="parameter-page">
    <td><CopyableCode code="page" /></td>
    <td><code>string</code></td>
    <td>A cursor for use in pagination. Corresponding to the `next_page` field from the previous response.</td>
</tr>
<tr id="parameter-project_ids">
    <td><CopyableCode code="project_ids" /></td>
    <td><code>array</code></td>
    <td>Return only costs for these projects.</td>
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

Costs data retrieved successfully.

```sql
SELECT
end_time,
object,
results,
start_time
FROM openai_admin.costs.costs
WHERE start_time = '{{ start_time }}' -- required
AND end_time = '{{ end_time }}'
AND bucket_width = '{{ bucket_width }}'
AND project_ids = '{{ project_ids }}'
AND api_key_ids = '{{ api_key_ids }}'
AND group_by = '{{ group_by }}'
AND limit = '{{ limit }}'
AND page = '{{ page }}'
;
```
</TabItem>
</Tabs>
