import { describe, expect, it } from 'vitest';
import { DocumentService } from './document.service';

describe('DocumentService', () => {
  it('creates a minimal draft document row', async () => {
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        expect(sql).toContain('INSERT INTO documents');
        expect(params).toEqual([
          '11111111-1111-4111-8111-111111111133',
          '11111111-1111-4111-8111-111111111111',
          '11111111-1111-4111-8111-111111111122',
          '11111111-1111-4111-8111-111111111133',
          'Draft Agreement',
          '11111111-1111-4111-8111-111111111101',
        ]);
        return {
          rowCount: 1,
          rows: [
            {
              document_id: '11111111-1111-4111-8111-111111111133',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              matter_id: '11111111-1111-4111-8111-111111111122',
              document_family_id: '11111111-1111-4111-8111-111111111133',
              title: 'Draft Agreement',
              status: 'draft',
              created_by: '11111111-1111-4111-8111-111111111101',
              created_at: new Date('2026-06-12T00:00:00.000Z'),
            },
          ],
        };
      },
    };

    await expect(
      new DocumentService().createDraft(
        {
          documentId: '11111111-1111-4111-8111-111111111133',
          tenantId: '11111111-1111-4111-8111-111111111111',
          matterId: '11111111-1111-4111-8111-111111111122',
          documentFamilyId: '11111111-1111-4111-8111-111111111133',
          title: 'Draft Agreement',
          createdBy: '11111111-1111-4111-8111-111111111101',
        },
        client as never,
      ),
    ).resolves.toMatchObject({ status: 'draft', title: 'Draft Agreement' });
  });
});
