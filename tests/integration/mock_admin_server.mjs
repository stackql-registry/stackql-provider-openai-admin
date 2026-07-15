#!/usr/bin/env node
// Mock of the OpenAI admin API, serving the real wire shapes for the three
// pagination idioms. Records every request it receives so a test can assert what
// stackql actually sent - notably the follow-up request of a paginated traversal.
//
// Routes:
//   GET /v1/organization/costs            bucketed idiom (page -> $.next_page), 2 pages
//   GET /v1/organization/usage/completions bucketed idiom, 2 pages
//   GET /v1/organization/projects         cursor-derived idiom (after -> $.last_id), 2 pages + empty overshoot
//   GET /v1/organization/roles            cursor-next idiom (after -> $.next), 2 pages
//   GET /__requests                       the recorded request log (test introspection)
//
// The bucketed routes emulate OpenAI's page-token contract: the token encodes the
// original query, so a follow-up request whose other query parameters differ from
// the ones the token was minted for is rejected 400 "The page token is invalid,
// have you modified the query parameters?" - exactly as the live API does.
//
// Usage: node tests/integration/mock_admin_server.mjs [--port 8099]

import http from 'node:http';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg !== -1 ? Number(args[portArg + 1]) : 8099;

const requests = [];

// --- page-token contract -----------------------------------------------------
// The token carries the query it was minted for (base64 of the non-page params),
// mirroring the real API's behaviour of validating the token against the query.
const mintToken = (params, nextPage) => {
  const rest = new URLSearchParams(params);
  rest.delete('page');
  rest.sort();
  return 'page_' + Buffer.from(JSON.stringify({ q: rest.toString(), p: nextPage })).toString('base64');
};
const readToken = (token) => {
  try {
    return JSON.parse(Buffer.from(token.replace(/^page_/, ''), 'base64').toString());
  } catch {
    return null;
  }
};

const bucket = (start, results) => ({
  object: 'bucket',
  start_time: start,
  end_time: start + 86400,
  results,
});

function bucketedRoute(url, kind) {
  const params = url.searchParams;
  const page = params.get('page');
  const start = Number(params.get('start_time') || 1781481600);

  const rest = new URLSearchParams(params);
  rest.delete('page');
  rest.sort();
  const currentQuery = rest.toString();

  if (page) {
    const decoded = readToken(page);
    if (!decoded) {
      return [400, { error: { message: 'The page token is invalid, have you modified the query parameters?', type: 'invalid_request_error', param: null, code: 'invalid_request_error' } }];
    }
    if (decoded.q !== currentQuery) {
      // This is the failure the live API reports when the follow-up request's
      // query parameters do not match the ones the token was minted for.
      return [400, {
        error: {
          message: 'The page token is invalid, have you modified the query parameters?',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_request_error',
          _mock_detail: { token_minted_for: decoded.q, request_carried: currentQuery },
        },
      }];
    }
    const results = kind === 'costs'
      ? [{ object: 'organization.costs.result', amount: { value: 2.5, currency: 'usd' }, line_item: 'gpt-4o', project_id: 'proj_two' }]
      : [{ object: 'organization.usage.completions.result', input_tokens: 20, output_tokens: 4, num_model_requests: 2, project_id: 'proj_two', model: 'gpt-4o' }];
    return [200, { object: 'page', data: [bucket(start + 86400, results)], has_more: false, next_page: null }];
  }

  const results = kind === 'costs'
    ? [{ object: 'organization.costs.result', amount: { value: 1.25, currency: 'usd' }, line_item: 'gpt-4o', project_id: 'proj_one' }]
    : [{ object: 'organization.usage.completions.result', input_tokens: 10, output_tokens: 2, num_model_requests: 1, project_id: 'proj_one', model: 'gpt-4o' }];
  return [200, { object: 'page', data: [bucket(start, results)], has_more: true, next_page: mintToken(params, 2) }];
}

function cursorDerivedRoute(url) {
  const after = url.searchParams.get('after');
  if (!after) {
    return [200, { object: 'list', data: [{ id: 'proj_one', object: 'organization.project', name: 'one', status: 'active' }], first_id: 'proj_one', last_id: 'proj_one', has_more: true }];
  }
  if (after === 'proj_one') {
    return [200, { object: 'list', data: [{ id: 'proj_two', object: 'organization.project', name: 'two', status: 'active' }], first_id: 'proj_two', last_id: 'proj_two', has_more: false }];
  }
  // the empty overshoot page the engine relies on to terminate
  return [200, { object: 'list', data: [], first_id: null, last_id: null, has_more: false }];
}

function cursorNextRoute(url) {
  const after = url.searchParams.get('after');
  if (!after) {
    return [200, { object: 'list', data: [{ id: 'role_one', object: 'organization.role', name: 'one' }], has_more: true, next: 'role_one' }];
  }
  return [200, { object: 'list', data: [{ id: 'role_two', object: 'organization.role', name: 'two' }], has_more: false, next: null }];
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/__requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(requests, null, 2));
    return;
  }
  if (url.pathname === '/__reset') {
    requests.length = 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"reset":true}');
    return;
  }

  requests.push({
    method: req.method,
    path: url.pathname,
    query: url.search,
    params: Object.fromEntries(url.searchParams),
    authorization: req.headers.authorization ? 'Bearer <redacted>' : null,
  });

  // every admin call must carry the bearer token
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Missing bearer credentials', type: 'invalid_request_error' } }));
    return;
  }

  let out;
  if (url.pathname === '/v1/organization/costs') out = bucketedRoute(url, 'costs');
  else if (url.pathname === '/v1/organization/usage/completions') out = bucketedRoute(url, 'usage');
  else if (url.pathname === '/v1/organization/projects') out = cursorDerivedRoute(url);
  else if (url.pathname === '/v1/organization/roles') out = cursorNextRoute(url);
  else out = [404, { error: { message: `mock has no route for ${url.pathname}`, type: 'invalid_request_error' } }];

  res.writeHead(out[0], { 'content-type': 'application/json' });
  res.end(JSON.stringify(out[1]));
});

server.listen(PORT, () => {
  console.log(`mock openai admin API listening on http://localhost:${PORT}`);
});
