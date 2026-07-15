#!/usr/bin/env node
// Builds provider-dev/config/endpoint_inventory.csv over the filtered spec
// (provider-dev/downloaded/openapi_cleaned.yaml): one row per operation with the
// proposed service/resource/method/SQL-verb mapping, the pagination idiom,
// group_by support, request-body and update-semantics flags.
// Deterministic rules; validate-and-fail-without-writing.
//
// The idiom is derived structurally from the 200 response envelope, never from a
// hand list. Three exist on this surface (see NOTES.md section 4):
//   bucketed        {object, data[bucket], has_more, next_page} + `page` request
//                   param -> requestToken page, responseToken $.next_page
//   cursor-derived  {object, data, first_id, last_id, has_more} + `after` request
//                   param -> requestToken after, responseToken $.last_id (the
//                   token is derived: no dedicated next-token field)
//   cursor-next     {object, data, has_more, next} + `after` request param ->
//                   requestToken after, responseToken $.next (an explicit cursor
//                   that nulls out on the last page - the RBAC family)
// post_process.mjs consumes this column to stamp the configs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const inPath = join(repoRoot, 'provider-dev', 'downloaded', 'openapi_cleaned.yaml');
const outPath = join(repoRoot, 'provider-dev', 'config', 'endpoint_inventory.csv');

const HTTP = ['get', 'post', 'delete', 'put', 'patch'];

