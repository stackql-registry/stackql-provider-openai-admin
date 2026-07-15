#!/usr/bin/env node
// Live evidence runbook for phase 1 tasks 3, 4 and the task 8 governance lifecycle.
// Executes unchanged once keys are present (the nvidia/vsphere blocked-on-key pattern):
//
//   OPENAI_ADMIN_KEY  (required) - an admin key (sk-admin-...), created by an org owner
//   OPENAI_API_KEY    (optional) - a standard key, for the rejection evidence
//
// Probes (reads by default; --lifecycle opts in to the governance writes):
//   1. key-class    - admin key lists projects (expect 200); standard key against the
//                     same endpoint (expect 401); admin key against /models (expect 401)
//   2. bucketed     - /organization/usage/completions with start_time, bucket_width=1d,
//                     group_by=project_id&group_by=model (form-explode array encoding),
//                     next_page traversal to exhaustion (max 5 pages); bucket shape captured
//   3. directory    - /organization/projects with limit=1, derived-cursor traversal
//                     (after = previous page's last_id), terminal-page shape captured
//   4. audit-filter - /organization/audit_logs with effective_at[gt] and event_types[]
//                     bracketed filter pass-through
//   5. lifecycle    - (--lifecycle only) create project stackql-smoke-<stamp>, add a
//                     service account, archive the project - all within the run
//
// Every capture is written to provider-dev/evidence/ with the Authorization header
// redacted. Nothing here consumes tokens: usage and cost are read, never generated.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidenceDir = join(repoRoot, 'provider-dev', 'evidence');

const BASE = 'https://api.openai.com/v1';
const adminKey = process.env.OPENAI_ADMIN_KEY;
const stdKey = process.env.OPENAI_API_KEY;
const doLifecycle = process.argv.includes('--lifecycle');

if (!adminKey) {
  console.error('BLOCKED: OPENAI_ADMIN_KEY is not set. This runbook executes unchanged once an admin key is present.');
  console.error('Optionally set OPENAI_API_KEY (a standard key) for the key-class rejection evidence.');
  process.exit(2);
}

const results = {};
const save = (name, data) => {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
  console.log(`  wrote provider-dev/evidence/${name}.json`);
};

