# DMS OSS Workbench Internal Execution Packs

Status: canonical post-R14 internal extension under direct operator instruction dated 2026-07-28.
Scope source: `docs/ui/dms-oss-workbench-tuw-plan-2026-07-28.md`, corrected by `docs/ui/dms-oss-workbench-capability-inventory.md`.

## Authority and boundary

The operator directed implementation of every non-external DMS workbench TUW.
This registration authorizes repository-local planning, code, tests and isolated
database verification only. It does not authorize M365/Office/WOPI, external
tenant or vendor operation, credentials, consent, staging/production traffic,
external runtime receipts, release, or go-live.

Existing DMS-GA-3B anchor behavior and DMS-GA-405 break-glass policy are
reused. They are not new backend implementation scope. `docs/package/**` stays
read-only; no dependency or source-vendoring change is authorized.

## Canonical Pack order

| Pack | Branch | TUW range | Mode | Depends on |
|---|---|---|---|---|
| `PACK-DMS-WB-00` | `feat/pack-dms-wb-00-registration` | `DMS-WB-GOV-TUW-001~004` | registration | none |
| `PACK-DMS-WB-01` | `feat/pack-dms-wb-01-files-workbench` | `DMS-WB-FILES-TUW-001~009` | implementation | WB-00 |
| `PACK-DMS-WB-02` | `feat/pack-dms-wb-02-search-flow` | `DMS-WB-SEARCH-TUW-001~008`, `DMS-WB-FLOW-TUW-001~004` | implementation | WB-01 |
| `PACK-DMS-WB-03` | `feat/pack-dms-wb-03-personal-pins` | `DMS-WB-PINS-TUW-001~005` | contract then implementation | Pins decision |
| `PACK-DMS-WB-04` | `feat/pack-dms-wb-04-bulk-actions` | `DMS-WB-BULK-TUW-001~005` | contract then implementation | Bulk decision |
| `PACK-DMS-WB-05` | `feat/pack-dms-wb-05-no-offline-cache` | `DMS-WB-OFFLINE-TUW-001~002` | policy guard | no-cache decision |
| `PACK-DMS-WB-06` | `feat/pack-dms-wb-06-internal-qa` | `DMS-WB-QA-TUW-001~003` | verification | enabled predecessors |

`DMS-WB-ACCESS-TUW-001~006`, `DMS-WB-ANCHOR-TUW-001~005`, `DMS-WB-M365-TUW-001~008`, `DMS-WB-QA-TUW-004~005` are not executable in this extension. Their rationale is in the capability inventory and scope source.

## PACK-DMS-WB-00

### DMS-WB-GOV-TUW-001 — exact-main capability inventory

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `docs` / `M` / `M`.
- **Depends_on:** none.
- **Objective:** Record current-main implementation evidence for every planned workbench capability and reclassify duplicate proposals before source changes start.
- **Files create:** `docs/ui/dms-oss-workbench-capability-inventory.md`.
- **Files modify:** scope source only for verified corrections.
- **Files NOT-modify:** `docs/package/**`, application source, migrations, dependencies.
- **Verification:** each `Reuse` row has source plus test evidence; `pnpm docs:frozen`, `pnpm backlog:validate`, `git diff --check` pass.
- **Edge cases:** code present but feature gated; historical plan contradicts current main.
- **Stop / Escalation:** classify uncertain source as `uncertain`, do not infer missing backend.

### DMS-WB-GOV-TUW-002 — workbench design handoff

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web design` / `M` / `M`.
- **Depends_on:** `DMS-WB-GOV-TUW-001`.
- **Objective:** Freeze responsive pane, selection, preview, upload, state and accessibility behavior before `/files` source changes.
- **Files create:** `docs/ui/dms-oss-workbench-handoff.md`.
- **Files modify:** none.
- **Files NOT-modify:** design-system globals, dependencies, external integration UI.
- **Verification:** desktop/tablet/mobile layout and all empty/error/stale states are specified; no forbidden UI pattern is required.
- **Edge cases:** missing Matter, revoked selection, preview expiry, long Korean labels, reduced motion.
- **Stop / Escalation:** stop if the handoff requires a policy or DTO not supplied by existing contracts.

### DMS-WB-GOV-TUW-003 — action, permission, audit matrix

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `security docs` / `H` / `M`.
- **Depends_on:** `DMS-WB-GOV-TUW-001`, `DMS-WB-GOV-TUW-002`.
- **Objective:** Bind every exposed workbench action to its existing owner, safe data boundary, audit boundary, and negative regression.
- **Files create:** `docs/ui/dms-oss-workbench-action-matrix.md`.
- **Files modify:** none.
- **Files NOT-modify:** PermissionService, audit implementation, preview/search backend.
- **Verification:** no UI action lacks an owner and no row proposes client-side authorization or token/metadata disclosure.
- **Edge cases:** revoke after selection, preview token expiry, break-glass state, external policy gate.
- **Stop / Escalation:** omit an action with unknown owner rather than invent a new endpoint.

### DMS-WB-GOV-TUW-004 — canonical registration

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `execution registry` / `H` / `S`.
- **Depends_on:** `DMS-WB-GOV-TUW-001~003`.
- **Objective:** Register the non-external workbench packs, branches, dependencies and exclusions without changing frozen package documents.
- **Files create:** `docs/execution/TUW_DMS_OSS_WORKBENCH.md`.
- **Files modify:** `docs/execution/PACKS_R4_R14.md`, append-only decision/execution ledger, scope plan correction.
- **Files NOT-modify:** `docs/package/**`, product source, migrations, dependencies.
- **Verification:** unique pack/TUW names, no external range marked executable, `pnpm docs:frozen`, `pnpm backlog:validate`, `git diff --check` pass.
- **Edge cases:** duplicate DMS-GA functionality, stale base SHA, conditional Pins/Bulk decision absent.
- **Stop / Escalation:** do not start a descendant whose contract decision or predecessor evidence is missing.

## Later Pack contract

The detailed TUW fields, file scopes, verification, edge cases and stop
conditions for WB-01 through WB-06 are the in-repository scope source cited
above, as corrected by the capability inventory. Every implementation pack must
re-read its relevant section at execution time, verify exact current main, and
keep its own branch, commit, test evidence and append-only execution receipt.
