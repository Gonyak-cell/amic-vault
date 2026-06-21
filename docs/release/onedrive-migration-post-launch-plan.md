# OneDrive Migration Post-Launch Plan

Status: POST-LAUNCH PLANNING ONLY
Owner: Operator / Customer-scope owner / Security owner
Evidence register: `EV-ONEDRIVE-001`
Data handling: Reference-only. Do not commit customer file contents, private
tenant identifiers, provider-console metadata, raw OneDrive paths, secrets,
cookies, tokens, or screenshots that expose matter data.

## Decision

Existing law-firm OneDrive corpus migration is a post-launch activity.
Pre-launch work is limited to inventory, mapping, sample dry-run, and rollback
planning. Pre-launch bulk customer document migration, OneDrive connected-state
claims, and Office open/save/sync claims remain blocked.

| Boundary | Decision |
|---|---|
| OneDrive migration | `POST-LAUNCH` |
| Pre-launch allowed | Inventory, mapping, sample dry-run, rollback plan |
| Pre-launch blocked | Bulk customer document migration, OneDrive connected-state claim, Office open/save/sync claim |
| First migration scope | Pilot Matter only |
| Source of truth cutover | After pilot validation |

## Relation To Office And OneDrive Gate

This plan does not approve Microsoft Graph, OneDrive runtime storage, Office
open/save, coauthoring, lock state, sync, service worker/offline behavior,
external sharing, or secure links. ADR-017 remains authoritative for the
Office/OneDrive runtime gate. The `/integrations/onedrive` route remains hidden
until an approved API/runtime contract and release evidence exist.

## Pre-Launch Allowed Work

Pre-launch work may prepare a migration without changing customer source of
truth or asserting connected-state behavior:

- inventory: read-only source inventory with bounded counts, types, owner refs,
  and retention/legal-hold flags recorded outside the repository;
- mapping: source-to-Vault mapping by tenant, Matter, folder class, retention
  class, and permission/wall implications without raw customer paths in repo;
- sample dry-run: synthetic or explicitly approved sample-only copy simulation
  that records hashes/counts/results as external refs and does not bulk import
  customer documents into production Vault;
- rollback plan: stop, quarantine, restore-source-of-truth, delete-uncommitted
  derived copies where allowed, and reconciliation procedures with no hard
  delete of Vault audit, version, or original records.

## Pre-Launch Blocked Work

The following are blocked until after launch and explicit migration approval:

- bulk customer document migration from OneDrive into Vault;
- any production claim that OneDrive is connected, syncing, or authoritative;
- any production claim that Office open/save/sync is available;
- source-of-truth cutover from OneDrive to Vault;
- customer-wide migration beyond a pilot Matter;
- repository evidence containing real customer document names, raw paths,
  document contents, screenshots, tokens, cookies, private endpoints, tenant
  identifiers, or provider-console metadata.

## Post-Launch Sequence

1. Collect external pre-launch refs:
   `ONEDRIVE-INVENTORY-REF`, `ONEDRIVE-MAPPING-REF`,
   `ONEDRIVE-SAMPLE-DRYRUN-REF`, and `ONEDRIVE-ROLLBACK-PLAN-REF`.
2. Select exactly one approved pilot Matter and record
   `ONEDRIVE-PILOT-MATTER-REF` outside the repository.
3. Run the pilot migration through an approved migration tool or runbook with
   PermissionService, audit, tenant isolation, immutable original, version, and
   rollback evidence.
4. Reconcile pilot counts, hashes, permissions, walls, retention/legal-hold
   flags, audit events, and rollback readiness.
5. Record `ONEDRIVE-PILOT-VALIDATION-REF` and obtain customer-scope,
   security, legal-data, and rollback-owner approvals.
6. Only after pilot validation, decide whether Vault becomes the source of
   truth for the pilot scope. Record `ONEDRIVE-CUTOVER-APPROVAL-REF`.
7. Consider widening to additional Matters only through a separate approved
   migration batch plan.

## Stop Conditions

Stop and escalate if any of the following occur:

- a migration request includes bulk customer documents before launch;
- the requested scope is broader than the approved pilot Matter;
- source permissions, ethical walls, legal holds, or retention policy cannot be
  mapped fail-closed;
- source inventory or dry-run evidence would require committing customer
  content, raw paths, screenshots, private endpoints, tenant identifiers,
  provider metadata, cookies, tokens, or secrets;
- the dry-run cannot prove rollback and reconciliation without hard delete or
  audit mutation;
- a UI, release note, or operator script would claim OneDrive connected state
  or Office open/save/sync before ADR-017 runtime approval.
