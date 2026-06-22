import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission, type TenantId } from '@amic-vault/shared';
import { DocumentEditingService } from './document-editing.service';
import type { UploadedDiskFile } from './document-upload.service';
import { VersionNumberResolver } from './version-number.resolver';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const documentId = '11111111-1111-4111-8111-1111111111dd';
const matterId = '11111111-1111-4111-8111-1111111111aa';
const baseVersionId = '11111111-1111-4111-8111-1111111111b1';
const editSessionId = '11111111-1111-4111-8111-1111111111e1';
const subversionId = '11111111-1111-4111-8111-1111111111s1';
const promotedVersionId = '11111111-1111-4111-8111-1111111111f4';
const fileObjectId = '11111111-1111-4111-8111-1111111111f1';
const subversionReviewerId = '11111111-1111-4111-8111-1111111111a5';
const subversionReviewId = '11111111-1111-4111-8111-1111111111d1';
const reviewerUserId = '11111111-1111-4111-8111-111111111102';
const hash = 'a'.repeat(64);
const now = new Date('2026-06-22T00:00:00.000Z');
const future = new Date('2099-06-22T01:00:00.000Z');

interface QueryResult {
  rows: unknown[];
  rowCount: number;
}

function targetRow() {
  return {
    document_id: documentId,
    tenant_id: tenantId,
    matter_id: matterId,
    status: 'draft',
    matter_status: 'active',
  };
}

function currentVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    version_id: baseVersionId,
    version_no: 3,
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    edit_session_id: editSessionId,
    document_id: documentId,
    matter_id: matterId,
    base_version_id: baseVersionId,
    base_version_no: 3,
    status: 'active',
    client_kind: 'web_upload',
    lock_owner_user_id: actorUserId,
    checked_out_at: now,
    heartbeat_at: now,
    expires_at: future,
    checked_in_at: null,
    cancelled_at: null,
    expired_at: null,
    conflicted_at: null,
    ...overrides,
  };
}

function subversionRow(overrides: Record<string, unknown> = {}) {
  return {
    subversion_id: subversionId,
    document_id: documentId,
    matter_id: matterId,
    base_version_id: baseVersionId,
    base_version_no: 3,
    subversion_no: 1,
    edit_session_id: editSessionId,
    status: 'saved',
    visibility_scope: 'session_owner',
    file_object_id: fileObjectId,
    file_hash: hash,
    created_by: actorUserId,
    created_at: now,
    submitted_at: null,
    promoted_version_id: null,
    ...overrides,
  };
}

