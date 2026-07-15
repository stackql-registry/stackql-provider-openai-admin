# WO-001 - any-sdk: pagination config switch to send the request token unencoded

- **Repo**: `stackql/any-sdk`
- **Type**: bug / small feature (config surface addition)
- **Raised from**: `stackql-registry/stackql-provider-openai-admin`, first live run 2026-07-16
- **Source refs**: any-sdk `eff549b`, stackql v0.10.542 (`2a0297b`)
- **Blocks**: auto-pagination on `openai_admin.usage.*` and `openai_admin.costs.costs`

## Summary

`SetNextPage` re-renders the whole query string with Go's `url.Values.Encode()` when it applies a page token. That percent-escapes reserved characters in the token value (`=` -> `%3D`, `+` -> `%2B`, `/` -> `%2F`). Servers whose cursor parser does not percent-decode the token reject the follow-up request, breaking transparent pagination against them. Requested: a config switch on the pagination `requestToken` that writes the token into the query verbatim.

## Evidence (live, OpenAI admin API)

The token is minted with base64 `=` padding and returned escaped:

```
GET /v1/organization/costs?group_by=project_id&start_time=1781481600
  -> 200   next_page: "page_AAAAAGpY30vJnSVZAAAAAGo4ewA="

GET /v1/organization/costs?group_by=project_id&page=page_AAAAAGpY30vJnSVZAAAAAGo4ewA%3D&start_time=1781481600
  -> 400   {"error":{"message":"The page token is invalid, have you modified the query parameters?",
             "type":"invalid_request_error","code":"invalid_request_error"}}
```

The query parameters are **not** modified - `group_by` and `start_time` are carried through byte-identically. The only delta between the token issued and the token received is the padding: `=` vs `%3D`.

Cross-client comparison of the same token:

| client | emitted |
|---|---|
| Go `url.Values.Encode()` (any-sdk today) | `page=page_AAAAAGpY30vJnSVZAAAAAGo4ewA%3D` |
| httpx (the OpenAI SDK's client; `=` in its safe set) | `page=page_AAAAAGpY30vJnSVZAAAAAGo4ewA=` |

Both are legal under RFC 3986 - `=` is permitted unescaped in a query value - but the server accepts only the raw form. any-sdk's escaping is correct HTTP; the interop still fails, and there is currently no way to express the other encoding.

Ruled out before raising this (all against a purpose-built mock, `tests/integration/mock_admin_server.mjs` in the provider repo):

- provider config is correct - the vendor spec documents `page` as "a cursor... corresponding to the `next_page` field from the previous response", exactly the stamped `requestToken: page` / `responseToken: $.next_page`
- request 2 preserves every parameter from request 1 and adds only `page`
- `page` is correctly absent from request 1 (no empty-token first call)
- the escaping itself is faithful and reversible - a token seeded with `+`, `/` and `=` round-trips exactly (`page_ab+cd/ef==xy` -> `page_ab%2Bcd%2Fef%3D%3Dxy` -> decodes back identically)

## Root cause

`internal/anysdk/http_armoury_params.go:114-122`:

```go
func (hap *standardHTTPArmouryParameters) SetNextPage(
	ops OperationStore, token string, tokenKey internaldto.HTTPElement) (*http.Request, error) {
	rv := hap.request.Clone(hap.request.Context())
	switch tokenKey.GetType() {
	case internaldto.QueryParam:
		q := hap.request.URL.Query()
		q.Set(tokenKey.GetName(), token)
		rv.URL.RawQuery = q.Encode()   // <-- escapes the token's reserved characters
		return rv, nil
```

`url.Values.Encode()` applies `url.QueryEscape` to every value, including the opaque token.

## Proposed change

Add an optional encoding switch to the `requestToken` token semantic, defaulting to current behaviour so nothing existing changes.

Config surface (`x-stackQL-config.pagination.requestToken`):

```yaml
pagination:
  requestToken:
    key: page
    location: query
    encoding: none      # new; one of: url (default, current behaviour) | none
  responseToken:
    key: $.next_page
    location: body
```

Implementation sketch:

1. `internal/anysdk/token_semantic.go` - add the field to `standardTokenSemantic` and an accessor on the `TokenSemantic` interface:

   ```go
   type standardTokenSemantic struct {
       Algorithm string            `json:"algorithm,omitempty" yaml:"algorithm,omitempty"`
       Args      TokenSemanticArgs `json:"args,omitempty" yaml:"args,omitempty"`
       Key       string            `json:"key,omitempty" yaml:"key,omitempty"`
       Location  string            `json:"location,omitempty" yaml:"location,omitempty"`
       Encoding  string            `json:"encoding,omitempty" yaml:"encoding,omitempty"` // "" | "url" | "none"
   }

   func (ts *standardTokenSemantic) GetEncoding() string {
       if ts.Encoding == "" {
           return TokenEncodingURL
       }
       return ts.Encoding
   }
   ```

   Extend `JSONLookup` to expose it, consistent with the other fields.

2. `internal/anysdk/http_armoury_params.go` - in the `QueryParam` branch, when the semantic asks for `none`, encode the other parameters normally and append the token verbatim rather than routing it through `Values.Encode()`:

   ```go
   case internaldto.QueryParam:
       q := hap.request.URL.Query()
       if encoding == TokenEncodingNone {
           q.Del(tokenKey.GetName())
           encoded := q.Encode()
           pair := tokenKey.GetName() + "=" + token   // token written as issued
           if encoded == "" {
               rv.URL.RawQuery = pair
           } else {
               rv.URL.RawQuery = encoded + "&" + pair
           }
           return rv, nil
       }
       q.Set(tokenKey.GetName(), token)
       rv.URL.RawQuery = q.Encode()
       return rv, nil
   ```

   Note `SetNextPage` receives the token as a `string`, so this is a local change; the token key name should still be escaped, and only the value is passed through.

Alternative considered and rejected: widening the escaper globally (treating `=` as safe everywhere, httpx-style). That changes every provider's wire behaviour to fix one server's parser, and is not opt-in. A per-config switch keeps the blast radius at the provider that needs it.

## Acceptance criteria

- Default (no `encoding` key) is byte-identical to today for every existing provider.
- With `encoding: none`, a token containing `=`, `+` or `/` reaches the wire exactly as the server issued it, and other query parameters remain correctly escaped.
- Unit test over `SetNextPage` covering both settings with a reserved-character token.
- Downstream: `openai_admin` usage/costs traverse multi-page results with `encoding: none` stamped; the provider's smoke assertion (`tests/smoke_test.py`, "flagship: bucketed pagination") flips from SKIP to PASS.

## Downstream state while this is open

`openai_admin` ships the bucketed pagination config as specified (it is correct) and the docs steer users to set `limit` so a normal reporting window fits in one page - `costs` allows 180 buckets, `usage` 31 at `bucket_width=1d` - so the second request does not arise in practice. The provider's smoke suite asserts the defect explicitly and reports PASS if it ever stops reproducing, so the guidance is removed on evidence rather than left in place indefinitely.

The two cursor idioms on the directory resources (`after` -> `$.last_id`, `after` -> `$.next`) are unaffected: their tokens are plain object ids with no reserved characters.
