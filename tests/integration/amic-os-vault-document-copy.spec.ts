import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { DlpService } from '../../apps/api/src/modules/dlp/dlp.service';
import { PermissionService } from '../../apps/api/src/modules/permission/permission.service';
import { StorageObjectAlreadyExistsError } from '../../apps/api/src/modules/storage/storage-adapter.interface';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import {
  betaOwnerUserId,
  createClient,
  createMatter,
  loginBetaOwner,
  uploadPdf,
} from './document-access/document-api-helpers';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

const providerHeader = 'x-amic-os-vault-provider-token';
const providerToken = 'native-copy-integration-provider-token-at-least-thirty-two-bytes';
const metadataFailureCopyId = 'document-copy:deadc0de-0000-4000-8000-000000000001';
const metadataFailureSnapshotId =
  'document-copy-snapshot:deadc0de-0000-4000-8000-000000000002';

interface ExactVersion {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: 'application/pdf';
}

interface StoredObject {
  bytes: Buffer;
  contentType: string;
  key: string;
}

interface PreviousIdentity {
  identity_value_normalized: string;
  status: string;
}

interface PrepareBody {
  principal: { tenant_id: string; user_id: string };
  lawos_matter_id: string;
  requested_exact_version: ExactVersion;
  copy_id: string;
  snapshot_id: string;
  title: string;
  mode: 'clone';
  file: null;
}

