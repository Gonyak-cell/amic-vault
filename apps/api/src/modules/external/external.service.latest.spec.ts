import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExternalService } from './external.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const policyRef = 'a'.repeat(64);

function createHarness({
  permissionEffect = 'ALLOW',
  targetMatterId = matterId,
  dlpAllowed = true,
}: {
  permissionEffect?: 'ALLOW' | 'DENY';
  targetMatterId?: string;
  dlpAllowed?: boolean;
} = {}) {
  const canReadDocument = vi.fn(async () => ({
    effect: permissionEffect,
    reasonCode: permissionEffect === 'ALLOW' ? null : 'PERMISSION_DENIED',
    appliedRules: permissionEffect === 'ALLOW' ? ['document.read:role_allow'] : [],
  }));
  const findDocumentTarget = vi.fn(async () => ({
    matter_id: targetMatterId,
    document_id: documentId,
    version_id: versionId,
    document_status: 'draft',
    document_legal_hold: false,
    matter_legal_hold: false,
  }));
  const evaluateExternalDlp = vi.fn(async () => ({
    allowed: dlpAllowed,
    findingCount: dlpAllowed ? 0 : 1,
    resultHash: policyRef,
  }));
  const service = Object.create(ExternalService.prototype) as ExternalService;
  Object.assign(service as unknown as Record<string, unknown>, {
    documentPermissionService: { canReadDocument },
    findDocumentTarget,
    evaluateExternalDlp,
  });
  return { service, canReadDocument, findDocumentTarget, evaluateExternalDlp };
}

describe('ExternalService internal latest authorization', () => {
  it('allows a read-only document reader without external-sharing management authority', async () => {
    const f = createHarness();
    await expect(f.service.authorizeInternalLatestDocument(
      { tenantId, userId: actorUserId }, matterId, documentId,
    )).resolves.toEqual({ versionId, policyRef });
    expect(f.canReadDocument).toHaveBeenCalledWith({ tenantId, userId: actorUserId }, documentId);
    expect(f.findDocumentTarget).toHaveBeenCalledWith(tenantId, documentId);
    expect(f.evaluateExternalDlp).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['document ACL denial', { permissionEffect: 'DENY' as const }],
    ['Matter mismatch', { targetMatterId: '66666666-6666-4666-8666-666666666666' }],
    ['DLP denial', { dlpAllowed: false }],
  ])('fails closed for %s', async (_label, options) => {
    const f = createHarness(options);
    await expect(f.service.authorizeInternalLatestDocument(
      { tenantId, userId: actorUserId }, matterId, documentId,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });
});
