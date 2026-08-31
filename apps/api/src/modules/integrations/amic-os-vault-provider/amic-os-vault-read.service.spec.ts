import type { SearchResultDto } from '@amic-vault/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import {
  AmicOsVaultReadService,
  type AmicOsVaultReadInput,
} from './amic-os-vault-read.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const vaultMatterId = '33333333-3333-4333-8333-333333333333';
const lawosMatterId = 'lawos-matter-1';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const fileObjectId = '66666666-6666-4666-8666-666666666666';
const sha256 = 'a'.repeat(64);
const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId,
  actorUserId,
};

function input(overrides: Partial<AmicOsVaultReadInput> = {}): AmicOsVaultReadInput {
  return {
    accountLedgerId: principal.accountLedgerId,
    lawosMatterId,
    page: 1,
    pageSize: 25,
    query: null,
    dateFrom: null,
    dateTo: null,
    ...overrides,
  };
}

function result(overrides: Partial<SearchResultDto> = {}): SearchResultDto {
  return {
    aiAllowed: false,
    author: null,
    contentTruncated: false,
    documentId,
    versionId,
    matterId: vaultMatterId,
    title: '공급계약서',
    snippet: '',
    highlights: [],
    documentType: 'contract',
    nextVersionId: null,
    prevVersionId: null,
    permissionBadges: {
      confidentiality: 'standard',
      legalHold: 'no_hold',
      privilege: 'none',
    },
    score: 1,
    updatedAt: '2026-08-29T00:00:00.000Z',
    versionStatus: 'current',
    ...overrides,
  };
}

function createHarness({ source = 'amic-os-provider' } = {}) {
  const incompleteDocumentId = '77777777-7777-4777-8777-777777777777';
  const mismatchedDocumentId = '88888888-8888-4888-8888-888888888888';
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM matters')) {
      return { rowCount: 1, rows: [{ matter_id: vaultMatterId }] };
    }
    if (sql.includes('FROM documents')) {
      return {
        rowCount: 3,
        rows: [
          {
            document_id: documentId,
            version_id: versionId,
            file_object_id: fileObjectId,
            sha256,
            size_bytes: '4096',
            mime_type: 'application/pdf',
            normalized_filename: 'supply-contract.pdf',
            lawos_matter_id: lawosMatterId,
          },
          {
            document_id: incompleteDocumentId,
            version_id: '99999999-9999-4999-8999-999999999999',
            file_object_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sha256: 'b'.repeat(64),
            size_bytes: '12',
            mime_type: 'application/pdf',
            normalized_filename: 'unmapped.pdf',
            lawos_matter_id: null,
          },
          {
            document_id: mismatchedDocumentId,
            version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            file_object_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            sha256: 'c'.repeat(64),
            size_bytes: '99',
            mime_type: 'application/pdf',
            normalized_filename: 'stale.pdf',
            lawos_matter_id: lawosMatterId,
          },
        ],
      };
    }
    throw new Error('unexpected read query');
  });
  const auditService = {
    transaction: vi.fn(async (
      _tenant: string,
      work: (client: { query: typeof query }) => Promise<unknown>,
    ) => work({ query })),
  };
  const searchService = {
    search: vi.fn(async () => ({
      results: [
        result(),
        result({ snippet: 'duplicate clause match' }),
        result({
          documentId: incompleteDocumentId,
          versionId: '99999999-9999-4999-8999-999999999999',
        }),
        result({
          documentId: mismatchedDocumentId,
          versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        }),
      ],
    })),
  };
  const service = new AmicOsVaultReadService(
    auditService as never,
    searchService as never,
    {
      require: () => ({ tenantId, source }),
    } as never,
    {
      uploadAuthorityRef: () => 'amic-vault-api:single-install',
      uploadProviderRevision: () => 'single-install-upload-v1',
    } as never,
  );
  return { auditService, query, searchService, service };
}

describe('AmicOsVaultReadService', () => {
  it('uses permission-scoped search and returns only mapped exact current versions', async () => {
    const { query, searchService, service } = createHarness();

    await expect(service.list(principal, input())).resolves.toEqual({
      authority_kind: 'amic-vault-api',
      authority_ref: 'amic-vault-api:single-install',
      provider_revision: 'single-install-upload-v1',
      items: [{
        document_id: documentId,
        matter_id: lawosMatterId,
        title: '공급계약서',
        current_version_id: versionId,
        version_id: versionId,
        current_file_object_id: fileObjectId,
        file_object_id: fileObjectId,
        latest_sha256: sha256,
        content_sha256: sha256,
        current_byte_size: 4096,
        byte_size: 4096,
        current_mime_type: 'application/pdf',
        mime_type: 'application/pdf',
        filename: 'supply-contract.pdf',
        indexed_at: null,
        match_fields: ['title'],
      }],
      page_info: {
        page: 1,
        page_size: 25,
        returned_count: 1,
        current_version_only: true,
        omitted_result_count: null,
      },
      count_leak_prevented: true,
      raw_bytes_included: false,
      storage_locator_returned: false,
    });
    expect(searchService.search).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId, sessionId: null },
      expect.objectContaining({
        mode: 'keyword',
        sortBy: 'updated_desc',
        filters: expect.objectContaining({
          matterId: vaultMatterId,
          versionStatus: 'current',
        }),
      }),
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(JSON.stringify((await service.list(principal, input())).items))
      .not.toMatch(/storage_uri|storage_locator|raw_bytes|content_base64/u);
  });

  it('passes bounded query and date filters to the same permission-scoped search path', async () => {
    const { searchService, service } = createHarness();

    await service.search(principal, input({
      query: '계약 해지',
      dateFrom: '2026-01-01',
      dateTo: '2026-08-29',
    }));

    expect(searchService.search).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId: actorUserId }),
      expect.objectContaining({
        query: '계약 해지',
        sortBy: 'relevance',
        filters: expect.objectContaining({
          dateFrom: '2026-01-01T00:00:00.000Z',
          dateTo: '2026-08-29T23:59:59.999Z',
          matterId: vaultMatterId,
          versionStatus: 'current',
        }),
      }),
    );
  });

  it('fails before search when the provider tenant context or account binding disagrees', async () => {
    const wrongSource = createHarness({ source: 'http' });
    await expect(wrongSource.service.list(principal, input())).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(wrongSource.searchService.search).not.toHaveBeenCalled();

    const wrongAccount = createHarness();
    await expect(wrongAccount.service.list(principal, input({
      accountLedgerId: 'user_other_account',
    }))).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(wrongAccount.searchService.search).not.toHaveBeenCalled();
  });
});