// operationId -> {service, resource, method, verb} - explicit, exhaustive, auditable.
// Verb rules: GET list -> SELECT .list; GET single -> SELECT .get; POST create /
// membership-or-assignment add -> INSERT; POST partial update -> UPDATE (update_post
// flagged; all admin update bodies have zero required properties - partial by
// construction, keycloak-warning evidence recorded in NOTES.md); DELETE -> DELETE;
// lifecycle actions (archive, activate, deactivate) -> EXEC.
const OPS = {
  // usage - one SELECT-able bucketed resource per capability (8 capabilities in the pin)
  'usage-completions': { service: 'usage', resource: 'completions', method: 'list', verb: 'select' },
  'usage-embeddings': { service: 'usage', resource: 'embeddings', method: 'list', verb: 'select' },
  'usage-moderations': { service: 'usage', resource: 'moderations', method: 'list', verb: 'select' },
  'usage-images': { service: 'usage', resource: 'images', method: 'list', verb: 'select' },
  'usage-audio-speeches': { service: 'usage', resource: 'audio_speeches', method: 'list', verb: 'select' },
  'usage-audio-transcriptions': { service: 'usage', resource: 'audio_transcriptions', method: 'list', verb: 'select' },
  'usage-vector-stores': { service: 'usage', resource: 'vector_stores', method: 'list', verb: 'select' },
  'usage-code-interpreter-sessions': { service: 'usage', resource: 'code_interpreter_sessions', method: 'list', verb: 'select' },

  // costs - daily USD buckets, read-only
  'usage-costs': { service: 'costs', resource: 'costs', method: 'list', verb: 'select' },

  // projects - the governance core
  'list-projects': { service: 'projects', resource: 'projects', method: 'list', verb: 'select' },
  'create-project': { service: 'projects', resource: 'projects', method: 'create', verb: 'insert' },
  'retrieve-project': { service: 'projects', resource: 'projects', method: 'get', verb: 'select' },
  'modify-project': { service: 'projects', resource: 'projects', method: 'update', verb: 'update', updatePost: true },
  'archive-project': { service: 'projects', resource: 'projects', method: 'archive', verb: 'exec', notes: 'disposal is archive-based; no delete exists' },
  'list-project-api-keys': { service: 'projects', resource: 'api_keys', method: 'list', verb: 'select' },
  'retrieve-project-api-key': { service: 'projects', resource: 'api_keys', method: 'get', verb: 'select' },
  'delete-project-api-key': { service: 'projects', resource: 'api_keys', method: 'delete', verb: 'delete', notes: 'no create - project keys are created in-console or via service accounts' },
  'list-project-service-accounts': { service: 'projects', resource: 'service_accounts', method: 'list', verb: 'select' },
  'create-project-service-account': { service: 'projects', resource: 'service_accounts', method: 'create', verb: 'insert', notes: 'response includes the service account api key (returned once)' },
  'retrieve-project-service-account': { service: 'projects', resource: 'service_accounts', method: 'get', verb: 'select' },
  'delete-project-service-account': { service: 'projects', resource: 'service_accounts', method: 'delete', verb: 'delete' },
  'list-project-users': { service: 'projects', resource: 'users', method: 'list', verb: 'select' },
  'create-project-user': { service: 'projects', resource: 'users', method: 'create', verb: 'insert' },
  'retrieve-project-user': { service: 'projects', resource: 'users', method: 'get', verb: 'select' },
  'modify-project-user': { service: 'projects', resource: 'users', method: 'update', verb: 'update', updatePost: true },
  'delete-project-user': { service: 'projects', resource: 'users', method: 'delete', verb: 'delete' },
  'list-project-rate-limits': { service: 'projects', resource: 'rate_limits', method: 'list', verb: 'select' },
  'update-project-rate-limits': { service: 'projects', resource: 'rate_limits', method: 'update', verb: 'update', updatePost: true },
  'list-project-groups': { service: 'projects', resource: 'groups', method: 'list', verb: 'select' },
  'add-project-group': { service: 'projects', resource: 'groups', method: 'add', verb: 'insert' },
  'remove-project-group': { service: 'projects', resource: 'groups', method: 'remove', verb: 'delete' },
  'list-project-group-role-assignments': { service: 'projects', resource: 'group_role_assignments', method: 'list', verb: 'select' },
  'assign-project-group-role': { service: 'projects', resource: 'group_role_assignments', method: 'assign', verb: 'insert' },
  'unassign-project-group-role': { service: 'projects', resource: 'group_role_assignments', method: 'unassign', verb: 'delete' },
  'list-project-user-role-assignments': { service: 'projects', resource: 'user_role_assignments', method: 'list', verb: 'select' },
  'assign-project-user-role': { service: 'projects', resource: 'user_role_assignments', method: 'assign', verb: 'insert' },
  'unassign-project-user-role': { service: 'projects', resource: 'user_role_assignments', method: 'unassign', verb: 'delete' },
  'list-project-roles': { service: 'roles', resource: 'project_roles', method: 'list', verb: 'select' },
  'create-project-role': { service: 'roles', resource: 'project_roles', method: 'create', verb: 'insert' },
  'update-project-role': { service: 'roles', resource: 'project_roles', method: 'update', verb: 'update', updatePost: true },
  'delete-project-role': { service: 'roles', resource: 'project_roles', method: 'delete', verb: 'delete' },

  // users - org membership and org role assignments
  'list-users': { service: 'users', resource: 'users', method: 'list', verb: 'select' },
  'retrieve-user': { service: 'users', resource: 'users', method: 'get', verb: 'select' },
  'modify-user': { service: 'users', resource: 'users', method: 'update', verb: 'update', updatePost: true },
  'delete-user': { service: 'users', resource: 'users', method: 'delete', verb: 'delete' },
  'list-user-role-assignments': { service: 'users', resource: 'role_assignments', method: 'list', verb: 'select' },
  'assign-user-role': { service: 'users', resource: 'role_assignments', method: 'assign', verb: 'insert' },
  'unassign-user-role': { service: 'users', resource: 'role_assignments', method: 'unassign', verb: 'delete' },

  // invites
  'list-invites': { service: 'invites', resource: 'invites', method: 'list', verb: 'select' },
  'inviteUser': { service: 'invites', resource: 'invites', method: 'create', verb: 'insert' },
  'retrieve-invite': { service: 'invites', resource: 'invites', method: 'get', verb: 'select' },
  'delete-invite': { service: 'invites', resource: 'invites', method: 'delete', verb: 'delete' },

  // groups - org groups, their members, their org role assignments
  'list-groups': { service: 'groups', resource: 'groups', method: 'list', verb: 'select' },
  'create-group': { service: 'groups', resource: 'groups', method: 'create', verb: 'insert' },
  'update-group': { service: 'groups', resource: 'groups', method: 'update', verb: 'update', updatePost: true, notes: 'rename only - body is exactly {name} (required)' },
  'delete-group': { service: 'groups', resource: 'groups', method: 'delete', verb: 'delete' },
  'list-group-users': { service: 'groups', resource: 'users', method: 'list', verb: 'select' },
  'add-group-user': { service: 'groups', resource: 'users', method: 'add', verb: 'insert' },
  'remove-group-user': { service: 'groups', resource: 'users', method: 'remove', verb: 'delete' },
  'list-group-role-assignments': { service: 'groups', resource: 'role_assignments', method: 'list', verb: 'select' },
  'assign-group-role': { service: 'groups', resource: 'role_assignments', method: 'assign', verb: 'insert' },
  'unassign-group-role': { service: 'groups', resource: 'role_assignments', method: 'unassign', verb: 'delete' },

  // roles - org role definitions (project_roles live here too, rows above)
  'list-roles': { service: 'roles', resource: 'roles', method: 'list', verb: 'select' },
  'create-role': { service: 'roles', resource: 'roles', method: 'create', verb: 'insert' },
  'update-role': { service: 'roles', resource: 'roles', method: 'update', verb: 'update', updatePost: true },
  'delete-role': { service: 'roles', resource: 'roles', method: 'delete', verb: 'delete' },

  // admin_api_keys
  'admin-api-keys-list': { service: 'admin_api_keys', resource: 'admin_api_keys', method: 'list', verb: 'select' },
  'admin-api-keys-create': { service: 'admin_api_keys', resource: 'admin_api_keys', method: 'create', verb: 'insert', notes: 'key value returned once on create' },
  'admin-api-keys-get': { service: 'admin_api_keys', resource: 'admin_api_keys', method: 'get', verb: 'select' },
  'admin-api-keys-delete': { service: 'admin_api_keys', resource: 'admin_api_keys', method: 'delete', verb: 'delete' },

  // audit_logs - append-only reads with rich filter pass-through
  'list-audit-logs': { service: 'audit_logs', resource: 'audit_logs', method: 'list', verb: 'select' },

  // certificates - org and project scopes
  'listOrganizationCertificates': { service: 'certificates', resource: 'certificates', method: 'list', verb: 'select' },
  'uploadCertificate': { service: 'certificates', resource: 'certificates', method: 'upload', verb: 'insert', notes: 'PEM content as a JSON string field - SQL-expressible' },
  'getCertificate': { service: 'certificates', resource: 'certificates', method: 'get', verb: 'select' },
  'modifyCertificate': { service: 'certificates', resource: 'certificates', method: 'update', verb: 'update', updatePost: true, notes: 'rename only - body requires name' },
  'deleteCertificate': { service: 'certificates', resource: 'certificates', method: 'delete', verb: 'delete' },
  'activateOrganizationCertificates': { service: 'certificates', resource: 'certificates', method: 'activate', verb: 'exec' },
  'deactivateOrganizationCertificates': { service: 'certificates', resource: 'certificates', method: 'deactivate', verb: 'exec' },
  'listProjectCertificates': { service: 'certificates', resource: 'project_certificates', method: 'list', verb: 'select' },
  'activateProjectCertificates': { service: 'certificates', resource: 'project_certificates', method: 'activate', verb: 'exec' },
  'deactivateProjectCertificates': { service: 'certificates', resource: 'project_certificates', method: 'deactivate', verb: 'exec' },
};

