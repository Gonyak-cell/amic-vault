# Production UI Inventory

Status: production UI policy source for the UI/UX package closeout
Scope: AMIC Vault web production routes and navigation exposure
Related TUW: TUW-UI-001, TUW-UI-002, TUW-UI-003, TUW-UI-004, TUW-UI-701, TUW-UI-702, TUW-UI-703, TUW-UI-704
Enterprise DMS UX baseline: `docs/ui/enterprise-dms-ux-baseline-gap-audit.md`

This inventory records which routes may be shown in production navigation, which routes must be gated, and which routes must remain hidden until an approved API or product scope exists. It complements `apps/web/src/lib/features.ts`; code changes to route visibility should update both files in the same PR.

For DMS core routes, backend API readiness alone is not enough to declare production UX readiness. Once upload/list/version/download APIs are approved for production, the UI must provide the corresponding upload, browse, document profile, version, and document action flows, or the release checklist must explicitly record a scoped deferral.

## Status Definitions

| Status | Meaning | Production navigation |
|---|---|---|
| `visible` | Route is in current production scope for internal users with the listed role policy. | Allowed when role policy allows it |
| `visible_admin_only` | Route is in current production scope for approved admin/security/operator roles. | Allowed only for approved admin/security/operator roles |
| `visible_limited` | Route is in production scope but intentionally hidden from primary navigation unless another approved entry point links to it. | Hidden by default |
| `hidden_until_api_ready` | Route shell may exist, but production must not claim connected data before the backing API/contract is approved. | Hidden |
| `hidden` | Route is out of current production scope or internal-only. Direct access must render a safe blocked/not-found state without placeholder data. | Hidden |

## Production App Routes

| Route | Group | Status | Navigation | Roles / audience | Direct access behavior | Data policy |
|---|---|---|---|---|---|---|
| `/dashboard` | Vault | `visible` | Shown | Internal production users | AppShell route | Real API data only; empty/unavailable before success; DMS action launcher links only to approved production surfaces; action queue derives only from dashboard API sections and connection states |
| `/matters` | Vault | `visible` | Shown | Internal production users | AppShell route | Permission-scoped matters only; Matter Code/display data must align with the canonical Matter app source of truth |
| `/search` | Vault | `visible` | Shown | Internal production users | AppShell route | Permission-before-search; no ID fallback; supports title/body/all target, display-safe Matter Code/client/title filters, legal-hold/records-status refiners, URL state, sort, grouping, user-scoped saved searches, current-search reusable links, and result actions to document detail/preview/file-cabinet filters with bounded hit context |
| `/search/folders` | Vault | `visible` | Shown | Internal production users | AppShell route backed by saved-search APIs | User-scoped saved searches are exposed as search folders; no fake folder tree, raw saved-search IDs, snippets, document body, prompt/source text, or model responses are displayed or stored by the UI |
| `/files` | Vault | `visible` | Shown | Internal production users | AppShell route with all-documents vault, server-backed document filters/sort, extraction/OCR status filters, Matter Code picker, single/bulk upload panel, and matter-scoped list foundation | Permission-scoped real document data only; no document ID or placeholder data; upload/list UX must stay Matter Code-gated and fail closed when Matter app source is unconfigured; bulk upload uses the same per-file Matter-scoped API and displays partial failures; source labels use operating-language copy, not implementation labels such as source-of-truth or projection |
| `/work` | Vault | `visible` | Shown | Internal production users | AppShell route | Work queue derives only from dashboard/work APIs and connection states, supports source/status/sort filtering, and links remediation work to URL-backed `/files` and `/records` entry points; no persisted task counts or fake assignments before unified task API approval |
| `/notifications` | Vault | `visible` | Shown | Internal production users | AppShell route and top-bar link | Notification center derives only from dashboard/notification APIs and real operating events/status, supports source/status/sort filtering, and links notifications back to approved source surfaces; no persisted notification counts or fake alerts before unified notification API approval |
| `/documents/[id]` | Vault | `visible_limited` | Hidden by default | Internal production users with document permission through approved entry points | AppShell action route | Profile read/edit, preview, controlled download, version operations, governance context, search hit context, records/audit links, records action entry points, and real-status work queue use real data only; audit timelines clear stale rows on denied/error reloads; no check-out, Office live edit, external sharing, raw ID display, raw snippet URL storage, or fake related-item data |
| `/records` | Governance | `visible_admin_only` | Shown when role policy allows | Firm admin, security admin, matter owner | AppShell route with display-label records action panel | No fake retention/disposal/certificate values; document-detail entry points may prefill action refs but the normal contextual flow shows only safe document/Matter labels plus action readiness cards |
| `/audit` | Audit | `visible_admin_only` | Shown when role policy allows | Firm admin, security admin | AppShell route | Display-safe actor/action/result/target/time only; contextual audit surfaces must clear stale rows before denied/error states render |
| `/walls` | Security | `visible_admin_only` | Shown when role policy allows | Firm admin, security admin | AppShell route | Default list hides wall/matter/user raw references; common lookup/create uses Matter Code picker, while user/group membership refs remain in clearly marked advanced security operations until picker APIs exist |
| `/admin` | Admin | `visible_admin_only` | Shown when role policy allows | Firm admin, security admin | Guarded admin settings route | SSO/MFA/BYOK/SIEM/Backup/Compliance data only after API success; taxonomy/template/refiner IA is read-only until save/audit APIs are approved; search index reprocessing uses the admin reindex endpoint and displays only audit-safe queue counts after request; operations health uses local file organization prep health/metrics only |
| `/admin/security` | Admin | `visible_admin_only` | Hidden | Firm admin, security admin | Guarded security settings route | Same real-data-only Admin Settings policy; no separate mock security data |
| `/enterprise` | Admin | `visible_admin_only` | Hidden | Firm admin, security admin | Compatibility guarded admin settings route | Alias only; not shown in navigation |
| `/integrations` | Integrations | `visible_admin_only` | Parent route hidden | Firm admin, security admin | Safe integration matrix route | Matter app links to source/gate status; Outlook links to real status; OneDrive/Office remain gated without connected-state claims |
| `/integrations/matter-app` | Integrations | `visible_admin_only` | Linked from integrations matrix | Firm admin, security admin | Matter app source status route | Shows Matter Code source mode, upload gate, projection fallback policy, and setup-required state without endpoints, tokens, internal Matter IDs, or connected-state claims before configuration |
| `/integrations/outlook` | Integrations | `visible_admin_only` | Shown when role policy allows | Firm admin, security admin | Admin status route | Status API data only plus Vault filing-path alignment; Office task pane stays separate |
| `/integrations/onedrive` | Integrations | `hidden_until_api_ready` | Hidden | Firm admin, security admin after API readiness | No production route until contract is approved | Must not claim OneDrive connection |
| `/ai-prep` | AI Prep/Ops | `visible_limited` | Hidden by default | Firm admin, security admin, matter owner, knowledge manager | Approved linked entry points only | File organization prep/readiness only |

