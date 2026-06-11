import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export interface DocumentDto {
  documentId: string;
  tenantId: string;
  matterId: string;
  documentFamilyId: string;
  title: string;
  status: 'draft';
  createdBy: string;
  createdAt: string;
}

export interface CreateDraftDocumentInput {
  documentId: string;
  tenantId: string;
  matterId: string;
  documentFamilyId: string;
  title: string;
  createdBy: string;
}

interface DocumentRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  document_family_id: string;
  title: string;
  status: 'draft';
  created_by: string;
  created_at: Date;
}

function mapDocument(row: DocumentRow): DocumentDto {
  return {
    documentId: row.document_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    documentFamilyId: row.document_family_id,
    title: row.title,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class DocumentService {
  async createDraft(input: CreateDraftDocumentInput, client: PoolClient): Promise<DocumentDto> {
    const result = await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, 'draft', $6)
        RETURNING document_id, tenant_id, matter_id, document_family_id, title,
          status, created_by, created_at
      `,
      [
        input.documentId,
        input.tenantId,
        input.matterId,
        input.documentFamilyId,
        input.title,
        input.createdBy,
      ],
    );
    const row = result.rows[0] as DocumentRow | undefined;
    if (!row) throw new Error('document insert returned no row');
    return mapDocument(row);
  }
}
