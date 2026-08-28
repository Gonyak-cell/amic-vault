import { StreamableFile } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AmicOsVaultProviderController } from './amic-os-vault-provider.controller';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import type { AmicOsVaultProviderService } from './amic-os-vault-provider.service';

const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
};
const exactVersion = {
  document_id: '33333333-3333-4333-8333-333333333333',
  version_id: '44444444-4444-4444-8444-444444444444',
  file_object_id: '55555555-5555-4555-8555-555555555555',
  sha256: 'a'.repeat(64),
  byte_size: 5,
  mime_type: 'application/pdf',
};
const correlationId = `vaultcorr_${'2'.repeat(32)}`;
const attachmentName = "client's (final).pdf";
const authorization = {
  authority_kind: 'amic-vault-api' as const,
  authority_ref: 'amic-vault-api:oa12',
  provider_revision: 'oa12-exact-copy-v1',
  state: 'authorized' as const,
  provider_export_ref: 'vault-export:66666666-6666-4666-8666-666666666666',
  expires_at: '2026-08-29T00:00:45.000Z',
  exact_version: exactVersion,
  attachment_name: attachmentName,
  decisions: {
    permission: { effect: 'allow' as const, decision_ref: 'vault-permission:allow' },
    ethical_wall: { effect: 'allow' as const, decision_ref: 'vault-wall:allow' },
    records: { effect: 'allow' as const, decision_ref: 'vault-records:allow' },
    dlp: { effect: 'allow' as const, decision_ref: 'vault-dlp:allow' },
  },
  audit: {
    event_id: '77777777-7777-4777-8777-777777777777',
    correlation_id: correlationId,
  },
};

function input() {
  return {
    principal: { tenant_id: 'lawos-tenant', user_id: principal.accountLedgerId },
    lawos_matter_id: 'matter-lawos-1',
    installation_ref_sha256: 'b'.repeat(64),
    compose_target_sha256: 'c'.repeat(64),
    operation: {
      operation_id: `vaultop_${'1'.repeat(32)}`,
      correlation_id: correlationId,
      operation_kind: 'attach_outlook',
      idempotency_key: 'vaultidem:controller',
    },
    authorization,
  };
}

describe('AmicOsVaultProviderController download transport', () => {
  it('returns only bounded exact metadata headers and an RFC 5987 attachment name', async () => {
    const body = Buffer.from('exact');
    const download = vi.fn(async () => ({
      metadata: {
        authority_kind: 'amic-vault-api' as const,
        authority_ref: authorization.authority_ref,
        provider_revision: authorization.provider_revision,
        state: 'downloaded' as const,
        provider_export_ref: authorization.provider_export_ref,
        exact_version: exactVersion,
        attachment_name: attachmentName,
        audit: {
          event_id: '88888888-8888-4888-8888-888888888888',
          correlation_id: correlationId,
        },
      },
      body,
    }));
    const controller = new AmicOsVaultProviderController({ download } as unknown as AmicOsVaultProviderService);
    const headers: Record<string, string> = {};
    const result = await controller.download(
      { headers: {}, amicOsVaultPrincipal: principal },
      input(),
      { setHeader: (name, value) => { headers[name] = value; } },
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(download).toHaveBeenCalledWith(principal, input());
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['content-length']).toBe(String(body.byteLength));
    expect(headers['content-disposition']).toBe(
      'attachment; filename="client_s_final_.pdf"; '
        + "filename*=UTF-8''client%27s%20%28final%29.pdf",
    );
    expect(headers['x-amic-vault-document-id']).toBe(exactVersion.document_id);
    expect(headers['x-amic-vault-version-id']).toBe(exactVersion.version_id);
    expect(headers['x-amic-vault-file-object-id']).toBe(exactVersion.file_object_id);
    expect(headers['x-amic-vault-sha256']).toBe(exactVersion.sha256);
    expect(Object.keys(headers).some((name) => /token|storage|location|presign/iu.test(name))).toBe(false);
  });
});
