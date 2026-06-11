import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SearchFiltersDto } from '@amic-vault/shared';
import { SearchFilterBuilder, type SearchSqlFragment } from '../../../apps/api/src/modules/search/query/search-filter.builder';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface IndexedFixtureRow {
  tenantId: string;
  ownerUserId: string;
  clientId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  title: string;
  documentType: 'contract' | 'memo' | 'evidence';
  documentStatus: 'draft' | 'deleted';
  versionStatus: 'current' | 'superseded';
  updatedAt: string;
}

interface Fixture {
  alphaClientA: string;
  alphaClientB: string;
  alphaMatterA: string;
  alphaMatterB: string;
  alphaMatterC: string;
  alphaMatterDeleted: string;
  alphaVersionIds: string[];
  betaMatter: string;
  betaVersionIds: string[];
}

interface SearchRow {
  title: string;
  matter_id: string;
  client_id: string;
  document_type: string;
  document_status: string;
  version_status: string;
}

function tenantScope(tenantId: string, versionIds?: readonly string[]): SearchSqlFragment {
  if (versionIds && versionIds.length > 0) {
    return {
      sql: 'idx.tenant_id = ? AND idx.version_id = ANY(?::uuid[])',
      params: [tenantId, versionIds],
    };
  }
  return { sql: 'idx.tenant_id = ?', params: [tenantId] };
}

function hexHash(index: number): string {
  return index.toString(16).padStart(64, '0').slice(-64);
}

function makeStorageUri(input: {
  tenantId: string;
  matterId: string;
  documentId: string;
  fileObjectId: string;
}): string {
  return `s3://amic-vault-dev/tenants/${input.tenantId}/matters/${input.matterId}/documents/${input.documentId}/${input.fileObjectId}`;
}

