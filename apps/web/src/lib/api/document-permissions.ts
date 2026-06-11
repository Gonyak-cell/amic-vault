import type {
  DocumentConfidentialityLevel,
  DocumentDto,
  UpdateDocumentMetadataDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export interface DocumentPermissionSummary {
  documentId: string;
  title: string;
  status: string;
  confidentialityLevel: DocumentConfidentialityLevel;
  privilegeStatus: string;
}

export function summarizeDocumentPermissions(document: DocumentDto): DocumentPermissionSummary {
  return {
    documentId: document.documentId,
    title: document.title,
    status: document.status,
    confidentialityLevel: document.confidentialityLevel,
    privilegeStatus: document.privilegeStatus,
  };
}

export async function getDocumentPermissionSummary(
  documentId: string,
): Promise<DocumentPermissionSummary> {
  const document = await apiFetch<DocumentDto>(`/documents/${documentId}`);
  return summarizeDocumentPermissions(document);
}

export function updateDocumentConfidentiality(
  documentId: string,
  confidentialityLevel: DocumentConfidentialityLevel,
): Promise<DocumentDto> {
  const body: UpdateDocumentMetadataDto = { confidentialityLevel };
  return apiFetch<DocumentDto>(`/documents/${documentId}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
