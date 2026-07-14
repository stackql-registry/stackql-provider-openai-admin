#!/usr/bin/env node
// Filters the pinned OpenAI spec TO the organization/administration surface (the inverse
// of the sibling openai provider's filter) and writes the artifact consumed by split.
// Every path is dispositioned - kept with a keep code or removed with a reason code -
// and the full list is emitted as provider-dev/config/filter_report.csv.
// Validate-and-fail-without-writing.
//
// Keep rules (CLAUDE.md scope boundary):
//   organization-subtree                   - everything under /organization
//   admin-key-class-outside-organization   - the six /projects/{project_id} role/group
//                                            paths: same admin key class, dispatched to
//                                            this provider by the sibling openai build's
//                                            filter (org-admin-surface in its
//                                            filter_report.csv); recorded as an open
//                                            item in NOTES.md
//
// Removal reasons mirror the sibling's partition so the two filter reports jointly
// cover the pinned spec with no gaps and no overlaps:
//   platform-surface      - the standard-key platform surface -> the sibling openai provider
//   data-plane-inference  - inference invocation, excluded from both providers
//   binary-transfer       - content downloads / upload parts, excluded from both
//   alpha-unstable        - /fine_tuning/alpha graders, excluded from both
//   beta-ui-surface       - ChatKit, excluded from both

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const inPath = join(repoRoot, 'provider-dev', 'downloaded', 'openapi.yaml');
const outPath = join(repoRoot, 'provider-dev', 'downloaded', 'openapi_cleaned.yaml');
const reportPath = join(repoRoot, 'provider-dev', 'config', 'filter_report.csv');

const HTTP = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// Ordered keep rules; first match wins.
const KEEP_RULES = [
  { re: /^\/organization(\/|$)/, code: 'organization-subtree' },
  { re: /^\/projects\/\{project_id\}\/(roles|groups\/\{group_id\}\/roles|users\/\{user_id\}\/roles)(\/|$)/, code: 'admin-key-class-outside-organization' },
];

// Ordered removal classification (the sibling's exclusion rules, same order); paths
// matching none of these and no keep rule are the sibling's kept platform surface.
const REMOVE_RULES = [
  { re: /^\/files\/\{file_id\}\/content$/, reason: 'binary-transfer' },
  { re: /^\/containers\/\{container_id\}\/files\/\{file_id\}\/content$/, reason: 'binary-transfer' },
  { re: /^\/vector_stores\/\{vector_store_id\}\/files\/\{file_id\}\/content$/, reason: 'binary-transfer' },
  { re: /^\/skills\/.*\/content$/, reason: 'binary-transfer' },
  { re: /^\/uploads\/\{upload_id\}\/parts$/, reason: 'binary-transfer' },
  { re: /^\/chat(\/|$)/, reason: 'data-plane-inference' },
  { re: /^\/completions$/, reason: 'data-plane-inference' },
  { re: /^\/responses(\/|$)/, reason: 'data-plane-inference' },
  { re: /^\/embeddings$/, reason: 'data-plane-inference' },
  { re: /^\/images(\/|$)/, reason: 'data-plane-inference' },
  { re: /^\/audio(\/|$)/, reason: 'data-plane-inference' },
  { re: /^\/moderations$/, reason: 'data-plane-inference' },
  { re: /^\/realtime(\/|$)/, reason: 'data-plane-inference' },
  { re: /^\/videos(\/|$)/, reason: 'data-plane-inference' },
  { re: /^\/fine_tuning\/alpha(\/|$)/, reason: 'alpha-unstable' },
  { re: /^\/chatkit(\/|$)/, reason: 'beta-ui-surface' },
];

const raw = readFileSync(inPath, 'utf8');
const doc = yaml.load(raw);

const prePaths = Object.keys(doc.paths).length;
const preOps = Object.values(doc.paths).reduce((n, item) => n + HTTP.filter((v) => item[v]).length, 0);

