import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '../../audit/audit.service';
import type { AmicOsVaultOfficeCopyBindingInput } from './amic-os-vault-editor.contract';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import { AmicOsVaultEditorService } from './amic-os-vault-editor.service';

const principal: AmicOsVaultProviderPrincipal = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  accountLedgerId: 'synthetic-copy-user',
};
const matterId = '33333333-3333-4333-8333-333333333333';
const input: AmicOsVaultOfficeCopyBindingInput = {
  principal: { tenant_id: 'synthetic-lawos-tenant', user_id: principal.accountLedgerId },
  lawos_matter_id: 'synthetic-lawos-matter',
  requested_exact_version: {
    document_id: '44444444-4444-4444-8444-444444444444',
    version_id: '55555555-5555-4555-8555-555555555555',
    file_object_id: '66666666-6666-4666-8666-666666666666',
    sha256: 'a'.repeat(64), byte_size: 128,
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  copy_id: 'document-copy:77777777-7777-4777-8777-777777777777',
  snapshot_id: 'document-copy-snapshot:88888888-8888-4888-8888-888888888888',
  working_document_id: '99999999-9999-4999-8999-999999999999',
};

function harness() {
  const exact = input.requested_exact_version;
  const query = vi.fn(async (sql: string) => {
    if (!sql.includes('JOIN document_versions base')) throw new Error('Unexpected copy access after denial');
    return { rowCount: 1, rows: [{ document_id: exact.document_id, matter_id: matterId,
      document_status: 'draft', matter_status: 'active', lawos_matter_id: input.lawos_matter_id,
      base_version_id: exact.version_id, base_file_object_id: exact.file_object_id,
      base_sha256: exact.sha256, base_byte_size: exact.byte_size, base_mime_type: exact.mime_type,
      current_version_id: exact.version_id }] };
  });
  const audit = { transaction: async (_tenant: string, run: (client: QueryClient) => Promise<unknown>) =>
    run({ query } as unknown as QueryClient) };
  const permission = {
    canReadDocument: vi.fn(async () => ({ effect: 'ALLOW' })),
    canDownloadDocument: vi.fn(async () => ({ effect: 'ALLOW' })),
    canUploadToMatter: vi.fn(async () => ({ effect: 'ALLOW' })),
  };
  const service = new AmicOsVaultEditorService(audit as never, {} as never, {} as never,
    permission as never, {} as never, { require: () => ({ tenantId: principal.tenantId, source: 'amic-os-provider' }) } as never,
    {} as never);
  return { service, query, permission };
}

describe('AMIC OS copy permission revalidation', () => {
  for (const action of ['retainCopy', 'commitCopy'] as const) {
    for (const check of ['canReadDocument', 'canDownloadDocument', 'canUploadToMatter'] as const) {
      for (const failure of ['deny', 'error'] as const) {
        it(`${action} refuses a current ${check} ${failure} before reading or updating a saved copy`, async () => {
          const { service, query, permission } = harness();
          if (failure === 'deny') permission[check].mockResolvedValue({ effect: 'DENY' });
          else permission[check].mockRejectedValue(new Error('synthetic permission evaluator failure'));
          await expect(service[action](principal, input)).rejects.toBeInstanceOf(ForbiddenException);
          expect(query).toHaveBeenCalledTimes(1);
          expect(permission.canReadDocument).toHaveBeenCalledWith(
            { tenantId: principal.tenantId, userId: principal.actorUserId }, input.requested_exact_version.document_id);
          expect(permission.canDownloadDocument).toHaveBeenCalledWith(
            { tenantId: principal.tenantId, userId: principal.actorUserId }, input.requested_exact_version.document_id,
            'AMIC_OS_OFFICE_COPY');
          expect(permission.canUploadToMatter).toHaveBeenCalledWith(
            { tenantId: principal.tenantId, userId: principal.actorUserId }, matterId);
        });
      }
    }
  }
});
