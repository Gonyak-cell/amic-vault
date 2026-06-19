import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableEnterpriseDmsSearchRefiner,
  disableEnterpriseDmsTaxonomy,
  listEnterpriseDmsSearchRefiners,
  listEnterpriseDmsTaxonomies,
  upsertEnterpriseDmsSearchRefiner,
  upsertEnterpriseDmsTaxonomy,
} from './enterprise';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

describe('enterprise API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses DMS taxonomy endpoints without raw content payloads', async () => {
    await listEnterpriseDmsTaxonomies();
    await upsertEnterpriseDmsTaxonomy({
      documentTypeCode: 'CONTRACT',
      displayName: 'Contract',
      subtypes: [{ subtypeCode: 'MSA', displayName: 'Master service agreement', status: 'active' }],
      metadataFields: [
        {
          fieldKey: 'counterparty',
          displayName: 'Counterparty',
          fieldType: 'text',
          required: true,
          searchable: true,
          refinable: true,
        },
      ],
    });
    await disableEnterpriseDmsTaxonomy('11111111-1111-4111-8111-111111111111');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/enterprise/dms/taxonomies');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/enterprise/dms/taxonomies', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      '/enterprise/dms/taxonomies/11111111-1111-4111-8111-111111111111/disable',
      { method: 'POST' },
    );
    expect(String(vi.mocked(apiFetch).mock.calls[1]?.[1]?.body)).not.toMatch(
      /bodyText|snippet|raw|prompt|response/i,
    );
  });

  it('uses DMS search refiner endpoints without raw content payloads', async () => {
    await listEnterpriseDmsSearchRefiners();
    await upsertEnterpriseDmsSearchRefiner({
      fieldKey: 'counterparty',
      displayName: 'Counterparty',
      fieldType: 'text',
      source: 'document_profile',
      searchable: true,
      refinable: true,
      filterable: true,
      sortOrder: 20,
    });
    await disableEnterpriseDmsSearchRefiner('22222222-2222-4222-8222-222222222222');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/enterprise/dms/search-refiners');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/enterprise/dms/search-refiners', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      '/enterprise/dms/search-refiners/22222222-2222-4222-8222-222222222222/disable',
      { method: 'POST' },
    );
    expect(String(vi.mocked(apiFetch).mock.calls[1]?.[1]?.body)).not.toMatch(
      /bodyText|snippet|raw|prompt|response/i,
    );
  });
});
