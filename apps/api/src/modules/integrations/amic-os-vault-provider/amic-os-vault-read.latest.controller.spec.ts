import { describe, expect, it, vi } from 'vitest';
import { AmicOsVaultReadController } from './amic-os-vault-read.controller';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import type { AmicOsVaultReadService } from './amic-os-vault-read.service';

const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
};
const response = {
  authority_kind: 'amic-vault-api' as const,
  authority_ref: 'amic-vault-api:single-install',
  provider_revision: 'single-install-upload-v1',
  matter_id: 'matter:1',
  exact_version: {
    document_id: '44444444-4444-4444-8444-444444444444',
    version_id: '55555555-5555-4555-8555-555555555555',
    file_object_id: '66666666-6666-4666-8666-666666666666',
    sha256: 'a'.repeat(64),
    byte_size: 4096,
    mime_type: 'application/pdf',
  },
  policy_ref: 'b'.repeat(64),
  raw_bytes_included: false as const,
  storage_locator_returned: false as const,
  history_included: false as const,
};

function createHarness() {
  const service = {
    latest: vi.fn(async () => response),
  };
  const controller = new AmicOsVaultReadController(service as unknown as AmicOsVaultReadService);
  const request = { headers: {}, amicOsVaultPrincipal: principal };
  return { controller, request, service };
}

describe('AmicOsVaultReadController latest contract', () => {
  it('accepts only the strict principal, Matter and document request', async () => {
    const f = createHarness();
    const body = {
      principal: { tenant_id: 'caller-tenant', user_id: 'USER_AMIC_JWSUH' },
      lawos_matter_id: 'matter:1',
      document_id: response.exact_version.document_id,
    };
    await expect(f.controller.latest(f.request, body)).resolves.toBe(response);
    expect(f.service.latest).toHaveBeenCalledWith(principal, {
      accountLedgerId: principal.accountLedgerId,
      lawosMatterId: 'matter:1',
      documentId: response.exact_version.document_id,
    });
  });

  it.each([
    { lawos_matter_id: null },
    { document_id: 'not-a-uuid' },
    { extra: true },
    { principal: { tenant_id: 'caller-tenant', user_id: 'not valid' } },
  ])('rejects malformed latest requests before service access: %#', bodyPatch => {
    const f = createHarness();
    const body = {
      principal: { tenant_id: 'caller-tenant', user_id: principal.accountLedgerId },
      lawos_matter_id: 'matter:1',
      document_id: response.exact_version.document_id,
      ...bodyPatch,
    };
    expect(() => f.controller.latest(f.request, body)).toThrow();
    expect(f.service.latest).not.toHaveBeenCalled();
  });

  it('requires the provider guard principal and never trusts a caller-only identity', () => {
    const f = createHarness();
    const body = {
      principal: { tenant_id: 'caller-tenant', user_id: principal.accountLedgerId },
      lawos_matter_id: 'matter:1',
      document_id: response.exact_version.document_id,
    };
    expect(() => f.controller.latest({ headers: {} }, body)).toThrow();
    expect(f.service.latest).not.toHaveBeenCalled();
  });
});
