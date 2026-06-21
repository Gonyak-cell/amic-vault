import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyEnterpriseDmsMatterTemplate,
  disableEnterpriseDmsMatterTemplate,
  disableEnterpriseDmsSearchRefiner,
  disableEnterpriseDmsTaxonomy,
  listApprovedEnterpriseDmsMatterTemplates,
  listApprovedEnterpriseDmsSearchRefiners,
  listApprovedEnterpriseDmsTaxonomies,
  listEnterpriseDmsMatterTemplates,
  listEnterpriseDmsSearchRefiners,
  listEnterpriseDmsTaxonomies,
  upsertEnterpriseDmsMatterTemplate,
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
    await listApprovedEnterpriseDmsTaxonomies();
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
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/enterprise/dms/taxonomies/approved', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/enterprise/dms/taxonomies', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/enterprise/dms/taxonomies/11111111-1111-4111-8111-111111111111/disable',
      { method: 'POST' },
    );
    expect(String(vi.mocked(apiFetch).mock.calls[2]?.[1]?.body)).not.toMatch(
      /bodyText|snippet|raw|prompt|response/i,
    );
  });

  it('uses DMS search refiner endpoints without raw content payloads', async () => {
    await listEnterpriseDmsSearchRefiners();
    await listApprovedEnterpriseDmsSearchRefiners();
    await upsertEnterpriseDmsSearchRefiner({
      fieldKey: 'confidentiality_level',
      displayName: 'Confidentiality',
      fieldType: 'text',
      source: 'document_profile',
      searchable: true,
      refinable: true,
      filterable: true,
      sortOrder: 20,
    });
    await disableEnterpriseDmsSearchRefiner('22222222-2222-4222-8222-222222222222');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/enterprise/dms/search-refiners');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/enterprise/dms/search-refiners/approved', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/enterprise/dms/search-refiners', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/enterprise/dms/search-refiners/22222222-2222-4222-8222-222222222222/disable',
      { method: 'POST' },
    );
    expect(String(vi.mocked(apiFetch).mock.calls[2]?.[1]?.body)).not.toMatch(
      /bodyText|snippet|raw|prompt|response/i,
    );
  });

  it('uses DMS Matter template endpoints without pseudo-folder payloads', async () => {
    await listEnterpriseDmsMatterTemplates();
    await listApprovedEnterpriseDmsMatterTemplates('advisory');
    await upsertEnterpriseDmsMatterTemplate({
      matterType: 'advisory',
      displayName: 'Advisory template',
      description: 'Advisory matter document set contract',
      documentSets: [
        {
          setKey: 'closing',
          displayName: 'Closing set',
          documentTypeCodes: ['contract', 'memo'],
          required: true,
          sortOrder: 10,
        },
      ],
    });
    await applyEnterpriseDmsMatterTemplate('33333333-3333-4333-8333-333333333333', {
      matterId: '44444444-4444-4444-8444-444444444444',
    });
    await disableEnterpriseDmsMatterTemplate('33333333-3333-4333-8333-333333333333');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/enterprise/dms/matter-templates');
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/enterprise/dms/matter-templates/approved?matterType=advisory',
      { redirectOnAuthRequired: false },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/enterprise/dms/matter-templates', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/enterprise/dms/matter-templates/33333333-3333-4333-8333-333333333333/apply',
      { method: 'POST', body: expect.any(String) },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      5,
      '/enterprise/dms/matter-templates/33333333-3333-4333-8333-333333333333/disable',
      { method: 'POST' },
    );
    const payload = String(vi.mocked(apiFetch).mock.calls[2]?.[1]?.body);
    expect(payload).toContain('documentSets');
    expect(payload).not.toMatch(/folderPath|bodyText|snippet|raw|prompt|response/i);
  });
});
