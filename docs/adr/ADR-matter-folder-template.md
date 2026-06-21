# ADR: DMS Matter Template Contract

Status: Accepted for Enterprise DMS GA repo-side implementation

## Context

DMS-GA-602 requires Matter type defaults without presenting a fake folder UI. AMIC Vault already treats document filing as Matter-scoped metadata, and production UI must not imply virtual folders unless backend semantics, audit, and rollback behavior exist.

## Decision

Matter templates are stored as tenant-governed document-set contracts:

- one active template per `matter_type`
- each template contains bounded `documentSets[]` with safe labels, approved document type codes, required flags, and sort order
- template configuration changes are admin-only and recorded through `ENTERPRISE_DMS_CONFIGURATION_CHANGED`
- applying a template to a Matter writes an `enterprise_dms_matter_template_applications` receipt and audit reference
- normal Matter file UI may display approved document sets only from `GET /enterprise/dms/matter-templates/approved`

The model deliberately does not create or display a folder tree. There is no `folderPath`, no object-store folder claim, and no file-system style hierarchy in this GA lane.

## Consequences

- Matter screens can show approved document-set guidance for the Matter type without exposing raw template IDs.
- Rollback is safe because documents, versions, and audit events are not deleted or rewritten.
- Future folder-like behavior must introduce explicit backend semantics first; UI-only pseudo folders remain blocked.
