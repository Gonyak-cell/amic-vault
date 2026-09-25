import type { SearchResultDto } from '@amic-vault/shared';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import {
  AmicOsVaultReadService,
  type AmicOsVaultReadInput,
  type AmicOsVaultPreviewInput,
} from './amic-os-vault-read.service';
import type { PreviewSessionTarget } from '../../preview/preview-session.service';
import { PREVIEW_CHUNK_BYTES, type PreparedPreview } from '../../preview/preview.service';
import { ExternalService } from '../../external/external.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const vaultMatterId = '33333333-3333-4333-8333-333333333333';
const vaultClientId = '33333333-3333-4333-8333-333333333334';
const lawosMatterId = 'lawos-matter-1';
const lawosClientId = 'lawos-client-1';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const fileObjectId = '66666666-6666-4666-8666-666666666666';
const sha256 = 'a'.repeat(64);
const pdfBytes = Buffer.from('%PDF-1.7\npreview');
const pdfFile = {
  file_object_id: '77777777-7777-4777-8777-777777777777',
  sha256: createHash('sha256').update(pdfBytes).digest('hex'),
  size_bytes: String(pdfBytes.byteLength),
  mime_type: 'application/pdf',
  storage_uri: 's3://private/derived.pdf',
  normalized_filename: 'contract.preview.pdf',
};
const source: PreviewSessionTarget = {
  tenant_id: tenantId, matter_id: vaultMatterId, document_id: documentId, version_id: versionId,
  file_object_id: fileObjectId, sha256, size_bytes: '4096', status: 'active',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  normalized_filename: 'contract.docx', storage_uri: 's3://private/source.docx',
};
const previewInput: AmicOsVaultPreviewInput = {
  accountLedgerId: 'user_amic_jwsuh', lawosMatterId,
  exact: { document_id: documentId, version_id: versionId, file_object_id: fileObjectId,
    sha256, byte_size: 4096, mime_type: source.mime_type },
};
const preview = { file_object_id: pdfFile.file_object_id, sha256: pdfFile.sha256,
  byte_size: pdfBytes.byteLength, mime_type: 'application/pdf' as const };
const session = { previewSessionId: '99999999-9999-4999-8999-999999999999', token: 'Z'.repeat(43), expiresAt: '2030-01-01T00:00:00.000Z' };
const chunkInput = { ...previewInput, preview, previewSessionId: session.previewSessionId, token: session.token, offset: 0 };
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
    author: { userId: actorUserId, displayName: '현재 편집자' },
    clientId: vaultClientId,
    clientDisplayName: 'AMIC Client',
    contentTruncated: false,
    documentId,
    versionId,
    matterId: vaultMatterId,
    matterDisplayCode: 'LAWOS-LIVE-internal-projection',
    matterDisplayName: '공급계약 자문',
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

interface ExactLabelOverrides {
  matterCode?: string | null;
  matterName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
}

interface HarnessOptions {
  source?: string;
  external?: ExternalService;
  exactMatterId?: string;
  exactLabels?: ExactLabelOverrides;
  exactQueryError?: boolean;
}

