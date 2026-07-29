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

| Pack             | Branch                                 | TUW range                                              | Mode                                | Depends on           |
| ---------------- | -------------------------------------- | ------------------------------------------------------ | ----------------------------------- | -------------------- |
| `PACK-DMS-WB-00` | `feat/pack-dms-wb-00-registration`     | `DMS-WB-GOV-TUW-001~004`                               | registration                        | none                 |
| `PACK-DMS-WB-01` | `feat/pack-dms-wb-01-files-workbench`  | `DMS-WB-FILES-TUW-001~009`                             | implementation                      | WB-00                |
| `PACK-DMS-WB-02` | `feat/pack-dms-wb-02-search-flow`      | `DMS-WB-SEARCH-TUW-001~008`, `DMS-WB-FLOW-TUW-001~004` | implementation                      | WB-01                |
| `PACK-DMS-WB-03` | `feat/pack-dms-wb-03-personal-pins`    | `DMS-WB-PINS-TUW-001~005`                              | contract then implementation        | Pins decision        |
| `PACK-DMS-WB-04` | `feat/pack-dms-wb-04-bulk-actions`     | `DMS-WB-BULK-TUW-001~005`                              | contract then implementation        | Bulk decision        |
| `PACK-DMS-WB-05` | `feat/pack-dms-wb-05-no-offline-cache` | `DMS-WB-OFFLINE-TUW-001~002`                           | policy guard                        | no-cache decision    |
| `PACK-DMS-WB-06` | `feat/pack-dms-wb-06-internal-qa`      | `DMS-WB-QA-TUW-001~003`                                | verification                        | enabled predecessors |
| `PACK-DMS-WB-07` | `feat/pack-dms-wb-07-korean-copy`      | `DMS-WB-COPY-TUW-001~007`                              | Korean SaaS copy and safe selectors | WB-06                |

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
conditions for WB-01 through WB-07 are the in-repository scope source cited
above, as corrected by the capability inventory. Every implementation pack must
re-read its relevant section at execution time, verify exact current main, and
keep its own branch, commit, test evidence and append-only execution receipt.

## PACK-DMS-WB-07

Authority: direct operator instruction dated 2026-07-29 to implement the
Korean-SaaS copy audit recommendations and remove the information-barrier
navigation item. The `/walls` route, its admin role guard, permission evaluation,
audit behavior, and direct contextual security links remain in place. This pack
does not delete or weaken information-barrier enforcement.