const doc = yaml.load(readFileSync(inPath, 'utf8'));
const resolveRef = (ref) => ref.split('/').slice(1).reduce((o, k) => o[k], doc);

const errors = [];
const rows = [];
const seenOpIds = new Set();

for (const [path, item] of Object.entries(doc.paths)) {
  const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  for (const httpVerb of HTTP) {
    const op = item[httpVerb];
    if (!op) continue;
    const opId = op.operationId;
    if (!opId) {
      errors.push(`${httpVerb.toUpperCase()} ${path}: missing operationId`);
      continue;
    }
    if (seenOpIds.has(opId)) errors.push(`duplicate operationId ${opId}`);
    seenOpIds.add(opId);
    const rule = OPS[opId];
    if (!rule) {
      errors.push(`${opId} (${httpVerb.toUpperCase()} ${path}): no classification rule`);
      continue;
    }

    // envelope and idiom facts from the 200 response
    let schema = op.responses?.['200']?.content?.['application/json']?.schema;
    if (schema?.$ref) schema = resolveRef(schema.$ref);
    const props = schema?.properties || {};
    const keys = Object.keys(props);
    let envelope = '';
    let idiom = '';
    let objectKey = '';
    if (props.data) {
      objectKey = '$.data';
      if (keys.includes('next_page')) {
        envelope = 'bucketed-page';
        idiom = 'bucketed';
      } else if (keys.includes('last_id')) {
        envelope = 'list-cursor';
        idiom = 'cursor-derived';
      } else if (keys.includes('next')) {
        envelope = 'list-next';
        idiom = 'cursor-next';
      } else {
        envelope = 'list-plain';
        idiom = 'unpaginated';
      }
    } else if (schema) {
      envelope = 'object';
      idiom = 'single';
    }

    const params = (op.parameters || []).map((p) => (p.$ref ? resolveRef(p.$ref) : p));
    const queryParams = params.filter((p) => p.in === 'query').map((p) => p.name);
    const groupBy = params.find((p) => p.in === 'query' && p.name === 'group_by');
    const groupByValues = groupBy ? (groupBy.schema?.items?.enum || []).join(' ') : '';
    const cursorParams = queryParams.filter((q) => ['limit', 'after', 'before', 'page'].includes(q));

    // request body facts (update semantics evidence: required-property count)
    let hasBody = '';
    let bodyRequiredProps = '';
    const bodySchemaRaw = op.requestBody?.content?.['application/json']?.schema;
    if (bodySchemaRaw) {
      hasBody = 'y';
      const bodySchema = bodySchemaRaw.$ref ? resolveRef(bodySchemaRaw.$ref) : bodySchemaRaw;
      bodyRequiredProps = (bodySchema.required || []).join(' ');
    }

    rows.push({
      service: rule.service,
      resource: rule.resource,
      sql_verb: rule.verb,
      method: rule.method,
      http_verb: httpVerb.toUpperCase(),
      path,
      operation_id: opId,
      idiom: rule.method === 'list' ? idiom : idiom === 'single' ? 'single' : idiom,
      envelope,
      object_key: rule.method === 'list' ? objectKey : '',
      group_by: groupByValues,
      cursor_params: cursorParams.join(' '),
      path_params: pathParams.join(' '),
      has_body: hasBody,
      body_required_props: bodyRequiredProps,
      update_post: rule.updatePost ? 'y' : '',
      notes: rule.notes || '',
    });
  }
}

