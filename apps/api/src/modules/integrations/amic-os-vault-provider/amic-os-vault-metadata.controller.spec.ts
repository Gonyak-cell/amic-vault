import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../../auth/public.decorator';
import { AmicOsVaultMetadataController } from './amic-os-vault-metadata.controller';

const request = { headers: {}, amicOsVaultPrincipal: {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  accountLedgerId: 'user_amic_jwsuh',
} };
const principal = { tenant_id: 'caller-tenant', user_id: 'USER_AMIC_JWSUH' };
const documentId = '44444444-4444-4444-8444-444444444444';
const update = {
  principal, document_id: documentId, expected_revision: 0,
  filename: 'renamed.pdf', metadata_code: 'LEGACY.CODE',
  business_info: { description: null, document_type: null, tags: [] },
};

function harness() {
  const service = { read: vi.fn(async () => ({})), update: vi.fn(async () => ({})) };
  return { service, controller: new AmicOsVaultMetadataController(service as never) };
}

describe('AmicOsVaultMetadataController', () => {
  it('binds provider identity and the exact read/update contract', async () => {
    const { service, controller } = harness();
    expect(new Reflector().get(IS_PUBLIC_ROUTE, AmicOsVaultMetadataController)).toBe(true);
    await controller.read(request, { principal, document_id: documentId });
    await controller.update(request, update);
    expect(service.read).toHaveBeenCalledWith(request.amicOsVaultPrincipal, {
      accountLedgerId: 'user_amic_jwsuh', documentId,
    });
    expect(service.update).toHaveBeenCalledWith(request.amicOsVaultPrincipal, {
      accountLedgerId: 'user_amic_jwsuh', documentId,
      expectedRevision: 0, filename: 'renamed.pdf', metadataCode: 'LEGACY.CODE',
      businessInfo: update.business_info,
    });
  });

  it('rejects missing fields, unknown fields and malformed business values before service invocation', () => {
    const { service, controller } = harness();
    for (const invalid of [
      { ...update, expected_revision: undefined },
      { ...update, metadata_code: 'bad code' },
      { ...update, filename: '../unsafe.pdf' },
      { ...update, business_info: { description: 'x', document_type: null, tags: ['same', 'same'] } },
      { ...update, business_info: { description: null, document_type: null, tags: [], raw: 'secret' } },
      { ...update, creator_user_id: 'forged' },
    ]) expect(() => controller.update(request, invalid)).toThrow();
    expect(service.update).not.toHaveBeenCalled();
  });
});