### DMS-WB-COPY-TUW-001 — Korean SaaS terminology contract and guard

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web quality` / `M` / `M`.
- **Depends_on:** `DMS-WB-QA-TUW-003`.
- **Objective:** Fix the user-visible terminology contract and make raw developer labels, untranslated table headings, raw route copy, and known specification-language regressions fail CI.
- **Files create:** focused web copy regression test where no existing owner test exists.
- **Files modify:** `tools/quality/check-production-ui-literals.mjs`, its tests, `apps/web/src/lib/i18n.tsx`, `apps/web/src/lib/i18n.test.tsx`.
- **Files NOT-modify:** `docs/package/**`, API contracts, database, dependencies.
- **Verification:** production literal guard rejects the audit corpus and accepts approved `Matter`, `MFA`, `DLP`, `OCR`, `RFI`, `DD`, `Q&A`, and `AMIC Vault` terms.
- **Edge cases:** English locale resources, code identifiers, test fixtures, accessibility-only labels.
- **Stop / Escalation:** do not ban an identifier that is required only in source or an English locale resource.

### DMS-WB-COPY-TUW-002 — remove information-barrier navigation item

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web navigation` / `H` / `S`.
- **Depends_on:** `DMS-WB-COPY-TUW-001`.
- **Objective:** Remove `/walls` from desktop and mobile navigation for every role while preserving the protected admin route and information-barrier enforcement.
- **Files create:** none.
- **Files modify:** `apps/web/src/lib/features.ts`, `apps/web/src/lib/navigation.ts`, navigation/app-shell tests.
- **Files NOT-modify:** `/walls` route source, auth guard, PermissionService, ethical-wall API/service, audit behavior.
- **Verification:** no navigation group or menu item contains the route; direct `/walls` remains protected and role-limited.
- **Edge cases:** loading role, firm admin, security admin, mobile navigation.
- **Stop / Escalation:** stop if removal would require disabling the security route or policy enforcement.

### DMS-WB-COPY-TUW-003 — replace raw identifiers with existing safe selectors

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web forms` / `H` / `L`.
- **Depends_on:** `DMS-WB-COPY-TUW-002`.
- **Objective:** Replace user-facing wall UUID, user ID, document ID/version ID, and email-hash entry with existing permission-scoped selectors or safe local transformation while keeping API payloads unchanged.
- **Files create:** a small permission-scoped Matter document picker and focused test.
- **Files modify:** admin security/account-ledger, work queue, Matter sharing, external link issuance, litigation evidence form, and their tests.
- **Files NOT-modify:** API DTO/schema, PermissionService, audit events, external sharing policy, database, dependencies.
- **Verification:** selector negative/empty/loading states, no raw identifier labels/placeholders, unchanged API reference payload, raw email never sent to the server.
- **Edge cases:** no wall, no directory result, no Matter document, missing display reference, Web Crypto failure.
- **Stop / Escalation:** omit an action rather than invent an unscoped endpoint or expose a denied resource.

### DMS-WB-COPY-TUW-004 — translate visible English and raw enums

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web copy` / `M` / `L`.
- **Depends_on:** `DMS-WB-COPY-TUW-001`.
- **Objective:** Translate confirmed English headings and map raw status/severity/kind values to Korean display labels without changing stored values.
- **Files create:** none.
- **Files modify:** contract clause bank and review components, Matter workstream/knowledge components, litigation forms, Outlook add-in, document action center/list, closing checklist, and their focused tests.
- **Files NOT-modify:** DTO/schema enum values, API response contracts, database, dependencies.
- **Verification:** table/section headings and badges render Korean labels while requests retain canonical enum values.
- **Edge cases:** unknown future enum values use a neutral Korean fallback without guessing meaning.
- **Stop / Escalation:** do not change a canonical enum or legal domain meaning to improve wording.

### DMS-WB-COPY-TUW-005 — replace specification language and normalize domain terms

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `UX writing` / `M` / `L`.
- **Depends_on:** `DMS-WB-COPY-TUW-001`.
- **Objective:** Replace permission-evaluation and operational specification prose with concise action/result copy and consistently use `Matter`, `Matter 코드`, `정보 차단`, `긴급 접근`, `문서`, and `검색 폴더`.
- **Files create:** none.
- **Files modify:** shared i18n, `/files`, `/search`, Matter, client, integrations, security state, org picker, and related component tests.
- **Files NOT-modify:** permission semantics, safe-denied behavior, API/error codes, database, dependencies.
- **Verification:** visible copy does not reveal resource existence or denial reason and avoids the audit’s banned phrases.
- **Edge cases:** policy-blocked states must remain safe; legal `사건` remains where it is not the product object `Matter`.
- **Stop / Escalation:** if a shorter phrase weakens safe-denied semantics, keep the safe meaning and revise only the wording.

### DMS-WB-COPY-TUW-006 — mask operational references

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web security copy` / `H` / `M`.
- **Depends_on:** `DMS-WB-COPY-TUW-003`.
- **Objective:** Make human-readable labels primary and confine necessary audit/reference values to masked administrator-only disclosure.
- **Files create:** none.
- **Files modify:** audit inspector/console, client detail, admin security request table, Matter workstream, external sharing list, and focused tests.
- **Files NOT-modify:** audit payload, authorization, tenant filtering, API response shape.
- **Verification:** full UUID/hash values are absent from normal rendered markup; administrators retain bounded copyable references only where operationally required.
- **Edge cases:** missing display labels, null references, same shortened suffix.
- **Stop / Escalation:** do not fetch extra data or reveal a protected resource to manufacture a label.

### DMS-WB-COPY-TUW-007 — regression and rendered QA

- **Release / Module / Risk / Size:** `DMS workbench internal extension` / `web QA` / `H` / `L`.
- **Depends_on:** `DMS-WB-COPY-TUW-001~006`.
- **Objective:** Prove the Korean copy, safe selectors, navigation removal, responsive layout, keyboard use, and absence of developer labels on actual rendered surfaces.
- **Files create:** screenshot/QA receipt under the existing DMS workbench artifact convention.
- **Files modify:** focused tests and append-only execution ledger only for defects found in the touched scope.
- **Files NOT-modify:** `docs/package/**`, production/staging configuration, external systems.
- **Verification:** V-UI, V-ROOT, `sloplint --changed --fail-level strong`, production smoke, and actual desktop/tablet/mobile checks for the touched routes.
- **Edge cases:** long Korean labels, 200% zoom, empty/error/loading, reduced motion, mobile menu.
- **Stop / Escalation:** do not claim full rendered coverage from source grep or empty fixtures alone.
