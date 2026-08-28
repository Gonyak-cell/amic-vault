import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PermissionDecision, TenantId } from '@amic-vault/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogInput, AuditService, QueryClient } from '../../audit/audit.service';
import type { DlpEgressDecision, DlpService } from '../../dlp/dlp.service';
import type { PermissionService } from '../../permission/permission.service';
import type { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context';
import type {
  AmicOsVaultExportAuthorization,
  AmicOsVaultExportAuthorizeInput,
  AmicOsVaultExportDownloadInput,
} from './amic-os-vault-provider.contract';
import { AmicOsVaultProviderConfig } from './amic-os-vault-provider.guard';
import { AmicOsVaultProviderService } from './amic-os-vault-provider.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const fileObjectId = '66666666-6666-4666-8666-666666666666';
const bytes = Buffer.from('payload');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const providerToken = 'provider-secret-that-is-longer-than-thirty-two-bytes';

interface GrantState {
  preview_session_id: string;
  tenant_id: string;
  user_id: string;
  document_id: string;
  version_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

interface TestState {
  matterMapped: boolean;
  permission: PermissionDecision;
  dlpAllowed: boolean;
  storageBytes: Buffer;
  storageReads: number;
  grant?: GrantState;
  events: Map<string, AuditLogInput>;
  eventCounter: number;
}

const principal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId,
  actorUserId,
};

function exactVersion() {
  return {
    document_id: documentId,
    version_id: versionId,
    file_object_id: fileObjectId,
    sha256,
    byte_size: bytes.byteLength,
    mime_type: 'application/pdf',
  };
}

function authorizeInput(): AmicOsVaultExportAuthorizeInput {
  return {
    principal: { tenant_id: 'lawos-tenant', user_id: principal.accountLedgerId },
    lawos_matter_id: 'matter-lawos-1',
    requested_exact_version: exactVersion(),
    installation_ref_sha256: null,
    compose_target_sha256: 'b'.repeat(64),
    operation_id: `vaultop_${'1'.repeat(32)}`,
    correlation_id: `vaultcorr_${'2'.repeat(32)}`,
    operation_kind: 'attach_outlook',
    idempotency_key: 'vaultidem:one',
  };
}

function downloadInput(authorization: AmicOsVaultExportAuthorization): AmicOsVaultExportDownloadInput {
  const input = authorizeInput();
  return {
    principal: input.principal,
    lawos_matter_id: input.lawos_matter_id,
    installation_ref_sha256: input.installation_ref_sha256,
    compose_target_sha256: input.compose_target_sha256,
    operation: {
      operation_id: input.operation_id,
      correlation_id: input.correlation_id,
      operation_kind: input.operation_kind,
      idempotency_key: input.idempotency_key,
    },
    authorization,
  };
}

function createHarness() {
  const state: TestState = {
    matterMapped: true,
    permission: {
      effect: 'ALLOW',
      reasonCode: 'ALLOWED',
      appliedRules: ['document.download:role_allow', 'ethical_wall:clear'],
    },
    dlpAllowed: true,
    storageBytes: Buffer.from(bytes),
    storageReads: 0,
    events: new Map(),
    eventCounter: 0,
  };
  const client: QueryClient = {
    async query(sql, params = []) {
      if (sql.includes("metadata_json ->> 'lawosMatterId'")) {
        return {
          rows: state.matterMapped ? [{ matter_id: matterId }] : [],
          rowCount: state.matterMapped ? 1 : 0,
        };
      }
      if (sql.includes('FROM documents d') && sql.includes('file_security_promotions')) {
        return {
          rows: [
            {
              document_id: documentId,
              version_id: versionId,
              file_object_id: fileObjectId,
              matter_id: matterId,
              storage_uri: `s3://vault/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
              normalized_filename: '계약서.pdf',
              mime_type: 'application/pdf',
              size_bytes: String(bytes.byteLength),
              sha256,
              document_status: 'final',
              matter_status: 'active',
              document_legal_hold: false,
              matter_legal_hold: false,
              active_legal_hold: false,
              active_disposal_request: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO preview_access_sessions')) {
        if (state.grant) return { rows: [], rowCount: 0 };
        state.grant = {
          preview_session_id: String(params[0]),
          tenant_id: String(params[1]),
          user_id: String(params[2]),
          document_id: String(params[3]),
          version_id: String(params[4]),
          token_hash: String(params[5]),
          expires_at: new Date(Date.now() + 45_000),
          revoked_at: null,
          created_at: new Date(),
        };
        return { rows: [state.grant], rowCount: 1 };
      }
      if (sql.includes('FROM preview_access_sessions')) {
        if (!state.grant) return { rows: [], rowCount: 0 };
        const tokenHash = params[5] == null ? state.grant.token_hash : String(params[5]);
        const matches =
          state.grant.preview_session_id === params[1] &&
          state.grant.user_id === params[2] &&
          state.grant.document_id === params[3] &&
          state.grant.version_id === params[4] &&
          state.grant.token_hash === tokenHash;
        return matches
          ? {
              rows: [
                {
                  ...state.grant,
                  active: state.grant.expires_at.getTime() > Date.now(),
                },
              ],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (sql.includes('UPDATE preview_access_sessions')) {
        if (!state.grant || state.grant.revoked_at) return { rows: [], rowCount: 0 };
        state.grant.revoked_at = new Date();
        return { rows: [{ revoked_at: state.grant.revoked_at }], rowCount: 1 };
      }
      if (sql.includes('FROM audit_events')) {
        const event = state.events.get(String(params[1]));
        const actionMatches = event ? sql.includes(`action = '${event.action}'`) : false;
        const clientRequestMatches = !sql.includes("metadata_json ->> 'client_request_hash'")
          || event?.metadata?.client_request_hash === params[9];
        return actionMatches && clientRequestMatches
          ? { rows: [{ event_id: String(params[1]) }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };

  const auditService = {
    transaction: vi.fn(async (_tenantId: string, run: (tx: QueryClient) => Promise<unknown>) =>
      run(client),
    ),
    log: vi.fn(async (input: AuditLogInput) => {
      state.eventCounter += 1;
      const eventId = `90000000-0000-4000-8000-${String(state.eventCounter).padStart(12, '0')}`;
      state.events.set(eventId, input);
      return { eventId, createdAt: new Date() };
    }),
  } as unknown as AuditService;
  const permissionService = {
    canDownloadDocument: vi.fn(async () => state.permission),
  } as unknown as PermissionService;
  const dlpService = {
    evaluateDocumentEgress: vi.fn(async (): Promise<DlpEgressDecision> => ({
      allowed: state.dlpAllowed,
      assessmentId: '77777777-7777-4777-8777-777777777777',
      reviewId: null,
      scanState: 'clean',
      reasonCode: null,
      findingCount: 0,
      restrictedFindingCount: 0,
      requiresReview: false,
      policyVersion: 'sf20-dlp-v1',
      resultHash: 'c'.repeat(64),
    })),
  } as unknown as DlpService;
  const storageService = {
    getByStorageUri: vi.fn(async () => {
      state.storageReads += 1;
      return {
        key: 'not-returned',
        contentLength: state.storageBytes.byteLength,
        contentType: 'application/pdf',
        etag: null,
        body: Readable.from([state.storageBytes]),
      };
    }),
  } as unknown as StorageService;
  const tenantContext = new TenantContextService();
  const service = new AmicOsVaultProviderService(
    auditService,
    dlpService,
    permissionService,
    storageService,
    tenantContext,
    new AmicOsVaultProviderConfig(),
  );
  const run = <T>(work: () => T): T =>
    tenantContext.run(
      { tenantId, slug: 'amic', status: 'active', source: 'amic-os-provider' },
      work,
    );
  return { state, service, run, auditService, permissionService, storageService };
}

describe('AmicOsVaultProviderService', () => {
  beforeEach(() => {
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_ENABLED', 'true');
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_TOKEN', providerToken);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('authorizes, verifies exact bytes, consumes once, and returns audit readback', async () => {
    const harness = createHarness();
    const authorization = await harness.run(() =>
      harness.service.authorize(principal, authorizeInput()),
    );
    expect(authorization.state).toBe('authorized');
    expect(authorization.exact_version).toEqual(exactVersion());
    expect(JSON.stringify(authorization)).not.toContain(providerToken);
    expect(JSON.stringify(authorization)).not.toContain('storage_uri');

    const downloaded = await harness.run(() =>
      harness.service.download(principal, downloadInput(authorization)),
    );
    expect(downloaded.body).toEqual(bytes);
    expect(downloaded.metadata.exact_version).toEqual(exactVersion());
    expect(harness.state.grant?.revoked_at).toBeInstanceOf(Date);

    const input = authorizeInput();
    const readback = await harness.run(() =>
      harness.service.readback(principal, {
        principal: input.principal,
        lawos_matter_id: input.lawos_matter_id,
        installation_ref_sha256: input.installation_ref_sha256,
        compose_target_sha256: input.compose_target_sha256,
        operation: {
          operation_id: input.operation_id,
          correlation_id: input.correlation_id,
          operation_kind: input.operation_kind,
        },
        authorization,
        download: downloaded.metadata,
      }),
    );
    expect(readback.state).toBe('consumed');
    expect(readback.audit.event_id).toBe(downloaded.metadata.audit.event_id);
    expect(
      [...harness.state.events.values()].map((event) => event.action),
    ).toEqual([
      'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
      'DOCUMENT_DOWNLOADED',
    ]);
  });

  it('rejects hash drift without consuming the grant or returning bytes', async () => {
    const harness = createHarness();
    const authorization = await harness.run(() =>
      harness.service.authorize(principal, authorizeInput()),
    );
    harness.state.storageBytes = Buffer.from('tamper!');

    await expect(
      harness.run(() => harness.service.download(principal, downloadInput(authorization))),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(harness.state.grant?.revoked_at).toBeNull();
    expect(
      [...harness.state.events.values()].at(-1),
    ).toMatchObject({ action: 'OUTLOOK_DOCUMENT_INSERT_DENIED', result: 'denied' });
  });

  it('fails before storage when mapping, permission, or DLP denies', async () => {
    for (const configure of [
      (state: TestState) => {
        state.matterMapped = false;
      },
      (state: TestState) => {
        state.permission = {
          effect: 'DENY',
          reasonCode: 'ETHICAL_WALL_BLOCKED',
          appliedRules: ['ethical_wall:excluded'],
        };
      },
      (state: TestState) => {
        state.dlpAllowed = false;
      },
    ]) {
      const harness = createHarness();
      configure(harness.state);
      await expect(
        harness.run(() => harness.service.authorize(principal, authorizeInput())),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: expect.any(String) }) });
      expect(harness.state.storageReads).toBe(0);
      expect(harness.state.grant).toBeUndefined();
    }
  });

  it('binds LawOS Matter, installation, and compose identity across authorize, download, and readback', async () => {
    const beforeDownload = createHarness();
    const authorization = await beforeDownload.run(() =>
      beforeDownload.service.authorize(principal, authorizeInput()),
    );
    await expect(
      beforeDownload.run(() =>
        beforeDownload.service.download(principal, {
          ...downloadInput(authorization),
          compose_target_sha256: 'c'.repeat(64),
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(beforeDownload.state.storageReads).toBe(0);
    expect(beforeDownload.state.grant?.revoked_at).toBeNull();

    const beforeReadback = createHarness();
    const secondAuthorization = await beforeReadback.run(() =>
      beforeReadback.service.authorize(principal, authorizeInput()),
    );
    const downloaded = await beforeReadback.run(() =>
      beforeReadback.service.download(principal, downloadInput(secondAuthorization)),
    );
    const input = authorizeInput();
    await expect(
      beforeReadback.run(() =>
        beforeReadback.service.readback(principal, {
          principal: input.principal,
          lawos_matter_id: input.lawos_matter_id,
          installation_ref_sha256: 'd'.repeat(64),
          compose_target_sha256: input.compose_target_sha256,
          operation: {
            operation_id: input.operation_id,
            correlation_id: input.correlation_id,
            operation_kind: input.operation_kind,
          },
          authorization: secondAuthorization,
          download: downloaded.metadata,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });

  it('allows only one concurrent consumer and blocks replay before another storage read', async () => {
    const harness = createHarness();
    const authorization = await harness.run(() =>
      harness.service.authorize(principal, authorizeInput()),
    );
    const results = await harness.run(() =>
      Promise.allSettled([
        harness.service.download(principal, downloadInput(authorization)),
        harness.service.download(principal, downloadInput(authorization)),
      ]),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const readsAfterRace = harness.state.storageReads;

    await expect(
      harness.run(() => harness.service.download(principal, downloadInput(authorization))),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(harness.state.storageReads).toBe(readsAfterRace);
  });
});