async function insertIndexedRow(row: IndexedFixtureRow, index: number): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    const fileObjectId = randomUUID();
    await client.query('BEGIN');
    try {
      await setTenant(client, row.tenantId);
      await client.query(
        `
          INSERT INTO clients (client_id, tenant_id, name, created_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (client_id) DO NOTHING
        `,
        [row.clientId, row.tenantId, `${row.title} Client`, row.ownerUserId],
      );
      await client.query(
        `
          INSERT INTO matters (
            matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, lead_lawyer_id, created_by
          )
          VALUES ($1, $2, $3, $4, $5, 'contract', 'active', $6, $6)
        `,
        [
          row.matterId,
          row.tenantId,
          row.clientId,
          `SF-${index}-${randomUUID()}`,
          `${row.title} Matter`,
          row.ownerUserId,
        ],
      );
      await client.query(
        `
          INSERT INTO file_objects (
            file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
            mime_type, size_bytes, sha256, created_by
          )
          VALUES ($1, $2, $3, $4, $4, 'application/pdf', 32, $5, $6)
        `,
        [
          fileObjectId,
          row.tenantId,
          makeStorageUri({
            tenantId: row.tenantId,
            matterId: row.matterId,
            documentId: row.documentId,
            fileObjectId,
          }),
          `${row.title}.pdf`,
          hexHash(index),
          row.ownerUserId,
        ],
      );
      await client.query(
        `
          INSERT INTO documents (
            document_id, tenant_id, matter_id, document_family_id, title, status,
            document_type, created_by, created_at, updated_at,
            deleted_at, deleted_by, deleted_previous_status
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $9,
            CASE WHEN $6::text = 'deleted' THEN $9::timestamptz ELSE NULL END,
            CASE WHEN $6::text = 'deleted' THEN $8::uuid ELSE NULL END,
            CASE WHEN $6::text = 'deleted' THEN 'draft'::text ELSE NULL END
          )
        `,
        [
          row.documentId,
          row.tenantId,
          row.matterId,
          randomUUID(),
          row.title,
          row.documentStatus,
          row.documentType,
          row.ownerUserId,
          row.updatedAt,
        ],
      );
      await client.query(
        `
          INSERT INTO document_versions (
            version_id, tenant_id, document_id, version_no, version_status,
            file_object_id, file_hash, created_by
          )
          VALUES ($1, $2, $3, 1, $4, $5, $6, $7)
        `,
        [
          row.versionId,
          row.tenantId,
          row.documentId,
          row.versionStatus,
          fileObjectId,
          hexHash(index),
          row.ownerUserId,
        ],
      );
      await client.query(
        `
          INSERT INTO document_search_index (
            tenant_id, document_id, version_id, matter_id, client_id, document_type,
            document_status, version_status, title, content_text, source_text_hash,
            indexed_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12)
        `,
        [
          row.tenantId,
          row.documentId,
          row.versionId,
          row.matterId,
          row.clientId,
          row.documentType,
          row.documentStatus,
          row.versionStatus,
          row.title,
          `${row.title} content`,
          hexHash(index + 100),
          row.updatedAt,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function queryRows(
  filters: SearchFiltersDto | undefined,
  scope: SearchSqlFragment,
): Promise<SearchRow[]> {
  const built = new SearchFilterBuilder().build({ filters, scope });
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<SearchRow>(
      `
        SELECT title, matter_id, client_id, document_type, document_status, version_status
        FROM document_search_index idx
        ${built.whereSql}
        ORDER BY title
      `,
      built.params,
    );
    return result.rows;
  });
}

function titles(rows: SearchRow[]): string[] {
  return rows.map((row) => row.title);
}

describe('search metadata filter integration', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    const alphaClientA = randomUUID();
    const alphaClientB = randomUUID();
    const alphaRows: IndexedFixtureRow[] = [
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: alphaClientA,
        matterId: randomUUID(),
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SF Alpha A Contract',
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: alphaClientA,
        matterId: randomUUID(),
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SF Alpha B Memo',
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: alphaClientB,
        matterId: randomUUID(),
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SF Alpha C Superseded',
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'superseded',
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: alphaClientB,
        matterId: randomUUID(),
        documentId: randomUUID(),
        versionId: randomUUID(),
        title: 'SF Alpha D Deleted',
        documentType: 'evidence',
        documentStatus: 'deleted',
        versionStatus: 'current',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    ];
    const betaMatter = randomUUID();
    const betaRow: IndexedFixtureRow = {
      tenantId: tenantBetaId,
      ownerUserId: betaOwnerUserId,
      clientId: randomUUID(),
      matterId: betaMatter,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: 'SF Beta Contract',
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-10T00:00:00.000Z',
    };

    for (const [index, row] of [...alphaRows, betaRow].entries()) {
      await insertIndexedRow(row, index + 1);
    }

    fixture = {
      alphaClientA,
      alphaClientB,
      alphaMatterA: alphaRows[0]!.matterId,
      alphaMatterB: alphaRows[1]!.matterId,
      alphaMatterC: alphaRows[2]!.matterId,
      alphaMatterDeleted: alphaRows[3]!.matterId,
      alphaVersionIds: alphaRows.map((row) => row.versionId),
      betaMatter,
      betaVersionIds: [betaRow.versionId],
    };
  });

  it('applies matterId and clientId as AND filters inside the tenant scope', async () => {
    const alphaScope = tenantScope(tenantAlphaId, fixture.alphaVersionIds);
    await expect(queryRows(undefined, alphaScope)).resolves.toHaveLength(2);
    await expect(queryRows({ matterId: fixture.alphaMatterA }, alphaScope)).resolves.toMatchObject([
      { title: 'SF Alpha A Contract' },
    ]);
    await expect(queryRows({ clientId: fixture.alphaClientA }, alphaScope)).resolves.toHaveLength(2);
    await expect(
      queryRows({ clientId: fixture.alphaClientB, matterId: fixture.alphaMatterA }, alphaScope),
    ).resolves.toEqual([]);
    await expect(queryRows({ matterId: fixture.betaMatter }, alphaScope)).resolves.toEqual([]);
    await expect(queryRows(undefined, tenantScope(tenantBetaId, fixture.betaVersionIds))).resolves.toMatchObject([
      { title: 'SF Beta Contract' },
    ]);
  });

  it('filters document types with enum validation and array semantics', async () => {
    const alphaScope = tenantScope(tenantAlphaId, fixture.alphaVersionIds);
    await expect(queryRows({ documentType: 'memo' }, alphaScope)).resolves.toMatchObject([
      { title: 'SF Alpha B Memo' },
    ]);
    await expect(queryRows({ documentType: ['contract', 'memo'] }, alphaScope)).resolves.toHaveLength(2);
    await expect(queryRows({ documentType: 'contract', versionStatus: 'all' }, alphaScope)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'SF Alpha A Contract' }),
        expect.objectContaining({ title: 'SF Alpha C Superseded' }),
      ]),
    );
    expect(() =>
      new SearchFilterBuilder().build({
        scope: alphaScope,
        filters: { documentType: 'MA' } as unknown as SearchFiltersDto,
      }),
    ).toThrow();
  });

  it('uses inclusive UTC-normalized document updated_at date ranges', async () => {
    const alphaScope = tenantScope(tenantAlphaId, fixture.alphaVersionIds);
    await expect(
      queryRows({
        dateFrom: '2026-06-10T00:00:00Z',
        dateTo: '2026-06-11T00:00:00Z',
      }, alphaScope),
    ).resolves.toHaveLength(2);
    await expect(
      queryRows({
        dateFrom: '2026-06-11T08:00:00+09:00',
        dateTo: '2026-06-11T09:00:00+09:00',
      }, alphaScope),
    ).resolves.toMatchObject([{ title: 'SF Alpha B Memo' }]);
    expect(() =>
      new SearchFilterBuilder().build({
        scope: alphaScope,
        filters: {
          dateFrom: '2026-06-12T00:00:00Z',
          dateTo: '2026-06-11T00:00:00Z',
        },
      }),
    ).toThrow();
  });

  it('excludes superseded by default and never returns deleted rows', async () => {
    const alphaScope = tenantScope(tenantAlphaId, fixture.alphaVersionIds);
    await expect(queryRows({ versionStatus: 'current' }, alphaScope)).resolves.toHaveLength(2);
    await expect(queryRows({ versionStatus: 'superseded' }, alphaScope)).resolves.toMatchObject([
      { title: 'SF Alpha C Superseded' },
    ]);
    await expect(queryRows({ versionStatus: 'all' }, alphaScope)).resolves.toHaveLength(3);
    await expect(queryRows({ matterId: fixture.alphaMatterDeleted, versionStatus: 'all' }, alphaScope)).resolves.toEqual(
      [],
    );
    await expect(queryRows({ matterId: fixture.alphaMatterC }, alphaScope)).resolves.toEqual([]);
  });
});
