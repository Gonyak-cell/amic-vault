import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMatterWiki, matterWikiExportUrl } from './matter-wiki';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async () => ({
    matterId: '11111111-1111-4111-8111-111111111001',
    pages: [],
  })),
}));

vi.mock('../config', () => ({
  apiBaseUrl: () => 'http://api.test/v1',
}));

describe('matter wiki API client', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
  });

  it('loads matter wiki pages through the matter route', async () => {
    const result = await listMatterWiki('11111111-1111-4111-8111-111111111001');

    expect(result.pages).toEqual([]);
    expect(apiFetch).toHaveBeenCalledWith(
      '/matters/11111111-1111-4111-8111-111111111001/wiki',
      { redirectOnAuthRequired: false },
    );
  });

  it('builds the Obsidian export URL with the configured API base', () => {
    expect(matterWikiExportUrl('11111111-1111-4111-8111-111111111001')).toBe(
      'http://api.test/v1/matters/11111111-1111-4111-8111-111111111001/wiki-export',
    );
  });
});
