#!/usr/bin/env node
// Admin-surface spec adjustments applied to provider-dev/source before the generic
// `npm run normalize` pass. This is the seam for mutations the generic normalizer
// cannot infer; it runs first so its edits flow through the flatten and into generate.
//
// Job 1: expand object-typed query parameters into their bracketed wire parameters.
//   `GET /organization/audit_logs` declares `effective_at` as a query parameter with
//   `type: object` and properties gt/gte/lt/lte, and no `style`. The wire form the
//   API accepts is `effective_at[gt]=<unix>` (deepObject semantics), but the spec
//   declares no style, so the OpenAPI default for an object query parameter (form +
//   explode) would serialize it as `gt=<unix>` - the wrong wire shape - and an
//   object-typed value is not SQL-expressible as a column anyway. Each property is
//   therefore lifted into a discrete scalar parameter named for its literal wire
//   spelling (`effective_at[gt]`, `effective_at[gte]`, `effective_at[lt]`,
//   `effective_at[lte]`), matching how the sibling array filters already ship
//   (`project_ids[]`, `event_types[]`, ...). Bracketed identifiers are addressable in
//   SQL with double quotes (`WHERE "effective_at[gt]" = 1750000000`); backticks are a
//   stackql parser error for them (the anthropic finding).
//   The rule is generic - any object-typed query parameter is expanded - so a spec
//   refresh that adds another filter of this shape is handled without a code change.
//
// Job 2 (guard): the openapi 3.1.0 array-type nullable form (`type: [x, "null"]`).
//   Absent from this pin. The `anyOf: [{realType}, {type: "null"}]` idiom that IS
//   present flattens safely under the normalizer's first-wins merge (the real type is
//   always the first member), so no rewrite is needed here. The guard fails the run if
//   a refresh introduces the array-type form, so the downgrade is written deliberately
//   rather than discovered during generate.
//
// Job 3 (guard): binary request-body properties. any-sdk marshals only JSON/XML
//   request bodies, so a `format: binary` property is never a functional column. None
//   exist on the admin surface (unlike the sibling's file/skill uploads); the guard
//   fails the run if a refresh adds one, rather than shipping a dead column.
//
// Not done here, and why: the sibling openai build injects the optional
// OpenAI-Organization / OpenAI-Project scoping headers on every operation. That is
// deliberately NOT carried over. An admin key is created by an owner within one
// organization and every path here is already `/organization/...` - the key IS the org
// scope, so there is no second organization to select and no project-scoping semantic
// on an org-administration call. Project scope is a path parameter on this surface
// (`/organization/projects/{project_id}/...`), not a header.
//
// Deterministic and re-runnable; validate-and-fail-without-writing.
// Usage: node provider-dev/scripts/pre_normalize.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceDir = path.join(repoRoot, 'provider-dev', 'source');

const HTTP_VERBS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

// Guard helpers -------------------------------------------------------------

function findArrayTypeNullable(node, at, hits) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => findArrayTypeNullable(n, `${at}[${i}]`, hits));
    return;
  }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.type) && node.type.includes('null')) hits.push(at);
    for (const [k, v] of Object.entries(node)) findArrayTypeNullable(v, `${at}.${k}`, hits);
  }
}

function findBinary(node, at, hits) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => findBinary(n, `${at}[${i}]`, hits));
    return;
  }
  if (node && typeof node === 'object') {
    if (node.format === 'binary') hits.push(at);
    for (const [k, v] of Object.entries(node)) findBinary(v, `${at}.${k}`, hits);
  }
}

// ---------------------------------------------------------------------------

const errors = [];
const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.yaml')).sort();
if (files.length === 0) errors.push('no service specs in provider-dev/source');

const docs = {};
const expanded = [];

for (const filename of files) {
  const doc = yaml.load(fs.readFileSync(path.join(sourceDir, filename), 'utf8'));
  docs[filename] = doc;
  const resolve = (ref) =>
    typeof ref === 'string' && ref.startsWith('#/')
      ? ref.replace(/^#\//, '').split('/').reduce((o, k) => (o ? o[k] : undefined), doc)
      : undefined;
  const deref = (s) => (s && s.$ref ? resolve(s.$ref) : s);

  const nullHits = [];
  findArrayTypeNullable(doc.paths || {}, 'paths', nullHits);
  findArrayTypeNullable(doc.components || {}, 'components', nullHits);
  if (nullHits.length) {
    errors.push(`${filename}: ${nullHits.length} array-type nullable site(s) (3.1 downgrade rule needed): ${nullHits.slice(0, 3).join(', ')}${nullHits.length > 3 ? ' ...' : ''}`);
  }

  for (const [pathKey, pathItem] of Object.entries(doc.paths || {})) {
    for (const verb of HTTP_VERBS) {
      const op = pathItem[verb];
      if (!op || typeof op !== 'object') continue;

      const binHits = [];
      if (op.requestBody) findBinary(op.requestBody, `${pathKey} ${verb} requestBody`, binHits);
      if (binHits.length) {
        errors.push(`${filename}: binary request-body site(s) not marshalable by any-sdk: ${binHits.slice(0, 2).join(', ')}`);
      }

      if (!Array.isArray(op.parameters)) continue;
      const nextParams = [];
      for (const raw of op.parameters) {
        const param = raw && raw.$ref ? deref(raw) : raw;
        const schema = deref(param?.schema);
        if (param?.in !== 'query' || schema?.type !== 'object') {
          nextParams.push(raw);
          continue;
        }
        const props = schema.properties || {};
        if (Object.keys(props).length === 0) {
          errors.push(`${filename}: ${verb.toUpperCase()} ${pathKey} query param '${param.name}' is type:object with no properties - cannot expand`);
          nextParams.push(raw);
          continue;
        }
        for (const [propName, propSchemaRaw] of Object.entries(props)) {
          const propSchema = deref(propSchemaRaw);
          nextParams.push({
            name: `${param.name}[${propName}]`,
            in: 'query',
            required: false,
            description: propSchema?.description || `${param.name}[${propName}] filter.`,
            schema: structuredClone({ type: propSchema?.type ?? 'string', ...(propSchema?.format ? { format: propSchema.format } : {}) }),
          });
        }
        expanded.push(`${filename}: ${verb.toUpperCase()} ${pathKey} '${param.name}' -> ${Object.keys(props).map((p) => `${param.name}[${p}]`).join(', ')}`);
      }
      op.parameters = nextParams;
    }
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} pre-normalize issue(s); nothing written`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

for (const filename of files) {
  fs.writeFileSync(path.join(sourceDir, filename), yaml.dump(docs[filename], { lineWidth: -1, noRefs: true }), 'utf8');
}

if (expanded.length === 0) {
  console.log('No object-typed query parameters to expand (idempotent re-run, or none in this pin).');
} else {
  console.log(`Expanded ${expanded.length} object-typed query parameter(s) into bracketed wire parameters:`);
  for (const e of expanded) console.log(`  ${e}`);
}
console.log('Guards clean: no openapi 3.1.0 array-type nullable sites, no binary request-body properties.');
console.log('Org/project scoping headers deliberately not injected (the admin key is the org scope; project scope is a path parameter).');
