# UI/UX PR Review Checklist

This checklist is the production review gate for AMIC Vault UI/UX work. It converts the UIUX development package requirements into concrete review questions, CI checks, and release evidence expectations.

## 1. Review Boundary

Use this checklist for every PR that changes:

- `apps/web/src/**`
- app shell, navigation, login, profile, language controls, search, matter/file views, dashboard, admin, audit, records, walls, AI Prep, integrations, or hidden production routes
- UI copy, i18n keys, design tokens, shared UI primitives, route visibility, role/capability gates, production release checks, or UI smoke scripts

Do not approve a UI PR when a required item is unchecked without a written reason in the PR body.

## 2. Mandatory Local And CI Evidence

Required for UI production PRs:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- production UI smoke gate review, including route visibility and ID/raw-data exposure checks, when the PR touches production UI routes or release readiness
- `docs/ui/enterprise-dms-release-hardening.md` reviewed when the PR changes release readiness, production route visibility, core DMS flows, or UI smoke guards

If the PR changes database-backed display behavior, include the relevant integration tests or state that the PR is UI-only and does not alter API/data contracts.

## 3. Fake Data And Operational Data

Reject the PR if production UI renders any of the following without real API success:

- fake/mock/sample/demo operating data
- default people, teams, documents, matters, files, dates, approval counts, readiness counts, connected states, or completed states
- null/error values coerced to `0`, success, approved, connected, or completed
- hidden or internal route placeholders visible to ordinary production users

Allowed states before API success are loading, empty, unavailable, permission denied, policy blocked, or safe setup-required states.

## 4. Internal Reference Exposure

Default UI must not expose:

- workspace ID or tenant ID
- user ID, matter ID, document ID, version ID, file object ID, audit event ID, policy ID, or queue job ID
- raw UUID slices, short hashes, or ID-derived labels used as display names

Advanced/security inspectors may show bounded references only when the screen intentionally requires them and the user role is allowed.

## 5. Role And Capability Gating

Review that navigation and direct route behavior are fail-closed:

- route visibility changes update `docs/ui/production-ui-inventory.md` and `apps/web/src/lib/features.ts` together
- role/capability loading must not expose Admin, Security, Audit, Integrations, AI Prep, or internal operations routes optimistically
- matter-member users see only allowed Vault routes
- firm/security admins see only allowed admin/security surfaces
- hidden routes are absent from production navigation
- direct hidden-route access returns a safe blocked, unavailable, or not-found state without placeholder data

## 6. Empty, Error, And Permission States

Affected screens must distinguish:

- loading
- empty/no results
- API unavailable
- auth required
- permission denied
- ethical wall blocked
- AI policy blocked
- tenant isolation violation

Search, Audit, AI Prep, and Admin must clear stale result/content areas on permission, policy, or API errors instead of retaining previous sensitive data.

## 7. AI Prep Scope

AI Prep production UI is limited to file organization prep/readiness.

Reject the PR if UI copy or evidence implies:

- legal analysis
- document summary
- external model routing
- raw prompt storage or display
- raw source/source text storage or display
- model response storage or display

AI evidence must remain bounded to refs, status, hashes, and safe metadata allowed by the product scope.

## 8. SaaS Design System And IA

Review visual and interaction consistency:

- shared design tokens for primary color, focus ring, background, border, surface, text, and muted text
- shared PageHeader, SectionCard, EmptyState, StatusBadge, table/list/filter patterns where applicable
- `docs/ui/design-system-checklist.md` reviewed for affected screens
- no route-specific theme, custom blue, custom shadow, custom gradient, or one-off panel style without design-system justification
- login, shell, dashboard, matter/file/search, governance, audit, walls, admin, AI Prep, and integrations feel like one enterprise SaaS product
- profile displays user name and email only
- language control follows the header design system

## 9. Enterprise DMS Core Flow

Review DMS operational completeness against `docs/ui/enterprise-dms-ux-baseline-gap-audit.md`.

Reject or explicitly defer the PR when a production-ready API exists but the UI has no corresponding operator flow for:

- matter creation/selection by canonical Matter app Matter Code or display name
- matter workspace home with profile, members, files, activity, tasks, and governance context when those APIs are in scope
- file upload into an allowed matter
- matter-code/name selection before file upload, with no free-floating document upload
- bulk upload/import review, retry, and progress when bulk APIs are production-ready
- email filing and attachment filing into matter/folder from Outlook or equivalent approved integration
- file browse/list by matter or filing location
- document profile and metadata review/edit
- version history and add-version flow
- check-out/check-in, coauthoring, or an explicit ADR deferral for controlled editing state; current PR-B deferral is `docs/adr/ADR-016-document-editing-and-office-flow.md`
- preview/download/open action surface
- contextual audit/activity timeline for matter and document pages when audit APIs are production-ready
- workflow/action inbox for document review, approval, metadata completion, extraction/OCR remediation, and records actions when task APIs are production-ready
- sensitivity/confidentiality/DLP/security-label status where those policies are in production scope
- permission-aware disabled/denied states for document actions
- user/matter/folder pickers for normal operators instead of raw reference entry
- enterprise search controls for body/full-text, metadata/profile, matter/client/folder scope, document type, author/uploader, date ranges, confidentiality/privilege/security status, OCR/extraction status, version status, saved searches, result sorting/grouping, and preview hit navigation when search APIs are production-ready

For `/files`, do not treat a hidden or empty route as production-complete after upload/list APIs are approved. The PR must either implement upload/browse UX or state a release-scoped deferral with owner and follow-up TUW.

For PR-D governance/workflow/ops PRs, review
`docs/ui/enterprise-dms-pr-d-closeout.md` and confirm the affected PR keeps the
closeout evidence true for Effective Access, Ethical Wall, Records Context,
Matter/Document Activity Timeline, Action Inbox, Notification Center, Ops
Health, AI Prep file organization only scope, External sharing gated scope, and
stale-content clearing. Remaining deferred items must be named instead of
presented as complete.

For PR-E admin/integration PRs, review
`docs/ui/enterprise-dms-pr-e-closeout.md` and confirm taxonomy, Matter template,
folder template, search refiner, Outlook, OneDrive, Office, admin IA, and
integration status claims remain tied to approved route evidence. Read-only
contract states must not look editable, and gated integrations must not imply a
connected production state.

For PR-F release-hardening PRs, review
`docs/ui/enterprise-dms-pr-f-readiness.md` and confirm the PR separates
machine-guarded readiness from external authenticated main-loop, negative-auth,
responsive, and accessibility receipts. Do not approve production signoff when
credential-backed DMS upload/search/detail receipts are missing.

## 10. Responsive And Accessibility

For affected screens, check:

- 1440px desktop: sidebar, top search, content, and inspector spacing remain aligned
- 768px tablet: navigation and tables remain readable
- 375px mobile: drawer/nav is reachable and usable without horizontal page overflow
- keyboard users can reach navigation, search, filters, language selector, logout, export/actions, and drawers
- active nav has `aria-current`
- icon-only buttons have accessible names and are not used for primary actions without visible text
- empty/error states include readable status text and do not rely only on color

## 11. Reviewer Decision

Approve only when:

- the PR template UI/UX checklist is complete or each non-applicable item has a reason
- required local/CI commands are green
- sensitive data is absent from PR body, logs, screenshots, and evidence
- production behavior remains file organization prep only where AI Prep is involved
- the change preserves the existing SaaS design-system theme

Hold or request changes when evidence is missing, hidden routes leak, fake data appears, internal refs are displayed as user-facing labels, or mobile navigation/accessibility is not checked for affected screens.

## 12. Release Hardening

For release-candidate or production-readiness PRs, review
`docs/ui/enterprise-dms-release-hardening.md` and confirm the PR body or release
record covers:

- authenticated main loop smoke: login -> Matter Code -> upload -> processing -> list -> detail -> search -> preview/version -> records/audit links
- negative auth smoke for non-member, wall-blocked, non-admin, denied upload/download/search, and stale-content clearing
- no fake data sweep, internal ref sweep, and AI Prep scope sweep
- responsive QA at 1440px, 768px, and 375px
- accessibility QA for keyboard focus, accessible names, `aria-current`, and readable error states
- evidence package refs only, no secrets or customer file contents
- rollback owner, route/feature/worker rollback controls, production monitor, and owner signoff
- PR-D closeout evidence, when governance/workflow/ops routes are touched,
  remains aligned with `docs/ui/enterprise-dms-pr-d-closeout.md`
- PR-E closeout evidence, when admin/integration routes are touched, remains
  aligned with `docs/ui/enterprise-dms-pr-e-closeout.md`
- PR-F readiness evidence, when release hardening is touched, remains aligned
  with `docs/ui/enterprise-dms-pr-f-readiness.md`
