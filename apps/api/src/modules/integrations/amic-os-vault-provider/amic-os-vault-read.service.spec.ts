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
const uploaderAccountLedgerId = 'user_vault_uploader';
const editorAccountLedgerId = 'user_vault_editor';
const vaultMatterId = '33333333-3333-4333-8333-333333333333';
const vaultClientId = '33333333-3333-4333-8333-333333333334';
const lawosMatterId = 'lawos-matter-1';
const lawosClientId = 'lawos-client-1';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const fileObjectId = '66666666-6666-4666-8666-666666666666';
const receivedEmailDocumentId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const receivedEmailVersionId = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const receivedEmailFileObjectId = 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc1';
const receivedEmailRawFileObjectId = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeee1';
const sentEmailDocumentId = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const sentEmailVersionId = 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const sentEmailFileObjectId = 'ccccccc2-cccc-4ccc-8ccc-ccccccccccc2';
const sentEmailRawFileObjectId = 'eeeeeee2-eeee-4eee-8eee-eeeeeeeeeee2';
const receivedEmailId = 'ddddddd1-dddd-4ddd-8ddd-ddddddddddd1';
const sentEmailId = 'ddddddd2-dddd-4ddd-8ddd-ddddddddddd2';
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

function emailProjectionRow(input: {
  documentId: string;
  versionId: string;
  fileObjectId: string;
  emailId: string;
  subject: string;
  sentAt: string | null;
  receivedAt: string | null;
  filedAt: string;
  storageUri: string;
  mimeType?: string;
  rawFileObjectId?: string;
  rawSha256?: string;
  rawSizeBytes?: string;
  rawMimeType?: string;
  rawFilename?: string;
}) {
  return {
    document_id: input.documentId,
    matter_id: vaultMatterId,
    version_id: input.versionId,
    file_object_id: input.fileObjectId,
    sha256: 'e'.repeat(64),
    size_bytes: '1024',
    mime_type: input.mimeType ?? 'message/rfc822',
    normalized_filename: input.mimeType === 'text/plain'
      ? `${input.documentId}.txt`
      : `${input.documentId}.eml`,
    lawos_matter_id: lawosMatterId,
    created_at: new Date('2026-08-20T00:00:00.000Z'),
    updated_at: new Date('2026-08-29T00:00:00.000Z'),
    creator_name: '메일 업로더',
    creator_user_id: uploaderAccountLedgerId,
    editor_name: '메일 편집자',
    editor_user_id: editorAccountLedgerId,
    canonical_matter_code: 'AMIC-2026-0001',
    canonical_matter_name: '공급계약 자문',
    canonical_client_id: lawosClientId,
    canonical_client_name: 'AMIC Client',
    email_id: input.emailId,
    email_subject: input.subject,
    email_sent_at: input.sentAt ? new Date(input.sentAt) : null,
    email_received_at: input.receivedAt ? new Date(input.receivedAt) : null,
    email_filed_at: new Date(input.filedAt),
    email_storage_uri: input.storageUri,
    email_raw_file_object_id: input.rawFileObjectId,
    email_raw_sha256: input.rawSha256,
    email_raw_size_bytes: input.rawSizeBytes,
    email_raw_mime_type: input.rawMimeType,
    email_raw_filename: input.rawFilename,
    ocr_search_current: true,
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
  exactRows?: readonly Record<string, unknown>[];
  ocrSearchCurrent?: boolean;
  emailSearchPages?: readonly (readonly SearchResultDto[])[];
  storageBody?: Buffer;
}

function createHarness({
  source: contextSource = 'amic-os-provider',
  external = {} as ExternalService,
  exactMatterId = vaultMatterId,
  exactLabels = {},
  exactQueryError = false,
  exactRows,
  ocrSearchCurrent = true,
  emailSearchPages,
  storageBody,
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
    if (sql.includes("emailBodySearchEnabled")) return { rowCount: 1, rows: [{ enabled: null }] };
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
      if (exactRows) return { rowCount: exactRows.length, rows: exactRows };
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
            amic_os_filename: null,
            amic_os_metadata_code: null,
            lawos_matter_id: lawosMatterId,
            created_at: new Date('2026-08-20T00:00:00.000Z'),
            updated_at: new Date('2026-08-29T00:00:00.000Z'),
            creator_name: '최초 업로더',
            creator_user_id: uploaderAccountLedgerId,
            editor_name: '현재 편집자',
            editor_user_id: editorAccountLedgerId,
            canonical_matter_code: labelsReadable ? matterCode : null,
            canonical_matter_name: labelsReadable ? matterName : null,
            canonical_client_id: labelsReadable ? clientId : null,
            canonical_client_name: labelsReadable ? clientName : null,
            ocr_search_current: ocrSearchCurrent,
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
            editor_name: '현재 편집자',
            canonical_matter_code: labelsReadable ? matterCode : null,
            canonical_matter_name: labelsReadable ? matterName : null,
            canonical_client_id: labelsReadable ? clientId : null,
            canonical_client_name: labelsReadable ? clientName : null,
            ocr_search_current: true,
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
            editor_name: '현재 편집자',
            canonical_matter_code: labelsReadable ? matterCode : null,
            canonical_matter_name: labelsReadable ? matterName : null,
            canonical_client_id: labelsReadable ? clientId : null,
            canonical_client_name: labelsReadable ? clientName : null,
            ocr_search_current: true,
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
    search: vi.fn(async (_context: unknown, searchInput: { page?: number } = {}) => ({
      ...(emailSearchPages
        ? { results: [...(emailSearchPages[(searchInput.page ?? 1) - 1] ?? [])], total: 0 }
        : {
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
      total: 4,
        }),
    })),
  };
  const permissionService = {
    canReadMatter: vi.fn(async () => ({
      effect: 'ALLOW', reasonCode: 'ALLOWED', appliedRules: ['matter.read:role_allow'],
    })),
    canReadDocument: vi.fn(async () => ({ effect: 'ALLOW', reasonCode: 'ALLOWED' })),
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
  const storageService = storageBody
    ? { getByStorageUri: vi.fn(async () => ({ body: storageBody })) }
    : undefined;
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
    storageService as never,
  );
  return { auditService, query, searchService, permissionService, service, previewSessions, previews, previewQueue,
    documentVersions, documentFolders, storageService };
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
        creator_user_id: uploaderAccountLedgerId,
        author_name: '현재 편집자',
        creator_name: '최초 업로더',
        editor_user_id: editorAccountLedgerId,
        indexed_at: null,
        match_fields: ['title'],
      }],
      page_info: {
        page: 1,
        page_size: 25,
        returned_count: 1,
        has_more: false,
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

  it('reports ordinary list pagination from the scoped search result without exposing totals', async () => {
    const f = createHarness();
    f.searchService.search.mockResolvedValueOnce({ results: [result()], total: 51 });
    f.searchService.search.mockResolvedValueOnce({ results: [result()], total: 51 });
    const first = await f.service.list(principal, input({ page: 1, pageSize: 50 }));
    const second = await f.service.list(principal, input({ page: 2, pageSize: 50 }));
    expect(first.page_info).toMatchObject({ page: 1, returned_count: 1, has_more: true });
    expect(second.page_info).toMatchObject({ page: 2, returned_count: 1, has_more: false });
    expect('total' in first.page_info).toBe(false);
  });

  it('projects the filing actor for email bodies and linked attachments, and the current version editor', async () => {
    const body = emailProjectionRow({
      documentId: receivedEmailDocumentId,
      versionId: receivedEmailVersionId,
      fileObjectId: receivedEmailFileObjectId,
      emailId: receivedEmailId,
      subject: '받은 메일',
      sentAt: null,
      receivedAt: '2026-08-28T15:00:00.000Z',
      filedAt: '2026-08-28T16:00:00.000Z',
      storageUri: 's3://private/received.eml',
      mimeType: 'text/plain',
    });
    const attachment = { ...body, document_id: sentEmailDocumentId, version_id: sentEmailVersionId,
      file_object_id: sentEmailFileObjectId, email_id: null, normalized_filename: 'attachment.pdf',
      mime_type: 'application/pdf' };
    const f = createHarness({ exactRows: [body, attachment], emailSearchPages: [[
      result({ documentId: receivedEmailDocumentId, versionId: receivedEmailVersionId,
        documentType: 'email', author: { userId: actorUserId, displayName: '오래된 검색 인덱스 작성자' } }),
      result({ documentId: sentEmailDocumentId, versionId: sentEmailVersionId,
        author: { userId: actorUserId, displayName: '오래된 검색 인덱스 작성자' } }),
    ]] });
    const listed = await f.service.list(principal, input());
    expect(listed.items).toHaveLength(2);
    expect(listed.items.map((item) => ({ creator: item.creator_name, creatorId: item.creator_user_id,
      editor: item.author_name, editorId: item.editor_user_id })))
      .toEqual([{ creator: '메일 업로더', creatorId: uploaderAccountLedgerId,
        editor: '메일 편집자', editorId: editorAccountLedgerId },
      { creator: '메일 업로더', creatorId: uploaderAccountLedgerId,
        editor: '메일 편집자', editorId: editorAccountLedgerId }]);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('filing.created_by AS filer_user_id'), expect.anything());
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('FROM email_document_links link'), expect.anything());
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('editor.user_id = dv.created_by'), expect.anything());
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('creator_identity.user_id = coalesce(email.filer_user_id, attachment_filing.filer_user_id, d.created_by)'), expect.anything());
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('editor_identity.user_id = editor.user_id'), expect.anything());
  });

  it('omits documents when Matter read access is denied', async () => {
    const { permissionService, searchService, service } = createHarness();
    permissionService.canReadMatter.mockResolvedValueOnce({
      effect: 'DENY', reasonCode: 'PERMISSION_DENIED', appliedRules: ['matter_members:missing'],
    });
    searchService.search.mockResolvedValueOnce({
      results: [result()],
      total: 1,
    });

    await expect(service.list(principal, input())).resolves.toMatchObject({ items: [] });
    expect(permissionService.canReadMatter).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      vaultMatterId,
    );
  });

  it('preserves legacy metadata code separately from current Matter labels on list and search', async () => {
    const { service } = createHarness({ exactRows: [{
      document_id: documentId, matter_id: vaultMatterId, version_id: versionId,
      file_object_id: fileObjectId, sha256, size_bytes: '4096', mime_type: 'application/pdf',
      normalized_filename: 'source.pdf', amic_os_filename: 'renamed.pdf',
      amic_os_metadata_code: 'LEGACY.CODE', lawos_matter_id: lawosMatterId,
      created_at: new Date('2026-08-20T00:00:00.000Z'),
      updated_at: new Date('2026-08-29T00:00:00.000Z'),
      creator_name: '최초 업로더', editor_name: '현재 편집자',
      canonical_matter_code: 'MATTER.CODE', canonical_matter_name: '공급계약 자문',
      canonical_client_id: lawosClientId, canonical_client_name: 'AMIC Client',
    }] });
    const listed = await service.list(principal, input());
    const searched = await service.search(principal, input({
      codeBasis: 'legacy', metadataCodes: ['LEGACY.CODE'],
    }));
    expect(listed.items[0]).toMatchObject({
      metadata_code: 'LEGACY.CODE', matter_code: 'MATTER.CODE', filename: 'renamed.pdf',
    });
    expect(searched.items[0]).toMatchObject({ document_id: documentId, metadata_code: 'LEGACY.CODE' });
    expect((await service.search(principal, input({
      codeBasis: 'matter', metadataCodes: ['LEGACY.CODE'],
    }))).items).toEqual([]);
  });

  it('omits the document when the Matter permission evaluator fails closed', async () => {
    const { permissionService, searchService, service } = createHarness();
    permissionService.canReadMatter.mockRejectedValueOnce(new Error('permission backend unavailable'));
    searchService.search.mockResolvedValueOnce({ results: [result()], total: 1 });

    await expect(service.list(principal, input())).resolves.toMatchObject({ items: [] });
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

  it('omits a hit when a newer current version replaces the indexed version', async () => {
    const f = createHarness();
    f.searchService.search.mockResolvedValueOnce({ results: [result({
      versionId: '99999999-9999-4999-8999-999999999999', snippet: 'old version OCR',
    })], total: 1 });

    await expect(f.service.search(principal, input({ bodyQuery: 'old version OCR' })))
      .resolves.toMatchObject({ items: [], page_info: { returned_count: 0 } });
  });

  it('omits a body hit after OCR correction while the exact index is stale', async () => {
    const f = createHarness({ ocrSearchCurrent: false });
    f.searchService.search.mockResolvedValueOnce({ results: [result({ snippet: 'old OCR table text' })], total: 1 });

    await expect(f.service.search(principal, input({ bodyQuery: 'old OCR table text' })))
      .resolves.toMatchObject({ items: [], page_info: { returned_count: 0 } });
    expect(f.query.mock.calls.some(([sql]) => String(sql).includes('idx.source_text_hash = encode(digest'))).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => String(sql).includes('page.corrected_text, page.page_text'))).toBe(true);
  });

  it('allows a partial OCR document to remain listed without claiming a body hit', async () => {
    const f = createHarness({ ocrSearchCurrent: false });

    await expect(f.service.list(principal, input())).resolves.toMatchObject({
      items: [expect.objectContaining({ document_id: documentId })],
    });
  });

  it('keeps a current OCR body hit after its correction is indexed', async () => {
    const f = createHarness({ ocrSearchCurrent: true });
    f.searchService.search.mockResolvedValueOnce({ results: [result({ snippet: 'corrected table total' })], total: 1 });

    await expect(f.service.search(principal, input({ bodyQuery: 'corrected table total' })))
      .resolves.toMatchObject({ items: [expect.objectContaining({ document_id: documentId })] });
  });

  it('omits a result when document access is revoked after scoped search', async () => {
    const f = createHarness();
    f.permissionService.canReadDocument.mockResolvedValue({ effect: 'DENY', reasonCode: 'PERMISSION_DENIED' });

    await expect(f.service.search(principal, input({ query: '공급계약' })))
      .resolves.toMatchObject({ items: [], page_info: { returned_count: 0 } });
    expect(f.permissionService.canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId }, documentId,
    );
  });

  it('omits a result if the current Matter read is revoked after scoped search', async () => {
    const f = createHarness();
    f.permissionService.canReadMatter.mockResolvedValue({ effect: 'DENY', reasonCode: 'PERMISSION_DENIED', appliedRules: [] });

    await expect(f.service.search(principal, input({ query: '공급계약' })))
      .resolves.toMatchObject({ items: [], page_info: { returned_count: 0 } });
    expect(f.permissionService.canReadDocument).not.toHaveBeenCalled();
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

  it('passes every supported provider filter into the permission-scoped SearchService query', async () => {
    const { searchService, service } = createHarness();

    await service.search(principal, input({
      query: null,
      bodyQuery: 'OCR 계약',
      dateBasis: 'created_or_modified',
      dateFrom: '2026-01-01',
      dateTo: '2026-08-29',
      mimeTypes: ['application/pdf', 'text/plain'],
      matterCode: 'AMIC-2026',
      matterName: '공급계약',
      clientCode: 'lawos-client-1',
      clientName: 'AMIC Client',
      tags: ['closing', 'executed'],
      sortBy: 'title_asc',
      page: 2,
      pageSize: 10,
    }));

    expect(searchService.search).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId, sessionId: null },
      {
        query: 'OCR 계약',
        mode: 'keyword',
        target: 'body',
        sortBy: 'title_asc',
        groupBy: 'none',
        filters: {
          versionStatus: 'current',
          matterId: vaultMatterId,
          dateFrom: '2026-01-01T00:00:00.000Z',
          dateTo: '2026-08-29T23:59:59.999Z',
          dateBasis: 'created_or_modified',
          mimeType: ['application/pdf', 'text/plain'],
          matterCode: 'AMIC-2026',
          matterName: '공급계약',
          clientCode: 'lawos-client-1',
          clientName: 'AMIC Client',
          tags: ['closing', 'executed'],
        },
        page: 2,
        pageSize: 10,
      },
    );
  });

  it('searches filed email body documents through the full current-version chunk index', async () => {
    const { searchService, service } = createHarness();
    await service.search(principal, input({
      bodyQuery: 'late phrase after one megabyte',
      mimeTypes: ['text/plain'],
    }));
    expect(searchService.search).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId, sessionId: null },
      expect.objectContaining({
        query: 'late phrase after one megabyte',
        target: 'body',
        filters: expect.objectContaining({ versionStatus: 'current', mimeType: ['text/plain'] }),
      }),
    );
  });

  it('fails closed when full-body search is requested on an unindexed raw EML', async () => {
    const { searchService, service } = createHarness();
    await expect(service.search(principal, input({
      bodyQuery: 'late phrase after one megabyte',
      mimeTypes: ['message/rfc822'],
    }))).rejects.toMatchObject({
      response: { code: 'EML_BODY_SEARCH_UNAVAILABLE', reason: 'RAW_EML_BODY_SEARCH_UNAVAILABLE' },
    });
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('reports a disabled filed-email body index instead of an empty search', async () => {
    const { query, searchService, service } = createHarness();
    query.mockImplementation(async (sql: string) => sql.includes('emailBodySearchEnabled')
      ? { rowCount: 1, rows: [{ enabled: 'false' }] }
      : { rowCount: 1, rows: [{ matter_id: vaultMatterId }] });
    await expect(service.search(principal, input({ bodyQuery: 'late phrase', mimeTypes: ['text/plain'] })))
      .rejects.toMatchObject({ response: { code: 'EML_BODY_SEARCH_UNAVAILABLE', reason: 'EMAIL_BODY_INDEX_DISABLED' } });
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('projects filed EML headers from text/plain email bodies, applies Seoul date bounds, and paginates at 50/51', async () => {
    const received = result({
      documentId: receivedEmailDocumentId,
      versionId: receivedEmailVersionId,
      title: '받은 메일',
      documentType: 'email',
    });
    const sent = result({
      documentId: sentEmailDocumentId,
      versionId: sentEmailVersionId,
      title: '보낸 메일',
      documentType: 'email',
    });
    const extraEmailFixtures = Array.from({ length: 49 }, (_, index) => {
      const suffix = String(index + 10).padStart(12, '0');
      const documentId = `aaaabbbb-aaaa-4aaa-8aaa-${suffix}`;
      const versionId = `bbbbcccc-bbbb-4bbb-8bbb-${suffix}`;
      const fileObjectId = `ccccdddd-cccc-4ccc-8ccc-${suffix}`;
      const emailId = `ddddaaaa-dddd-4ddd-8ddd-${suffix}`;
      const sentAt = `2026-08-27T${String(index % 24).padStart(2, '0')}:00:00.000Z`;
      return {
        result: result({ documentId, versionId, title: `추가 메일 ${index + 1}`, documentType: 'email' }),
        row: emailProjectionRow({
          documentId,
          versionId,
          fileObjectId,
          emailId,
          subject: `추가 메일 DB 제목 ${index + 1}`,
          sentAt,
          receivedAt: null,
          filedAt: '2026-08-27T23:00:00.000Z',
          storageUri: `s3://private/extra-${index + 1}.eml`,
          mimeType: 'text/plain',
        }),
      };
    });
    const firstSearchPage = [received, sent, ...extraEmailFixtures.slice(0, 48).map(({ result: item }) => item)];
    const secondSearchPage = [extraEmailFixtures[48]!.result];
    const rawHeaders = Buffer.from([
      'Date: Fri, 28 Aug 2026 15:00:00 +0000',
      'Received: from mail.example.test; Fri, 28 Aug 2026 15:00:00 +0000',
      'Message-ID: <received@example.test>',
      'Subject: Received header subject',
      'From: sender@example.test',
      'To: reader@example.test, second@example.test',
      '',
      '본문은 응답에 포함하지 않는다.',
    ].join('\r\n'));
    const rawSha256 = createHash('sha256').update(rawHeaders).digest('hex');
    const f = createHarness({
      exactRows: [
        emailProjectionRow({
          documentId: receivedEmailDocumentId,
          versionId: receivedEmailVersionId,
          fileObjectId: receivedEmailFileObjectId,
          emailId: receivedEmailId,
          subject: '받은 메일 DB 제목',
          sentAt: '2026-08-28T14:00:00.000Z',
          receivedAt: '2026-08-28T15:00:00.000Z',
          filedAt: '2026-08-28T16:00:00.000Z',
          storageUri: 's3://private/received.eml',
          mimeType: 'text/plain',
          rawFileObjectId: receivedEmailRawFileObjectId,
          rawSha256,
          rawSizeBytes: String(rawHeaders.byteLength),
          rawMimeType: 'message/rfc822',
          rawFilename: 'received.eml',
        }),
        emailProjectionRow({
          documentId: sentEmailDocumentId,
          versionId: sentEmailVersionId,
          fileObjectId: sentEmailFileObjectId,
          emailId: sentEmailId,
          subject: '보낸 메일 DB 제목',
          sentAt: '2026-08-28T00:00:00.000Z',
          receivedAt: null,
          filedAt: '2026-08-28T01:00:00.000Z',
          storageUri: 's3://private/sent.eml',
          mimeType: 'text/plain',
          rawFileObjectId: sentEmailRawFileObjectId,
          rawSha256,
          rawSizeBytes: String(rawHeaders.byteLength),
          rawMimeType: 'message/rfc822',
          rawFilename: 'sent.eml',
        }),
        ...extraEmailFixtures.map(({ row }) => row),
      ],
      emailSearchPages: [firstSearchPage, secondSearchPage],
      storageBody: rawHeaders,
    });

    const first = await f.service.search(principal, input({
      query: 'sender@example.test',
      dateFrom: '2026-08-28',
      dateTo: '2026-08-29',
      mimeTypes: ['message/rfc822'],
      emailDateBasis: 'event_at',
      emailSort: 'event_at',
      emailSortOrder: 'desc',
      page: 1,
      pageSize: 1,
    }));
    expect(f.searchService.search).toHaveBeenCalledTimes(2);
    expect(f.searchService.search).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      target: 'email',
      page: 2,
      pageSize: 50,
    }));
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('filing.body_document_id = d.document_id'), expect.anything());
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('raw_file.sha256 = em.raw_sha256'), expect.anything());
    expect(f.searchService.search).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      target: 'email',
      page: 1,
      pageSize: 50,
      filters: expect.objectContaining({
        mimeType: undefined,
        documentType: ['email'],
        dateFrom: undefined,
        dateTo: undefined,
        dateBasis: undefined,
      }),
      emailCriteria: expect.objectContaining({ dateBasis: 'event_at', sort: 'event_at', sortOrder: 'desc' }),
      query: 'sender@example.test',
    }));
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      document_id: receivedEmailDocumentId,
      current_mime_type: 'text/plain',
      mime_type: 'text/plain',
      email_message: {
        subject: '받은 메일 DB 제목',
        from: 'sender@example.test',
        to: ['reader@example.test', 'second@example.test'],
        direction: 'received',
        sent_at: '2026-08-28T14:00:00.000Z',
        received_at: '2026-08-28T15:00:00.000Z',
        filed_at: '2026-08-28T16:00:00.000Z',
        event_at: '2026-08-28T15:00:00.000Z',
      },
      email_source: {
        source_kind: 'filed_eml',
        exact_version: {
          document_id: receivedEmailDocumentId,
          version_id: receivedEmailVersionId,
          file_object_id: receivedEmailRawFileObjectId,
          sha256: rawSha256,
          byte_size: rawHeaders.byteLength,
          mime_type: 'message/rfc822',
        },
        attachment_name: 'received.eml',
      },
      match_fields: ['email_from'],
    });
    expect(JSON.stringify(first.items)).not.toMatch(/본문은|storage_uri|email_storage_uri/u);
    expect(first.page_info).toMatchObject({
      page: 1,
      page_size: 1,
      returned_count: 1,
      has_more: true,
      email_date_basis: 'event_at',
      email_sort: 'event_at',
      email_sort_order: 'desc',
      email_direction: null,
    });

    const second = await f.service.search(principal, input({
      query: 'sender@example.test',
      dateFrom: '2026-08-28',
      dateTo: '2026-08-29',
      mimeTypes: ['message/rfc822'],
      emailDateBasis: 'event_at',
      emailSort: 'event_at',
      emailSortOrder: 'desc',
      page: 2,
      pageSize: 1,
    }));
    expect(second.items).toHaveLength(1);
    expect(second.page_info.has_more).toBe(false);
    expect(second.items[0]).toMatchObject({
      document_id: sentEmailDocumentId,
      email_message: {
        direction: 'sent',
        sent_at: '2026-08-28T00:00:00.000Z',
        received_at: null,
        event_at: '2026-08-28T00:00:00.000Z',
      },
    });

    await expect(f.service.search(principal, input({
      query: 'second@',
      mimeTypes: ['message/rfc822'],
      emailSort: 'event_at',
      page: 1,
      pageSize: 1,
    }))).rejects.toMatchObject({
      response: { reason: 'EMAIL_ADDRESS_QUERY_REQUIRES_COMPLETE_ADDRESS' },
    });

    const receivedOnly = await f.service.search(principal, input({
      dateFrom: '2026-08-29',
      dateTo: '2026-08-29',
      mimeTypes: ['message/rfc822'],
      emailDateBasis: 'received_at',
      emailSort: 'received_at',
      emailSortOrder: 'asc',
      emailDirection: 'received',
      page: 1,
      pageSize: 50,
    }));
    expect(receivedOnly.items).toHaveLength(1);
    expect(receivedOnly.items[0]).toMatchObject({ document_id: receivedEmailDocumentId });
    expect(receivedOnly.page_info).toMatchObject({
      has_more: false,
      email_date_basis: 'received_at',
      email_sort: 'received_at',
      email_sort_order: 'asc',
      email_direction: 'received',
    });
  });

  it('sorts all permission-scoped email pages even after SearchService caps its reported count', async () => {
    const fixtures = Array.from({ length: 102 }, (_, index) => {
      const suffix = String(index + 100).padStart(12, '0');
      const currentDocumentId = `aaaabbbb-aaaa-4aaa-8aaa-${suffix}`;
      const currentVersionId = `bbbbcccc-bbbb-4bbb-8bbb-${suffix}`;
      const currentFileObjectId = `ccccdddd-cccc-4ccc-8ccc-${suffix}`;
      return {
        result: result({ documentId: currentDocumentId, versionId: currentVersionId, documentType: 'email' }),
        row: emailProjectionRow({
          documentId: currentDocumentId,
          versionId: currentVersionId,
          fileObjectId: currentFileObjectId,
          emailId: `ddddaaaa-dddd-4ddd-8ddd-${suffix}`,
          subject: `Email ${index}`,
          sentAt: index === 101 ? '2026-08-30T00:00:00.000Z' : '2026-08-20T00:00:00.000Z',
          receivedAt: null,
          filedAt: '2026-08-31T00:00:00.000Z',
          storageUri: `s3://private/email-${index}.eml`,
          mimeType: 'text/plain',
          rawFileObjectId: currentFileObjectId,
          rawSha256: 'a'.repeat(64),
          rawSizeBytes: '64',
          rawMimeType: 'message/rfc822',
          rawFilename: `email-${index}.eml`,
        }),
      };
    });
    const f = createHarness({
      exactRows: fixtures.map(({ row }) => row),
      emailSearchPages: [
        fixtures.slice(0, 50).map(({ result: item }) => item),
        fixtures.slice(50, 100).map(({ result: item }) => item),
        fixtures.slice(100).map(({ result: item }) => item),
      ],
      storageBody: Buffer.from('Message-ID: <fixture@example.test>\r\nFrom: sender@example.test\r\nTo: recipient@example.test\r\n\r\n'),
    });
    const response = await f.service.search(principal, input({
      mimeTypes: ['message/rfc822'],
      emailSort: 'event_at',
      pageSize: 1,
    }));
    expect(f.searchService.search).toHaveBeenCalledTimes(3);
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.document_id).toBe(fixtures[101]?.result.documentId);
  });

  it('reports has_more across the 50/51 email page boundary after exact projection', async () => {
    const fixtures = Array.from({ length: 51 }, (_, index) => {
      const suffix = String(index + 200).padStart(12, '0');
      const currentDocumentId = `aaaabbbb-aaaa-4aaa-8aaa-${suffix}`;
      const currentVersionId = `bbbbcccc-bbbb-4bbb-8bbb-${suffix}`;
      const currentFileObjectId = `ccccdddd-cccc-4ccc-8ccc-${suffix}`;
      return {
        result: result({ documentId: currentDocumentId, versionId: currentVersionId, documentType: 'email' }),
        row: emailProjectionRow({
          documentId: currentDocumentId,
          versionId: currentVersionId,
          fileObjectId: currentFileObjectId,
          emailId: `ddddaaaa-dddd-4ddd-8ddd-${suffix}`,
          subject: `Email ${index}`,
          sentAt: `2026-08-${String(1 + Math.floor(index / 24)).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
          receivedAt: null,
          filedAt: '2026-08-31T00:00:00.000Z',
          storageUri: `s3://private/email-${index}.eml`,
          mimeType: 'text/plain',
          rawFileObjectId: currentFileObjectId,
          rawSha256: 'a'.repeat(64),
          rawSizeBytes: '64',
          rawMimeType: 'message/rfc822',
          rawFilename: `email-${index}.eml`,
        }),
      };
    });
    const f = createHarness({
      exactRows: fixtures.map(({ row }) => row),
      emailSearchPages: [
        fixtures.slice(0, 50).map(({ result: item }) => item),
        fixtures.slice(50).map(({ result: item }) => item),
      ],
      storageBody: Buffer.from('Message-ID: <fixture@example.test>\r\nFrom: sender@example.test\r\nTo: recipient@example.test\r\n\r\n'),
    });
    const first = await f.service.search(principal, input({ emailSort: 'event_at', page: 1, pageSize: 50 }));
    const second = await f.service.search(principal, input({ emailSort: 'event_at', page: 2, pageSize: 50 }));
    expect(first.items).toHaveLength(50);
    expect(first.page_info).toMatchObject({ page: 1, returned_count: 50, has_more: true, omitted_result_count: null });
    expect(second.items).toHaveLength(1);
    expect(second.page_info).toMatchObject({ page: 2, returned_count: 1, has_more: false, omitted_result_count: null });
    expect(second.items[0]?.document_id).toBe(fixtures[0]?.result.documentId);
    expect(f.searchService.search).toHaveBeenCalledTimes(4);
  });

  it('omits email search hits when the filed EML source or its headers cannot be read', async () => {
    const candidate = result({ documentId: receivedEmailDocumentId, versionId: receivedEmailVersionId,
      documentType: 'email' });
    const row = emailProjectionRow({
      documentId: receivedEmailDocumentId,
      versionId: receivedEmailVersionId,
      fileObjectId: receivedEmailFileObjectId,
      emailId: receivedEmailId,
      subject: 'Filed subject',
      sentAt: '2026-08-28T00:00:00.000Z',
      receivedAt: null,
      filedAt: '2026-08-28T01:00:00.000Z',
      storageUri: 's3://private/received.eml',
      mimeType: 'text/plain',
    });
    const withoutSource = createHarness({ exactRows: [row], emailSearchPages: [[candidate]] });
    expect((await withoutSource.service.search(principal, input({
      mimeTypes: ['message/rfc822'], emailSort: 'event_at',
    }))).items).toEqual([]);

    const sourceRow = { ...row, email_raw_file_object_id: receivedEmailRawFileObjectId,
      email_raw_sha256: 'a'.repeat(64), email_raw_size_bytes: '64',
      email_raw_mime_type: 'message/rfc822', email_raw_filename: 'received.eml' };
    const withoutHeader = createHarness({ exactRows: [sourceRow], emailSearchPages: [[candidate]],
      storageBody: Buffer.from('From: sender@example.test\r\n') });
    expect((await withoutHeader.service.search(principal, input({
      mimeTypes: ['message/rfc822'], emailSort: 'event_at',
    }))).items).toEqual([]);
  });

  it('does not read a filed EML header after document access is denied', async () => {
    const candidate = result({ documentId: receivedEmailDocumentId, versionId: receivedEmailVersionId,
      documentType: 'email' });
    const row = emailProjectionRow({
      documentId: receivedEmailDocumentId,
      versionId: receivedEmailVersionId,
      fileObjectId: receivedEmailFileObjectId,
      emailId: receivedEmailId,
      subject: 'Private subject',
      sentAt: '2026-08-28T00:00:00.000Z',
      receivedAt: null,
      filedAt: '2026-08-28T01:00:00.000Z',
      storageUri: 's3://private/received.eml',
      rawFileObjectId: receivedEmailRawFileObjectId,
      rawSha256: 'a'.repeat(64),
      rawSizeBytes: '64',
      rawMimeType: 'message/rfc822',
      rawFilename: 'received.eml',
    });
    const f = createHarness({ exactRows: [row], emailSearchPages: [[candidate]],
      storageBody: Buffer.from('Message-ID: <private@example.test>\r\nFrom: sender@example.test\r\n\r\n') });
    f.permissionService.canReadDocument.mockResolvedValue({ effect: 'DENY', reasonCode: 'DENIED' });
    expect((await f.service.search(principal, input({
      query: 'sender@example.test', mimeTypes: ['message/rfc822'], emailSort: 'event_at',
    }))).items).toEqual([]);
    expect(f.storageService?.getByStorageUri).not.toHaveBeenCalled();
  });

  it('does not substitute another filed header for a complete address search hit', async () => {
    const candidate = result({ documentId: receivedEmailDocumentId, versionId: receivedEmailVersionId,
      documentType: 'email', snippet: 'A search-index body excerpt containing the queried address' });
    const row = emailProjectionRow({
      documentId: receivedEmailDocumentId,
      versionId: receivedEmailVersionId,
      fileObjectId: receivedEmailFileObjectId,
      emailId: receivedEmailId,
      subject: 'Current filed subject',
      sentAt: '2026-08-28T00:00:00.000Z',
      receivedAt: null,
      filedAt: '2026-08-28T01:00:00.000Z',
      storageUri: 's3://private/received.eml',
      mimeType: 'text/plain',
      rawFileObjectId: receivedEmailRawFileObjectId,
      rawSha256: 'a'.repeat(64),
      rawSizeBytes: '64',
      rawMimeType: 'message/rfc822',
      rawFilename: 'received.eml',
    });
    const f = createHarness({ exactRows: [row], emailSearchPages: [[candidate]],
      storageBody: Buffer.from('Message-ID: <fixture@example.test>\r\nFrom: other@example.test\r\nTo: reader@example.test\r\n\r\n') });
    expect((await f.service.search(principal, input({
      query: 'sender@example.test', mimeTypes: ['message/rfc822'], emailSort: 'event_at',
    }))).items).toEqual([]);
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
