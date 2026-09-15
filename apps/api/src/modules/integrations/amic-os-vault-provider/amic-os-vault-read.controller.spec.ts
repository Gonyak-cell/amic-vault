import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../../auth/public.decorator';
import { AmicOsVaultReadController } from './amic-os-vault-read.controller';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import type { AmicOsVaultReadService } from './amic-os-vault-read.service';
import { PREVIEW_MAX_INPUT_BYTES } from '../../preview/preview-convert.job';
import { PREVIEW_CHUNK_BYTES } from '../../preview/preview.service';

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
const exact = {
  document_id: '44444444-4444-4444-8444-444444444444',
  version_id: '55555555-5555-4555-8555-555555555555',
  file_object_id: '66666666-6666-4666-8666-666666666666',
  sha256: 'a'.repeat(64), byte_size: 4096,
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const previewBody = {
  principal: { tenant_id: 'caller-tenant', user_id: principal.accountLedgerId },
  lawos_matter_id: 'matter:1', requested_exact_version: exact,
};
const preview = { file_object_id: '77777777-7777-4777-8777-777777777777',
  sha256: 'b'.repeat(64), byte_size: 99, mime_type: 'application/pdf' };
const chunkBody = { ...previewBody, preview_session_id: '99999999-9999-4999-8999-999999999999', token: 'a'.repeat(43), preview, offset: 0 };

function createHarness() {
  const service = {
    list: vi.fn(async () => response),
    search: vi.fn(async () => response),
    preparePreview: vi.fn(async () => ({ status: 'pending' })),
    issuePreviewSession: vi.fn(async () => ({ status: 'ready' })),
    previewChunk: vi.fn(async () => ({ final_chunk: true })),
  };
  const controller = new AmicOsVaultReadController(
    service as unknown as AmicOsVaultReadService,
  );
  const request = { headers: {}, amicOsVaultPrincipal: principal };
  return { controller, request, service };
}

describe('AmicOsVaultReadController', () => {
  it('parses exact preview targets and separates polling from explicit queue requests', async () => {
    const f = createHarness();
    await f.controller.preparePreview(f.request, { ...previewBody, enqueue: true });
    expect(f.service.preparePreview).toHaveBeenCalledWith(principal, {
      accountLedgerId: principal.accountLedgerId, lawosMatterId: 'matter:1', exact,
    }, true);
    await f.controller.issuePreviewSession(f.request, previewBody);
    expect(f.service.issuePreviewSession).toHaveBeenCalledWith(principal, expect.objectContaining({ exact }));
    await f.controller.previewChunk(f.request, chunkBody);
    expect(f.service.previewChunk).toHaveBeenCalledWith(principal, expect.objectContaining({
      exact, preview, previewSessionId: chunkBody.preview_session_id, token: chunkBody.token, offset: 0,
    }));
  });

  it.each([
    { ...previewBody },
    { ...previewBody, enqueue: 'true' },
    { ...previewBody, enqueue: true, storage_uri: 's3://private/source' },
    { ...previewBody, enqueue: true, lawos_matter_id: null },
    { ...previewBody, enqueue: true, requested_exact_version: { ...exact, byte_size: PREVIEW_MAX_INPUT_BYTES + 1 } },
    { ...previewBody, enqueue: true, requested_exact_version: { ...exact, sha256: 'invalid' } },
    { ...previewBody, enqueue: true, requested_exact_version: { ...exact, mime_type: 'text/html' } },
  ])('rejects unbounded or forged preparation without calling the service: %#', body => {
    const f = createHarness();
    expect(() => f.controller.preparePreview(f.request, body)).toThrow();
    expect(f.service.preparePreview).not.toHaveBeenCalled();
  });

  it.each([
    { ...chunkBody, token: 'invalid' },
    { ...chunkBody, preview_session_id: 'not-uuid' },
    { ...chunkBody, offset: -1 },
    { ...chunkBody, offset: 1 },
    { ...chunkBody, offset: PREVIEW_CHUNK_BYTES + 1 },
    { ...chunkBody, preview: { ...preview, mime_type: exact.mime_type } },
    { ...chunkBody, authorization: 'untrusted' },
  ])('rejects invalid session credentials, derivative bindings or chunk offsets: %#', body => {
    const f = createHarness();
    expect(() => f.controller.previewChunk(f.request, body)).toThrow();
    expect(f.service.previewChunk).not.toHaveBeenCalled();
  });

  it('requires the provider guard principal for every preview route', () => {
    const f = createHarness();
    expect(() => f.controller.preparePreview({ headers: {} }, { ...previewBody, enqueue: true })).toThrow();
    expect(() => f.controller.issuePreviewSession({ headers: {} }, previewBody)).toThrow();
    expect(() => f.controller.previewChunk({ headers: {} }, chunkBody)).toThrow();
    expect(f.service.preparePreview).not.toHaveBeenCalled();
    expect(f.service.issuePreviewSession).not.toHaveBeenCalled();
    expect(f.service.previewChunk).not.toHaveBeenCalled();
  });

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
