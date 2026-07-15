--- 
title: audit_logs
hide_title: false
hide_table_of_contents: false
keywords:
  - audit_logs
  - audit_logs
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

Creates, updates, deletes, gets or lists an <code>audit_logs</code> resource.

## Overview
<table><tbody>
<tr><td><b>Name</b></td><td><CopyableCode code="audit_logs" /></td></tr>
<tr><td><b>Type</b></td><td>Resource</td></tr>
<tr><td><b>Id</b></td><td><CopyableCode code="openai_admin.audit_logs.audit_logs" /></td></tr>
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

Audit logs listed successfully.

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
    <td>The ID of this log.</td>
</tr>
<tr>
    <td><CopyableCode code="actor" /></td>
    <td><code>object</code></td>
    <td>The actor who performed the audit logged action.</td>
</tr>
<tr>
    <td><CopyableCode code="api_key.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="api_key.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="api_key.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="certificate.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="certificate.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="certificate.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="certificates.activated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="certificates.deactivated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="checkpoint.permission.created" /></td>
    <td><code>object</code></td>
    <td>The project and fine-tuned model checkpoint that the checkpoint permission was created for.</td>
</tr>
<tr>
    <td><CopyableCode code="checkpoint.permission.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="effective_at" /></td>
    <td><code>integer (unixtime)</code></td>
    <td>The Unix timestamp (in seconds) of the event.</td>
</tr>
<tr>
    <td><CopyableCode code="external_key.registered" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="external_key.removed" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="group.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="group.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="group.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="invite.accepted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="invite.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="invite.sent" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="ip_allowlist.config.activated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="ip_allowlist.config.deactivated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="ip_allowlist.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="ip_allowlist.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="ip_allowlist.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="login.failed" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="login.succeeded" /></td>
    <td><code>string</code></td>
    <td>This event has no additional fields beyond the standard audit log attributes. (opaque JSON object)</td>
</tr>
<tr>
    <td><CopyableCode code="logout.failed" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="logout.succeeded" /></td>
    <td><code>string</code></td>
    <td>This event has no additional fields beyond the standard audit log attributes. (opaque JSON object)</td>
</tr>
<tr>
    <td><CopyableCode code="organization.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="project" /></td>
    <td><code>object</code></td>
    <td>The project that the action was scoped to. Absent for actions not scoped to projects. Note that any admin actions taken via Admin API keys are associated with the default project.</td>
</tr>
<tr>
    <td><CopyableCode code="project.archived" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="project.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="project.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="project.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="rate_limit.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="rate_limit.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="role.assignment.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="role.assignment.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="role.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="role.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="role.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="scim.disabled" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="scim.enabled" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="service_account.created" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="service_account.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="service_account.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="type" /></td>
    <td><code>string</code></td>
    <td>The event type. (api_key.created, api_key.updated, api_key.deleted, certificate.created, certificate.updated, certificate.deleted, certificates.activated, certificates.deactivated, checkpoint.permission.created, checkpoint.permission.deleted, external_key.registered, external_key.removed, group.created, group.updated, group.deleted, invite.sent, invite.accepted, invite.deleted, ip_allowlist.created, ip_allowlist.updated, ip_allowlist.deleted, ip_allowlist.config.activated, ip_allowlist.config.deactivated, login.succeeded, login.failed, logout.succeeded, logout.failed, organization.updated, project.created, project.updated, project.archived, project.deleted, rate_limit.updated, rate_limit.deleted, resource.deleted, tunnel.created, tunnel.updated, tunnel.deleted, role.created, role.updated, role.deleted, role.assignment.created, role.assignment.deleted, scim.enabled, scim.disabled, service_account.created, service_account.updated, service_account.deleted, user.added, user.updated, user.deleted)</td>
</tr>
<tr>
    <td><CopyableCode code="user.added" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="user.deleted" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
</tr>
<tr>
    <td><CopyableCode code="user.updated" /></td>
    <td><code>object</code></td>
    <td>The details for events with this `type`.</td>
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
    <td></td>
    <td><a href="#parameter-effective_at[gt]"><code>effective_at[gt]</code></a>, <a href="#parameter-effective_at[gte]"><code>effective_at[gte]</code></a>, <a href="#parameter-effective_at[lt]"><code>effective_at[lt]</code></a>, <a href="#parameter-effective_at[lte]"><code>effective_at[lte]</code></a>, <a href="#parameter-project_ids[]"><code>project_ids[]</code></a>, <a href="#parameter-event_types[]"><code>event_types[]</code></a>, <a href="#parameter-actor_ids[]"><code>actor_ids[]</code></a>, <a href="#parameter-actor_emails[]"><code>actor_emails[]</code></a>, <a href="#parameter-resource_ids[]"><code>resource_ids[]</code></a>, <a href="#parameter-limit"><code>limit</code></a>, <a href="#parameter-after"><code>after</code></a>, <a href="#parameter-before"><code>before</code></a></td>
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
<tr id="parameter-actor_emails[]">
    <td><CopyableCode code="actor_emails[]" /></td>
    <td><code>array</code></td>
    <td>Return only events performed by users with these emails.</td>
