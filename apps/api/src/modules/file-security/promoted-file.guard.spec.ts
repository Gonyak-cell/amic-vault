import { describe, expect, it, vi } from 'vitest';
import { isDocumentPromoted, promotedDocumentExistsSql } from './promoted-file.guard';

const target = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  documentId: '22222222-2222-4222-8222-222222222222',
};

describe('promoted file guard', () => {
  it('requires the document promotion receipt and promoted scanner state in the same tenant', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ '?column?': 1 }] });

    await expect(isDocumentPromoted({ query } as never, target)).resolves.toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("scan.state = 'promoted'"),
      [target.tenantId, target.documentId],
    );
  });

  it.each(['unknown', 'quarantined', 'scanning', 'infected', 'error', 'stale'])('denies %s rows', async () => {
    await expect(
      isDocumentPromoted({ query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as never, target),
    ).resolves.toBe(false);
  });

  it('builds a tenant-and-document-correlated query predicate', () => {
    const sql = promotedDocumentExistsSql('document_target');
    expect(sql).toContain('promotion.tenant_id = document_target.tenant_id');
    expect(sql).toContain('promotion.document_id = document_target.document_id');
  });
});