// coverage both directions
for (const opId of Object.keys(OPS)) {
  if (!seenOpIds.has(opId)) errors.push(`rule for ${opId} matches no operation in the filtered spec`);
}
// idiom sanity: every list carries $.data, and each idiom declares the request param
// its config depends on. An unpaginated list would need a documented posture, so it
// fails the run rather than silently shipping as first-page-only.
for (const r of rows) {
  if (r.method !== 'list') continue;
  if (!r.object_key) errors.push(`${r.service}.${r.resource}.list (${r.operation_id}): no $.data object key`);
  if (r.idiom === 'bucketed' && !r.cursor_params.includes('page'))
    errors.push(`${r.operation_id}: bucketed envelope without a page request param`);
  if ((r.idiom === 'cursor-derived' || r.idiom === 'cursor-next') && !r.cursor_params.includes('after'))
    errors.push(`${r.operation_id}: ${r.idiom} envelope without an after request param`);
  if (r.idiom !== 'bucketed' && !r.cursor_params.includes('limit'))
    errors.push(`${r.operation_id}: list without a limit param`);
  if (r.idiom === 'unpaginated')
    errors.push(`${r.operation_id}: list envelope carries no cursor field (next_page/last_id/next) - decide a posture, do not ship silently`);
}
for (const r of rows) {
  if (r.idiom === 'bucketed' && ['usage', 'costs'].includes(r.service) && !r.group_by)
    errors.push(`${r.operation_id}: usage/costs op without group_by`);
}
// update-POSTs must be partial by construction unless the note says otherwise
for (const r of rows) {
  if (r.update_post && r.body_required_props && !r.notes) {
    errors.push(`${r.operation_id}: update-POST with required body props [${r.body_required_props}] and no note`);
  }
}
// unique (service, resource, method) and unique path-param signature per (service, resource, sql_verb)
const methodKeys = new Set();
const sigMap = new Map();
for (const r of rows) {
  const mk = `${r.service}.${r.resource}.${r.method}`;
  if (methodKeys.has(mk)) errors.push(`duplicate method key ${mk}`);
  methodKeys.add(mk);
  if (['select', 'insert', 'update', 'delete'].includes(r.sql_verb)) {
    const sk = `${r.service}.${r.resource}.${r.sql_verb}:${r.path_params}`;
    if (sigMap.has(sk)) errors.push(`signature collision ${sk} (${sigMap.get(sk)} vs ${r.operation_id})`);
    sigMap.set(sk, r.operation_id);
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} validation error(s); nothing written`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const cols = ['service', 'resource', 'sql_verb', 'method', 'http_verb', 'path', 'operation_id', 'idiom', 'envelope', 'object_key', 'group_by', 'cursor_params', 'path_params', 'has_body', 'body_required_props', 'update_post', 'notes'];
const csvEscape = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
rows.sort((a, b) => a.service.localeCompare(b.service) || a.resource.localeCompare(b.resource) || a.path.localeCompare(b.path) || a.http_verb.localeCompare(b.http_verb));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(String(r[c]))).join(','))].join('\n') + '\n');

const count = (arr, fn) => {
  const m = {};
  for (const x of arr) {
    const k = fn(x);
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort();
};
console.log(`Wrote ${rows.length} operations (all mapped, none skipped) -> ${outPath}`);
console.log(`Resources: ${new Set(rows.map((r) => `${r.service}.${r.resource}`)).size} across ${new Set(rows.map((r) => r.service)).size} services`);
console.log('By service:');
for (const [k, v] of count(rows, (r) => r.service)) console.log(`  ${k}: ${v}`);
console.log('By SQL verb:');
for (const [k, v] of count(rows, (r) => r.sql_verb)) console.log(`  ${k}: ${v}`);
console.log('By idiom (list methods):');
for (const [k, v] of count(rows.filter((r) => r.method === 'list'), (r) => r.idiom)) console.log(`  ${k}: ${v}`);
console.log(`group_by ops: ${rows.filter((r) => r.group_by).length}; update-POSTs: ${rows.filter((r) => r.update_post).length}; body-bearing: ${rows.filter((r) => r.has_body).length}`);
