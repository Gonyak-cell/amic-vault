import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { describe, expect, it, vi } from 'vitest';
import { PreviewSessionService } from './preview-session.service';

const tenantId = '11111111-1111-4111-8111-111111111101' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111102';
const documentId = '11111111-1111-4111-8111-111111111103';
const versionId = '11111111-1111-4111-8111-111111111104';
const matterId = '11111111-1111-4111-8111-111111111105';

function target(status = 'active') {
  return { document_id: documentId, matter_id: matterId, status, version_id: versionId };
}

function setup(input?: {
  targetRow?: ReturnType<typeof target> | undefined;
  permission?: { effect: 'ALLOW' | 'DENY'; reasonCode?: string };
  permissionError?: Error;
  auditError?: Error;
}) {
  const query = vi.fn(async () => ({ rows: [input?.targetRow ?? target()], rowCount: 1 }));
  const transactionClient = { query };
  const auditService = {
    transaction: vi.fn(async (_tenantId: string, run: (tx: typeof transactionClient) => Promise<unknown>) =>
      run(transactionClient),
    ),
    log: vi.fn(async () => {
      if (input?.auditError) throw input.auditError;
      return { eventId: 'audit-id', createdAt: new Date() };
    }),
  };
  const permissionService = {
    canReadDocument: vi.fn(async () => {
      if (input?.permissionError) throw input.permissionError;
      return input?.permission ?? { effect: 'ALLOW' as const };
    }),
  };
  const service = new PreviewSessionService(
    auditService as never,
    permissionService as never,
    { require: () => ({ tenantId }) } as never,
  );
  return { service, auditService, permissionService, query, transactionClient };
}

function code(error: unknown): string | undefined {
  if (error instanceof BadRequestException || error instanceof NotFoundException) {
    return (error.getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('PreviewSessionService', () => {
  it('writes only a hash and the one view audit in the same tenant transaction', async () => {
    const { service, auditService, permissionService, query, transactionClient } = setup();

    const issued = await service.issue(actorUserId, documentId);

    expect(issued.previewSessionToken).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(issued.expiresAt).toMatch(/Z$/);
    expect(permissionService.canReadDocument).toHaveBeenCalledWith({ tenantId, userId: actorUserId }, documentId);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO preview_access_sessions'),
      [
        tenantId,
        actorUserId,
        documentId,
        versionId,
        expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        expect.any(Date),
      ],
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOCUMENT_VIEWED', targetId: documentId, matterId }),
      transactionClient,
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(issued.previewSessionToken);
  });

  it.each([
    ['non-member', { effect: 'DENY' as const, reasonCode: 'PERMISSION_DENIED' }],
    ['ethical wall', { effect: 'DENY' as const, reasonCode: 'ETHICAL_WALL_BLOCKED' }],
  ])('denies %s before inserting a session or audit', async (_name, permission) => {
    const { service, auditService, query } = setup({ permission });

    await expect(service.issue(actorUserId, documentId)).rejects.toSatisfy(
      (error: unknown) => code(error) === 'PERMISSION_DENIED',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('fails closed when permission evaluation throws', async () => {
    const { service, auditService, query } = setup({ permissionError: new Error('unavailable') });

    await expect(service.issue(actorUserId, documentId)).rejects.toSatisfy(
      (error: unknown) => code(error) === 'PERMISSION_DENIED',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not issue a token response when the required audit insert fails', async () => {
    const { service, auditService } = setup({ auditError: new Error('audit write failed') });

    await expect(service.issue(actorUserId, documentId)).rejects.toSatisfy(
      (error: unknown) => code(error) === 'PERMISSION_DENIED',
    );
    expect(auditService.log).toHaveBeenCalledOnce();
  });

  it('accepts only an active session bound to the same tenant user document and version', async () => {
    const { service } = setup();
    const query = vi.fn(async () => ({ rows: [{ exists: 1 }], rowCount: 1 }));
    const previewSessionToken = 'dGhpcy1pcy1hLXRlc3QtcHJldmlldy1zZXNzaW9uLXRva2VuXzEyMw';

    await expect(
      service.assertActiveSession(
        { query },
        tenantId,
        actorUserId,
        documentId,
        versionId,
        previewSessionToken,
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('expires_at > now()'),
      [
        tenantId,
        actorUserId,
        documentId,
        versionId,
        expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      ],
    );
  });

  it('denies absent, expired, revoked, or replayed session references without querying storage', async () => {
    const { service } = setup();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const previewSessionToken = 'dGhpcy1pcy1hLXRlc3QtcHJldmlldy1zZXNzaW9uLXRva2VuXzEyMw';

    await expect(
      service.assertActiveSession(
        { query },
        tenantId,
        actorUserId,
        documentId,
        versionId,
        previewSessionToken,
      ),
    ).rejects.toSatisfy((error: unknown) => code(error) === 'PERMISSION_DENIED');
    await expect(
      service.assertActiveSession({ query }, tenantId, actorUserId, documentId, versionId, undefined),
    ).rejects.toSatisfy((error: unknown) => code(error) === 'PERMISSION_DENIED');
  });

  it('keeps deleted documents and locked permission decisions distinct without metadata', async () => {
    const deleted = setup({ targetRow: target('deleted') });
    await expect(deleted.service.issue(actorUserId, documentId)).rejects.toSatisfy(
      (error: unknown) => code(error) === 'DOCUMENT_LOCKED',
    );
    expect(deleted.auditService.log).not.toHaveBeenCalled();

    const locked = setup({ permission: { effect: 'DENY', reasonCode: 'DOCUMENT_LOCKED' } });
    await expect(locked.service.issue(actorUserId, documentId)).rejects.toSatisfy(
      (error: unknown) => code(error) === 'DOCUMENT_LOCKED',
    );
  });
});
