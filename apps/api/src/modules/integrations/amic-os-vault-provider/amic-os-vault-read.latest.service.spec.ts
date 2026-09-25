import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import { AmicOsVaultReadService } from './amic-os-vault-read.service';
import { AMIC_OS_VAULT_MAX_UPLOAD_BYTES } from './amic-os-vault-upload.contract';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const vaultMatterId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const fileObjectId = '66666666-6666-4666-8666-666666666666';
const lawosMatterId = 'matter:1';
const sha256 = 'a'.repeat(64);
const policyRef = 'b'.repeat(64);

const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId,
  actorUserId,
};

function createHarness({
  target = true,
  contextSource = 'amic-os-provider',
  authorizeInternal = vi.fn(async () => ({ versionId, policyRef })),
  mimeType = 'application/pdf',
  sizeBytes = '4096',
}: {
  target?: boolean;
  contextSource?: string;
  authorizeInternal?: ReturnType<typeof vi.fn>;
  mimeType?: string;
  sizeBytes?: string;
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM matters')) {
      return { rowCount: 1, rows: [{ matter_id: vaultMatterId }] };
    }
    if (sql.includes('app_lock_internal_latest_authority')) {
      return { rowCount: 1, rows: [{ locked: true }] };
    }
    if (sql.includes('FROM documents d')) {
      return target
        ? {
        rowCount: 1,
          rows: [{ matter_id: vaultMatterId, document_id: documentId, version_id: versionId,
            file_object_id: fileObjectId, sha256, size_bytes: sizeBytes, mime_type: mimeType }],
        }
        : { rowCount: 0, rows: [] };
    }
    throw new Error(`unexpected latest query: ${sql}`);
  });
  const transaction = vi.fn(async (
    _tenant: string,
    work: (client: { query: typeof query }) => Promise<unknown>,
  ) => work({ query }));
  const service = Object.create(AmicOsVaultReadService.prototype) as AmicOsVaultReadService;
  Object.assign(service as unknown as Record<string, unknown>, {
    auditService: { transaction },
    tenantContext: { require: () => ({ tenantId, source: contextSource }) },
    external: { authorizeInternalLatestDocument: authorizeInternal },
    config: {
      uploadAuthorityRef: () => 'amic-vault-api:single-install',
      uploadProviderRevision: () => 'single-install-upload-v1',
    },
  });
  return { service, query, transaction, authorizeInternal };
}

const request = {
  accountLedgerId: principal.accountLedgerId,
  lawosMatterId,
  documentId,
};

describe('AmicOsVaultReadService latest contract', () => {
  it('returns one current exact version with Matter/policy authority and no bytes, storage or history', async () => {
    const f = createHarness();
    await expect(f.service.latest(principal, request)).resolves.toEqual({
      authority_kind: 'amic-vault-api',
      authority_ref: 'amic-vault-api:single-install',
      provider_revision: 'single-install-upload-v1',
      matter_id: lawosMatterId,
      exact_version: {
        document_id: documentId,
        version_id: versionId,
        file_object_id: fileObjectId,
        sha256,
        byte_size: 4096,
        mime_type: 'application/pdf',
      },
      policy_ref: policyRef,
      raw_bytes_included: false,
      storage_locator_returned: false,
      history_included: false,
    });
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('d.matter_id = $3::uuid'),
      [tenantId, documentId, vaultMatterId, versionId]);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('file_security_promotions'))).toBe(true);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('app_lock_internal_latest_authority'),
      [tenantId, actorUserId, documentId, vaultMatterId],
    );
    expect(f.transaction).toHaveBeenCalledWith(tenantId, expect.any(Function), {
      isolationLevel: 'serializable',
    });
  });

  it('fails closed before any version read when ACL authorization is denied', async () => {
    const authorizeInternal = vi.fn(async () => { throw new ForbiddenException({ code: 'PERMISSION_DENIED' }); });
    const f = createHarness({ authorizeInternal });
    await expect(f.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
    expect(f.query.mock.calls.length).toBeGreaterThan(1);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('FROM documents d'))).toBe(false);
  });

  it('fails closed before permission evaluation when the authority fence cannot lock the target', async () => {
    const f = createHarness();
    f.query.mockImplementationOnce(async () => ({ rowCount: 1, rows: [{ matter_id: vaultMatterId }] }))
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ locked: false }] });
    await expect(f.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
    expect(f.authorizeInternal).not.toHaveBeenCalled();
  });

  it('fails closed when the document moved, was deleted, or its current version changed', async () => {
    const movedOrDeleted = createHarness({ target: false });
    await expect(movedOrDeleted.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });

    const changed = createHarness({
      authorizeInternal: vi.fn(async () => ({ versionId: '77777777-7777-4777-8777-777777777777', policyRef })),
    });
    await expect(changed.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
  });

  it('fails closed on provider tenant/account context and unknown Matter mapping', async () => {
    const tenantMismatch = createHarness({ contextSource: 'browser-session' });
    await expect(tenantMismatch.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
    expect(tenantMismatch.query).not.toHaveBeenCalled();

    const wrongAccount = createHarness();
    await expect(wrongAccount.service.latest(principal, { ...request, accountLedgerId: 'other-account' }))
      .rejects.toMatchObject({ status: 403 });
    expect(wrongAccount.query).not.toHaveBeenCalled();

    const unknownMatter = createHarness();
    unknownMatter.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM matters')) return { rowCount: 0, rows: [] };
      throw new Error('latest must stop after unknown Matter');
    });
    await expect(unknownMatter.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
    expect(unknownMatter.authorizeInternal).not.toHaveBeenCalled();
  });

  it('fails closed when canonical authority returns a malformed policy binding', async () => {
    const f = createHarness({
      authorizeInternal: vi.fn(async () => ({ versionId, policyRef: 'invalid' })),
    });
    await expect(f.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ['application/x-hwp', String(AMIC_OS_VAULT_MAX_UPLOAD_BYTES)],
    ['application/vnd.hancom.hwpx', String(AMIC_OS_VAULT_MAX_UPLOAD_BYTES)],
    ['message/rfc822', String(AMIC_OS_VAULT_MAX_UPLOAD_BYTES)],
    ['application/vnd.ms-outlook', String(AMIC_OS_VAULT_MAX_UPLOAD_BYTES)],
    ['application/pdf', String(256 * 1024 * 1024 + 1)],
  ])('returns metadata for promoted %s at %s bytes without portal download limits', async (mimeType, sizeBytes) => {
    const f = createHarness({ mimeType, sizeBytes });
    await expect(f.service.latest(principal, request)).resolves.toMatchObject({
      exact_version: { mime_type: mimeType, byte_size: Number(sizeBytes) },
      raw_bytes_included: false,
      storage_locator_returned: false,
      history_included: false,
    });
  });

  it('fails closed above the authoritative 1 GiB Vault file boundary', async () => {
    const f = createHarness({ sizeBytes: String(AMIC_OS_VAULT_MAX_UPLOAD_BYTES + 1) });
    await expect(f.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
  });

  it('fails closed when PostgreSQL rejects a raced serializable authority snapshot', async () => {
    const f = createHarness();
    f.query.mockImplementationOnce(async () => ({ rowCount: 1, rows: [{ matter_id: vaultMatterId }] }))
      .mockRejectedValueOnce(Object.assign(new Error('serialization failure'), { code: '40001' }));
    await expect(f.service.latest(principal, request)).rejects.toMatchObject({ status: 403 });
    expect(f.authorizeInternal).not.toHaveBeenCalled();
  });
});
