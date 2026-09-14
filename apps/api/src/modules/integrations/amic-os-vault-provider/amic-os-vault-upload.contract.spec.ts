import { describe, expect, it } from 'vitest';
import {
  AMIC_OS_VAULT_MAX_UPLOAD_BYTES,
  parseAmicOsVaultCapabilityInput,
  parseAmicOsVaultUploadCommitInput,
  parseAmicOsVaultUploadPreflightInput,
  parseAmicOsVaultUploadReadbackInput,
} from './amic-os-vault-upload.contract';

const operationId = `vaultop_${'1'.repeat(32)}`;
const correlationId = `vaultcorr_${'2'.repeat(32)}`;
const sha256 = 'a'.repeat(64);

const preflight = {
  authority_kind: 'amic-vault-api',
  authority_ref: 'amic-vault-api:single-install',
  provider_revision: 'single-install-upload-v1',
  preflight_ref: 'vault-preflight:11111111-1111-5111-8111-111111111111',
  expires_at: '2026-08-29T00:05:00.000Z',
  resolved: {
    vault_tenant_id: '11111111-1111-4111-8111-111111111111',
    vault_actor_id: '22222222-2222-4222-8222-222222222222',
    vault_matter_id: '33333333-3333-4333-8333-333333333333',
    vault_workspace_id: '44444444-4444-4444-8444-444444444444',
    vault_folder_id: null,
  },
  decisions: {
    permission: { effect: 'allow', decision_ref: 'vault-upload-permission:allow' },
    ethical_wall: { effect: 'allow', decision_ref: 'vault-upload-wall:allow' },
    records: { effect: 'allow', decision_ref: 'vault-upload-records:allow' },
    dlp: { effect: 'deferred', decision_ref: 'vault-upload-dlp:deferred' },
  },
  audit: {
    event_id: '55555555-5555-4555-8555-555555555555',
    correlation_id: correlationId,
  },
};

function localCommit() {
  return {
    principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
    preflight,
    operation: {
      operation_id: operationId,
      correlation_id: correlationId,
      idempotency_key: 'vaultidem:upload-1',
      operation_kind: 'save_local_file',
    },
    file: {
      filename: '계약서.pdf',
      sha256,
      byte_size: 123,
      mime_type: 'application/pdf',
    },
    request_id: 'request-1',
  };
}

describe('AMIC OS Vault upload contract', () => {
  it('accepts only the bounded account-ledger capability request', () => {
    expect(parseAmicOsVaultCapabilityInput({
      principal: { tenant_id: 'lawos-tenant', user_id: ' USER_AMIC_JWSUH ' },
      request_id: 'capability-request-1',
    })).toEqual({
      principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
      request_id: 'capability-request-1',
    });
    expect(() => parseAmicOsVaultCapabilityInput({
      principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
      request_id: 'capability-request-1',
      capabilities: { governance: true },
    })).toThrow();
  });

  it('accepts the strict local-file preflight and normalizes the account ledger id', () => {
    expect(parseAmicOsVaultUploadPreflightInput({
      principal: { tenant_id: 'lawos-tenant', user_id: ' USER_AMIC_JWSUH ' },
      lawos_matter_id: 'lawos-matter-1',
      matter_projection: {
        lawos_client_id: 'lawos-client-1',
        client_display_name: 'AMIC Web QA',
        matter_code: null,
        matter_name: 'Web upload verification',
        matter_status: 'open',
        source_revision: 'lawos-live-matter-projection-v1',
        source_updated_at: '2026-09-14T06:00:00.000Z',
      },
      requested_workspace_id: null,
      requested_folder_id: null,
      operation_id: operationId,
      correlation_id: correlationId,
      request_id: 'request-1',
    })).toMatchObject({
      principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
      matter_projection: expect.objectContaining({
        lawos_client_id: 'lawos-client-1',
        matter_status: 'open',
      }),
      requested_workspace_id: null,
      requested_folder_id: null,
    });
  });

  it('rejects unknown fields and source/kind confusion', () => {
    expect(() => parseAmicOsVaultUploadPreflightInput({
      principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
      lawos_matter_id: 'lawos-matter-1',
      requested_workspace_id: null,
      requested_folder_id: null,
      operation_id: operationId,
      correlation_id: correlationId,
      request_id: 'request-1',
      attacker_selected_tenant: 'other',
    })).toThrow();

    expect(() => parseAmicOsVaultUploadCommitInput({
      ...localCommit(),
      source: { ref_sha256: 'b'.repeat(64) },
    })).toThrow();

    const emailCommit = localCommit();
    emailCommit.operation.operation_kind = 'save_email';
    expect(() => parseAmicOsVaultUploadCommitInput(emailCommit)).toThrow();
  });

  it('accepts an email source only when it is bound to the email operation', () => {
    const input = localCommit();
    input.operation.operation_kind = 'save_email';
    const parsed = parseAmicOsVaultUploadCommitInput({
      ...input,
      source: { ref_sha256: 'b'.repeat(64) },
    });

    expect(parsed.operation.operation_kind).toBe('save_email');
    expect(parsed.source).toEqual({ ref_sha256: 'b'.repeat(64) });
  });

  it('enforces the bounded fingerprint and exact commit identity on readback', () => {
    const commit = {
      authority_kind: 'amic-vault-api',
      authority_ref: preflight.authority_ref,
      provider_revision: preflight.provider_revision,
      state: 'quarantined',
      provider_operation_ref: 'vault-upload:66666666-6666-5666-8666-666666666666',
      accepted: { sha256, byte_size: 123, mime_type: 'application/pdf' },
      exact_version: null,
      retry_after_ms: 1_000,
      audit: {
        event_id: '77777777-7777-4777-8777-777777777777',
        correlation_id: correlationId,
      },
    };
    expect(parseAmicOsVaultUploadReadbackInput({
      principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
      preflight,
      commit,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        operation_kind: 'save_local_file',
      },
      expected: commit.accepted,
      request_id: 'request-2',
    })).toMatchObject({ commit, expected: commit.accepted });

    expect(() => parseAmicOsVaultUploadCommitInput({
      ...localCommit(),
      file: {
        ...localCommit().file,
        byte_size: AMIC_OS_VAULT_MAX_UPLOAD_BYTES + 1,
      },
    })).toThrow();
  });
});