## Hidden And Out-Of-Scope Routes

| Route | Group | Status | Required behavior |
|---|---|---|---|
| `/launch` | Internal Ops | `hidden` | No navigation entry; direct access renders `RouteBlockedState` |
| `/scale` | Internal Ops | `hidden` | No navigation entry; direct access renders `RouteBlockedState` |
| `/contracts` | Out of scope | `hidden` | No navigation entry; direct access renders `RouteBlockedState` |
| `/dd` | Out of scope | `hidden` | No navigation entry; direct access renders `RouteBlockedState` |
| `/litigation` | Out of scope | `hidden` | No navigation entry; direct access renders `RouteBlockedState` |
| `/showcase` | Out of scope | `hidden` | No navigation entry; direct access returns Next `notFound()` |
| `/external/[token]` | External route | out of current UIUX batch scope | Not part of internal AppShell navigation; external scope remains governed by release gates |
| `/outlook-addin` | Office task pane | task-pane-only | Not shown in internal console navigation; managed through `/integrations/outlook` status |

## Production Invariants

- Production navigation must be derived from `apps/web/src/lib/features.ts` and `apps/web/src/lib/navigation.ts`, not local route arrays.
- Role/capability loading must fail closed. Admin, Security, Audit, Integrations, AI Prep, Internal Ops, and Out-of-scope routes must not appear optimistically.
- Production UI must not render fake/mock/sample/demo operating data, default people, default documents, default teams, hard-coded dates, placeholder metrics, or connected/completed states before real API success.
- Default UI must not show workspace ID, tenant ID, user ID, matter ID, document ID, version ID, raw UUID slices, or ID-derived labels.
- AI Prep production UI is limited to file organization prep/readiness. Legal analysis, summary, external model route, raw prompt, raw source/source text, and model response UI/copy/storage remain out of scope.
- Evidence for rollout or review must use refs only. Do not paste secrets, customer file contents, raw prompts, source text, model responses, cookies, tokens, or confidential screenshots into PRs or release records.

## Batch Closeout Evidence

Before merging a UI/UX batch that changes production routes or navigation, include:

- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- role/navigation evidence for affected routes
- direct hidden-route evidence when hidden route files change
- `docs/ui/enterprise-dms-release-hardening.md` review for release-readiness PRs
- confirmation that `docs/package/` was not modified
