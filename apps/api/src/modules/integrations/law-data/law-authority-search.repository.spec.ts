import { describe, expect, it, vi } from 'vitest';
import { LawAuthoritySearchRepository } from './law-authority-search.repository';

describe('LawAuthoritySearchRepository', () => {
  it('searches the external authority cache without document permission joins', async () => {
    const query = vi.fn(async () => ({
      rowCount: 1,
      rows: [
        {
          authority_id: '11111111-1111-4111-8111-111111111309',
          citation: '상법 제398조',
          external_ref: '001570-398',
          raw_snippet: '<mark>상법</mark> 제398조 이사 등과 회사 간의 거래',
          score: 0.94,
          source_type: 'law_statute',
          source_url: 'https://www.law.go.kr/법령/상법/제398조',
          title: '상법',
          total: 1,
          updated_at: new Date('2026-06-12T10:00:00.000Z'),
        },
      ],
    }));
    const repository = new LawAuthoritySearchRepository();

    await expect(
      repository.search(
        { query },
        { page: 1, pageSize: 10, query: '상법 제398조', sortBy: 'relevance' },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        citation: '상법 제398조',
        external_ref: '001570-398',
        source_type: 'law_statute',
        title: '상법',
      }),
    ]);

    const firstCall = query.mock.calls[0] as [string, unknown[]] | undefined;
    expect(firstCall).toBeDefined();
    const [sql, params] = firstCall!;
    expect(String(sql)).toContain('FROM external_authorities ea');
    expect(String(sql)).toContain('ea.search_vector @@ tsq.query');
    expect(String(sql)).not.toContain('matter_members');
    expect(String(sql)).not.toContain('document_search_index');
    expect(params).toEqual(['상법 제398조', 10, 0]);
  });

  it('does not query the database for blank authority searches', async () => {
    const query = vi.fn();
    const repository = new LawAuthoritySearchRepository();

    await expect(
      repository.search({ query }, { page: 1, pageSize: 10, query: '   ' }),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