const report = [];
const removedPaths = [];
for (const [path, item] of Object.entries(doc.paths)) {
  const verbs = HTTP.filter((v) => item[v]).map((v) => v.toUpperCase()).join(';');
  const opIds = HTTP.filter((v) => item[v]).map((v) => item[v].operationId || '').join(';');
  const keep = KEEP_RULES.find((r) => r.re.test(path));
  if (keep) {
    report.push({ path, verbs, opIds, disposition: 'kept', reason: keep.code });
    continue;
  }
  const rule = REMOVE_RULES.find((r) => r.re.test(path));
  report.push({ path, verbs, opIds, disposition: 'removed', reason: rule ? rule.reason : 'platform-surface' });
  removedPaths.push(path);
}
for (const p of removedPaths) delete doc.paths[p];

const postPaths = Object.keys(doc.paths).length;
const postOps = Object.values(doc.paths).reduce((n, item) => n + HTTP.filter((v) => item[v]).length, 0);

// Every keep rule must match at least one path (stale rule = silent drift).
const staleKeeps = KEEP_RULES.filter((r) => !report.some((x) => x.disposition === 'kept' && r.re.test(x.path)));
if (staleKeeps.length) {
  console.error(`FAIL: ${staleKeeps.length} keep rule(s) matched no path (stale against this spec pin); nothing written`);
  for (const r of staleKeeps) console.error(`  - ${r.re} (${r.code})`);
  process.exit(1);
}

// The inverse filter is validated (non-negotiable 3): no /organization path may be removed,
// and nothing outside the admin key class may survive.
const orgRemoved = report.filter((r) => r.disposition === 'removed' && r.path.startsWith('/organization'));
if (orgRemoved.length) {
  console.error(`FAIL: /organization paths were removed: ${orgRemoved.map((r) => r.path).join(', ')}; nothing written`);
  process.exit(1);
}
const nonAdminSurvivors = Object.keys(doc.paths).filter((p) => !KEEP_RULES.some((r) => r.re.test(p)));
if (nonAdminSurvivors.length) {
  console.error(`FAIL: non-admin paths survived the filter: ${nonAdminSurvivors.join(', ')}; nothing written`);
  process.exit(1);
}

// Stamp tags on untagged operations (the admin_api_keys family ships untagged upstream):
// deterministic rule - 'Admin API Keys'. The split step discriminates on tags, so every
// operation must carry exactly one.
let stamped = 0;
for (const [path, item] of Object.entries(doc.paths)) {
  for (const v of HTTP) {
    const op = item[v];
    if (op && (!op.tags || op.tags.length === 0)) {
      if (!path.startsWith('/organization/admin_api_keys')) {
        console.error(`FAIL: unexpected untagged operation ${v.toUpperCase()} ${path}; nothing written`);
        process.exit(1);
      }
      op.tags = ['Admin API Keys'];
      stamped++;
    }
  }
}
if (stamped) console.log(`Stamped tags on ${stamped} untagged admin_api_keys operation(s)`);

console.log('Validating filtered spec with @apidevtools/swagger-parser ...');
await SwaggerParser.validate(structuredClone(doc));

mkdirSync(dirname(outPath), { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(outPath, yaml.dump(doc, { noRefs: true, lineWidth: -1 }));
const csvEscape = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(
  reportPath,
  ['path,verbs,operation_ids,disposition,reason', ...report
    .sort((a, b) => a.disposition.localeCompare(b.disposition) || a.reason.localeCompare(b.reason) || a.path.localeCompare(b.path))
    .map((r) => [r.path, r.verbs, r.opIds, r.disposition, r.reason].map(csvEscape).join(','))].join('\n') + '\n'
);

console.log(`Pre-filter:  ${prePaths} paths / ${preOps} operations`);
const byReason = {};
for (const r of report) {
  const ops = r.verbs.split(';').filter(Boolean).length;
  const key = `${r.disposition}:${r.reason}`;
  byReason[key] = byReason[key] || { paths: 0, ops: 0 };
  byReason[key].paths++;
  byReason[key].ops += ops;
}
for (const [key, c] of Object.entries(byReason).sort()) console.log(`  ${key}: ${c.paths} paths / ${c.ops} ops`);
console.log(`Post-filter: ${postPaths} paths / ${postOps} operations`);
console.log(`Wrote ${outPath} and ${reportPath}`);
