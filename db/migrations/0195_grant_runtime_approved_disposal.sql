-- Up Migration

-- The existing approved Records disposal transaction sets its executor GUC,
-- performs legal-hold guarded cleanup, and removes only the document's
-- tenant-scoped derived/original rows. Preserve RLS and grant that exact path.
GRANT DELETE ON document_chunks, canonical_documents, document_search_index,
  document_preview_artifacts, document_versions, file_objects, documents TO vault_app;
GRANT UPDATE (supersedes_version_id) ON document_versions TO vault_app;

-- Down Migration

REVOKE DELETE ON document_chunks, canonical_documents, document_search_index,
  document_preview_artifacts, document_versions, file_objects, documents FROM vault_app;
REVOKE UPDATE (supersedes_version_id) ON document_versions FROM vault_app;
