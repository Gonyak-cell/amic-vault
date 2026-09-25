import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../../audit/audit.service';
import type { DlpService } from '../../dlp/dlp.service';
import type { DocumentVersionService } from '../../document/document-version.service';
import type { FileScanQueueService } from '../../file-security/file-scan-queue.service';
import type { ClientDocumentAction, ClientDocumentAuthorityContext } from '../../permission/client-document-authority';
import type { PermissionService } from '../../permission/permission.service';
import type { FileObjectService } from '../../storage/file-object.service';
import type { StorageService } from '../../storage/storage.service';
import type { ClientDocumentEnvelope } from './amic-os-vault-client.contract';
import { clientWorkspaceRef } from './amic-os-vault-client.contract';
import { AmicOsVaultClientService } from './amic-os-vault-client.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111112';
const scopeId = '11111111-1111-4111-8111-111111111113';
const documentId = '11111111-1111-4111-8111-111111111114';
const versionId = '11111111-1111-4111-8111-111111111115';
const fileObjectId = '11111111-1111-4111-8111-111111111116';
const bytes = Buffer.from('synthetic exact client document bytes');
const digest = createHash('sha256').update(bytes).digest('hex');
const storageUri = `s3://synthetic/tenants/${tenantId}/clients/${scopeId}/documents/${documentId}/${fileObjectId}`;

function fixture(action: ClientDocumentAction = 'dms:document:download') {
  const authority = { tenantId, actorUserId, osTenantId: 'lawos-test', partyId: 'party-1',
    workspaceRef: clientWorkspaceRef('lawos-test', 'party-1'), action,
    decisionRef: 'synthetic-decision', requestId: 'synthetic-request' };
  const envelope = { schema_version: 'amic-os.client-documents.v1', request_id: authority.requestId,
    principal: { tenant_id: authority.osTenantId, user_id: 'account-ledger-1' },
    scope: { type: 'client_documents', party_id: authority.partyId, workspace_ref: authority.workspaceRef },
    authorization: { decision: 'allow', decision_ref: authority.decisionRef,
      action: authority.action, checked_at: new Date().toISOString() },
    input: { document_id: documentId, version_id: versionId } } as ClientDocumentEnvelope;
  const entry = { document_id: documentId, title: 'Synthetic registry', status: 'draft',
    created_at: new Date(), updated_at: new Date(), client_metadata_revision: 0,
    client_document_metadata: null, current_version_id: versionId, version_id: versionId,
    version_no: 1, file_object_id: fileObjectId, file_hash: digest, sha256: digest,
    size_bytes: String(bytes.length), mime_type: 'application/pdf', storage_uri: storageUri,
    version_created_at: new Date(), version_created_by: actorUserId, legal_hold: false };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM client_document_scopes')) return { rows: [{ client_scope_id: scopeId, status: 'active' }], rowCount: 1 };
    if (sql.includes('FROM documents d')) return { rows: [entry], rowCount: 1 };
    throw new Error('unexpected synthetic query');
  });
  const tx = { query } as unknown as QueryClient;
  const audit = { transaction: vi.fn(async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) => run(tx)),
    log: vi.fn(async () => ({ eventId: '11111111-1111-4111-8111-111111111117' })) };
  const permissions = { canAccessClientScope: vi.fn(async () => ({ effect: 'ALLOW' })),
    canReadDocument: vi.fn(async () => ({ effect: 'ALLOW' })),
    canDownloadDocument: vi.fn(async () => ({ effect: 'ALLOW' })) };
  const getByStorageUri = vi.fn(async () => ({ body: Readable.from([bytes]), contentLength: bytes.length,
    contentType: 'application/pdf' }));
  const storage = { getByStorageUri, sha256ByStorageUri: vi.fn(async () => digest) };
  const dlp = { evaluateClientDocumentDownload: vi.fn(async () => ({ allowed: true })) };
  const service = new AmicOsVaultClientService(audit as unknown as AuditService,
    permissions as unknown as PermissionService,
    { current: () => authority } as unknown as ClientDocumentAuthorityContext,
    storage as unknown as StorageService, {} as FileObjectService, {} as DocumentVersionService,
    dlp as unknown as DlpService, {} as FileScanQueueService);
  return { service, envelope, authority, permissions, getByStorageUri, dlp, audit, entry };
}

describe('AMIC OS Client exact-version provider', () => {
  it('projects Vault lifecycle to the OS contract without changing document visibility', async () => {
    const { service, envelope, entry, permissions } = fixture('dms:document:read');
    envelope.input = { document_id: documentId };
    for (const [vaultStatus, legalHold, expected] of [
      ['draft', false, 'active'], ['internal_review', false, 'active'],
      ['draft', true, 'held'], ['disposal_locked', false, 'held'],
      ['archived', false, 'archived'],
    ] as const) {
      entry.status = vaultStatus;
      entry.legal_hold = legalHold;
      const response = await service.execute('metadata/read', envelope);
      expect((response.body as { result: { document: { status: string } } }).result.document.status).toBe(expected);
    }
    expect(permissions.canReadDocument).toHaveBeenCalledTimes(5);
  });

  it('returns exact bytes with digest and audit only after current permission and DLP allow', async () => {
    const { service, envelope, getByStorageUri, dlp, audit } = fixture();
    const response = await service.execute('documents/download', envelope);
    const body = response.body as { result: { download: unknown } };
    expect(response.status).toBe(200);
    expect(body.result.download).toMatchObject({ encoding: 'base64',
      content_base64: bytes.toString('base64'), sha256: digest, byte_size: bytes.length,
      independent_digest_readback: true });
    expect(dlp.evaluateClientDocumentDownload).toHaveBeenCalledWith(expect.anything(), {
      tenantId, documentId, versionId, userId: actorUserId,
    });
    expect(getByStorageUri).toHaveBeenCalledWith(tenantId, storageUri);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_DOWNLOADED' }),
      expect.anything());
    expect(JSON.stringify(response.body)).not.toContain(storageUri);
  });

  it('blocks a retained version handle after permission revocation before reading bytes', async () => {
    const { service, envelope, permissions, getByStorageUri } = fixture();
    permissions.canDownloadDocument.mockResolvedValue({ effect: 'DENY' });
    await expect(service.execute('documents/download', envelope)).rejects.toThrow();
    expect(getByStorageUri).not.toHaveBeenCalled();
  });

  it('blocks a changed storage digest before returning bytes', async () => {
    const { service, envelope, getByStorageUri } = fixture();
    getByStorageUri.mockResolvedValue({ body: Readable.from([Buffer.from('tampered')]),
      contentLength: bytes.length, contentType: 'application/pdf' });
    await expect(service.execute('documents/download', envelope)).rejects.toThrow();
  });
});
