import { describe, expect, it } from 'vitest';
import { DuplicateDetectorService } from './duplicate-detector.service';

describe('DuplicateDetectorService', () => {
  it('limits candidates to the same tenant and same matter query scope', async () => {
    const calls: Array<[string, readonly unknown[] | undefined]> = [];
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        calls.push([sql, params]);
        return {
          rows: [
            {
              document_id: 'doc-1',
              file_object_id: 'file-1',
              sha256: 'a'.repeat(64),
            },
          ],
          rowCount: 1,
        };
      },
    };
    const service = new DuplicateDetectorService();

    await expect(
      service.findCandidates(
        {
          tenantId: 'tenant-1',
          matterId: 'matter-1',
          documentId: 'doc-new',
          sha256: 'a'.repeat(64),
        },
        client,
      ),
    ).resolves.toEqual([{ documentId: 'doc-1', fileObjectId: 'file-1', sha256: 'a'.repeat(64) }]);

    expect(calls[0]?.[1]).toEqual(['tenant-1', 'matter-1', 'doc-new', 'a'.repeat(64), 10]);
    expect(calls[0]?.[0]).toContain('d.matter_id = $2');
    expect(calls[0]?.[0]).toContain("d.status <> 'deleted'");
  });

  it('returns safe upload duplicate candidates without exposing hashes', async () => {
    const calls: Array<[string, readonly unknown[] | undefined]> = [];
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        calls.push([sql, params]);
        return {
          rows: [
            {
              document_id: '11111111-1111-4111-8111-111111111123',
              matter_code: 'AMIC-2026-0001',
              matter_name: 'Investment Advisory',
              title: 'Investment memo.pdf',
              version_label: 'v2 current',
              sha256: 'a'.repeat(64),
            },
          ],
          rowCount: 1,
        };
      },
    };
    const service = new DuplicateDetectorService();

    await expect(
      service.findSafeUploadCandidates(
        {
          tenantId: 'tenant-1',
          matterId: 'matter-1',
          sha256: 'a'.repeat(64),
          limit: 3,
        },
        client,
      ),
    ).resolves.toEqual([
      {
        documentReference: '11111111-1111-4111-8111-111111111123',
        matterCode: 'AMIC-2026-0001',
        matterName: 'Investment Advisory',
        title: 'Investment memo.pdf',
        versionLabel: 'v2 current',
      },
    ]);

    expect(calls[0]?.[1]).toEqual(['tenant-1', 'matter-1', 'a'.repeat(64), 3]);
    expect(calls[0]?.[0]).toContain('d.matter_id = $2');
    expect(calls[0]?.[0]).toContain("d.status <> 'deleted'");
  });
});
