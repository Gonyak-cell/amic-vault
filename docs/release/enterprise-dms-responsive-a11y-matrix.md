# Enterprise DMS Responsive And Accessibility Matrix

Status: REQUIRED BEFORE DMS PRODUCTION SIGNOFF - EXTERNAL REFS ONLY
Related TUW: DMS-GA-703, DMS-UX-806, DMS-UX-807

This matrix defines the route-level responsive and accessibility evidence
required for the Matter-first Enterprise DMS release. It records only reference
IDs, owners, route groups, viewport coverage, keyboard/screen-reader coverage,
and hold triggers. Do not commit screenshots with customer matter data,
production URLs, provider metadata, cookies, tokens, document names, document
contents, raw prompts, raw source/source text, or model responses.

The repository guards below prove layout and accessibility primitives exist.
They are not final visual QA receipts. DMS-UX-812 remains `HOLD` until each
`DMS-RA-*` row has owner-reviewed external refs for 1440px, 768px, 375px,
keyboard traversal, focus visibility, accessible names, active `aria-current`,
and readable empty/error states.

## Repository Guard Contract

| Guard ref | Required proof | Repository evidence | External receipt boundary |
| --- | --- | --- | --- |
| RA-DMS-GUARD-001 | App shell mobile navigation, focus trap, aria-current, decorative icon hiding, and body overflow lock are guarded | `apps/web/src/app/(app)/app-shell.test.tsx`, `apps/web/src/app/(app)/app-shell.tsx`, `pnpm --filter @amic-vault/web test -- src/app/(app)/app-shell.test.tsx` | External keyboard and screen-reader receipt for visible release routes |
| RA-DMS-GUARD-002 | Page/layout primitives keep main landmarks, bounded desktop width, wrapped actions, and responsive headers | `apps/web/src/components/ui/layout-primitives.test.tsx`, `page-shell.tsx`, `page-header.tsx`, `section-card.tsx`, `filter-bar.tsx` | External 1440px, 768px, and 375px visual receipt for visible release routes |
| RA-DMS-GUARD-003 | Empty/error states expose readable status text and do not rely only on color or icon | `apps/web/src/components/ui/empty-state.test.tsx`, `empty-state.tsx` | External no-data/error-state receipt for visible route group |
| RA-DMS-GUARD-004 | Tables and selectable rows contain horizontal overflow, captions, keyboard access, and selected state semantics | `apps/web/src/components/ui/data-table.test.tsx`, `data-table.tsx` | External table/filter receipt for files, search, audit, records, work, admin, and governance routes |

## Route Receipt Matrix

| Receipt ID | Visible DMS route group | Required visual QA refs | Required keyboard/screen-reader refs | Owner | HOLD trigger |
| --- | --- | --- | --- | --- | --- |
| DMS-RA-001 | App shell, dashboard, navigation, language selector, logout | `RA-DMS-001A-1440`, `RA-DMS-001B-768`, `RA-DMS-001C-375` | `RA-DMS-001D-KEYBOARD`, `RA-DMS-001E-SR-BASICS` | QA owner | Mobile drawer unreachable, active route lacks `aria-current`, focus is hidden, logout/language controls lack accessible names, or horizontal overflow appears |
| DMS-RA-002 | Upload/files route and Matter Code picker | `RA-DMS-002A-1440`, `RA-DMS-002B-768`, `RA-DMS-002C-375` | `RA-DMS-002D-KEYBOARD`, `RA-DMS-002E-SR-BASICS` | QA owner | Upload, Matter Code picker, filters, queue receipt, or file table is unusable at any required viewport or loses readable empty/error state |
| DMS-RA-003 | Matter list, Matter workspace, Matter file cabinet, and team access routes | `RA-DMS-003A-1440`, `RA-DMS-003B-768`, `RA-DMS-003C-375` | `RA-DMS-003D-KEYBOARD`, `RA-DMS-003E-SR-BASICS` | QA owner | Matter actions, team member controls, wall/access panels, or file cabinet controls cannot be reached by keyboard or overflow on mobile/tablet |
| DMS-RA-004 | Document detail, preview, action center, versioning, download reason, related items | `RA-DMS-004A-1440`, `RA-DMS-004B-768`, `RA-DMS-004C-375` | `RA-DMS-004D-KEYBOARD`, `RA-DMS-004E-SR-BASICS` | QA owner | Detail/profile/action controls overlap, preview or version panels obscure controls, download reason selector is keyboard-inaccessible, or readable denied/error state is missing |
| DMS-RA-005 | Search and governed search folders | `RA-DMS-005A-1440`, `RA-DMS-005B-768`, `RA-DMS-005C-375` | `RA-DMS-005D-KEYBOARD`, `RA-DMS-005E-SR-BASICS` | QA owner | Search bar, filters, pagination, no-results, denied states, or snippet/result cards overflow, trap focus, or expose inaccessible labels |
| DMS-RA-006 | Admin, security, enterprise hardening, integrations, Outlook, and Matter source status | `RA-DMS-006A-1440`, `RA-DMS-006B-768`, `RA-DMS-006C-375` | `RA-DMS-006D-KEYBOARD`, `RA-DMS-006E-SR-BASICS` | Web lead | Admin panels, integration cards, gated Office/OneDrive states, or enterprise controls are unreadable, unreachable, or claim connected state before evidence |
| DMS-RA-007 | Records, audit, walls, work queue, notifications, and governance tables | `RA-DMS-007A-1440`, `RA-DMS-007B-768`, `RA-DMS-007C-375` | `RA-DMS-007D-KEYBOARD`, `RA-DMS-007E-SR-BASICS` | QA owner | Records/audit/walls/work tables lack horizontal containment, captions, focusable rows/actions, or readable empty/error state |

## Required External Evidence Review

Before DMS-UX-812 can move from `HOLD` to `PASS`, the QA owner and Web lead
must attach reference-only evidence for every `RA-DMS-*` visual and
keyboard/screen-reader ref above. Evidence must name the release SHA or PR
range, approved tenant class or synthetic/canary scope, route group, viewport,
browser/device class, reviewer, timestamp, and PASS/HOLD decision.

Missing route coverage, missing 1440px/768px/375px visual refs, missing keyboard
or screen-reader basics refs, screenshots with customer data, or evidence that
uses fake/mock/sample operating data are release blockers, not code failures.
