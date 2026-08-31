import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../../auth/public.decorator';
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
  items: [],
  page_info: {
    page: 1,
    page_size: 25,
    returned_count: 0,
    current_version_only: true as const,
    omitted_result_count: null,
  },
  count_leak_prevented: true as const,
  raw_bytes_included: false as const,
  storage_locator_returned: false as const,
};

function createHarness() {
  const service = {
    list: vi.fn(async () => response),
    search: vi.fn(async () => response),
  };
  const controller = new AmicOsVaultReadController(
    service as unknown as AmicOsVaultReadService,
  );
  const request = { headers: {}, amicOsVaultPrincipal: principal };
  return { controller, request, service };
}

describe('AmicOsVaultReadController', () => {
  it('lets the workload provider guard authenticate read routes without a browser session cookie', () => {
    expect(new Reflector().get(IS_PUBLIC_ROUTE, AmicOsVaultReadController)).toBe(true);
  });

  it('accepts only the bounded document-list contract and normalizes the account binding', async () => {
    const { controller, request, service } = createHarness();

    await expect(controller.list(request, {
      principal: { tenant_id: 'caller-tenant', user_id: 'USER_AMIC_JWSUH' },
      lawos_matter_id: 'matter:1',
      page: 1,
      page_size: 25,
    })).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(principal, {
      accountLedgerId: principal.accountLedgerId,
      lawosMatterId: 'matter:1',
      page: 1,
      pageSize: 25,
      query: null,
      dateFrom: null,
      dateTo: null,
    });

    expect(() => controller.list(request, {
      principal: { tenant_id: 'caller-tenant', user_id: principal.accountLedgerId },
      lawos_matter_id: null,
      page: 1,
      page_size: 25,
      extra: true,
    })).toThrow();
  });

  it('requires current versions, valid calendar dates, and no extra fields', async () => {
    const { controller, request, service } = createHarness();
    const valid = {
      principal: { tenant_id: 'caller-tenant', user_id: principal.accountLedgerId },
      query: '계약 해지',
      lawos_matter_id: null,
      current_version_only: true,
      date_from: '2026-01-01',
      date_to: '2026-08-29',
      page: 1,
      page_size: 25,
    };

    await expect(controller.search(request, valid)).resolves.toBe(response);
    expect(service.search).toHaveBeenCalledWith(principal, expect.objectContaining({
      query: '계약 해지',
      dateFrom: '2026-01-01',
      dateTo: '2026-08-29',
    }));

    expect(() => controller.search(request, {
      ...valid,
      current_version_only: false,
    })).toThrow();
    await expect(controller.search(request, { ...valid, query: '   ' })).resolves.toBe(response);
    expect(service.search).toHaveBeenLastCalledWith(principal, expect.objectContaining({
      query: null,
    }));
    expect(() => controller.search(request, { ...valid, date_from: '2026-02-30' })).toThrow();
    expect(() => controller.search(request, { ...valid, extra: 'no' })).toThrow();
  });

  it('does not call the service without the guard-bound principal', () => {
    const { controller, service } = createHarness();
    expect(() => controller.list({ headers: {} }, {
      principal: { tenant_id: 'caller-tenant', user_id: principal.accountLedgerId },
      lawos_matter_id: null,
      page: 1,
      page_size: 25,
    })).toThrow();
    expect(service.list).not.toHaveBeenCalled();
  });
});