async function readBody(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('AMIC OS native document-copy PostgreSQL integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  let accountLedgerId: string;
  let previousIdentity: PreviousIdentity | null = null;
  let matterId: string;
  let reassignedMatterId: string;
  let lawosMatterId: string;
  let reassignedLawosMatterId: string;
  let exact: ExactVersion;
  let sourceBytes: Buffer;
  let quarantineGate: Promise<void> | undefined;
  let notifyQuarantineEntered: (() => void) | undefined;
  let quarantinePutCount = 0;
  const deletedUris: string[] = [];
  const copyIds = new Set<string>();
  const storedObjects = new Map<string, StoredObject>();
  const previousEnv = {
    enabled: process.env.AMIC_OS_VAULT_PROVIDER_ENABLED,
    token: process.env.AMIC_OS_VAULT_PROVIDER_TOKEN,
  };

  const request = async (action: string, body: Record<string, unknown>) => {
    const response = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/edit/document-copy/${action}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify(body),
      },
    );
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // The status and raw text remain the authoritative observable for non-JSON failures.
    }
    return { response, text, body: parsed };
  };

  const prepareBody = (overrides: Partial<PrepareBody> = {}): PrepareBody => {
    const copyId = overrides.copy_id ?? `document-copy:${randomUUID()}`;
    copyIds.add(copyId);
    return {
      principal: { tenant_id: 'lawos-tenant-integration', user_id: accountLedgerId },
      lawos_matter_id: lawosMatterId,
      requested_exact_version: exact,
      copy_id: copyId,
      snapshot_id: overrides.snapshot_id ?? `document-copy-snapshot:${randomUUID()}`,
      title: '통합 테스트 원본 사본',
      mode: 'clone',
      file: null,
      ...overrides,
    };
  };

  const bindingBody = (input: PrepareBody) => ({
    principal: input.principal,
    lawos_matter_id: input.lawos_matter_id,
    requested_exact_version: input.requested_exact_version,
    copy_id: input.copy_id,
    snapshot_id: input.snapshot_id,
  });

  beforeAll(async () => {
    process.env.AMIC_OS_VAULT_PROVIDER_ENABLED = 'true';
    process.env.AMIC_OS_VAULT_PROVIDER_TOKEN = providerToken;
    accountLedgerId = `user_amic_native_copy_${randomUUID().replaceAll('-', '')}`;
    previousIdentity = await withClient(createOwnerClient(), async (client) => {
      const previous = await client.query<PreviousIdentity>(
        `SELECT identity_value_normalized, status
         FROM user_login_identities
         WHERE tenant_id = $1 AND user_id = $2
           AND identity_type = 'account_ledger_id'
         LIMIT 1`,
        [tenantBetaId, betaOwnerUserId],
      );
      await client.query(
        `INSERT INTO user_login_identities (
           tenant_id, user_id, identity_type, identity_value_normalized, status
         ) VALUES ($1, $2, 'account_ledger_id', $3, 'active')
         ON CONFLICT (tenant_id, user_id, identity_type)
         DO UPDATE SET identity_value_normalized = EXCLUDED.identity_value_normalized,
                       status = 'active', updated_at = now()`,
        [tenantBetaId, betaOwnerUserId, accountLedgerId],
      );
      return previous.rows[0] ?? null;
    });

    app = await NestFactory.create(AppModule, { logger: false });
    vi.spyOn(app.get(DlpService), 'evaluateDocumentEgress')
      .mockResolvedValue({ allowed: true } as never);
    const storage = app.get(StorageService);
    vi.spyOn(storage, 'putTenantObject').mockImplementation(async (input) => {
      const bytes = await readBody(input.body);
      const key = [
        'tenants', input.tenantId.toLowerCase(), 'matters', input.matterId.toLowerCase(),
        'documents', input.documentId.toLowerCase(), input.fileObjectId.toLowerCase(),
      ].join('/');
      const storageUri = `s3://${process.env.S3_BUCKET ?? 'amic-vault-dev'}/${key}`;
      if (storedObjects.has(storageUri)) throw new StorageObjectAlreadyExistsError(key);
      storedObjects.set(storageUri, { bytes, contentType: input.contentType, key });
      return { key, storageUri, encryptionKeyId: null };
    });
    vi.spyOn(storage, 'putQuarantineObject').mockImplementation(async (input) => {
      quarantinePutCount += 1;
      notifyQuarantineEntered?.();
      await quarantineGate;
      const bytes = await readBody(input.body);
      const key = `tenants/${input.tenantId.toLowerCase()}/quarantine/${input.quarantineRef}`;
      const storageUri = storage.quarantineStorageUri(input.tenantId, input.quarantineRef);
      if (storedObjects.has(storageUri)) throw new StorageObjectAlreadyExistsError(key);
      storedObjects.set(storageUri, { bytes, contentType: input.contentType, key });
      return { key, storageUri, encryptionKeyId: null };
    });
    vi.spyOn(storage, 'getByStorageUri').mockImplementation(async (tenantId, storageUri) => {
      const stored = storedObjects.get(storageUri);
      if (!stored || !stored.key.startsWith(`tenants/${tenantId.toLowerCase()}/`)) {
        throw new Error('in-memory integration storage object missing');
      }
      return {
        key: stored.key,
        contentLength: stored.bytes.byteLength,
        contentType: stored.contentType,
        etag: null,
        body: Readable.from([Buffer.from(stored.bytes)]),
      };
    });
    vi.spyOn(storage, 'deleteByStorageUri').mockImplementation(async (tenantId, storageUri) => {
      const stored = storedObjects.get(storageUri);
      if (stored && !stored.key.startsWith(`tenants/${tenantId.toLowerCase()}/`)) {
        throw new Error('in-memory integration storage tenant mismatch');
      }
      deletedUris.push(storageUri);
      storedObjects.delete(storageUri);
    });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    betaOwnerCookie = await loginBetaOwner(baseUrl);

    const marker = `NATIVE-COPY-${randomUUID()}`;
    const clientId = await createClient(baseUrl, betaOwnerCookie, marker);
    matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, marker);
    reassignedMatterId = await createMatter(baseUrl, betaOwnerCookie, clientId, `${marker}-MOVED`);
    lawosMatterId = `lawos-${randomUUID()}`;
    reassignedLawosMatterId = `lawos-${randomUUID()}`;
    await withClient(createOwnerClient(), (client) => client.query(
      `UPDATE matters
       SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
         jsonb_build_object('lawosMatterId', CASE matter_id WHEN $2::uuid THEN $3 ELSE $4 END)
       WHERE tenant_id = $1 AND matter_id = ANY($5::uuid[])`,
      [
        tenantBetaId,
        matterId,
        lawosMatterId,
        reassignedLawosMatterId,
        [matterId, reassignedMatterId],
      ],
    ));
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, marker);
    const source = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<ExactVersion & { storage_uri: string }>(
        `SELECT dv.document_id, dv.version_id, f.file_object_id, f.sha256,
                f.size_bytes::integer AS byte_size, f.mime_type, f.storage_uri
         FROM document_versions dv
         JOIN file_objects f ON f.tenant_id = dv.tenant_id
           AND f.file_object_id = dv.file_object_id
         WHERE dv.tenant_id = $1 AND dv.document_id = $2
           AND dv.version_status = 'current'`,
        [tenantBetaId, uploaded.documentId],
      );
      if (!result.rows[0]) throw new Error('native copy source fixture missing');
      return result.rows[0];
    });
    const { storage_uri: storageUri, ...version } = source;
    exact = version;
    sourceBytes = Buffer.from(storedObjects.get(storageUri)?.bytes ?? []);
    if (sourceBytes.byteLength !== exact.byte_size) {
      throw new Error('native copy source storage fixture mismatch');
    }
  }, 30_000);

  afterAll(async () => {
    await withClient(createOwnerClient(), async (client) => {
      await client.query('DROP TRIGGER IF EXISTS test_native_copy_retain_failure ON amic_os_native_document_copies');
      await client.query('DROP FUNCTION IF EXISTS test_native_copy_retain_failure()');
      if (copyIds.size > 0) {
        await client.query(
          'DELETE FROM amic_os_native_document_copies WHERE tenant_id = $1 AND copy_id = ANY($2::text[])',
          [tenantBetaId, [...copyIds]],
        );
      }
      if (previousIdentity) {
        await client.query(
          `UPDATE user_login_identities
           SET identity_value_normalized = $3, status = $4, updated_at = now()
           WHERE tenant_id = $1 AND user_id = $2 AND identity_type = 'account_ledger_id'`,
          [
            tenantBetaId,
            betaOwnerUserId,
            previousIdentity.identity_value_normalized,
            previousIdentity.status,
          ],
        );
      } else {
        await client.query(
          `DELETE FROM user_login_identities
           WHERE tenant_id = $1 AND user_id = $2 AND identity_type = 'account_ledger_id'
             AND identity_value_normalized = $3`,
          [tenantBetaId, betaOwnerUserId, accountLedgerId],
        );
      }
    });
    await app?.close();
    storedObjects.clear();
    vi.restoreAllMocks();
    if (previousEnv.enabled === undefined) delete process.env.AMIC_OS_VAULT_PROVIDER_ENABLED;
    else process.env.AMIC_OS_VAULT_PROVIDER_ENABLED = previousEnv.enabled;
    if (previousEnv.token === undefined) delete process.env.AMIC_OS_VAULT_PROVIDER_TOKEN;
    else process.env.AMIC_OS_VAULT_PROVIDER_TOKEN = previousEnv.token;
  }, 30_000);

  it('serializes same-binding prepare and commit while preserving one retained copy under RLS', async () => {
    const input = prepareBody();
    const putsBefore = quarantinePutCount;
    let releaseQuarantine!: () => void;
    let enteredQuarantine!: () => void;
    const entered = new Promise<void>((resolve) => { enteredQuarantine = resolve; });
    quarantineGate = new Promise<void>((resolve) => { releaseQuarantine = resolve; });
    notifyQuarantineEntered = enteredQuarantine;

    const first = request('prepare', input);
    await entered;
    const second = request('prepare', input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(quarantinePutCount - putsBefore).toBe(1);
    releaseQuarantine();
    quarantineGate = undefined;
    notifyQuarantineEntered = undefined;

    const prepared = await Promise.all([first, second]);
    for (const result of prepared) {
      expect(result.response.status, result.text).toBe(200);
      expect(result.body).toMatchObject({
        copy_id: input.copy_id,
        snapshot_id: input.snapshot_id,
        state: 'retained',
      });
      expect(result.text).not.toMatch(/storage_uri|quarantine_ref|s3:\/\//u);
    }
    expect(quarantinePutCount - putsBefore).toBe(1);

    const read = await request('read', { ...bindingBody(input), offset: 0 });
    expect(read.response.status, read.text).toBe(200);
    expect(Buffer.from(String(read.body.bytes_base64), 'base64')).toEqual(sourceBytes);

    const committed = await Promise.all([
      request('commit', bindingBody(input)),
      request('commit', bindingBody(input)),
    ]);
    expect(committed.some((result) => result.response.status === 200)).toBe(true);
    expect(committed.every((result) => [200, 400].includes(result.response.status))).toBe(true);
    const replay = await request('commit', bindingBody(input));
    expect(replay.response.status, replay.text).toBe(200);
    expect(replay.body).toMatchObject({ state: 'saved', saved: true });

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const ownTenant = await client.query<{ state: string }>(
        `SELECT state FROM amic_os_native_document_copies
         WHERE tenant_id = $1 AND copy_id = $2`,
        [tenantBetaId, input.copy_id],
      );
      expect(ownTenant.rows).toEqual([{ state: 'saved' }]);
      await setTenant(client, tenantAlphaId);
      const otherTenant = await client.query(
        `SELECT state FROM amic_os_native_document_copies
         WHERE tenant_id = $1 AND copy_id = $2`,
        [tenantBetaId, input.copy_id],
      );
      expect(otherTenant.rowCount).toBe(0);
    });
  }, 15_000);

  it('rolls back metadata and removes newly written bytes when final access is revoked', async () => {
    const input = prepareBody();
    const deletesBefore = deletedUris.length;
    const permission = app.get(PermissionService);
    const uploadAccess = vi.spyOn(permission, 'canUploadToMatter')
      .mockResolvedValueOnce({ effect: 'ALLOW' } as never)
      .mockResolvedValueOnce({ effect: 'DENY' } as never);
    try {
      const result = await request('prepare', input);
      expect(result.response.status, result.text).toBe(403);
      expect(uploadAccess).toHaveBeenCalledTimes(2);
      expect(deletedUris.length - deletesBefore).toBe(1);
      await withClient(createOwnerClient(), async (client) => {
        const persisted = await client.query(
          `SELECT state FROM amic_os_native_document_copies
           WHERE tenant_id = $1 AND copy_id = $2`,
          [tenantBetaId, input.copy_id],
        );
        expect(persisted.rowCount).toBe(0);
      });
      expect(storedObjects.has(deletedUris.at(-1) ?? '')).toBe(false);
    } finally {
      uploadAccess.mockRestore();
    }
  });

  it('does not convert a PostgreSQL retained-state failure into snapshot_unavailable', async () => {
    copyIds.add(metadataFailureCopyId);
    const quarantineRef = randomUUID();
    const storage = app.get(StorageService);
    const storageUri = storage.quarantineStorageUri(tenantBetaId, quarantineRef);
    storedObjects.set(storageUri, {
      bytes: Buffer.from(sourceBytes),
      contentType: exact.mime_type,
      key: `tenants/${tenantBetaId}/quarantine/${quarantineRef}`,
    });
    await withClient(createOwnerClient(), async (client) => {
      await client.query(
        `INSERT INTO amic_os_native_document_copies (
           tenant_id, copy_id, snapshot_id, source_document_id, source_version_id,
           source_file_object_id, source_matter_id, lawos_matter_id, quarantine_ref,
           title, filename, sha256, byte_size, mime_type, mode, state, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   'DB failure fixture', 'fixture.pdf', $10, $11, $12, 'clone', 'prepared', $13)`,
        [
          tenantBetaId,
          metadataFailureCopyId,
          metadataFailureSnapshotId,
          exact.document_id,
          exact.version_id,
          exact.file_object_id,
          matterId,
          lawosMatterId,
          quarantineRef,
          exact.sha256,
          exact.byte_size,
          exact.mime_type,
          betaOwnerUserId,
        ],
      );
      await client.query(`
        CREATE OR REPLACE FUNCTION test_native_copy_retain_failure()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.copy_id = '${metadataFailureCopyId}'
             AND OLD.state = 'prepared' AND NEW.state = 'retained' THEN
            RAISE EXCEPTION 'injected native copy retained-state failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await client.query(
        `CREATE TRIGGER test_native_copy_retain_failure
         BEFORE UPDATE OF state ON amic_os_native_document_copies
         FOR EACH ROW EXECUTE FUNCTION test_native_copy_retain_failure()`,
      );
    });
    const input = prepareBody({
      copy_id: metadataFailureCopyId,
      snapshot_id: metadataFailureSnapshotId,
    });
    try {
      const result = await request('complete', bindingBody(input));
      expect(result.response.status, result.text).toBe(500);
      await withClient(createOwnerClient(), async (client) => {
        const state = await client.query<{ state: string; blocked_reason: string | null }>(
          `SELECT state, blocked_reason FROM amic_os_native_document_copies
           WHERE tenant_id = $1 AND copy_id = $2`,
          [tenantBetaId, metadataFailureCopyId],
        );
        expect(state.rows).toEqual([{ state: 'prepared', blocked_reason: null }]);
      });
      expect(storedObjects.get(storageUri)?.bytes).toEqual(sourceBytes);
    } finally {
      await withClient(createOwnerClient(), async (client) => {
        await client.query(
          'DROP TRIGGER IF EXISTS test_native_copy_retain_failure ON amic_os_native_document_copies',
        );
        await client.query('DROP FUNCTION IF EXISTS test_native_copy_retain_failure()');
      });
    }
  });

  it('does not reveal a historic Matter binding when the current Matter code changes', async () => {
    const input = prepareBody();
    const prepared = await request('prepare', input);
    expect(prepared.response.status, prepared.text).toBe(200);
    await withClient(createOwnerClient(), (client) => client.query(
      `UPDATE matters SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
         jsonb_build_object('lawosMatterId', $3::text)
       WHERE tenant_id = $1 AND matter_id = $2`,
      [tenantBetaId, matterId, reassignedLawosMatterId],
    ));
    try {
      const listed = await request('list', {
        principal: input.principal,
        lawos_matter_id: reassignedLawosMatterId,
        requested_exact_version: exact,
        limit: 50,
      });
      expect(listed.response.status, listed.text).toBe(200);
      expect(listed.body).toMatchObject({ items: [], next_cursor: null });
      expect(listed.text).not.toContain(lawosMatterId);
    } finally {
      await withClient(createOwnerClient(), (client) => client.query(
        `UPDATE matters SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
           jsonb_build_object('lawosMatterId', $3::text)
         WHERE tenant_id = $1 AND matter_id = $2`,
        [tenantBetaId, matterId, lawosMatterId],
      ));
    }
  });
});
