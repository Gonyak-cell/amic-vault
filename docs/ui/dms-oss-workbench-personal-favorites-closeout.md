# DMS OSS Workbench Personal Favorites Closeout

Pack: `PACK-DMS-WB-03`
TUWs: `DMS-WB-PINS-TUW-001~005`
Decision: `docs/adr/ADR-019-personal-saved-items.md`
Base: `origin/main@8166d1c6`

## Contract Receipt

| Layer | Evidence | Closed behavior |
|---|---|---|
| persistence | `db/migrations/0210_create_personal_saved_items.sql` | tenant/user-bound personal rows, RLS/FORCE RLS, duplicate and 0..99 position constraints, reversible schema before append-only audit use |
| shared contract | `packages/shared/src/dto/saved-item/saved-item.dto.ts` | three target kinds, UUID-only request, unique exact order of at most 100 |
| permission API | `apps/api/src/modules/saved-item/saved-item.service.ts` | existing document search scope and Matter permission query injected before target projection; personal saved-search owner check; invisible preferences removed and compacted in that transaction |
| audit | shared audit action registry plus service transactions | add/remove/changed-order reference-only actions; audit failure rolls back mutation |
| UI | saved-item hook, section and explicit toggles in files/search | one `즐겨찾기` label, server labels only, empty/error/long-list overflow, optimistic rollback |

## Automated Evidence

- Shared DTO: 3 tests.
- API saved-item service: 5 tests covering permission SQL binding, duplicate
  idempotency, 100-item bound, delete compaction/audit, and reorder lock/audit.
- Web API/component regression: 11 focused tests across saved-item API, rail,
  files inspector, search rail, and search inspector.
- Canonical integration:
  `tests/integration/search-permission/saved-items.spec.ts`, 5 tests covering
  concurrent duplicate add, personal target kinds, cross-tenant RLS, concurrent
  exact-set reorder, incomplete-order rejection, permission revocation,
  permission-bound stale cleanup, and explicit/stale removal audit counts.
- Migration verification: UP succeeded; the new 0210 DOWN executed inside the
  repository rollback transaction and was restored when an older 0208
  append-only guard intentionally stopped the global rollback. Applied history
  and `saved_items` existence were rechecked afterward.

## Authenticated Rendered Evidence

An authenticated local session for `alpha-member@test.local` verified:

1. `/files` renders the empty personal rail honestly.
2. Selecting a permitted document exposes an explicit add action.
3. Add immediately updates the rail, persists after reload, and changes the
   action to remove.
4. Remove restores the honest empty state.
5. `/search` shows the same authorized document favorite.
6. A personal saved search exposes add/remove and appears in the same rail.
7. Test preferences and the temporary saved search were removed after the
   scenario; reference-only audit rows remain immutable.
8. Responsive rendering at 1440, 1024, 768, and 390 CSS pixels has no document
   horizontal overflow; the 390px navigation drawer shows the same authorized
   list, and long Matter labels truncate without a nested horizontal scrollbar.

No document preview was issued by selection or favorite actions. No external
connection, customer data, deployment, release, or go-live operation was used.

## Rollback

Before production data, roll back 0210 normally. After saved-item audit rows
exist, append-only audit immutability deliberately prevents removal of the new
audit action values. Runtime rollback is then to hide/disable the UI and routes
while retaining preference and audit rows; do not delete audit history.