</tr>
<tr id="parameter-actor_ids[]">
    <td><CopyableCode code="actor_ids[]" /></td>
    <td><code>array</code></td>
    <td>Return only events performed by these actors. Can be a user ID, a service account ID, or an api key tracking ID.</td>
</tr>
<tr id="parameter-after">
    <td><CopyableCode code="after" /></td>
    <td><code>string</code></td>
    <td>A cursor for use in pagination. `after` is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, ending with obj_foo, your subsequent call can include after=obj_foo in order to fetch the next page of the list. </td>
</tr>
<tr id="parameter-before">
    <td><CopyableCode code="before" /></td>
    <td><code>string</code></td>
    <td>A cursor for use in pagination. `before` is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, starting with obj_foo, your subsequent call can include before=obj_foo in order to fetch the previous page of the list. </td>
</tr>
<tr id="parameter-effective_at[gt]">
    <td><CopyableCode code="effective_at[gt]" /></td>
    <td><code>integer</code></td>
    <td>Return only events whose `effective_at` (Unix seconds) is greater than this value.</td>
</tr>
<tr id="parameter-effective_at[gte]">
    <td><CopyableCode code="effective_at[gte]" /></td>
    <td><code>integer</code></td>
    <td>Return only events whose `effective_at` (Unix seconds) is greater than or equal to this value.</td>
</tr>
<tr id="parameter-effective_at[lt]">
    <td><CopyableCode code="effective_at[lt]" /></td>
    <td><code>integer</code></td>
    <td>Return only events whose `effective_at` (Unix seconds) is less than this value.</td>
</tr>
<tr id="parameter-effective_at[lte]">
    <td><CopyableCode code="effective_at[lte]" /></td>
    <td><code>integer</code></td>
    <td>Return only events whose `effective_at` (Unix seconds) is less than or equal to this value.</td>
</tr>
<tr id="parameter-event_types[]">
    <td><CopyableCode code="event_types[]" /></td>
    <td><code>array</code></td>
    <td>Return only events with a `type` in one of these values. For example, `project.created`. For all options, see the documentation for the [audit log object](https://platform.openai.com/docs/api-reference/audit-logs/object).</td>
</tr>
<tr id="parameter-limit">
    <td><CopyableCode code="limit" /></td>
    <td><code>integer</code></td>
    <td>A limit on the number of objects to be returned. Limit can range between 1 and 100, and the default is 20. </td>
</tr>
<tr id="parameter-project_ids[]">
    <td><CopyableCode code="project_ids[]" /></td>
    <td><code>array</code></td>
    <td>Return only events for these projects.</td>
</tr>
<tr id="parameter-resource_ids[]">
    <td><CopyableCode code="resource_ids[]" /></td>
    <td><code>array</code></td>
    <td>Return only events performed on these targets. For example, a project ID updated.</td>
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

Audit logs listed successfully.

```sql
SELECT
id,
actor,
api_key.created,
api_key.deleted,
api_key.updated,
certificate.created,
certificate.deleted,
certificate.updated,
certificates.activated,
certificates.deactivated,
checkpoint.permission.created,
checkpoint.permission.deleted,
effective_at,
external_key.registered,
external_key.removed,
group.created,
group.deleted,
group.updated,
invite.accepted,
invite.deleted,
invite.sent,
ip_allowlist.config.activated,
ip_allowlist.config.deactivated,
ip_allowlist.created,
ip_allowlist.deleted,
ip_allowlist.updated,
login.failed,
login.succeeded,
logout.failed,
logout.succeeded,
organization.updated,
project,
project.archived,
project.created,
project.deleted,
project.updated,
rate_limit.deleted,
rate_limit.updated,
role.assignment.created,
role.assignment.deleted,
role.created,
role.deleted,
role.updated,
scim.disabled,
scim.enabled,
service_account.created,
service_account.deleted,
service_account.updated,
type,
user.added,
user.deleted,
user.updated
FROM openai_admin.audit_logs.audit_logs
WHERE effective_at[gt] = '{{ effective_at[gt] }}'
AND effective_at[gte] = '{{ effective_at[gte] }}'
AND effective_at[lt] = '{{ effective_at[lt] }}'
AND effective_at[lte] = '{{ effective_at[lte] }}'
AND project_ids[] = '{{ project_ids[] }}'
AND event_types[] = '{{ event_types[] }}'
AND actor_ids[] = '{{ actor_ids[] }}'
AND actor_emails[] = '{{ actor_emails[] }}'
AND resource_ids[] = '{{ resource_ids[] }}'
AND limit = '{{ limit }}'
AND after = '{{ after }}'
AND before = '{{ before }}'
;
```
</TabItem>
</Tabs>
