--- 
title: users
hide_title: false
hide_table_of_contents: false
keywords:
  - users
  - users
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

Creates, updates, deletes, gets or lists a <code>users</code> resource.

## Overview
<table><tbody>
<tr><td><b>Name</b></td><td><CopyableCode code="users" /></td></tr>
<tr><td><b>Type</b></td><td>Resource</td></tr>
<tr><td><b>Id</b></td><td><CopyableCode code="openai_admin.users.users" /></td></tr>
</tbody></table>

## Fields

The following fields are returned by `SELECT` queries:

<Tabs
    defaultValue="get"
    values={[
        { label: 'get', value: 'get' },
        { label: 'list', value: 'list' }
    ]}
>
<TabItem value="get">

User retrieved successfully.

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
    <td>The identifier, which can be referenced in API endpoints</td>
</tr>
<tr>
    <td><CopyableCode code="name" /></td>
    <td><code>string</code></td>
    <td>The name of the user</td>
</tr>
<tr>
    <td><CopyableCode code="added_at" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of when the user was added.</td>
</tr>
<tr>
    <td><CopyableCode code="api_key_last_used_at" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of the user's last API key usage.</td>
</tr>
<tr>
    <td><CopyableCode code="created" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of when the user was created.</td>
</tr>
<tr>
    <td><CopyableCode code="developer_persona" /></td>
    <td><code>string</code></td>
    <td>The developer persona metadata for the user.</td>
</tr>
<tr>
    <td><CopyableCode code="email" /></td>
    <td><code>string</code></td>
    <td>The email address of the user</td>
</tr>
<tr>
    <td><CopyableCode code="is_default" /></td>
    <td><code>boolean</code></td>
    <td>Whether this is the organization's default user.</td>
</tr>
<tr>
    <td><CopyableCode code="is_scale_tier_authorized_purchaser" /></td>
    <td><code>boolean</code></td>
    <td>Whether the user is an authorized purchaser for Scale Tier.</td>
</tr>
<tr>
    <td><CopyableCode code="is_scim_managed" /></td>
    <td><code>boolean</code></td>
    <td>Whether the user is managed through SCIM.</td>
</tr>
<tr>
    <td><CopyableCode code="is_service_account" /></td>
    <td><code>boolean</code></td>
    <td>Whether the user is a service account.</td>
</tr>
<tr>
    <td><CopyableCode code="object" /></td>
    <td><code>string</code></td>
    <td>The object type, which is always `organization.user` (organization.user)</td>
</tr>
<tr>
    <td><CopyableCode code="projects" /></td>
    <td><code>object</code></td>
    <td>Projects associated with the user, if included.</td>
</tr>
<tr>
    <td><CopyableCode code="role" /></td>
    <td><code>string</code></td>
    <td>`owner` or `reader`</td>
</tr>
<tr>
    <td><CopyableCode code="technical_level" /></td>
    <td><code>string</code></td>
    <td>The technical level metadata for the user.</td>
</tr>
<tr>
    <td><CopyableCode code="user" /></td>
    <td><code>object</code></td>
    <td>Nested user details.</td>
</tr>
</tbody>
</table>
</TabItem>
<TabItem value="list">

Users listed successfully.

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
    <td>The identifier, which can be referenced in API endpoints</td>
</tr>
<tr>
    <td><CopyableCode code="name" /></td>
    <td><code>string</code></td>
    <td>The name of the user</td>
</tr>
<tr>
    <td><CopyableCode code="added_at" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of when the user was added.</td>
</tr>
<tr>
    <td><CopyableCode code="api_key_last_used_at" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of the user's last API key usage.</td>
</tr>
<tr>
    <td><CopyableCode code="created" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of when the user was created.</td>
</tr>
<tr>
    <td><CopyableCode code="developer_persona" /></td>
    <td><code>string</code></td>
    <td>The developer persona metadata for the user.</td>
</tr>
<tr>
    <td><CopyableCode code="email" /></td>
    <td><code>string</code></td>
    <td>The email address of the user</td>
</tr>
<tr>
    <td><CopyableCode code="is_default" /></td>
    <td><code>boolean</code></td>
    <td>Whether this is the organization's default user.</td>
</tr>
<tr>
    <td><CopyableCode code="is_scale_tier_authorized_purchaser" /></td>
    <td><code>boolean</code></td>
    <td>Whether the user is an authorized purchaser for Scale Tier.</td>
</tr>
<tr>
    <td><CopyableCode code="is_scim_managed" /></td>
    <td><code>boolean</code></td>
    <td>Whether the user is managed through SCIM.</td>
</tr>
<tr>
    <td><CopyableCode code="is_service_account" /></td>
    <td><code>boolean</code></td>
    <td>Whether the user is a service account.</td>
