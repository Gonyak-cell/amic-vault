# Production UI Rollout Checklist

Status: Draft for operator execution
Scope: AMIC Vault production UI/UX release verification
Data handling: Evidence refs only. Do not paste customer file contents, secrets, raw prompts, source text, model responses, cookies, access tokens, or screenshots that expose confidential matter data.

## 1. Execution Header

| Field | Value |
|---|---|
| Release / PR range |  |
| Production URL |  |
| Operator |  |
| Security reviewer |  |
| Legal-data owner |  |
| Customer-scope owner |  |
| Started at |  |
| Completed at |  |
| Result | `PASS` / `FAIL` / `ROLLBACK` |
| Evidence register ref |  |
| Rollback owner |  |

## 2. Pre-Deploy Gates

| ID | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|
| UI-PRE-001 | CI `verify`, `db-integration`, `docker-build`, `python-worker` are green on the release commit | All required checks green | Operator |  |  |
| UI-PRE-002 | Production UI literal guard passed | No fake/mock/sample/demo operating data literals | Operator |  |  |
| UI-PRE-003 | Production UI smoke gate passed | Hidden routes, raw hex, `?? 0`, unsafe ID fallback checks pass | Operator |  |  |
| UI-PRE-004 | Production UI inventory reviewed | `docs/ui/production-ui-inventory.md` matches route visibility and navigation policy | Security reviewer |  |  |
| UI-PRE-005 | `docs/package/` unchanged unless separately approved | Normative package remains frozen | Security reviewer |  |  |
| UI-PRE-006 | Feature scope confirmed | File organization prep only; no legal analysis, summary, external model route, raw prompt/source/model-response storage | Legal-data owner |  |  |
| UI-PRE-007 | Enterprise DMS UI evidence package prepared | `docs/release/enterprise-dms-ui-release-evidence.md` is copied into the external evidence workspace and every required row has an evidence ref or approved deferral | Operator |  |  |
| UI-PRE-008 | DMS main-loop smoke passed | `pnpm release:dms-smoke -- --json` passes with approved synthetic or canary DMS credentials, Matter Code source, upload, file list, search, detail, records/audit, and negative-auth non-discovery | Operator |  |  |

## 3. Auth And Shell Smoke

| ID | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|
| UI-AUTH-001 | Login page theme | Login page follows the blue SaaS design system and does not show a design theme selector | Operator |  |  |
| UI-AUTH-002 | Login requirements | User can sign in with email and password only; no workspace ID required | Operator |  |  |
| UI-AUTH-003 | Safe auth error | Invalid login does not reveal credential details | Security reviewer |  |  |
| UI-SHELL-001 | Profile card | Shell shows current user's name and email only; no workspace name or workspace ID | Operator |  |  |
| UI-SHELL-002 | Language control | Korean/English control uses design-system styling and does not drift from the header theme | Operator |  |  |
| UI-SHELL-003 | Navigation counts | Sidebar does not show hard-coded counts such as matter/file/access numbers unless API success returns them | Operator |  |  |

## 4. Navigation And Route Visibility

| ID | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|
| UI-NAV-001 | Matter member navigation | Matter member sees only allowed Vault navigation; Admin, Audit, Security, Integrations hidden | Security reviewer |  |  |
| UI-NAV-002 | Firm admin navigation | Firm admin sees allowed Governance, Audit, Security, Integrations routes | Security reviewer |  |  |
| UI-NAV-003 | Loading navigation fail-closed | While user role is loading, shell exposes only the safe minimum navigation | Security reviewer |  |  |
| UI-NAV-004 | Hidden production routes | `/launch`, `/scale`, `/contracts`, `/dd`, `/litigation` are absent from navigation | Operator |  |  |
| UI-NAV-005 | Hidden direct routes | Direct access to hidden production routes renders a safe blocked state without placeholder data | Operator |  |  |
| UI-NAV-006 | API-unready routes | `/files` and OneDrive routes do not claim connected data before API readiness | Operator |  |  |

## 5. Core Screen Smoke

| ID | Screen | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|---|
| UI-CORE-001 | Dashboard | Real-data-only cockpit | No fake person, document, team, time, or count. Empty/API-unavailable states shown until real API success | Operator |  |  |
| UI-CORE-002 | Matters | Empty/error states | Loading, empty, API error, permission denied, and policy blocked states are distinct | Operator |  |  |
| UI-CORE-003 | Search | Pre-search state | Before search, only safe pre-search copy is shown | Operator |  |  |
| UI-CORE-004 | Search | Permission-bound results | Result titles never fall back to document IDs; hidden facets do not expose UUID labels | Security reviewer |  |  |
| UI-CORE-005 | Search | Error states | Permission and policy errors clear the result area and show fail-closed empty states | Security reviewer |  |  |
| UI-CORE-006 | Files | API-unavailable state | Files route shows no file list, document ID, count, or placeholder data before API readiness | Operator |  |  |

## 6. Governance, Security, Audit, Admin

| ID | Screen | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|---|
| UI-GOV-001 | Records | Governance console | No prefilled retention policy, reason, disposal ID, or certificate hash in the primary UI | Legal-data owner |  |  |
| UI-GOV-002 | Records | Advanced refs | Raw references appear only in intentional advanced/security context | Security reviewer |  |  |
| UI-AUD-001 | Audit | Audit console | Rows show display-safe actor/action/result/target/time only; raw refs hidden from default table | Security reviewer |  |  |
| UI-AUD-002 | Audit | Export/search actions | Visible labels are present and actions are disabled or empty until API success | Operator |  |  |
| UI-WALL-001 | Information barriers | Policy console | No wall/matter/user partial ID display in default list | Security reviewer |  |  |
| UI-WALL-002 | Information barriers | Create/edit | Raw ID entry is not the primary workflow; unavailable picker/API state is explicit | Security reviewer |  |  |
| UI-ADM-001 | Admin settings | Enterprise sections | SSO, MFA, keys, SIEM, backup, and compliance sections use design-system tokens and no sample provider/key/evidence values | Operator |  |  |
| UI-ADM-002 | Admin readiness | Count handling | Readiness counts render only after API success; null/error states do not render `0` as a substitute | Security reviewer |  |  |