function baseVersionFileRow(overrides: Record<string, unknown> = {}) {
  return {
    version_id: baseVersionId,
    version_no: 3,
    storage_uri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/base-file`,
    original_filename: 'Draft.txt',
    normalized_filename: 'draft.txt',
    mime_type: 'text/plain',
    size_bytes: 32,
    sha256: hash,
    ...overrides,
  };
}

function subversionFileRow(overrides: Record<string, unknown> = {}) {
  return {
    storage_uri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
    original_filename: 'Draft Review.docx',
    normalized_filename: 'draft-review.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size_bytes: 42,
    sha256: hash,
    ...overrides,
  };
}

function subversionReviewerRow(overrides: Record<string, unknown> = {}) {
  return {
    subversion_reviewer_id: subversionReviewerId,
    subversion_id: subversionId,
    document_id: documentId,
    reviewer_user_id: reviewerUserId,
    assigned_by: actorUserId,
    status: 'active',
    created_at: now,
    revoked_at: null,
    reviewer_display_email: 'alpha.reviewer@example.test',
    reviewer_display_name: 'Alpha Reviewer',
    ...overrides,
  };
}

function subversionReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    subversion_review_id: subversionReviewId,
    subversion_reviewer_id: subversionReviewerId,
    subversion_id: subversionId,
    document_id: documentId,
    reviewer_user_id: reviewerUserId,
    decision: 'approved',
    decided_at: now,
    reviewer_display_email: 'alpha.reviewer@example.test',
    reviewer_display_name: 'Alpha Reviewer',
    ...overrides,
  };
}

async function tempUploadFile(name = 'Draft.pdf', content = '%PDF-1.7 draft'): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-edit-test-'));
  const path = join(dir, name);
  await writeFile(path, content);
  return {
    path,
    originalname: name,
    mimetype: 'application/pdf',
    size: Buffer.byteLength(content),
  };
}

async function drainBody(body: Buffer | Readable): Promise<void> {
  if (Buffer.isBuffer(body)) return;
  for await (const chunk of body) {
    void chunk;
  }
}

function createService() {
  const query = vi.fn(
    async (_sql: string, _params?: readonly unknown[]): Promise<QueryResult> => {
      void _sql;
      void _params;
      return {
        rowCount: 0,
        rows: [],
      };
    },
  );
  const tx = { query };
  const transaction = vi.fn(async (_tenant: string, run: (client: never) => Promise<unknown>) =>
    run(tx as never),
  );
  const auditLog = vi.fn(async (event: { action: string }) => ({
    eventId: `audit-${event.action}`,
    createdAt: now,
  }));
  const createFileObject = vi.fn(async () => undefined);
  const putTenantObject = vi.fn(
    async (input: { body: Buffer | Readable; fileObjectId: string; documentId: string }) => {
      await drainBody(input.body);
      return {
        key: `tenants/${tenantId}/matters/${matterId}/documents/${input.documentId}/${input.fileObjectId}`,
        storageUri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${input.documentId}/${input.fileObjectId}`,
        encryptionKeyId: null,
      };
    },
  );
  const getByStorageUri = vi.fn(async () => ({
    key: `tenants/${tenantId}/matters/${matterId}/documents/${documentId}/base-file`,
    contentLength: 32,
    contentType: 'text/plain',
    etag: null,
    body: Readable.from(['native draft body']),
  }));
  const deleteByStorageUri = vi.fn(async () => undefined);
  const enqueueVersionCreated = vi.fn(async () => 'extraction-job-id');
  const enqueueVersion = vi.fn(async () => undefined);
  const permissionService = {
    canCheckoutDocument: vi.fn(async () => allowPermission()),
    canReadDocumentSubversion: vi.fn(async () => allowPermission()),
    canSaveDocumentSubversion: vi.fn(async () => allowPermission()),
    canCheckInDocument: vi.fn(async () => allowPermission()),
    canPromoteDocumentVersion: vi.fn(async () => allowPermission()),
  };
  const service = new DocumentEditingService(
    { transaction, log: auditLog } as never,
    { create: createFileObject } as never,
    permissionService as never,
    { putTenantObject, getByStorageUri, deleteByStorageUri } as never,
    { require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }) } as never,
    new VersionNumberResolver(),
    { enqueueVersionCreated } as never,
    { enqueueVersion } as never,
  );
  return {
    auditLog,
    createFileObject,
    deleteByStorageUri,
    enqueueVersion,
    enqueueVersionCreated,
    permissionService,
    getByStorageUri,
    putTenantObject,
    query,
    service,
  };
}

