# Matter App Lambda Path Normalization Closeout

Status: source hotfix permanently reflected and production Lambda smoke passed.

Scope:

- Source repo: `Gonyak-cell/law-firm-os`.
- Source branch: `codex/matter-lambda-path-normalization`.
- Source commit: `ca1ed3719d0c1b0a100db968e7edb50b779753b6`.
- Production Lambda surface: Matter app bridge API wrapper.

## Implemented

- Normalized duplicate leading slashes from Lambda Function URL paths.
- Added fallback from `requestContext.http.path` for HTTP API style events.
- Added regression coverage for `//api/matters/vault-bridge/status`.
- Applied the same leading-slash normalization to the temporary desktop runtime Lambda route helper.

## Verification

| Check | Result |
| --- | --- |
| `node --test apps/api/test/lambda-path.test.js apps/api/test/matter-temp-desktop-runtime-lambda.test.js` | PASS, 10 tests |
| Lambda package required file check | PASS |
| Production Lambda update state | Active/Successful |
| Deployment commit env | `ca1ed3719d0c1b0a100db968e7edb50b779753b6` |
| Function URL normal bridge status path | PASS |
| Function URL duplicate-slash bridge status path | PASS |
| Function URL unauth duplicate-slash path | PASS, fail-closed |

## Deployment Note

The first package attempt omitted the required account seed file and produced a 502. The package was immediately rebuilt with the required seed file included, redeployed, and verified. The final production state is Active/Successful and the duplicate-slash bridge smoke passes.

## Non-Claims

This closeout does not claim customer document import, Vault storage write, source-of-truth cutover, OneDrive connected-state, Office open/save/sync, Gemma indexing, or customer-wide go-live.

## Sanitization

No raw endpoint, token, secret, AWS ARN, account id, raw customer content, raw path, object key, Matter Code, matter name, or client label is stored in this document.
