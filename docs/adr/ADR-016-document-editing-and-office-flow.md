# ADR-016: Document Editing And Office Flow

Status: Proposed - B12 local handoff update pending PR/operator approval

Source: DMS-UX PR-B document operations plan (`DMS-UX-208`, `DMS-UX-210`)
and B12 Office/Hancom native editing uplift.

## Context

The document detail surface needs controlled editing without weakening the Vault
constitution. Since the original read/download-only decision, the repo has added
server-side edit sessions, lock tokens, heartbeat, saveSubversion idempotency,
check-in/cancel/force-release, review gates, immutable version promotion, and
reference-only audit events.

The remaining B12 need is a local desktop handoff for firms that edit DOCX/HWP
files in installed Word or Hancom Office. The handoff must not become a second
source of truth, must not overwrite originals, and must not claim browser
coauthoring or WOPI runtime support before a separate approval.

## Decision

Adopt a controlled local desktop handoff as the proposed next editing model.
Until this ADR and ADR-018 receive PR/operator approval, the implementation may
ship only as repo-local B12 evidence and must stay below product-readiness
claims.

The production document action center may expose:

1. preview when the existing preview endpoint permits it,
2. controlled download with a reason code,
3. metadata profile read/edit through the existing metadata endpoint,
4. version history through the existing version list endpoint,
5. new version upload through the existing immutable version endpoint,
6. server-authoritative check-out/check-in/review subversion controls,
7. a desktop edit protocol URL that carries only document/version references,
8. local app handoff after server checkout, package download, local temporary
   file write, watcher debounce, saveSubversion retry/idempotency, heartbeat,
   and explicit check-in/cancel.

The production document action center and desktop bridge must not expose:

1. lock tokens, storage URIs, raw file hashes, API URLs, document body text, or
   credentials in protocol URLs, UI evidence, logs, or notifications,
2. WOPI host endpoints, browser editing, or coauthoring controls,
3. external sharing links as an editing workaround,
4. any path that bypasses PermissionService, immutable original preservation, or
   audit-by-default behavior.

## WOPI Boundary

WOPI is evaluated in `ADR-018-wopi-evaluation.md`. B12 does not implement WOPI
CheckFileInfo/GetFile/PutFile/Lock endpoints, Office Online browser editing, or
coauthoring. A later ADR must approve auth, storage, version, audit, callback,
rollback, tenant isolation, and cost before runtime WOPI work starts.

## Guardrails

- Checkout, package download, saveSubversion, check-in, cancel, and heartbeat
  remain server-authoritative.
- Every saved local edit creates a new review subversion and never overwrites
  the official version or original FileObject.
- `clientSaveId` is reused only for retries of the same local save burst.
- Local desktop notifications use workflow state only; no raw document content,
  token, storage URI, or API URL is shown.
- The desktop app may use temporary working files for the active edit package
  only. It must not introduce persistent document cache, offline sync, local DB,
  search cache, audit cache, AI cache, or records cache.
- Coauthoring and live browser editing remain non-goals for B12 and must stay
  behind release-smoke claim gates.

## Review Triggers

Revisit this ADR when:

- B12 desktop manual QA captures Word and Hancom open-save-check-in receipts,
- ADR-018 receives PR/operator approval,
- a future requirement needs simultaneous browser editing or coauthoring,
- a WOPI/CSPP contract is approved with rollback and tenant isolation evidence.
