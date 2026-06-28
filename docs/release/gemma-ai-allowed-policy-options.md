# Gemma `ai_allowed` Policy Options After OneDrive Cutover

Date: 2026-06-28
Scope: local AMIC Vault after OneDrive source-of-truth cutover execute

This document is repo-safe. It does not store raw source paths, document body,
OCR excerpts, object keys, screenshots, tokens, or tenant-private raw labels.

## Current Inventory

Cutover state:

- OneDrive source cutover status: `executed`
- Vault source of truth: `true`
- Gemma indexing executed: `false`

Vault counts:

- Documents: `22,299`
- Document versions: `22,299`
- File objects: `22,299`
- Matters: `123`
- Clients: `80`
- Documents without matter: `0`
- Active ethical walls: `0`
- AI policies configured: `0`
- Matters with AI policy: `0`

`ai_allowed` distribution:

- `true`: `0`
- `false`: `22,299`

Current aggregate document profile:

- `status=draft`: `22,299`
- `document_type=other`: `22,299`
- `confidentiality_level=standard`: `22,299`
- `privilege_status=none`: `22,299`
- `legal_hold=true`: `0`

## Decision Options

### Option 0: Keep All Denied

Set no documents to `ai_allowed=true`.

Recommended when no human-approved AI access policy exists. Gemma indexing stays
blocked/no-op, and Vault remains source of truth for document storage only.

Acceptance:

- `ai_allowed_true=0`
- Gemma indexing execute remains blocked
- A receipt records that AI indexing was intentionally deferred

### Option 1: Pilot Matter Allowlist

Approve a small set of matter IDs for Gemma eligibility.

This is the recommended first executable option. It keeps the blast radius small
and maps cleanly to permission-before-AI, matter membership, and future ethical
wall checks.

Acceptance:

- Human approval workbook names approved matter references
- Every target document belongs to an approved matter
- Exclusions are applied before any indexing queue is prepared
- Dry-run target count and exclusion count are reviewed before execute

### Option 2: Client Or Matter-Type Allowlist

Approve all documents under selected clients or selected matter categories.

This should follow a successful Option 1 pilot because the current imported
document metadata is broad: all imported rows are currently `document_type=other`
and `confidentiality_level=standard`.

Acceptance:

- Client/matter category approval is explicit
- Matter-to-client linkage is verified before allow
- No row is allowed only because of folder ancestry without approved mapping
- Dry-run includes per-lane target counts and exclusion counts

### Option 3: Broad Allow With Exclusions

Set most imported documents eligible, excluding legal hold, restricted privilege,
ethical wall, blocked matter/client, and unsupported indexing classes.

This is not recommended yet. The imported metadata profile is not granular enough
to support broad allow safely without a separate governance approval.

Acceptance:

- Firm-level AI policy approval exists
- Exclusion rules are implemented and tested before write
- Permission-before-AI and tenant isolation gates pass
- Full dry-run receipt is approved before execute

## Required Gates Before Gemma Execute

Gemma indexing must not run until all of the following are true:

- Source-of-truth cutover receipt is PASS
- A human-approved `ai_allowed` option exists
- `ai_allowed` write dry-run passes
- Permission-before-AI gate passes
- Ethical wall gate passes, even when active wall count is `0`
- Tenant isolation gate passes
- Index target/exclusion receipt is generated and approved
- Rollback/containment receipt exists

## Recommended Next Step

Use Option 1 first:

1. Select a small pilot allowlist by matter.
2. Run `ai_allowed` dry-run only.
3. Review target/exclusion counts.
4. Execute the `ai_allowed` write only after explicit approval.
5. Run Gemma indexing preflight after the allowlist write receipt passes.

No Gemma indexing execute was performed as part of this packet.
