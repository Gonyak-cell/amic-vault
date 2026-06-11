import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { FileObjectDto } from '@amic-vault/shared';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface QueryClient {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface FileObjectRow {
  file_object_id: string;
  tenant_id: string;
  storage_uri: string;
  original_filename: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
  encryption_key_id: string | null;
  source_system: 'upload' | 'email_ingest' | 'migration';
  created_by: string | null;
  created_at: Date;
}

export interface CreateFileObjectInput {
  fileObjectId: string;
  tenantId: string;
  storageUri: string;
  originalFilename: string;
  normalizedFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  encryptionKeyId: string | null;
  sourceSystem?: 'upload' | 'email_ingest' | 'migration';
  createdBy: string | null;
}

function mapFileObject(row: FileObjectRow): FileObjectDto {
  return {
    fileObjectId: row.file_object_id,
    tenantId: row.tenant_id,
    storageUri: row.storage_uri,
    originalFilename: row.original_filename,
    normalizedFilename: row.normalized_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    encryptionKeyId: row.encryption_key_id,
    sourceSystem: row.source_system,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class FileObjectService {
  async create(input: CreateFileObjectInput, client: QueryClient = getPool()) {
    const result = await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING file_object_id, tenant_id, storage_uri, original_filename,
          normalized_filename, mime_type, size_bytes::text, sha256, encryption_key_id,
          source_system, created_by, created_at
      `,
      [
        input.fileObjectId,
        input.tenantId,
        input.storageUri,
        input.originalFilename,
        input.normalizedFilename,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        input.encryptionKeyId,
        input.sourceSystem ?? 'upload',
        input.createdBy,
      ],
    );
    const row = result.rows[0] as FileObjectRow | undefined;
    if (!row) throw new Error('file object insert returned no row');
    return mapFileObject(row);
  }

  async findByIdForTenant(tenantId: string, fileObjectId: string) {
    const result = await getPool().query(
      `
        SELECT file_object_id, tenant_id, storage_uri, original_filename,
          normalized_filename, mime_type, size_bytes::text, sha256, encryption_key_id,
          source_system, created_by, created_at
        FROM file_objects
        WHERE tenant_id = $1
          AND file_object_id = $2
        LIMIT 1
      `,
      [tenantId, fileObjectId],
    );
    const row = result.rows[0] as FileObjectRow | undefined;
    return row ? mapFileObject(row) : null;
  }
}
