import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface QueryClient {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export interface DuplicateCandidateDto {
  documentId: string;
  fileObjectId: string;
  sha256: string;
}

interface DuplicateCandidateRow {
  document_id: string;
  file_object_id: string;
  sha256: string;
}

@Injectable()
export class DuplicateDetectorService {
  async findCandidates(
    input: {
      tenantId: string;
      matterId: string;
      documentId: string;
      sha256: string;
      limit?: number;
    },
    client: QueryClient = getPool(),
  ): Promise<DuplicateCandidateDto[]> {
    const result = await client.query(
      `
        SELECT d.document_id, f.file_object_id, f.sha256
        FROM documents d
        JOIN file_objects f
          ON f.tenant_id = d.tenant_id
         AND f.storage_uri LIKE (
           's3://%/tenants/' || d.tenant_id || '/matters/' || d.matter_id ||
           '/documents/' || d.document_id || '/%'
         )
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.document_id <> $3
          AND d.status <> 'deleted'
          AND f.sha256 = $4
        ORDER BY d.created_at DESC, d.document_id DESC
        LIMIT $5
      `,
      [input.tenantId, input.matterId, input.documentId, input.sha256, input.limit ?? 10],
    );
    return (result.rows as DuplicateCandidateRow[]).map((row) => ({
      documentId: row.document_id,
      fileObjectId: row.file_object_id,
      sha256: row.sha256,
    }));
  }
}