describe('DocumentEditingService', () => {
  it('checks out the current official version into an active edit session', async () => {
    const { auditLog, permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [currentVersionRow()] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const response = await service.checkout(actorUserId, documentId, {
      idempotencyKey: 'checkout-1',
      clientKind: 'outlook',
      checkoutReasonCode: 'EMAIL_DRAFT',
    });

    expect(response).toMatchObject({
      editSessionId,
      baseVersionId,
      baseVersionNo: 3,
      status: 'active',
    });
    expect(permissionService.canCheckoutDocument).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(query.mock.calls[3]?.[0]).toContain('INSERT INTO document_edit_sessions');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_CHECKED_OUT',
        metadata: expect.objectContaining({
          edit_session_id: editSessionId,
          base_version_id: baseVersionId,
          client_kind: 'outlook',
        }),
      }),
      expect.anything(),
    );
  });

  it('returns the active session when the same actor retries checkout for the same base version', async () => {
    const { auditLog, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [currentVersionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] });

    const response = await service.checkout(actorUserId, documentId, {
      idempotencyKey: 'checkout-1',
      clientKind: 'web_upload',
      checkoutReasonCode: 'WEB_EDIT',
    });

    expect(response).toMatchObject({
      editSessionId,
      baseVersionId,
      status: 'active',
      lockOwnerUserId: actorUserId,
    });
    expect(auditLog).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('records a lock-expired audit when active-session lookup observes an expired lock', async () => {
    const { auditLog, permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [sessionRow({ expires_at: new Date('2000-01-01T00:00:00.000Z') })],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await expect(service.getActiveSession(actorUserId, documentId)).resolves.toBeNull();

    expect(permissionService.canReadDocumentSubversion).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_LOCK_EXPIRED',
        metadata: expect.objectContaining({
          edit_session_id: editSessionId,
          base_version_id: baseVersionId,
          reason_code: 'EDIT_SESSION_EXPIRED',
        }),
      }),
      expect.anything(),
    );
    expect(query.mock.calls[2]?.[0]).toContain("SET status = 'expired'");
  });

  it('saves an internal subversion without creating an official extraction or search job', async () => {
    const {
      auditLog,
      createFileObject,
      enqueueVersion,
      enqueueVersionCreated,
      putTenantObject,
      query,
      service,
    } = createService();
    const file = await tempUploadFile();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ next_no: 2 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionRow({
            subversion_no: 2,
            file_object_id: fileObjectId,
            file_hash: '2bf0cc2ebaba20d1b227e6c87028676e88b0dd44a62800aad4de2fcc92e6dfc0',
          }),
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const response = await service.saveSubversion({
      actorUserId,
      documentId,
      editSessionId,
      fields: { visibilityScope: 'matter_editors', saveReasonCode: 'AUTOSAVE' },
      file,
    });

    expect(response.displayVersion).toBe('v3.2');
    expect(response.status).toBe('saved');
    expect(putTenantObject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, matterId, documentId }),
    );
    expect(createFileObject).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'document_edit',
        sha256: '2bf0cc2ebaba20d1b227e6c87028676e88b0dd44a62800aad4de2fcc92e6dfc0',
      }),
      expect.anything(),
    );
    expect(enqueueVersionCreated).not.toHaveBeenCalled();
    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_SUBVERSION_SAVED',
        metadata: expect.objectContaining({
          subversion_no: 2,
          visibility_scope: 'matter_editors',
          reason_code: 'AUTOSAVE',
        }),
      }),
      expect.anything(),
    );
  });

  it('returns an existing subversion when a client save id is retried', async () => {
    const {
      auditLog,
      createFileObject,
      enqueueVersion,
      enqueueVersionCreated,
      putTenantObject,
      query,
      service,
    } = createService();
    const file = await tempUploadFile();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [subversionRow({ subversion_no: 2, visibility_scope: 'matter_editors' })],
      });

    const response = await service.saveSubversion({
      actorUserId,
      documentId,
      editSessionId,
      fields: {
        visibilityScope: 'matter_editors',
        clientSaveId: 'native-save-2026:0001',
      },
      file,
    });

    expect(response).toMatchObject({
      subversionId,
      displayVersion: 'v3.2',
      visibilityScope: 'matter_editors',
    });
    expect(putTenantObject).not.toHaveBeenCalled();
    expect(createFileObject).not.toHaveBeenCalled();
    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(enqueueVersionCreated).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('lists internal subversions with structured review gate status', async () => {
    const { query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionRow({
            status: 'submitted',
            visibility_scope: 'reviewers',
            active_reviewers: 2,
            approved_reviews: 1,
            changes_requested_reviews: 0,
          }),
        ],
      });

    await expect(service.listSubversions(actorUserId, documentId)).resolves.toEqual({
      items: [
        expect.objectContaining({
          subversionId,
          displayVersion: 'v3.1',
          status: 'submitted',
          reviewGate: {
            status: 'pending',
            activeReviewerCount: 2,
            approvedReviewCount: 1,
            changesRequestedCount: 0,
          },
        }),
      ],
    });
    expect(query.mock.calls[1]?.[0]).toContain('document_subversion_review_decisions');
  });

  it('rejects edit package save-back when the expected base file hash is stale', async () => {
    const { putTenantObject, query, service } = createService();
    const file = await tempUploadFile();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [baseVersionFileRow()] });

    await expect(
      service.saveSubversion({
        actorUserId,
        documentId,
        editSessionId,
        fields: {
          editPackageMode: 'vault_text',
          expectedBaseSha256: 'b'.repeat(64),
          visibilityScope: 'matter_editors',
        },
        file,
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'base_version_stale' },
    });
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('assigns and revokes internal subversion reviewers with audit events', async () => {
    const { auditLog, permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionRow({ visibility_scope: 'reviewers' })] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionReviewerRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionRow({ visibility_scope: 'reviewers' })] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [subversionReviewerRow({ status: 'revoked', revoked_at: now })],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await expect(
      service.assignReviewer(actorUserId, documentId, subversionId, {
        reviewerUserId,
      }),
    ).resolves.toMatchObject({
      subversionReviewerId,
      subversionId,
      documentId,
      reviewerUserId,
      status: 'active',
    });
    await expect(
      service.revokeReviewer(actorUserId, documentId, subversionId, reviewerUserId),
    ).resolves.toMatchObject({
      subversionReviewerId,
      reviewerUserId,
      status: 'revoked',
      revokedAt: now.toISOString(),
    });

    expect(permissionService.canCheckInDocument).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED',
        metadata: expect.objectContaining({
          subversion_id: subversionId,
          subversion_reviewer_id: subversionReviewerId,
          target_user_id: reviewerUserId,
        }),
      }),
      expect.anything(),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_SUBVERSION_REVIEWER_REVOKED',
        metadata: expect.objectContaining({
          subversion_id: subversionId,
          subversion_reviewer_id: subversionReviewerId,
          target_user_id: reviewerUserId,
        }),
      }),
      expect.anything(),
    );
  });

  it('lists internal subversion reviewers only after subversion visibility is satisfied', async () => {
    const { permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionRow({ visibility_scope: 'reviewers' })] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionReviewerRow()] });

    await expect(service.listReviewers(actorUserId, documentId, subversionId)).resolves.toEqual({
      items: [
        expect.objectContaining({
          displayEmail: 'alpha.reviewer@example.test',
          displayName: 'Alpha Reviewer',
          reviewerUserId,
          safeLabel: 'Alpha Reviewer · alpha.reviewer@example.test',
          status: 'active',
          subversionId,
        }),
      ],
    });

    expect(permissionService.canReadDocumentSubversion).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(query.mock.calls[1]?.[0]).toContain('reviewer.reviewer_user_id = $4');
    expect(query.mock.calls[2]?.[0]).toContain('FROM document_subversion_reviewers reviewer');
  });

  it('does not list reviewer ACLs for subversions hidden from the actor', async () => {
    const { query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(service.listReviewers(actorUserId, documentId, subversionId)).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('lists structured subversion review decisions only after subversion visibility is satisfied', async () => {
    const { permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionRow({ visibility_scope: 'reviewers' })] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionReviewRow()] });

    await expect(service.listReviewDecisions(actorUserId, documentId, subversionId)).resolves.toEqual({
      items: [
        expect.objectContaining({
          decision: 'approved',
          displayEmail: 'alpha.reviewer@example.test',
          displayName: 'Alpha Reviewer',
          reviewerUserId,
          safeLabel: 'Alpha Reviewer · alpha.reviewer@example.test',
          subversionId,
          subversionReviewId,
          subversionReviewerId,
        }),
      ],
    });

    expect(permissionService.canReadDocumentSubversion).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(query.mock.calls[1]?.[0]).toContain('reviewer.reviewer_user_id = $4');
    expect(query.mock.calls[2]?.[0]).toContain('FROM document_subversion_review_decisions review');
  });

  it('submits a reviewer decision with reference-only audit metadata', async () => {
    const { auditLog, permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [subversionRow({ visibility_scope: 'reviewers', created_by: actorUserId })],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionReviewRow({
            decision: 'changes_requested',
            reviewer_user_id: actorUserId,
          }),
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await expect(
      service.submitReviewDecision(actorUserId, documentId, subversionId, {
        decision: 'changes_requested',
      }),
    ).resolves.toMatchObject({
      decision: 'changes_requested',
      reviewerUserId: actorUserId,
      safeLabel: 'Alpha Reviewer · alpha.reviewer@example.test',
      subversionReviewId,
      subversionReviewerId,
    });

    expect(permissionService.canReadDocumentSubversion).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(query.mock.calls[2]?.[0]).toContain('INSERT INTO document_subversion_review_decisions');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_SUBVERSION_REVIEW_SUBMITTED',
        metadata: expect.objectContaining({
          review_decision: 'changes_requested',
          subversion_id: subversionId,
          subversion_review_id: subversionReviewId,
          subversion_reviewer_id: subversionReviewerId,
          target_user_id: actorUserId,
        }),
      }),
      expect.anything(),
    );
  });

  it('rejects subversion review decisions from non-reviewer actors', async () => {
    const { auditLog, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [subversionRow({ visibility_scope: 'reviewers', created_by: actorUserId })],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      service.submitReviewDecision(actorUserId, documentId, subversionId, {
        decision: 'approved',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });

    expect(auditLog).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('opens a visible internal subversion file with bounded audit metadata', async () => {
    const { auditLog, getByStorageUri, permissionService, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [subversionRow({ status: 'submitted', visibility_scope: 'reviewers' })],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionFileRow()] });

    const response = await service.getSubversionFile(actorUserId, documentId, subversionId);

    expect(response).toMatchObject({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentLength: 42,
      filename: 'draft-review.docx',
      sha256: hash,
    });
    expect(permissionService.canReadDocumentSubversion).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(getByStorageUri).toHaveBeenCalledWith(
      tenantId,
      `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_DOWNLOADED',
        metadata: expect.objectContaining({
          document_id: documentId,
          hash,
          reason_code: 'SUBVERSION_REVIEW_FILE',
          subversion_id: subversionId,
          version_id: baseVersionId,
        }),
      }),
      expect.anything(),
    );
  });

  it('opens a native draft from the active edit session base file', async () => {
    const { getByStorageUri, permissionService, query, service } = createService();
    const content = 'native draft body';
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [baseVersionFileRow({ size_bytes: Buffer.byteLength(content), sha256: hash })],
      });

    const response = await service.getNativeDraft(actorUserId, documentId, editSessionId);

    expect(response).toMatchObject({
      documentId,
      editSessionId,
      baseVersionId,
      baseVersionNo: 3,
      filename: 'Draft.txt',
      mimeType: 'text/plain',
      content,
      sizeBytes: Buffer.byteLength(content),
      sha256: hash,
    });
    expect(permissionService.canSaveDocumentSubversion).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      documentId,
    );
    expect(getByStorageUri).toHaveBeenCalledWith(
      tenantId,
      `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/base-file`,
    );
  });

  it('builds a session-scoped edit package without exposing storage URIs', async () => {
    const { query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          baseVersionFileRow({
            original_filename: 'Draft.docx',
            normalized_filename: 'draft.docx',
            mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size_bytes: 2048,
          }),
        ],
      });

    const response = await service.getEditPackage(actorUserId, documentId, editSessionId);

    expect(response).toMatchObject({
      documentId,
      editSessionId,
      baseVersionId,
      baseVersionNo: 3,
      filename: 'Draft.docx',
      mode: 'binary_roundtrip',
      canOpenInVaultEditor: false,
      nativeDraftUrl: null,
      baseFileUrl: `/v1/documents/${documentId}/edit-sessions/${editSessionId}/base-file`,
      saveSubversionUrl: `/v1/documents/${documentId}/edit-sessions/${editSessionId}/subversions`,
    });
    expect(response).not.toHaveProperty('storageUri');
  });

  it('streams the edit base file through the active session and records audit', async () => {
    const { auditLog, getByStorageUri, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [baseVersionFileRow({ size_bytes: 17 })],
      });

    const response = await service.getEditBaseFile(actorUserId, documentId, editSessionId);

    expect(response).toMatchObject({
      contentType: 'text/plain',
      contentLength: 17,
      filename: 'draft.txt',
      sha256: hash,
    });
    expect(getByStorageUri).toHaveBeenCalledWith(
      tenantId,
      `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/base-file`,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_DOWNLOADED',
        metadata: expect.objectContaining({
          version_id: baseVersionId,
          reason_code: 'EDIT_SESSION_BASE_FILE',
        }),
      }),
      expect.anything(),
    );
  });

  it('saves a native draft as an internal subversion without official indexing jobs', async () => {
    const {
      auditLog,
      createFileObject,
      enqueueVersion,
      enqueueVersionCreated,
      putTenantObject,
      query,
      service,
    } = createService();
    const content = 'updated native draft';
    const expectedHash = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [baseVersionFileRow({ size_bytes: Buffer.byteLength(content), sha256: hash })],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ next_no: 3 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionRow({
            subversion_no: 3,
            file_object_id: fileObjectId,
            file_hash: expectedHash,
            visibility_scope: 'matter_editors',
          }),
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const response = await service.saveNativeDraft(actorUserId, documentId, editSessionId, {
      clientSaveId: 'native-save-2026:0001',
      content,
      saveReasonCode: 'NATIVE_SAVE',
      visibilityScope: 'matter_editors',
    });

    expect(response.displayVersion).toBe('v3.3');
    expect(putTenantObject).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        matterId,
        documentId,
        contentLength: Buffer.byteLength(content),
        contentType: 'text/plain',
      }),
    );
    expect(createFileObject).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'document_edit',
        originalFilename: 'Draft.txt',
        normalizedFilename: 'draft.txt',
        mimeType: 'text/plain',
        sha256: expectedHash,
      }),
      expect.anything(),
    );
    expect(enqueueVersionCreated).not.toHaveBeenCalled();
    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_SUBVERSION_SAVED',
        metadata: expect.objectContaining({
          subversion_no: 3,
          visibility_scope: 'matter_editors',
          reason_code: 'NATIVE_SAVE',
        }),
      }),
      expect.anything(),
    );
  });

  it('checks in the latest saved subversion and closes the edit session', async () => {
    const { auditLog, query, service } = createService();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [sessionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [subversionRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [sessionRow({ status: 'checked_in', checked_in_at: now })],
      });

    const response = await service.checkIn(actorUserId, documentId, editSessionId, {
      expectedLastSubversionId: subversionId,
    });

    expect(response.status).toBe('checked_in');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_CHECKED_IN',
        metadata: expect.objectContaining({ subversion_id: subversionId }),
      }),
      expect.anything(),
    );
  });

  it('promotes a submitted subversion into the next official version', async () => {
    const { auditLog, enqueueVersion, enqueueVersionCreated, query, service } = createService();
    const submittedAt = new Date('2026-06-22T00:05:00.000Z');
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [subversionRow({ status: 'submitted', submitted_at: submittedAt })],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ active_reviewers: 0, approved_reviews: 0, changes_requested_reviews: 0 }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [targetRow()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [currentVersionRow({ version_id: baseVersionId })],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            version_id: promotedVersionId,
            document_id: documentId,
            version_no: 4,
            version_status: 'current',
            file_object_id: fileObjectId,
            file_hash: hash,
            created_by: actorUserId,
            created_at: now,
            supersedes_version_id: baseVersionId,
            promoted_from_subversion_id: subversionId,
            published_at: now,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const response = await service.promote(actorUserId, documentId, subversionId, {
      expectedBaseVersionId: baseVersionId,
      publishReasonCode: 'CLIENT_READY',
      idempotencyKey: 'promote-1',
    });

    expect(response).toMatchObject({
      documentId,
      subversionId,
      promotedVersionId,
      versionNo: 4,
      supersedesVersionId: baseVersionId,
    });
    expect(enqueueVersion).toHaveBeenCalledWith(
      { tenantId, documentId, versionId: baseVersionId },
      expect.anything(),
    );
    expect(enqueueVersionCreated).toHaveBeenCalledWith(
      { tenantId, documentId, versionId: promotedVersionId, fileObjectId },
      expect.anything(),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_VERSION_PROMOTED',
        metadata: expect.objectContaining({
          subversion_id: subversionId,
          promoted_version_id: promotedVersionId,
          version_no: 4,
          reason_code: 'CLIENT_READY',
        }),
      }),
      expect.anything(),
    );
  });

  it('returns the existing official version when a promoted subversion is retried', async () => {
    const { auditLog, enqueueVersion, enqueueVersionCreated, query, service } = createService();
    const publishedAt = new Date('2026-06-22T00:06:00.000Z');
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionRow({
            status: 'promoted',
            submitted_at: now,
            promoted_version_id: promotedVersionId,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            version_id: promotedVersionId,
            document_id: documentId,
            version_no: 4,
            version_status: 'current',
            file_object_id: fileObjectId,
            file_hash: hash,
            created_by: actorUserId,
            created_at: now,
            supersedes_version_id: baseVersionId,
            promoted_from_subversion_id: subversionId,
            published_at: publishedAt,
          },
        ],
      });

    const response = await service.promote(actorUserId, documentId, subversionId, {
      expectedBaseVersionId: baseVersionId,
      publishReasonCode: 'CLIENT_READY',
      idempotencyKey: 'promote-1',
    });

    expect(response).toMatchObject({
      documentId,
      subversionId,
      promotedVersionId,
      versionNo: 4,
      supersedesVersionId: baseVersionId,
      promotedFromSubversionId: subversionId,
      publishedAt: publishedAt.toISOString(),
    });
    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(enqueueVersionCreated).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('blocks promotion when an active reviewer requested changes', async () => {
    const { auditLog, enqueueVersion, enqueueVersionCreated, query, service } = createService();
    const submittedAt = new Date('2026-06-22T00:05:00.000Z');
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionRow({
            status: 'submitted',
            submitted_at: submittedAt,
            visibility_scope: 'reviewers',
          }),
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ active_reviewers: 1, approved_reviews: 0, changes_requested_reviews: 1 }],
      });

    await expect(
      service.promote(actorUserId, documentId, subversionId, {
        expectedBaseVersionId: baseVersionId,
        idempotencyKey: 'promote-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'review_changes_requested' },
    });

    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(enqueueVersionCreated).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('requires all active reviewers to approve before promotion', async () => {
    const { auditLog, query, service } = createService();
    const submittedAt = new Date('2026-06-22T00:05:00.000Z');
    query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          subversionRow({
            status: 'submitted',
            submitted_at: submittedAt,
            visibility_scope: 'reviewers',
          }),
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ active_reviewers: 2, approved_reviews: 1, changes_requested_reviews: 0 }],
      });

    await expect(
      service.promote(actorUserId, documentId, subversionId, {
        expectedBaseVersionId: baseVersionId,
        idempotencyKey: 'promote-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'review_required' },
    });

    expect(auditLog).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
