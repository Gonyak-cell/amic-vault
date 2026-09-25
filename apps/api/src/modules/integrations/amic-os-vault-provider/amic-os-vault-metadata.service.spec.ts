import { describe, expect, it, vi } from 'vitest';
import { AmicOsVaultMetadataService } from './amic-os-vault-metadata.service';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';

const principal: AmicOsVaultProviderPrincipal = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  accountLedgerId: 'user_amic_jwsuh',
};
const documentId = '44444444-4444-4444-8444-444444444444';
const matterId = '33333333-3333-4333-8333-333333333333';
const initial = {
  document_id: documentId, matter_id: matterId, created_by: principal.actorUserId,
  effective_creator_user_id: principal.actorUserId,
  effective_creator_account_ledger_id: principal.accountLedgerId,
  effective_creator_name: '최초 업로더',
  actor_role: 'matter_member', actor_status: 'active', filename: 'original.pdf',
  mime_type: 'application/pdf', metadata_code: null,
  business_info: { description: null, document_type: null, tags: [] },
  metadata_revision: '0',
  created_at: new Date('2026-09-20T01:00:00.000Z'),
  updated_at: new Date('2026-09-20T01:00:00.000Z'),
};
const input = {
  accountLedgerId: principal.accountLedgerId, documentId,
  expectedRevision: 0, filename: 'renamed.pdf', metadataCode: 'LEGACY.CODE',
  businessInfo: { description: '계약', document_type: '계약서', tags: ['최종'] },
};

function harness(row: Record<string, unknown> = initial, readEffect = 'ALLOW') {
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => {
    if (sql.includes('app_lock_internal_latest_authority')) return {
      rowCount: 1, rows: [{ locked: true }],
    };
    if (sql.includes('UPDATE documents')) return {
      rowCount: 1, rows: [{ metadata_revision: '1', updated_at: new Date('2026-09-21T01:00:00.000Z') }],
    };
    return { rowCount: 1, rows: [row] };
  });
  const log = vi.fn(async () => ({ eventId: documentId, createdAt: new Date() }));
  const transaction = vi.fn(async (_tenantId: string, run: (tx: { query: typeof query }) => Promise<unknown>) => run({ query }));
  const canReadMatter = vi.fn(async () => ({ effect: readEffect }));
  const canReadDocument = vi.fn(async () => ({ effect: readEffect }));
  const enqueueCurrentVersionForDocument = vi.fn(async () => {});
  const service = new AmicOsVaultMetadataService(
    { transaction, log } as never,
    { canReadMatter, canReadDocument } as never,
    { require: () => ({ tenantId: principal.tenantId, source: 'amic-os-provider' }) } as never,
    { uploadAuthorityRef: () => 'amic-vault-api:single-install',
      uploadProviderRevision: () => 'single-install-upload-v1' } as never,
    { enqueueCurrentVersionForDocument } as never,
  );
  return { service, query, log, canReadMatter, canReadDocument,
    enqueueCurrentVersionForDocument, transaction };
}