function createHarness({
  source: contextSource = 'amic-os-provider',
  external = {} as ExternalService,
  exactMatterId = vaultMatterId,
  exactLabels = {},
  exactQueryError = false,
}: HarnessOptions = {}) {
  const {
    matterCode = 'AMIC-2026-0001',
    matterName = '공급계약 자문',
    clientId = lawosClientId,
    clientName = 'AMIC Client',
  } = exactLabels;
  const incompleteDocumentId = '77777777-7777-4777-8777-777777777777';
  const mismatchedDocumentId = '88888888-8888-4888-8888-888888888888';
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO document_preview_artifacts')) return { rowCount: 1, rows: [] };
    if (sql.includes('FROM matters')) {
      return { rowCount: 1, rows: [{ matter_id: vaultMatterId }] };
    }
    if (sql.includes('FROM document_versions v')) {
      return { rowCount: 1, rows: [{ document_id: documentId, version_id: versionId,
        file_object_id: fileObjectId, sha256, size_bytes: '4096', mime_type: 'application/pdf' }] };
    }
    if (sql.includes('FROM file_objects')) {
      return { rowCount: 1, rows: [{ file_object_id: fileObjectId, size_bytes: '4096', mime_type: 'application/pdf' }] };
    }
    if (sql.includes('FROM documents')) {
      if (exactQueryError) throw new Error('exact projection unavailable');
      const labelsReadable = (params[2] as string[] | undefined)?.includes(exactMatterId) === true;
      return {
        rowCount: 3,
        rows: [
          {
            document_id: documentId,
            matter_id: exactMatterId,
            version_id: versionId,
            file_object_id: fileObjectId,
            sha256,
            size_bytes: '4096',
            mime_type: 'application/pdf',
            normalized_filename: 'supply-contract.pdf',
            lawos_matter_id: lawosMatterId,
            created_at: new Date('2026-08-20T00:00:00.000Z'),
            updated_at: new Date('2026-08-29T00:00:00.000Z'),
            creator_name: '최초 업로더',
            canonical_matter_code: labelsReadable ? matterCode : null,
            canonical_matter_name: labelsReadable ? matterName : null,
            canonical_client_id: labelsReadable ? clientId : null,
            canonical_client_name: labelsReadable ? clientName : null,
          },
          {
            document_id: incompleteDocumentId,
            matter_id: vaultMatterId,
            version_id: '99999999-9999-4999-8999-999999999999',
            file_object_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            sha256: 'b'.repeat(64),
            size_bytes: '12',
            mime_type: 'application/pdf',
            normalized_filename: 'unmapped.pdf',
            lawos_matter_id: null,
            created_at: new Date('2026-08-20T00:00:00.000Z'),
            updated_at: new Date('2026-08-29T00:00:00.000Z'),
            creator_name: '최초 업로더',
            canonical_matter_code: labelsReadable ? matterCode : null,
            canonical_matter_name: labelsReadable ? matterName : null,
            canonical_client_id: labelsReadable ? clientId : null,
            canonical_client_name: labelsReadable ? clientName : null,
          },
          {
            document_id: mismatchedDocumentId,
            matter_id: vaultMatterId,
            version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            file_object_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            sha256: 'c'.repeat(64),
            size_bytes: '99',
            mime_type: 'application/pdf',
            normalized_filename: 'stale.pdf',
            lawos_matter_id: lawosMatterId,
            created_at: new Date('2026-08-20T00:00:00.000Z'),
            updated_at: new Date('2026-08-29T00:00:00.000Z'),
            creator_name: '최초 업로더',
            canonical_matter_code: labelsReadable ? matterCode : null,
            canonical_matter_name: labelsReadable ? matterName : null,
            canonical_client_id: labelsReadable ? clientId : null,
            canonical_client_name: labelsReadable ? clientName : null,
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
  const permissionService = {
    canReadMatter: vi.fn(async () => ({
      effect: 'ALLOW', reasonCode: 'ALLOWED', appliedRules: ['matter.read:role_allow'],
    })),
  };
  const previewSessions = {
    inspect: vi.fn(async () => source),
    authorizeStream: vi.fn(async () => source),
    issue: vi.fn(async () => session),
  };
  const previews = {
    getPreparedPreview: vi.fn(async (): Promise<PreparedPreview> => ({
      status: 'pending', file: null, converterProfileSha256: 'c'.repeat(64),
    })),
    readPreparedChunk: vi.fn(async () => pdfBytes),
  };
  const previewQueue = { enqueueVersionCreated: vi.fn(async () => null) };
  const documentVersions = {
    findVersionTarget: vi.fn(async () => ({ matter_id: vaultMatterId })),
    listVersions: vi.fn(async () => ({ items: [{
      versionId,
      documentId,
      versionNo: 2,
      versionStatus: 'current',
      fileObjectId,
      fileHash: sha256,
      createdBy: actorUserId,
      createdAt: '2026-09-15T09:00:00.000Z',
      supersedesVersionId: null,
      promotedFromSubversionId: null,
      versionLabel: 'v2',
      versionSignificance: 'internal_draft',
      renditionType: 'clean',
      baseCleanVersionId: null,
    }] })),
  };
  const documentFolders = { listFolders: vi.fn(async () => [{ folderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    parentFolderId: null, name: '계약', path: '계약' }]) };
  const service = new AmicOsVaultReadService(
    auditService as never,
    searchService as never,
    permissionService as never,
    {
      require: () => ({ tenantId, source: contextSource }),
    } as never,
    {
      uploadAuthorityRef: () => 'amic-vault-api:single-install',
      uploadProviderRevision: () => 'single-install-upload-v1',
    } as never,
    previewSessions as never,
    previews as never,
    previewQueue as never,
    external,
    documentVersions as never,
    documentFolders as never,
  );
  return { auditService, query, searchService, permissionService, service, previewSessions, previews, previewQueue, documentVersions, documentFolders };
}

describe('AmicOsVaultReadService', () => {
  it('requires Matter permission before listing folders and constrains document search to an existing folder', async () => {
    const f = createHarness();
    const folders = await f.service.folders(principal, { accountLedgerId: principal.accountLedgerId, lawosMatterId });
    expect(f.documentFolders.listFolders).toHaveBeenCalledWith(actorUserId, vaultMatterId);
    expect(folders.items[0]?.folder_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await f.service.list(principal, input({ folderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
    expect(f.searchService.search).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      filters: expect.objectContaining({ matterId: vaultMatterId, folderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    }));
    await expect(f.service.list(principal, input({ folderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })))
      .rejects.toThrow();
  });
  it('authorizes delegated Portal documents through current sharing, owner, hold and external DLP policy', async () => {
    const actor = { role: 'matter_owner', status: 'active' };
    const member = { matter_role: 'owner', access_level: 'edit' };
    const policies = { count: '3' };
    const target = { matter_id: vaultMatterId, document_id: documentId, version_id: versionId,
      document_status: 'active', document_legal_hold: false, matter_legal_hold: false };
    const edit = vi.fn(async () => ({ effect: 'ALLOW' }));
    const read = vi.fn(async () => ({ effect: 'ALLOW' }));
    const evaluate = vi.fn(async () => ({ allowed: true, findingCount: 0, resultHash: sha256 }));
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(params[0]).toBe(tenantId);
      if (sql.includes('FROM users')) return { rows: [actor] };
      if (sql.includes('FROM matter_members')) return { rows: [member] };
      if (sql.includes('FROM sharing_policy_definitions')) return { rows: [policies] };
      if (sql.includes('FROM documents d')) {
        expect(params).toEqual([tenantId, documentId, null]);
        expect(sql).toContain("version_status = 'current'");
        return { rows: [target] };
      }
      throw new Error('unexpected external authority query');
    });
    const transaction = async (_tenant: string, work: (client: { query: typeof query }) => Promise<unknown>) => {
      expect(_tenant).toBe(tenantId);
      return work({ query });
    };
    const external = new ExternalService({ transaction } as never, { tenantTransaction: transaction } as never,
      { canEditMatter: edit } as never, { canReadDocument: read } as never,
      { evaluateDocumentEgress: evaluate } as never, {} as never);
    const f = createHarness({ external });
    const request = { accountLedgerId: principal.accountLedgerId, lawosMatterId, documentId };
    const run = () => f.service.portalDocument(principal, request);
    const allowed = await run();
    expect(allowed).toEqual({ authority_kind: 'amic-vault-api', authority_ref: 'amic-vault-api:single-install',
      provider_revision: 'single-install-upload-v1', policy_ref: sha256,
      exact_version: { document_id: documentId, version_id: versionId, file_object_id: fileObjectId,
        sha256, byte_size: 4096, mime_type: 'application/pdf' } });
    expect(evaluate).toHaveBeenCalledWith(expect.anything(), {
      tenantId, matterId: vaultMatterId, documentId, versionId, purpose: 'external_link',
      authorization: { kind: 'internal', userId: actorUserId, sessionId: null },
    });
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("v.version_status = 'current'"), [tenantId, documentId, versionId]);
    f.query.mockImplementationOnce(async () => ({ rowCount: 1, rows: [{ matter_id: vaultMatterId }] }))
      .mockImplementationOnce(async () => ({ rowCount: 1, rows: [{ document_id: documentId, version_id: versionId,
        file_object_id: fileObjectId, sha256, size_bytes: String(256 * 1024 * 1024),
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] }));
    await expect(run()).resolves.toMatchObject({ exact_version: {
      byte_size: 256 * 1024 * 1024,
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } });
    await expect(f.service.portalDocument(principal, { ...request, accountLedgerId: 'wrong-account' })).rejects.toMatchObject({ status: 403 });
    await expect(f.service.portalDocument({ ...principal, tenantId: 'another-tenant' }, request)).rejects.toMatchObject({ status: 403 });
    f.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(run()).rejects.toMatchObject({ status: 403 });
    edit.mockResolvedValueOnce({ effect: 'DENY' });
    await expect(run()).rejects.toMatchObject({ status: 403 });
    read.mockResolvedValueOnce({ effect: 'DENY' });
    await expect(run()).rejects.toMatchObject({ status: 403 });
    for (const [object, key, value] of [
      [actor, 'status', 'disabled'], [member, 'matter_role', 'member'], [policies, 'count', '2'],
      [target, 'matter_id', 'another-matter'], [target, 'document_status', 'deleted'],
      [target, 'document_legal_hold', true], [target, 'matter_legal_hold', true],
      [target, 'version_id', '77777777-7777-4777-8777-777777777777'],
    ] as [Record<string, unknown>, string, unknown][]) {
      const previous = object[key]; object[key] = value;
      await expect(run()).rejects.toMatchObject({ status: 403 });
      object[key] = previous;
    }
    evaluate.mockResolvedValueOnce({ allowed: false, findingCount: 0, resultHash: sha256 });
    await expect(run()).rejects.toMatchObject({ status: 403 });
    evaluate.mockResolvedValueOnce({ allowed: true, findingCount: 1, resultHash: sha256 });
    await expect(run()).rejects.toMatchObject({ status: 403 });
    await expect(run()).resolves.toEqual(allowed);
  });

  it('polls without writes and explicitly enqueues the authorized exact source in one transaction', async () => {
    const f = createHarness();
    await expect(f.service.preparePreview(principal, previewInput, false)).resolves.toMatchObject({ status: 'pending', preview: null });
    expect(f.previewQueue.enqueueVersionCreated).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
    await expect(f.service.preparePreview(principal, previewInput, true)).resolves.toMatchObject({ status: 'pending' });
    expect(f.previewQueue.enqueueVersionCreated).toHaveBeenCalledWith({
      tenantId, actorUserId, documentId, versionId, fileObjectId,
    }, expect.anything(), true);
    expect(f.previewSessions.inspect).toHaveBeenCalledWith(actorUserId, documentId, previewInput.exact);
    expect(f.previewSessions.issue).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => sql.includes("WHERE document_preview_artifacts.status = 'failed'"))).toBe(true);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('converter_profile_sha256 IS DISTINCT FROM'),
      [tenantId, documentId, versionId, fileObjectId, source.sha256, 'c'.repeat(64)]);
  });

  it('exposes failed preparation until an explicit retry, without issuing an early view session', async () => {
    const f = createHarness();
    f.previews.getPreparedPreview.mockResolvedValue({ status: 'failed', file: null, converterProfileSha256: 'c'.repeat(64) });
    await expect(f.service.preparePreview(principal, previewInput, false)).resolves.toMatchObject({ status: 'failed' });
    await expect(f.service.issuePreviewSession(principal, previewInput)).rejects.toMatchObject({ response: { reason: 'PREVIEW_CONVERSION_UNAVAILABLE' } });
    expect(f.previewSessions.issue).not.toHaveBeenCalled();
    expect(f.previewQueue.enqueueVersionCreated).not.toHaveBeenCalled();
    await expect(f.service.preparePreview(principal, previewInput, true)).resolves.toMatchObject({ status: 'pending' });
  });

  it('reuses a ready derivative and issues the native session with the exact source binding', async () => {
    const f = createHarness();
    f.previews.getPreparedPreview.mockResolvedValue({ status: 'ready', file: pdfFile });
    const prepared = await f.service.preparePreview(principal, previewInput, true);
    expect(prepared).toMatchObject({ status: 'ready', preview, exact_version: previewInput.exact });
    expect(f.previewQueue.enqueueVersionCreated).not.toHaveBeenCalled();
    const issued = await f.service.issuePreviewSession(principal, previewInput);
    expect(issued).toMatchObject({ status: 'ready', session, preview, chunk_bytes: PREVIEW_CHUNK_BYTES });
    expect(f.previewSessions.issue).toHaveBeenCalledTimes(1);
    expect(f.previewSessions.issue).toHaveBeenCalledWith(actorUserId, documentId, previewInput.exact);
    expect(JSON.stringify(issued)).not.toMatch(/storage_uri|s3:\/\/|normalized_filename/);
  });

  it('blocks wrong account, Matter mapping and permission before preparing or enqueuing', async () => {
    const f = createHarness();
    await expect(f.service.preparePreview(principal, { ...previewInput, accountLedgerId: 'another_user' }, true)).rejects.toMatchObject({ status: 403 });
    f.previewSessions.inspect.mockResolvedValueOnce({ ...source, matter_id: 'other-matter' });
    await expect(f.service.preparePreview(principal, previewInput, true)).rejects.toMatchObject({ status: 403 });
    f.previewSessions.inspect.mockRejectedValueOnce(new Error('permission denied'));
    await expect(f.service.preparePreview(principal, previewInput, true)).rejects.toThrow('permission denied');
    expect(f.previews.getPreparedPreview).not.toHaveBeenCalled();
    expect(f.previewQueue.enqueueVersionCreated).not.toHaveBeenCalled();
  });

  it('binds chunks to the derivative and rechecks the native session after storage returns', async () => {
    const f = createHarness();
    f.previews.getPreparedPreview.mockResolvedValue({ status: 'ready', file: pdfFile });
    const result = await f.service.previewChunk(principal, chunkInput);
    expect(result).toMatchObject({ preview, exact_version: previewInput.exact,
      chunk: { offset: 0, byte_size: pdfBytes.byteLength, sha256: pdfFile.sha256, content_base64: pdfBytes.toString('base64') },
      next_offset: pdfBytes.byteLength, final_chunk: true });
    expect(f.previews.readPreparedChunk).toHaveBeenCalledWith(tenantId, pdfFile, 0);
    expect(f.previewSessions.authorizeStream).toHaveBeenCalledTimes(2);
    expect(f.previewSessions.authorizeStream).toHaveBeenLastCalledWith(actorUserId, documentId, session.previewSessionId, session.token, previewInput.exact);
    expect(f.previewSessions.inspect).not.toHaveBeenCalled();
    expect(f.previewSessions.issue).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(session.token);
  });

  it.each([
    { file_object_id: fileObjectId }, { sha256 }, { byte_size: pdfBytes.byteLength + 1 },
  ])('rejects a changed PDF identity before opening its bytes: %#', async changed => {
    const f = createHarness();
    f.previews.getPreparedPreview.mockResolvedValue({ status: 'ready', file: pdfFile });
    await expect(f.service.previewChunk(principal, { ...chunkInput, preview: { ...preview, ...changed } })).rejects.toMatchObject({ status: 403 });
    expect(f.previews.readPreparedChunk).not.toHaveBeenCalled();
  });

  it('does not release a chunk when authorization is revoked during its storage read', async () => {
    const f = createHarness();
    f.previews.getPreparedPreview.mockResolvedValue({ status: 'ready', file: pdfFile });
    f.previewSessions.authorizeStream.mockResolvedValueOnce(source).mockRejectedValueOnce(new Error('session revoked'));
    await expect(f.service.previewChunk(principal, chunkInput)).rejects.toThrow('session revoked');
    expect(f.previews.readPreparedChunk).toHaveBeenCalledTimes(1);
  });

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
        matter_code: 'AMIC-2026-0001',
        matter_name: '공급계약 자문',
        client_id: lawosClientId,
        client_name: 'AMIC Client',
        client_display_name: 'AMIC Client',
        metadata_code: null,
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
        created_at: '2026-08-20T00:00:00.000Z',
        edited_at: '2026-08-29T00:00:00.000Z',
        author_name: '현재 편집자',
        creator_name: '최초 업로더',
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

  it('keeps related labels null when document access does not grant Matter label access', async () => {
    const { permissionService, searchService, service } = createHarness();
    permissionService.canReadMatter.mockResolvedValueOnce({
      effect: 'DENY', reasonCode: 'PERMISSION_DENIED', appliedRules: ['matter_members:missing'],
    });
    searchService.search.mockResolvedValueOnce({
      results: [result()],
    });

    await expect(service.list(principal, input())).resolves.toMatchObject({
      items: [{
        document_id: documentId,
        matter_id: lawosMatterId,
        matter_code: null,
        matter_name: null,
        client_id: null,
        client_name: null,
        client_display_name: null,
        metadata_code: null,
      }],
    });
    expect(permissionService.canReadMatter).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      vaultMatterId,
    );
  });

  it('keeps related labels null when the Matter permission evaluator fails closed', async () => {
    const { permissionService, searchService, service } = createHarness();
    permissionService.canReadMatter.mockRejectedValueOnce(new Error('permission backend unavailable'));
    searchService.search.mockResolvedValueOnce({ results: [result()] });

    await expect(service.list(principal, input())).resolves.toMatchObject({
      items: [{
        document_id: documentId,
        matter_code: null,
        matter_name: null,
        client_id: null,
        client_name: null,
        client_display_name: null,
      }],
    });
  });

  it('returns null instead of a Vault-internal UUID when a Client has no external mapping', async () => {
    const { query, service } = createHarness({ exactLabels: { clientId: null } });

    await expect(service.list(principal, input())).resolves.toMatchObject({
      items: [{
        document_id: documentId,
        client_id: null,
        client_name: 'AMIC Client',
        client_display_name: 'AMIC Client',
      }],
    });
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toContain('c.client_id::text');
  });

  it('normalizes valid labels and nulls malformed canonical label fields', async () => {
    const { service } = createHarness({
      exactLabels: {
        matterCode: ' A\u030A-2026 ',
        matterName: 'x'.repeat(1_001),
        clientId: 'invalid client id',
        clientName: 'bad\u0000name',
      },
    });

    await expect(service.list(principal, input())).resolves.toMatchObject({
      items: [{
        document_id: documentId,
        matter_code: 'Å-2026',
        matter_name: null,
        client_id: null,
        client_name: null,
        client_display_name: null,
      }],
    });
  });

  it('fails the request when the exact current-version projection query fails', async () => {
    const { service } = createHarness({ exactQueryError: true });

    await expect(service.list(principal, input())).rejects.toThrow('exact projection unavailable');
  });

  it('omits a document when its current Matter changes after the permission-scoped search', async () => {
    const { service } = createHarness({
      exactMatterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await expect(service.list(principal, input())).resolves.toMatchObject({
      items: [],
      page_info: { returned_count: 0 },
    });
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

  it('reuses the permission-scoped document version service and returns exact file metadata', async () => {
    const { documentVersions, service } = createHarness();
    await expect(service.versions(principal, {
      accountLedgerId: principal.accountLedgerId,
      lawosMatterId,
      documentId,
      page: 1,
      pageSize: 50,
    })).resolves.toMatchObject({
      authority_kind: 'amic-vault-api',
      items: [{ document_id: documentId, matter_id: lawosMatterId, version_id: versionId,
        version_no: 2, file_object_id: fileObjectId, sha256, byte_size: 4096, mime_type: 'application/pdf' }],
      page_info: { page: 1, page_size: 50, returned_count: 1, has_more: false },
      raw_bytes_included: false,
      storage_locator_returned: false,
    });
    expect(documentVersions.listVersions).toHaveBeenCalledWith(actorUserId, documentId, {});
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
