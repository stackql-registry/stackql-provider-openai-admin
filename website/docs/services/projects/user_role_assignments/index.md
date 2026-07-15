--- 
title: user_role_assignments
hide_title: false
hide_table_of_contents: false
keywords:
  - user_role_assignments
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

Creates, updates, deletes, gets or lists a <code>user_role_assignments</code> resource.

## Overview
<table><tbody>
<tr><td><b>Name</b></td><td><CopyableCode code="user_role_assignments" /></td></tr>
<tr><td><b>Type</b></td><td>Resource</td></tr>
<tr><td><b>Id</b></td><td><CopyableCode code="openai_admin.projects.user_role_assignments" /></td></tr>
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

Project user role assignments listed successfully.

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
    <td>Identifier for the role.</td>
</tr>
<tr>
    <td><CopyableCode code="name" /></td>
    <td><code>string</code></td>
    <td>Name of the role.</td>
</tr>
<tr>
    <td><CopyableCode code="created_at" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>When the role was created.</td>
</tr>
<tr>
    <td><CopyableCode code="created_by" /></td>
    <td><code>string</code></td>
    <td>Identifier of the actor who created the role.</td>
</tr>
<tr>
    <td><CopyableCode code="created_by_user_obj" /></td>
    <td><code>object</code></td>
    <td>User details for the actor that created the role, when available.</td>
</tr>
<tr>
    <td><CopyableCode code="description" /></td>
    <td><code>string</code></td>
    <td>Description of the role.</td>
</tr>
<tr>
    <td><CopyableCode code="metadata" /></td>
    <td><code>object</code></td>
    <td>Arbitrary metadata stored on the role.</td>
</tr>
<tr>
    <td><CopyableCode code="permissions" /></td>
    <td><code>array</code></td>
    <td>Permissions associated with the role.</td>
</tr>
<tr>
    <td><CopyableCode code="predefined_role" /></td>
    <td><code>boolean</code></td>
    <td>Whether the role is predefined by OpenAI.</td>
</tr>
<tr>
    <td><CopyableCode code="resource_type" /></td>
    <td><code>string</code></td>
    <td>Resource type the role applies to.</td>
</tr>
<tr>
    <td><CopyableCode code="updated_at" /></td>
    <td><code>integer (int64)</code></td>
    <td>When the role was last updated.</td>
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
    <td><a href="#parameter-project_id"><code>project_id</code></a>, <a href="#parameter-user_id"><code>user_id</code></a></td>
    <td><a href="#parameter-limit"><code>limit</code></a>, <a href="#parameter-after"><code>after</code></a>, <a href="#parameter-order"><code>order</code></a></td>
    <td></td>
</tr>
<tr>
    <td><a href="#assign"><CopyableCode code="assign" /></a></td>
    <td><CopyableCode code="insert" /></td>
    <td><a href="#parameter-project_id"><code>project_id</code></a>, <a href="#parameter-user_id"><code>user_id</code></a>, <a href="#parameter-role_id"><code>role_id</code></a></td>
    <td></td>
    <td></td>
</tr>
<tr>
    <td><a href="#unassign"><CopyableCode code="unassign" /></a></td>
    <td><CopyableCode code="delete" /></td>
    <td><a href="#parameter-project_id"><code>project_id</code></a>, <a href="#parameter-user_id"><code>user_id</code></a>, <a href="#parameter-role_id"><code>role_id</code></a></td>
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
    <td>The ID of the project to modify.</td>
</tr>
<tr id="parameter-role_id">
    <td><CopyableCode code="role_id" /></td>
    <td><code>string</code></td>
    <td>The ID of the project role to remove from the user.</td>
</tr>
<tr id="parameter-user_id">
    <td><CopyableCode code="user_id" /></td>
    <td><code>string</code></td>
    <td>The ID of the user whose project role assignment should be removed.</td>
</tr>
<tr id="parameter-after">
    <td><CopyableCode code="after" /></td>
    <td><code>string</code></td>
    <td>Cursor for pagination. Provide the value from the previous response's `next` field to continue listing project roles.</td>
</tr>
<tr id="parameter-limit">
    <td><CopyableCode code="limit" /></td>
    <td><code>integer</code></td>
    <td>A limit on the number of project role assignments to return.</td>
</tr>
<tr id="parameter-order">
    <td><CopyableCode code="order" /></td>
    <td><code>string</code></td>
    <td>Sort order for the returned project roles.</td>
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

Project user role assignments listed successfully.

```sql
SELECT
id,
name,
created_at,
created_by,
created_by_user_obj,
description,
metadata,
permissions,
predefined_role,
resource_type,
updated_at
FROM openai_admin.projects.user_role_assignments
WHERE project_id = '{{ project_id }}' -- required
AND user_id = '{{ user_id }}' -- required
AND limit = '{{ limit }}'
AND after = '{{ after }}'
AND order = '{{ order }}'
;
```
</TabItem>
</Tabs>


## `INSERT` examples

<Tabs
    defaultValue="assign"
    values={[
        { label: 'assign', value: 'assign' },
        { label: 'Manifest', value: 'manifest' }
    ]}
>
<TabItem value="assign">

No description available.

```sql
INSERT INTO openai_admin.projects.user_role_assignments (
role_id,
project_id,
user_id
)
SELECT 
'{{ role_id }}' /* required */,
'{{ project_id }}',
'{{ user_id }}'
RETURNING
object,
role,
user
;
```
</TabItem>
<TabItem value="manifest">

<CodeBlock language="yaml">{`# Description fields are for documentation purposes
- name: user_role_assignments
  props:
    - name: project_id
      value: "{{ project_id }}"
      description: Required parameter for the user_role_assignments resource.
    - name: user_id
      value: "{{ user_id }}"
      description: Required parameter for the user_role_assignments resource.
    - name: role_id
      value: "{{ role_id }}"
      description: |
        Identifier of the role to assign.
`}</CodeBlock>

</TabItem>
</Tabs>


## `DELETE` examples

<Tabs
    defaultValue="unassign"
    values={[
        { label: 'unassign', value: 'unassign' }
    ]}
>
<TabItem value="unassign">

No description available.

```sql
DELETE FROM openai_admin.projects.user_role_assignments
WHERE project_id = '{{ project_id }}' --required
AND user_id = '{{ user_id }}' --required
AND role_id = '{{ role_id }}' --required
;
```
</TabItem>
</Tabs>
