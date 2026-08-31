import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import {
  AmicOsVaultCapabilityController,
  AmicOsVaultUploadController,
} from './amic-os-vault-upload.controller';
import type { AmicOsVaultUploadService } from './amic-os-vault-upload.service';

const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
};
const operationId = `vaultop_${'1'.repeat(32)}`;
const correlationId = `vaultcorr_${'2'.repeat(32)}`;
const sha256 = 'a'.repeat(64);
const preflight = {
  authority_kind: 'amic-vault-api',
  authority_ref: 'amic-vault-api:single-install',
  provider_revision: 'single-install-upload-v1',
  preflight_ref: 'vault-preflight:33333333-3333-5333-8333-333333333333',
  expires_at: '2026-08-29T00:05:00.000Z',
  resolved: {
    vault_tenant_id: principal.tenantId,
    vault_actor_id: principal.actorUserId,
    vault_matter_id: '44444444-4444-4444-8444-444444444444',
    vault_workspace_id: '55555555-5555-4555-8555-555555555555',
    vault_folder_id: null,
  },
  decisions: {
    permission: { effect: 'allow', decision_ref: 'vault-upload-permission:allow' },
    ethical_wall: { effect: 'allow', decision_ref: 'vault-upload-wall:allow' },
    records: { effect: 'allow', decision_ref: 'vault-upload-records:allow' },
    dlp: { effect: 'deferred', decision_ref: 'vault-upload-dlp:deferred' },
  },
  audit: {
    event_id: '66666666-6666-4666-8666-666666666666',
    correlation_id: correlationId,
  },
};

async function tempFile(): Promise<UploadedDiskFile> {
  const directory = await mkdtemp(join(tmpdir(), 'amic-os-upload-controller-'));
  const path = join(directory, 'contract.pdf');
  await writeFile(path, Buffer.from('exact'));
  return {
    path,
    originalname: 'contract.pdf',
    mimetype: 'application/pdf',
    size: 5,
  };
}

describe('AmicOsVaultUploadController', () => {
  it('projects only server-bound capabilities and never grants governance surfaces', () => {
    const controller = new AmicOsVaultCapabilityController({
      uploadAuthorityRef: () => 'amic-vault-api:single-install',
    } as never);

    expect(controller.resolve(
      { headers: {}, amicOsVaultPrincipal: principal },
      {
        principal: { tenant_id: 'caller-tenant-is-not-authority', user_id: principal.accountLedgerId },
        request_id: 'capability-request-1',
      },
    )).toEqual({
      authoritative: true,
      provider_state: 'ready',
      tenant_binding_state: 'bound',
      user_binding_state: 'bound',
      authority_ref: 'amic-vault-api:single-install',
      capabilities: {
        read: true,
        upload: true,
        download: true,
        attach: true,
        work: false,
        governance: false,
        audit: false,
      },
    });
    expect(() => controller.resolve(
      { headers: {}, amicOsVaultPrincipal: principal },
      {
        principal: { tenant_id: 'lawos-tenant', user_id: 'user_other_account' },
        request_id: 'capability-request-1',
      },
    )).toThrow();
  });

  it('parses the one-field multipart envelope, delegates authority, and always removes the temp file', async () => {
    const file = await tempFile();
    const commit = vi.fn(async () => ({ state: 'quarantined' }));
    const controller = new AmicOsVaultUploadController({ commit } as unknown as AmicOsVaultUploadService);
    const envelope = {
      principal: { tenant_id: 'lawos-tenant', user_id: principal.accountLedgerId },
      preflight,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        idempotency_key: 'vaultidem:controller-1',
        operation_kind: 'save_local_file',
      },
      file: {
        filename: 'contract.pdf',
        sha256,
        byte_size: 5,
        mime_type: 'application/pdf',
      },
      request_id: 'request-controller-1',
    };

    await expect(controller.commit(
      { headers: {}, amicOsVaultPrincipal: principal },
      { envelope: JSON.stringify(envelope) },
      file,
    )).resolves.toEqual({ state: 'quarantined' });
    expect(commit).toHaveBeenCalledWith(principal, expect.objectContaining({
      operation: expect.objectContaining({ operation_id: operationId }),
      file: expect.objectContaining({ sha256, byte_size: 5 }),
    }), file);
    await expect(access(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes the temp file even when the multipart envelope is invalid', async () => {
    const file = await tempFile();
    const commit = vi.fn();
    const controller = new AmicOsVaultUploadController({ commit } as unknown as AmicOsVaultUploadService);

    await expect(controller.commit(
      { headers: {}, amicOsVaultPrincipal: principal },
      { envelope: '{invalid-json' },
      file,
    )).rejects.toThrow();
    expect(commit).not.toHaveBeenCalled();
    await expect(access(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
