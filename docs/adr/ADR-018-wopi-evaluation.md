# ADR-018: WOPI Evaluation For Office And Hancom Editing

Status: Proposed - requires PR/operator approval before runtime implementation
Date: 2026-07-04
Related: ADR-016, ADR-017, B12

## Context

B12 chooses a first editing step for a 9-person internal law firm. The immediate
need is to remove the manual download-upload loop for DOCX/HWP work while
preserving check-out locks, immutable originals, review subversions, and audit
events. WOPI or Microsoft 365 CSPP could later provide browser editing or
coauthoring, but that is deeper than the B12 operating need.

## Options

| Option | Strengths | Costs | Main risks | B12 decision |
|---|---|---|---|---|
| Collabora Online self-hosted WOPI | On-prem friendly, controllable runtime, avoids Microsoft tenant dependency | Infra sizing, operations, WOPI host implementation, support coverage | Office fidelity variance, Korean/HWP handling limits, callback and lock correctness | Do not implement in B12 |
| OnlyOffice Docs self-hosted WOPI | Strong OOXML editing surface, self-hostable, familiar browser document UX | License review, infra, WOPI host implementation, support coverage | Coauthoring semantics, callback replay/idempotency, tenant isolation proof | Do not implement in B12 |
| Microsoft 365 CSPP / Office for the web | Best Word fidelity, user familiarity, potential future coauthoring | CSPP approval, Microsoft identity/token contract, cloud dependency, legal/compliance review | External auth/storage callback exposure, rollback complexity, customer tenant variance | Evaluate later only |
| Tauri local app handoff | Fits small-firm checkout model, uses installed Word/Hancom, avoids WOPI host runtime | Desktop packaging/manual QA, local temp-file hygiene, OS app availability | Protocol handling, save watcher reliability, user machine variance | Preferred B12 phase-1 path |

## Decision

Do not implement WOPI runtime in B12. Use the local desktop app handoff as the
phase-1 editing path, backed by server checkout, lock-token verification,
saveSubversion idempotency, heartbeat, check-in/cancel, and reference-only audit.

WOPI remains a later go/no-go decision. It becomes a candidate only if the firm
needs browser-based editing, simultaneous editing, or Microsoft/OnlyOffice/
Collabora managed editing beyond the local-app workflow.

## Go/No-Go Criteria For Future WOPI

Go only when all of these are true:

- Auth: tenant-scoped identity, consent, token rotation, and fail-closed
  authorization are approved.
- Storage: immutable original preservation, tenant prefixing, malware/DLP
  boundary, and storage failure handling are proven.
- Version: every save creates a FileObject/version or review subversion with
  hash validation and duplicate/idempotency handling.
- Audit: each approved action writes one reference-only audit row.
- Callback: signature validation, replay protection, tenant/document binding,
  and safe denied responses are implemented and tested.
- Rollback: route hiding, feature disablement, token revocation, callback
  rejection, queue stop, and no-hard-delete verification are rehearsed.
- Cost/support: licensing, compute, operations owner, and support SLA are
  accepted by the operator.

No-go if any of those controls are missing, or if the use case is still satisfied
by check-out lock plus local Word/Hancom editing.

## B12 Manual Approval Needs

- Word DOCX manual receipt: desktop edit click, Word opens, save produces a new
  review subversion in web detail, check-in completes.
- Hancom HWP manual receipt: same flow for one HWP fixture.
- PR/operator approval that this ADR contains the comparison table, cost view,
  and go/no-go criteria.
