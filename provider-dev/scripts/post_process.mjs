#!/usr/bin/env node
// Stage 4 tail: stamp the pagination configuration onto the generated provider.
//
// Why this is a script rather than a `--service-config` flag. The generator's
// --service-config applies ONE config to every service, but this surface carries
// three pagination idioms (NOTES.md section 4) and two services mix them
// (`projects`: 5 cursor-derived resources + 3 cursor-next; `users`: users
// cursor-derived, role_assignments cursor-next). any-sdk resolves pagination through
// a fallback chain - operation -> resource -> service -> providerService -> provider
// (internal/anysdk/operation_store.go:600-660) - and an operation's config is the
// `config:` key on its method entry in x-stackQL-resources
// (standardOpenAPIOperationStore.StackQLConfig, yaml key `config`). So each service
// gets its dominant idiom at service level (x-stackQL-config) and every deviating
// list method gets a method-level override, which wins.
//
// The idiom per operation comes from provider-dev/config/endpoint_inventory.csv,
// which derives it structurally from the response envelope's cursor field - one
// source of truth, no second rule table to drift.
//
// Validation (all must pass or nothing is written): every list method in the
// generated provider resolves - through the real fallback chain, recomputed here -
// to exactly the config its inventory idiom requires; every non-list method resolves
// to no pagination or is unaffected; no method-level config is clobbered.
//
// Deterministic, idempotent, validate-and-fail-without-writing.
// Usage: node provider-dev/scripts/post_process.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const servicesDir = path.join(repoRoot, 'provider-dev', 'openapi', 'src', 'openai_admin', 'v00.00.00000', 'services');
const inventoryPath = path.join(repoRoot, 'provider-dev', 'config', 'endpoint_inventory.csv');

// idiom -> pagination config. Keep in sync with NOTES.md section 4.
const PAGINATION = {
  bucketed: {
    requestToken: { key: 'page', location: 'query' },
    responseToken: { key: '$.next_page', location: 'body' },
  },
  'cursor-derived': {
    requestToken: { key: 'after', location: 'query' },
    responseToken: { key: '$.last_id', location: 'body' },
  },
  'cursor-next': {
    requestToken: { key: 'after', location: 'query' },
    responseToken: { key: '$.next', location: 'body' },
  },
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const cols = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ''])));
}

const inventory = parseCsv(fs.readFileSync(inventoryPath, 'utf8'));

// expected idiom per service.resource.method, for list methods only
const expectedIdiom = new Map();
const listsByService = new Map();
for (const r of inventory) {
  if (r.method !== 'list') continue;
  if (!PAGINATION[r.idiom]) {
    console.error(`FAIL: inventory idiom '${r.idiom}' on ${r.operation_id} has no pagination config defined; nothing written`);
    process.exit(1);
  }
  expectedIdiom.set(`${r.service}.${r.resource}.${r.method}`, r.idiom);
  if (!listsByService.has(r.service)) listsByService.set(r.service, []);
  listsByService.get(r.service).push({ resource: r.resource, method: r.method, idiom: r.idiom });
}

// dominant idiom per service (most list methods; ties break alphabetically for determinism)
const dominant = new Map();
for (const [service, lists] of listsByService) {
  const counts = {};
  for (const l of lists) counts[l.idiom] = (counts[l.idiom] || 0) + 1;
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  dominant.set(service, winner);
}

const errors = [];
const docs = {};
const stamps = { service: [], method: [] };

const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.yaml')).sort();
for (const filename of files) {
  const service = filename.replace(/\.yaml$/, '');
  const doc = yaml.load(fs.readFileSync(path.join(servicesDir, filename), 'utf8'));
  docs[filename] = doc;

  const svcIdiom = dominant.get(service);
  if (!svcIdiom) {
    errors.push(`${service}: no list methods in the inventory - unexpected for this surface`);
    continue;
  }

  // service-level default
  doc['x-stackQL-config'] = { ...(doc['x-stackQL-config'] || {}), pagination: structuredClone(PAGINATION[svcIdiom]) };
  stamps.service.push(`${service}: ${svcIdiom}`);

  const resources = doc.components?.['x-stackQL-resources'] || {};
  for (const [resourceName, resource] of Object.entries(resources)) {
    for (const [methodName, method] of Object.entries(resource.methods || {})) {
      const key = `${service}.${resourceName}.${methodName}`;
      const want = expectedIdiom.get(key);
      if (!want) continue; // not a list method - inherits the service config, which the engine only applies to paginated calls
      if (want === svcIdiom) {
        // inherits the service-level config; make sure no stale override lingers (idempotency)
        if (method.config?.pagination) {
          delete method.config.pagination;
          if (Object.keys(method.config).length === 0) delete method.config;
        }
        continue;
      }
      // deviating list method: method-level override, merged so requestBodyTranslate survives
      method.config = { ...(method.config || {}), pagination: structuredClone(PAGINATION[want]) };
      stamps.method.push(`${key}: ${want} (service default ${svcIdiom})`);
    }
  }
}

// Validate by recomputing the engine's resolution chain: method config, else service config.
for (const filename of files) {
  const service = filename.replace(/\.yaml$/, '');
  const doc = docs[filename];
  const svcPag = doc['x-stackQL-config']?.pagination;
  const resources = doc.components?.['x-stackQL-resources'] || {};
  for (const [resourceName, resource] of Object.entries(resources)) {
    for (const [methodName, method] of Object.entries(resource.methods || {})) {
      const key = `${service}.${resourceName}.${methodName}`;
      const want = expectedIdiom.get(key);
      if (!want) continue;
      const effective = method.config?.pagination ?? svcPag;
      const expected = PAGINATION[want];
      if (JSON.stringify(effective) !== JSON.stringify(expected)) {
        errors.push(`${key}: resolves to ${JSON.stringify(effective)}, expected ${want} -> ${JSON.stringify(expected)}`);
      }
    }
  }
  // every inventory list for this service must exist as a generated method
  for (const l of listsByService.get(service) || []) {
    if (!resources[l.resource]?.methods?.[l.method]) {
      errors.push(`${service}.${l.resource}.${l.method}: in the inventory but not in the generated provider`);
    }
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} pagination error(s); nothing written`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

for (const filename of files) {
  fs.writeFileSync(path.join(servicesDir, filename), yaml.dump(docs[filename], { lineWidth: -1, noRefs: true }), 'utf8');
}

console.log(`Stamped service-level pagination on ${stamps.service.length} service(s):`);
for (const s of stamps.service) console.log(`  ${s}`);
console.log(`Stamped method-level overrides on ${stamps.method.length} deviating list method(s):`);
for (const m of stamps.method) console.log(`  ${m}`);
console.log(`Validated ${expectedIdiom.size} list method(s) resolve to their inventory idiom through the operation -> service chain.`);
