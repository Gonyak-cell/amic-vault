-- Up Migration

-- Existing R12 disposal executes only after approval and hold/reference checks,
-- then records an immutable disposal certificate and audit event in the same
-- tenant-scoped transaction. This is the exact existing dependent-row set.
GRANT DELETE ON document_chunks TO vault_app;
GRANT DELETE ON canonical_documents TO vault_app;
GRANT DELETE ON document_search_index TO vault_app;
GRANT DELETE ON document_preview_artifacts TO vault_app;
GRANT UPDATE (supersedes_version_id), DELETE ON document_versions TO vault_app;
GRANT DELETE ON file_objects TO vault_app;
GRANT DELETE ON documents TO vault_app;

-- Down Migration

REVOKE DELETE ON document_chunks FROM vault_app;
REVOKE DELETE ON canonical_documents FROM vault_app;
REVOKE DELETE ON document_search_index FROM vault_app;
REVOKE DELETE ON document_preview_artifacts FROM vault_app;
REVOKE UPDATE (supersedes_version_id), DELETE ON document_versions FROM vault_app;
REVOKE DELETE ON file_objects FROM vault_app;
REVOKE DELETE ON documents FROM vault_app;
