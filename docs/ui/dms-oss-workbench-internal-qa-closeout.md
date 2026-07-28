# PACK-DMS-WB-06 Internal QA Closeout

> Base: `origin/main@8b7bef1e216e536f0e0615fc0af99a00f9d7049e`
>
> Branch: `feat/pack-dms-wb-06-internal-qa`
>
> TUWs: `DMS-WB-QA-TUW-001~003`

## Result

The internal workbench QA scope is closed without adding a dependency, schema,
API, permission rule, audit authority, or external connection.

Rendered inspection found and fixed three bounded defects:

1. The shared workbench shell no longer nests `main` or `complementary`
   landmarks inside the page landmarks.
2. The search surface selector exposes a named `group`, and each responsive
   drawer trigger exposes its controlled target and current expanded state.
3. Search submission remains blocked while Korean IME composition is active.
   Busy, blank, and composition states return no query, while a 406-character
   Korean query remains intact.

## Component and route manifest

| Contract                                                      | Canonical evidence                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| shared shell and drawer semantics                             | `apps/web/src/components/document/document-workbench.test.tsx`                                      |
| Korean IME and long-query submission                          | `apps/web/src/components/search/search-bar.test.tsx`                                                |
| private selection history and responsive drawer state         | `apps/web/src/app/(app)/search/search-client.flow.test.ts`                                          |
| files URL/filter refresh                                      | `apps/web/src/components/document/document-vault-list.test.tsx`                                     |
| empty, error, partial, selection, and explicit preview states | existing search results, result card, inspector, files page, bulk-action, and saved-item web suites |

The focused changed tests pass 3 files and 10 tests. The complete web suite
passes 120 files and 388 tests, with zero skipped or quarantined tests. Web
lint, typecheck, and production build pass. Root lint, typecheck, test, and
build also pass; the root test includes API 211 files/1,007 tests, shared 46/208,
domain 7/18, desktop 8/18, and AI 1/13.

The authenticated browser route probe used a 720 CSS-pixel layout-equivalent
200% view. `/files?page=1&title=계약서&tag=executed` retained both values after
reload and back navigation, forward navigation returned to `/search`, and
`scrollWidth` equaled `clientWidth`. A 406-character Korean search value
scrolled only inside its input and did not create page-level horizontal
overflow.

## Permission, audit, and tenant-isolation manifest

A fresh isolated database applied every migration and the normal seed before
running this exact 12-file canonical pack:

- `tests/integration/auth-session.spec.ts`
- `tests/integration/ethical-wall.spec.ts`
- `tests/integration/cross-tenant.spec.ts`
- `tests/integration/document-access/safe-denied-message.spec.ts`
- `tests/integration/document-access/preview-session.spec.ts`
- `tests/integration/metadata-leakage/preview-session-token.spec.ts`
- `tests/integration/metadata-leakage/search-metadata-leakage.spec.ts`
- `tests/integration/audit-coverage/permission-audit.spec.ts`
- `tests/integration/audit-coverage/preview-session-audit.spec.ts`
- `tests/integration/audit-coverage/search-audit.spec.ts`
- `tests/integration/search-permission/saved-items.spec.ts`
- `tests/integration/document-access/document-bulk-actions.spec.ts`

Result: 12 files and 34 tests pass. The pack covers expired and revoked
sessions, a wall created during an active session, safe denied responses,
cross-tenant access, stale personal targets, denied search counts and facets,
preview token non-disclosure, permission/search/preview audit failure
rollback, and per-item bulk-action re-evaluation. No security assertion was
replaced by a UI assertion.

No migration changed in this PACK, so a new migration rollback is not
applicable.

## Rendered viewport and screenshot index

Screenshots contain only the repository's synthetic local fixture account.
They remain ignored under `.artifacts/dms-wb-06/`; only their SHA-256 index is
committed.

| Route     | Viewport | Local-only artifact   | SHA-256                                                            |
| --------- | -------: | --------------------- | ------------------------------------------------------------------ |
| `/files`  | 1440x900 | `files-1440x900.png`  | `f385175bfd9bd439525fcbb4f3f866e2e5c6b98885214432242f8d369f6339d0` |
| `/search` | 1440x900 | `search-1440x900.png` | `4b2d2013d51434bea1d92ef267448ba592cd9a8f2e6c67455ecea3da64c5479d` |
| `/files`  | 1024x768 | `files-1024x768.png`  | `f77ad00dfc05291b1f658ba70e20faec60163dace0ff5be1377e2ae81e7222bd` |
| `/search` | 1024x768 | `search-1024x768.png` | `71f73b87a2a8d14fca6dd49d6a501575f410381be5826330154c56f9b6858978` |
| `/files`  |  768x900 | `files-768x900.png`   | `976ffabeffde3fece0b1696d0a200f16672d079822e42de527da27cc3322735b` |
| `/search` |  768x900 | `search-768x900.png`  | `25906e8f59e9a01c3b47f344383b71e662455277f6e51111cc5309725045e459` |
| `/files`  |  390x844 | `files-390x844.png`   | `c47a2d3063935826ad7ebbf09ee58ca5ffcad4ee6f1eccb5c4e7d7a9fa6d882e` |
| `/search` |  390x844 | `search-390x844.png`  | `646e5676dd1487291322815f7dabaec2c10a29e917b6ee8e8757458b378e08a2` |

Every viewport has zero page-level horizontal overflow, zero duplicate IDs,
zero unnamed visible controls, and exactly one `main` landmark. The search
drawer opens with focus on Close, wraps Shift+Tab to its last control, closes
with Escape, restores focus to the trigger, and exposes a visible two-pixel
focus ring.

The repository has no approved `axe-core` dependency, and this PACK is not
authorized to add one. The no-new-dependency equivalent used the live browser
accessibility tree plus bounded DOM checks for name, role, value, landmarks,
IDs, target relationships, focus order, keyboard operation, and contrast.
The only naive contrast candidate was white-at-90-percent text over the
header gradient; gradient-aware calculation is 4.55:1 at the lightest stop.

The product currently has a fixed light token set and no implicit dark-system
override, so a dark OS preference cannot create a mixed theme. Reduced-motion
inspection found no decorative or continuous animation in the workbench;
existing loading motion remains state-bound. Existing deterministic loading,
empty, unavailable, and error tests cover the slow-network boundary without
changing external runtime state.

## AI slop and external boundary

Rendered `/files` and `/search` review found no decorative hero treatment,
fake metric, capability slogan, excessive card grid, dead interaction, or
generic generated-image treatment. The changed copy remains operational and
permission-specific. Changed-file sloplint reports seven pre-existing
append-only ledger matches (six weak and one strong); the changed product and
closeout files produce no finding.

M365, Office/WOPI, external tenant, vendor contract, credential, consent,
external runtime receipt, deployment, release, production rollout, and
go-live remain excluded.