describe('AmicOsVaultMetadataService', () => {
  it('reads exact current metadata only after Matter and document ACLs', async () => {
    const f = harness();
    await expect(f.service.read(principal, { accountLedgerId: principal.accountLedgerId, documentId }))
      .resolves.toMatchObject({ document_id: documentId, creator_user_id: principal.accountLedgerId,
        metadata_code: null, metadata_revision: 0, editable: true });
    expect(f.canReadMatter).toHaveBeenCalledWith({ tenantId: principal.tenantId,
      userId: principal.actorUserId }, matterId);
    expect(f.canReadDocument).toHaveBeenCalledWith({ tenantId: principal.tenantId,
      userId: principal.actorUserId }, documentId);
    await expect(harness(initial, 'DENY').service.read(principal,
      { accountLedgerId: principal.accountLedgerId, documentId })).rejects.toThrow();
  });

  it('uses revision compare-and-swap and writes an audit event without changing a file object', async () => {
    const f = harness();
    await expect(f.service.update(principal, input)).resolves.toMatchObject({
      filename: 'renamed.pdf', metadata_code: 'LEGACY.CODE', metadata_revision: 1,
    });
    const update = f.query.mock.calls.find(([sql]) => sql.includes('UPDATE documents'));
    expect(update?.[0]).toContain('amic_os_metadata_revision = $6');
    expect(update?.[0]).not.toMatch(/UPDATE file_objects|UPDATE document_versions/u);
    expect(f.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DOCUMENT_METADATA_CHANGED', targetId: documentId,
    }), expect.anything());
    expect(f.enqueueCurrentVersionForDocument).toHaveBeenCalledWith({
      tenantId: principal.tenantId, documentId,
    }, expect.anything());
    await expect(f.service.update(principal, { ...input, expectedRevision: 1 }))
      .rejects.toThrow();
  });

  it('allows an active firm administrator with existing read access, and denies other readers', async () => {
    const other = '55555555-5555-4555-8555-555555555555';
    const admin = harness({ ...initial, created_by: other, effective_creator_user_id: other,
      effective_creator_account_ledger_id: 'other-ledger', actor_role: 'firm_admin' });
    await expect(admin.service.update(principal, input)).resolves.toMatchObject({ editable: true });
    const reader = harness({ ...initial, created_by: other, effective_creator_user_id: other,
      effective_creator_account_ledger_id: 'other-ledger' });
    await expect(reader.service.read(principal,
      { accountLedgerId: principal.accountLedgerId, documentId })).resolves.toMatchObject({ editable: false });
    await expect(reader.service.update(principal, input)).rejects.toThrow();
    expect(reader.query.mock.calls.some(([sql]) => sql.includes('UPDATE documents'))).toBe(false);
    const deniedAdmin = harness({ ...initial, created_by: other, effective_creator_user_id: other,
      effective_creator_account_ledger_id: 'other-ledger', actor_role: 'firm_admin' }, 'DENY');
    await expect(deniedAdmin.service.update(principal, input)).rejects.toThrow();
  });

  it('does not attribute an email filing to its service actor or invent an unmapped AMIC identity', async () => {
    const serviceActor = '55555555-5555-4555-8555-555555555555';
    const filed = harness({ ...initial, created_by: serviceActor,
      effective_creator_user_id: principal.actorUserId,
      effective_creator_account_ledger_id: principal.accountLedgerId });
    await expect(filed.service.read(principal, { accountLedgerId: principal.accountLedgerId,
      documentId })).resolves.toMatchObject({ creator_user_id: principal.accountLedgerId, editable: true });
    const unmapped = harness({ ...initial, created_by: serviceActor,
      effective_creator_user_id: serviceActor, effective_creator_account_ledger_id: null });
    await expect(unmapped.service.read(principal, { accountLedgerId: principal.accountLedgerId,
      documentId })).resolves.toMatchObject({ creator_user_id: null, editable: false });
    await expect(unmapped.service.update(principal, input)).rejects.toThrow();
  });

  it('rejects filename mutation of immutable original EML and mismatched account ledger', async () => {
    const email = harness({ ...initial, mime_type: 'message/rfc822', filename: 'original.eml' });
    await expect(email.service.update(principal, input)).rejects.toThrow();
    expect(email.query.mock.calls.some(([sql]) => sql.includes('UPDATE documents'))).toBe(false);
    const wrong = harness();
    await expect(wrong.service.read(principal, { accountLedgerId: 'other-user', documentId }))
      .rejects.toThrow();
    expect(wrong.query).not.toHaveBeenCalled();
  });

  it('fails closed when the current-version authority lock is unavailable', async () => {
    const f = harness();
    f.query.mockImplementation(async (sql: string) => sql.includes('app_lock_internal_latest_authority')
      ? { rowCount: 1, rows: [{ locked: false }] }
      : { rowCount: 1, rows: [initial] });
    await expect(f.service.read(principal, { accountLedgerId: principal.accountLedgerId,
      documentId })).rejects.toThrow();
    await expect(f.service.update(principal, input)).rejects.toThrow();
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE documents'))).toBe(false);
  });
});