## 7. AI Prep Scope Smoke

| ID | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|
| UI-AI-001 | Scope wording | UI says file organization prep / file organization readiness only | Legal-data owner |  |  |
| UI-AI-002 | Excluded wording | No legal analysis, summary, external model, raw prompt, raw source, source text, or model response wording in production UI | Legal-data owner |  |  |
| UI-AI-003 | Safe refs | Matter/document/version IDs are not shown in headers or primary cards | Security reviewer |  |  |
| UI-AI-004 | Retry | Retry action is available only when API and permission state allow it | Security reviewer |  |  |

## 8. Responsive And Accessibility Smoke

| ID | Viewport / Mode | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|---|
| UI-RSP-001 | 375px | Mobile navigation | Drawer opens, closes, and exposes allowed navigation without horizontal page overflow across `DMS-RA-001` through `DMS-RA-007` | Operator | `RA-DMS-001C-375` through `RA-DMS-007C-375` external refs required | `HOLD` until refs attached |
| UI-RSP-002 | 768px | Tablet layout | Header, search, side navigation, tables, filters, upload, document detail, records, walls, work queue, and admin panels remain readable across `DMS-RA-001` through `DMS-RA-007` | Operator | `RA-DMS-001B-768` through `RA-DMS-007B-768` external refs required | `HOLD` until refs attached |
| UI-RSP-003 | 1440px | Desktop layout | Sidebar, top search, content, inspectors, and admin/integration panels align with the SaaS design system across `DMS-RA-001` through `DMS-RA-007` | Operator | `RA-DMS-001A-1440` through `RA-DMS-007A-1440` external refs required | `HOLD` until refs attached |
| UI-A11Y-001 | Keyboard | Shell navigation | Keyboard can reach search, language selector, nav items, logout, and mobile drawer controls across `DMS-RA-001` through `DMS-RA-007` | Operator | `RA-DMS-001D-KEYBOARD` through `RA-DMS-007D-KEYBOARD` external refs required | `HOLD` until refs attached |
| UI-A11Y-002 | Keyboard | Search/filter/actions | Search, pagination, filter reset, upload, document actions, download reason, records/audit links, admin refresh, integration links, export, and feedback actions have visible labels or accessible names | Operator | `RA-DMS-002D-KEYBOARD`, `RA-DMS-004D-KEYBOARD`, `RA-DMS-005D-KEYBOARD`, `RA-DMS-006D-KEYBOARD`, `RA-DMS-007D-KEYBOARD` refs required | `HOLD` until refs attached |
| UI-A11Y-003 | Screen reader basics | Empty/error states | Empty/error/denied blocks expose status text, active `aria-current`, and accessible names without relying only on color or icon across `DMS-RA-001` through `DMS-RA-007` | Security reviewer | `RA-DMS-001E-SR-BASICS` through `RA-DMS-007E-SR-BASICS` external refs required | `HOLD` until refs attached |

## 9. Post-Deploy Monitoring

| ID | Check | Expected | Owner | Evidence ref | Result |
|---|---|---|---|---|---|
| UI-POST-001 | First production login | Approved internal account reaches dashboard without workspace ID | Operator |  |  |
| UI-POST-002 | Real upload smoke | Approved file upload completes through Matter Code-scoped DMS flow and file organization prep stays in scope; use `pnpm release:dms-smoke -- --json` receipt ref | Operator |  |  |
| UI-POST-003 | Audit trail | UI-facing upload/prep actions have bounded audit events without document body/raw AI data | Security reviewer |  |  |
| UI-POST-004 | Error monitoring | No spike in auth, route, or UI rendering errors after deploy | Operator |  |  |
| UI-POST-005 | Rollback readiness | Rollback command/path, rollback owner, `DMS-RB-001` through `DMS-RB-007`, and `RB-DMS-*` external drill refs are confirmed before widening traffic; no hard delete or audit mutation allowed | Operator | `RB-DMS-001*` through `RB-DMS-007*` external refs required | `HOLD` until rollback owner and drill refs attached |
| UI-POST-006 | DMS production monitor | Upload, extraction/OCR, search/reindex, permission/wall, AI prep file organization, audit, storage, Matter source, Outlook, and Office/OneDrive gate signals are watched using refs from `docs/release/enterprise-dms-monitor-map.md` only | Operator | `MON-DMS-001*` through `MON-DMS-008*` external refs required | `HOLD` until external refs attached |

## 10. DMS Evidence Handoff

Use `docs/release/enterprise-dms-ui-release-evidence.md` as the external
evidence package template for DMS-UX-808 through DMS-UX-812. The repository copy
is a template only. Completed evidence must remain outside the repository when
it includes production URLs, provider metadata, screenshots, customer matter
data, secrets, cookies, tokens, raw prompts, raw source/source text, or model
responses.

## 11. Decision Record

| Decision | Value |
|---|---|
| Release decision | `APPROVE` / `HOLD` / `ROLLBACK` |
| Decision timestamp |  |
| Approver |  |
| Exact production scope |  |
| Excluded scopes |  |
| Approved tenant class or tenant refs |  |
| Rollback owner |  |
| Required follow-up PRs/issues |  |
| Evidence register refs |  |
| Customer-data exposure confirmed absent | `YES` / `NO` |
| Secrets exposure confirmed absent | `YES` / `NO` |
