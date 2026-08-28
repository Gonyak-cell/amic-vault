import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  parseAmicOsVaultExportAuthorizeInput,
  parseAmicOsVaultExportDownloadInput,
  parseAmicOsVaultExportReadbackInput,
} from './amic-os-vault-provider.contract';

const exact = {
  document_id: '11111111-1111-4111-8111-111111111111',
  version_id: '22222222-2222-4222-8222-222222222222',
  file_object_id: '33333333-3333-4333-8333-333333333333',
  sha256: 'a'.repeat(64),
  byte_size: 7,
  mime_type: 'application/pdf',
};
const principal = { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' };
const operation = {
  operation_id: `vaultop_${'1'.repeat(32)}`,
  correlation_id: `vaultcorr_${'2'.repeat(32)}`,
  operation_kind: 'attach_outlook' as const,
  idempotency_key: 'vaultidem:one',
};
const decisions = Object.fromEntries(
  ['permission', 'ethical_wall', 'records', 'dlp'].map((kind) => [
    kind,
    { effect: 'allow', decision_ref: `vault-${kind}:decision` },
  ]),
);
const authorization = {
  authority_kind: 'amic-vault-api',
  authority_ref: 'amic-vault-api:oa12',
  provider_revision: 'oa12-exact-copy-v1',
  state: 'authorized',
  provider_export_ref: 'vault-export:44444444-4444-4444-8444-444444444444',
  expires_at: '2026-08-29T00:00:45.000Z',
  exact_version: exact,
  attachment_name: '계약서.pdf',
  decisions,
  audit: {
    event_id: '55555555-5555-4555-8555-555555555555',
    correlation_id: operation.correlation_id,
  },
};

describe('AMIC OS Vault provider closed contract', () => {
  it('parses the exact authorize, download, and readback shapes', () => {
    const authorize = parseAmicOsVaultExportAuthorizeInput({
      principal,
      lawos_matter_id: 'matter-lawos-1',
      requested_exact_version: exact,
      installation_ref_sha256: null,
      compose_target_sha256: 'b'.repeat(64),
      ...operation,
    });
    expect(authorize.principal.user_id).toBe('user_amic_jwsuh');

    const download = parseAmicOsVaultExportDownloadInput({
      principal,
      lawos_matter_id: 'matter-lawos-1',
      installation_ref_sha256: null,
      compose_target_sha256: 'b'.repeat(64),
      operation,
      authorization,
    });
    expect(download.authorization.exact_version).toEqual(exact);

    const readback = parseAmicOsVaultExportReadbackInput({
      principal,
      lawos_matter_id: 'matter-lawos-1',
      installation_ref_sha256: null,
      compose_target_sha256: 'b'.repeat(64),
      operation: {
        operation_id: operation.operation_id,
        correlation_id: operation.correlation_id,
        operation_kind: operation.operation_kind,
      },
      authorization,
      download: {
        authority_kind: 'amic-vault-api',
        authority_ref: authorization.authority_ref,
        provider_revision: authorization.provider_revision,
        state: 'downloaded',
        provider_export_ref: authorization.provider_export_ref,
        exact_version: exact,
        attachment_name: authorization.attachment_name,
        audit: {
          event_id: '66666666-6666-4666-8666-666666666666',
          correlation_id: operation.correlation_id,
        },
      },
    });
    expect(readback.download.state).toBe('downloaded');
  });

  it('rejects unknown fields, non-Vault UUIDs, oversize bodies, and unsafe names', () => {
    const base = {
      principal,
      lawos_matter_id: 'matter-lawos-1',
      requested_exact_version: exact,
      installation_ref_sha256: null,
      compose_target_sha256: null,
      ...operation,
    };
    for (const candidate of [
      { ...base, token: 'forbidden' },
      {
        ...base,
        requested_exact_version: { ...exact, document_id: 'document-latest' },
      },
      {
        ...base,
        requested_exact_version: { ...exact, byte_size: 25 * 1024 * 1024 + 1 },
      },
    ]) {
      expect(() => parseAmicOsVaultExportAuthorizeInput(candidate)).toThrow(BadRequestException);
    }
    expect(() =>
      parseAmicOsVaultExportDownloadInput({
        principal,
        lawos_matter_id: 'matter-lawos-1',
        installation_ref_sha256: null,
        compose_target_sha256: null,
        operation,
        authorization: { ...authorization, attachment_name: '../unsafe.pdf' },
      }),
    ).toThrow(BadRequestException);
  });
});
