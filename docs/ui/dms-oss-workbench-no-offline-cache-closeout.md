# PACK-DMS-WB-05 No-Document-Cache Closeout

> Base: `origin/main@c17f4c95a75b069741c12824fa006b33812d6b5c`
>
> Branch: `feat/pack-dms-wb-05-no-offline-cache`
>
> TUWs: `DMS-WB-OFFLINE-TUW-001~002`

## Result

`RETAIN_NO_DOCUMENT_CACHE` is accepted and enforced. AMIC Vault caches only queryless public application-shell assets. Document, preview, token, API, search query/snippet, authenticated route, Matter, tenant, and audit state remain outside service-worker Cache Storage.

The cache version advances from `v1` to `v2`, so activation removes every prior service-worker cache. `/files` and `/integrations` are explicitly classified with the existing sensitive routes. Query, authorization, and explicit cookie variants bypass Cache Storage before any lookup. A persisted BFCache restore of a sensitive route reloads the page and re-enters the current session, tenant, and permission boundary.

No offline document feature, client decryption/key custody, remote deletion claim, new dependency, schema, API, permission, audit authority, or external system was added.

## Evidence

- Web cache policy unit: 1 file / 4 tests green.
- Actual service-worker execution plus existing desktop cache checks: 3 files / 9 tests green.
- Canonical metadata-leakage profile on an isolated database: 4 files / 12 tests green.
- Web regression: 120 files / 386 tests green; lint, typecheck, production build, production UI literal/smoke, and UI checklist green.
- Root regression: lint, typecheck, test, build, frozen package 51 files, backlog 174+266, and diff check green.
- OSS governance: source-map/reuse validators 9 tests green; static source-map green. No new product-source path or dependency exists.
- AI slop review: pass for the WB05 product, test, and decision surfaces. The first lint run identified a generic test-helper identifier as a strong copy heuristic; it was renamed to the literal `driver`. The final changed-file run reports only seven inherited append-only ledger matches: six weak historical pattern matches and one strong historical wording match.

The full local integration runner first reproduced shared-database queue contention in unchanged DD/bulk-upload suites. An isolated database passed those suites and every preceding product/security batch. The run then stopped before assertions in the unchanged Docker-only ingestion gateway/sandbox suites with `status=null` and `UNKNOWN` compose initialization. Reclaiming 21.47GB of unused Docker build cache and two bounded retries reproduced the same initialization failure; 16 container assertions were skipped by their failed setup. The WB05 canonical metadata-leakage profile and its actual service-worker execution test remain green. Exact-head CI is the clean-container completion gate.

The first push and pull-request supply-chain runs exposed an unrelated workflow regression: the SBOM step removed both GitHub token variables before using `gh release download`, and current GitHub returned `401 Unauthorized`. The remediation passes the job's read-only `github.token` only to the pinned-release download steps. Version, release archive checksum, and source commit verification remain unchanged; the same correction is applied to the dependent pinned scanner downloads before they can run.

## UI and external boundary

This PACK changes no rendered layout, component hierarchy, copy, or interaction control. Authenticated viewport screenshots are therefore not applicable; the changed browser behavior is covered by deterministic `pageshow` and service-worker execution tests.

M365, Office/WOPI, external tenants, vendor contracts, credentials, consent, external runtime receipts, deployment, release, production rollout, and go-live remain excluded.
