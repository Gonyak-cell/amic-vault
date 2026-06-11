import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { QueryClient } from '../../audit/audit.service';

const maxIndexedContentBytes = 1024 * 1024;

export interface SearchIndexRow {
  indexId: string;
  tenantId: string;
  documentId: string;
  versionId: string;
  matterId: string;
  clientId: string;
  documentType: string;
  documentStatus: string;
  versionStatus: string;
  title: string;
  contentText: string;
  sourceTextHash: string;
  indexedAt: Date;
}

interface SearchIndexSourceRow {
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  client_id: string;
  document_type: string;
  document_status: string;
  version_status: string;
  title: string;
  body_text: string | null;
}

interface SearchIndexDbRow {
  index_id: string;
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  client_id: string;
  document_type: string;
  document_status: string;
  version_status: string;
  title: string;
  content_text: string;
  source_text_hash: string;
  indexed_at: Date;
}

export function truncateUtf8(input: string, maxBytes = maxIndexedContentBytes): string {
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input;
  let bytes = 0;
  let output = '';
  for (const char of input) {
    const next = Buffer.byteLength(char, 'utf8');
    if (bytes + next > maxBytes) break;
    bytes += next;
    output += char;
  }
  return output;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function mapRow(row: SearchIndexDbRow): SearchIndexRow {
  return {
    indexId: row.index_id,
    tenantId: row.tenant_id,
    documentId: row.document_id,
    versionId: row.version_id,
    matterId: row.matter_id,
    clientId: row.client_id,
    documentType: row.document_type,
    documentStatus: row.document_status,
    versionStatus: row.version_status,
    title: row.title,
    contentText: row.content_text,
    sourceTextHash: row.source_text_hash,
    indexedAt: row.indexed_at,
  };
}

@Injectable()
export class SearchIndexRepository {
  async upsertVersion(
    client: QueryClient,
    input: { tenantId: string; documentId: string; versionId: string },
  ): Promise<SearchIndexRow | null> {
    const source = await this.findSource(client, input);
    if (!source) return null;
    const contentText = source.body_text ?? '';
    const sourceTextHash = sha256Hex(contentText);
    const truncatedContent = truncateUtf8(contentText);

    const result = await client.query(
      `
        INSERT INTO document_search_index (
          tenant_id, document_id, version_id, matter_id, client_id, document_type,
          document_status, version_status, title, content_text, fts_config,
          source_text_hash, indexed_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'simple', $11, now(), now())
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          client_id = EXCLUDED.client_id,
          document_type = EXCLUDED.document_type,
          document_status = EXCLUDED.document_status,
          version_status = EXCLUDED.version_status,
          title = EXCLUDED.title,
          content_text = EXCLUDED.content_text,
          fts_config = EXCLUDED.fts_config,
          source_text_hash = EXCLUDED.source_text_hash,
          indexed_at = EXCLUDED.indexed_at,
          updated_at = EXCLUDED.updated_at
        RETURNING index_id, tenant_id, document_id, version_id, matter_id, client_id,
          document_type, document_status, version_status, title, content_text,
          source_text_hash, indexed_at
      `,
      [
        source.tenant_id,
        source.document_id,
        source.version_id,
        source.matter_id,
        source.client_id,
        source.document_type,
        source.document_status,
        source.version_status,
        source.title,
        truncatedContent,
        sourceTextHash,
      ],
    );
    const row = result.rows[0] as SearchIndexDbRow | undefined;
    return row ? mapRow(row) : null;
  }

  async findByVersion(
    client: QueryClient,
    input: { tenantId: string; versionId: string },
  ): Promise<SearchIndexRow | null> {
    const result = await client.query(
      `
        SELECT index_id, tenant_id, document_id, version_id, matter_id, client_id,
          document_type, document_status, version_status, title, content_text,
          source_text_hash, indexed_at
        FROM document_search_index
        WHERE tenant_id = $1
          AND version_id = $2
        LIMIT 1
      `,
      [input.tenantId, input.versionId],
    );
    const row = result.rows[0] as SearchIndexDbRow | undefined;
    return row ? mapRow(row) : null;
  }

  private async findSource(
    client: QueryClient,
    input: { tenantId: string; documentId: string; versionId: string },
  ): Promise<SearchIndexSourceRow | null> {
    const result = await client.query(
      `
        SELECT dv.tenant_id, dv.document_id, dv.version_id, d.matter_id, m.client_id,
          d.document_type, d.status AS document_status, dv.version_status, d.title,
          cd.body_text
        FROM document_versions dv
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
          AND cd.version_id = dv.version_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = $3
        LIMIT 1
      `,
      [input.tenantId, input.documentId, input.versionId],
    );
    return (result.rows[0] as SearchIndexSourceRow | undefined) ?? null;
  }
}