async function call(pathAndQuery, { key = adminKey, method = 'GET', body = null } = {}) {
  const url = `${BASE}${pathAndQuery}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body kept as text */ }
  return { url, method, status: res.status, body: json ?? text };
}

function truncateBuckets(page, maxBuckets = 3, maxResults = 3) {
  if (!page || !Array.isArray(page.data)) return page;
  return {
    ...page,
    data: page.data.slice(0, maxBuckets).map((b) => ({
      ...b,
      results: Array.isArray(b.results) ? b.results.slice(0, maxResults) : b.results,
    })),
    _truncated: page.data.length > maxBuckets ? `${page.data.length} buckets total` : undefined,
  };
}

console.log('1. key-class evidence');
{
  const adminOk = await call('/organization/projects?limit=1');
  const adminCross = await call('/models');
  const evidence = {
    captured_at: new Date().toISOString(),
    admin_key_list_projects: { url: adminOk.url, status: adminOk.status, ok: adminOk.status === 200 },
    admin_key_against_platform_models: { url: adminCross.url, status: adminCross.status, error: adminCross.body?.error ?? null },
  };
  if (stdKey) {
    const stdRejected = await call('/organization/projects?limit=1', { key: stdKey });
    evidence.standard_key_list_projects = { url: stdRejected.url, status: stdRejected.status, error: stdRejected.body?.error ?? null };
  } else {
    evidence.standard_key_list_projects = 'SKIPPED: OPENAI_API_KEY not set';
  }
  save('key_class', evidence);
  if (adminOk.status !== 200) {
    console.error(`FAIL: admin key list-projects returned ${adminOk.status}: ${JSON.stringify(adminOk.body).slice(0, 400)}`);
    process.exit(1);
  }
}

console.log('2. bucketed idiom (usage/completions, group_by on the wire, next_page traversal)');
{
  const start = Math.floor(Date.now() / 1000) - 30 * 86400;
  const qs = `start_time=${start}&bucket_width=1d&limit=7&group_by=project_id&group_by=model`;
  const pages = [];
  let next = null;
  for (let i = 0; i < 5; i++) {
    const q = next ? `${qs}&page=${encodeURIComponent(next)}` : qs;
    const page = await call(`/organization/usage/completions?${q}`);
    pages.push({ request: page.url, status: page.status, body: truncateBuckets(page.body), next_page: page.body?.next_page ?? null, has_more: page.body?.has_more ?? null });
    if (page.status !== 200) break;
    next = page.body?.next_page;
    if (!next) break;
  }
  // negative control for the array encoding: the bracketed form the anthropic API uses
  const bracket = await call(`/organization/usage/completions?start_time=${start}&bucket_width=1d&limit=2&group_by[]=project_id&group_by[]=model`);
  save('bucketed_idiom', {
    captured_at: new Date().toISOString(),
    array_encoding: 'form-explode: group_by=project_id&group_by=model (per the spec default style)',
    pages,
    bracketed_form_control: { request: bracket.url, status: bracket.status, accepted: bracket.status === 200, error: bracket.body?.error ?? null },
  });
}

console.log('3. directory idiom (projects, derived cursor)');
{
  const pages = [];
  let after = null;
  for (let i = 0; i < 4; i++) {
    const q = `limit=1${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const page = await call(`/organization/projects?${q}`);
    pages.push({ request: page.url, status: page.status, first_id: page.body?.first_id ?? null, last_id: page.body?.last_id ?? null, has_more: page.body?.has_more ?? null, row_count: page.body?.data?.length ?? null });
    if (page.status !== 200 || !page.body?.data?.length) break;
    after = page.body.last_id;
    if (after == null) break;
  }
  save('directory_idiom', { captured_at: new Date().toISOString(), derived_cursor: 'after = previous page last_id; terminal page expected data: [] with last_id null/absent', pages });
}

console.log('4. audit-log filter pass-through (bracketed array filters)');
{
  const gt = Math.floor(Date.now() / 1000) - 30 * 86400;
  const page = await call(`/organization/audit_logs?limit=3&effective_at[gt]=${gt}&event_types[]=project.created`);
  save('audit_filter', { captured_at: new Date().toISOString(), request: page.url, status: page.status, row_count: page.body?.data?.length ?? null, first_id: page.body?.first_id ?? null, last_id: page.body?.last_id ?? null, has_more: page.body?.has_more ?? null });
}

if (doLifecycle) {
  console.log('5. governance lifecycle (create project -> add service account -> archive)');
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const name = `stackql-smoke-${stamp}`;
  const created = await call('/organization/projects', { method: 'POST', body: { name } });
  if (created.status !== 200 && created.status !== 201) {
    console.error(`FAIL: project create returned ${created.status}: ${JSON.stringify(created.body).slice(0, 400)}`);
    process.exit(1);
  }
  const projectId = created.body.id;
  const sa = await call(`/organization/projects/${projectId}/service_accounts`, { method: 'POST', body: { name: `${name}-sa` } });
  const archived = await call(`/organization/projects/${projectId}/archive`, { method: 'POST', body: {} });
  save('governance_lifecycle', {
    captured_at: new Date().toISOString(),
    project_name: name,
    create: { status: created.status, id: projectId, status_field: created.body?.status ?? null },
    service_account: { status: sa.status, id: sa.body?.id ?? null, api_key_redacted: sa.body?.api_key ? '(returned, redacted)' : null },
    archive: { status: archived.status, status_field: archived.body?.status ?? null, archived_at: archived.body?.archived_at ?? null },
  });
  if (archived.status !== 200) {
    console.error(`WARNING: archive returned ${archived.status} - project ${projectId} (${name}) may need manual archiving`);
    process.exit(1);
  }
} else {
  console.log('5. governance lifecycle SKIPPED (opt in with --lifecycle)');
}

console.log('Done. Evidence in provider-dev/evidence/');
