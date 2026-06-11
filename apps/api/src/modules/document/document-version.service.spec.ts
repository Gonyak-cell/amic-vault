import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { DocumentVersionService } from './document-version.service';
import { VersionNumberResolver } from './version-number.resolver';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const documentId = '11111111-1111-4111-8111-111111111133';
const matterId = '11111111-1111-4111-8111-111111111122';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const fileObjectId = '11111111-1111-4111-8111-111111111144';
const hash = 'a'.repeat(64);

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    version_id: '11111111-1111-4111-8111-111111111155',
    document_id: documentId,
    version_no: 1,
    version_status: 'current',
    file_object_id: fileObjectId,
    file_hash: hash,
    created_by: actorUserId,
    created_at: new Date('2026-06-12T00:00:00.000Z'),
    supersedes_version_id: null,
    ...overrides,
  };
}

function createService() {
  return new DocumentVersionService(
    { transaction: vi.fn() } as never,
    { canReadMatter: vi.fn() } as never,
    { require: vi.fn() } as never,
    new VersionNumberResolver(),
  );
}

describe('DocumentVersionService', () => {
  it('creates the initial current version at version 1', async () => {
    const tx = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        void sql;
        void params;
        return {
          rowCount: 1,
          rows: [versionRow()],
        };
      }),
    };

    const result = await createService().createInitialVersion(
      {
        tenantId,
        documentId,
        fileObjectId,
        fileHash: hash,
        createdBy: actorUserId,
      },
      tx as never,
    );

    expect(result).toMatchObject({
      documentId,
      versionNo: 1,
      versionStatus: 'current',
      fileObjectId,
      fileHash: hash,
      supersedesVersionId: null,
    });
    expect(tx.query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      documentId,
      1,
      fileObjectId,
      hash,
      actorUserId,
    ]);
  });

  it('marks the previous current version superseded before inserting the next current version', async () => {
    const previousVersionId = '11111111-1111-4111-8111-111111111166';
    const nextFileObjectId = '11111111-1111-4111-8111-111111111177';
    const query = vi.fn(
      async (
        sql: string,
        params?: readonly unknown[],
      ): Promise<{ rowCount: number; rows: unknown[] }> => {
        void sql;
        void params;
        return {
          rowCount: 0,
          rows: [],
        };
      },
    );
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            document_id: documentId,
            tenant_id: tenantId,
            matter_id: matterId,
            document_family_id: documentId,
            status: 'draft',
            matter_status: 'active',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ version_id: previousVersionId, version_no: 1 }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          versionRow({
            version_id: '11111111-1111-4111-8111-111111111188',
            version_no: 2,
            file_object_id: nextFileObjectId,
            supersedes_version_id: previousVersionId,
          }),
        ],
      });
    const tx = {
      query,
    };

    const result = await createService().addNextVersion(
      {
        tenantId,
        documentId,
        fileObjectId: nextFileObjectId,
        fileHash: hash,
        createdBy: actorUserId,
      },
      tx as never,
    );

    expect(result).toMatchObject({
      versionNo: 2,
      versionStatus: 'current',
      fileObjectId: nextFileObjectId,
      supersedesVersionId: previousVersionId,
    });
    expect(tx.query.mock.calls[2]?.[0]).toContain("SET version_status = 'superseded'");
    expect(tx.query.mock.calls[3]?.[1]).toEqual([
      tenantId,
      documentId,
      2,
      nextFileObjectId,
      hash,
      actorUserId,
      previousVersionId,
    ]);
  });
});