</tr>
<tr>
    <td><CopyableCode code="object" /></td>
    <td><code>string</code></td>
    <td>The object type, which is always `organization.user` (organization.user)</td>
</tr>
<tr>
    <td><CopyableCode code="projects" /></td>
    <td><code>object</code></td>
    <td>Projects associated with the user, if included.</td>
</tr>
<tr>
    <td><CopyableCode code="role" /></td>
    <td><code>string</code></td>
    <td>`owner` or `reader`</td>
</tr>
<tr>
    <td><CopyableCode code="technical_level" /></td>
    <td><code>string</code></td>
    <td>The technical level metadata for the user.</td>
</tr>
<tr>
    <td><CopyableCode code="user" /></td>
    <td><code>object</code></td>
    <td>Nested user details.</td>
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
    <td><a href="#get"><CopyableCode code="get" /></a></td>
    <td><CopyableCode code="select" /></td>
    <td><a href="#parameter-user_id"><code>user_id</code></a></td>
    <td></td>
    <td></td>
</tr>
<tr>
    <td><a href="#list"><CopyableCode code="list" /></a></td>
    <td><CopyableCode code="select" /></td>
    <td></td>
    <td><a href="#parameter-limit"><code>limit</code></a>, <a href="#parameter-after"><code>after</code></a>, <a href="#parameter-emails"><code>emails</code></a></td>
    <td></td>
</tr>
<tr>
    <td><a href="#update"><CopyableCode code="update" /></a></td>
    <td><CopyableCode code="update" /></td>
    <td><a href="#parameter-user_id"><code>user_id</code></a></td>
    <td></td>
    <td></td>
</tr>
<tr>
    <td><a href="#delete"><CopyableCode code="delete" /></a></td>
    <td><CopyableCode code="delete" /></td>
    <td><a href="#parameter-user_id"><code>user_id</code></a></td>
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
<tr id="parameter-user_id">
    <td><CopyableCode code="user_id" /></td>
    <td><code>string</code></td>
    <td>The ID of the user.</td>
</tr>
<tr id="parameter-after">
    <td><CopyableCode code="after" /></td>
    <td><code>string</code></td>
    <td>A cursor for use in pagination. `after` is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, ending with obj_foo, your subsequent call can include after=obj_foo in order to fetch the next page of the list. </td>
</tr>
<tr id="parameter-emails">
    <td><CopyableCode code="emails" /></td>
    <td><code>array</code></td>
    <td>Filter by the email address of users.</td>
</tr>
<tr id="parameter-limit">
    <td><CopyableCode code="limit" /></td>
    <td><code>integer</code></td>
    <td>A limit on the number of objects to be returned. Limit can range between 1 and 100, and the default is 20. </td>
</tr>
</tbody>
</table>

## `SELECT` examples

<Tabs
    defaultValue="get"
    values={[
        { label: 'get', value: 'get' },
        { label: 'list', value: 'list' }
    ]}
>
<TabItem value="get">

User retrieved successfully.

```sql
SELECT
id,
name,
added_at,
api_key_last_used_at,
created,
developer_persona,
email,
is_default,
is_scale_tier_authorized_purchaser,
is_scim_managed,
is_service_account,
object,
projects,
role,
technical_level,
user
FROM openai_admin.users.users
WHERE user_id = '{{ user_id }}' -- required
;
```
</TabItem>
<TabItem value="list">

Users listed successfully.

```sql
SELECT
id,
name,
added_at,
api_key_last_used_at,
created,
developer_persona,
email,
is_default,
is_scale_tier_authorized_purchaser,
is_scim_managed,
is_service_account,
object,
projects,
role,
technical_level,
user
FROM openai_admin.users.users
WHERE limit = '{{ limit }}'
AND after = '{{ after }}'
AND emails = '{{ emails }}'
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
UPDATE openai_admin.users.users
SET 
role = '{{ role }}',
role_id = '{{ role_id }}',
technical_level = '{{ technical_level }}',
developer_persona = '{{ developer_persona }}'
WHERE 
user_id = '{{ user_id }}' --required
RETURNING
id,
name,
added_at,
api_key_last_used_at,
created,
developer_persona,
email,
is_default,
is_scale_tier_authorized_purchaser,
is_scim_managed,
is_service_account,
object,
projects,
role,
technical_level,
user;
```
</TabItem>
</Tabs>


## `DELETE` examples

<Tabs
    defaultValue="delete"
    values={[
        { label: 'delete', value: 'delete' }
    ]}
>
<TabItem value="delete">

No description available.

```sql
DELETE FROM openai_admin.users.users
WHERE user_id = '{{ user_id }}' --required
;
```
</TabItem>
</Tabs>
