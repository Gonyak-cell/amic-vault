import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import {
  betaOwnerUserId,
  createClient,
  createMatter,
  loginBetaOwner,
  markCanonicalReadyFixture,
  uploadPdf,
} from './document-access/document-api-helpers';
import { createOwnerClient, tenantBetaId, withClient } from './helpers/db';

const providerToken = 'oa12-integration-provider-token-at-least-thirty-two-bytes';
const providerHeader = 'x-amic-os-vault-provider-token';

interface ExactVersion {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
}

interface Authorization {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  state: 'authorized';
  provider_export_ref: string;
  expires_at: string;
  exact_version: ExactVersion;
  attachment_name: string;
  decisions: Record<string, { effect: 'allow'; decision_ref: string }>;
  audit: { event_id: string; correlation_id: string };
}

interface PreviousIdentity {
  identity_value_normalized: string;
  status: string;
}

interface StoredObject {
  bytes: Buffer;
  contentType: string;
  key: string;
}

async function readStorageBody(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function providerBody(input: {
  accountLedgerId: string;
  lawosMatterId: string;
  exact: ExactVersion;
  operationId: string;
  correlationId: string;
  installationRef: string;
  composeTarget: string;
}) {
  return {
    principal: {
      tenant_id: 'lawos-tenant-correlation',
      user_id: input.accountLedgerId,
    },
    lawos_matter_id: input.lawosMatterId,
    requested_exact_version: input.exact,
    installation_ref_sha256: input.installationRef,
    compose_target_sha256: input.composeTarget,
    operation_id: input.operationId,
    correlation_id: input.correlationId,
    operation_kind: 'attach_outlook' as const,
    idempotency_key: `vaultidem:${input.operationId}`,
  };
}

describe('AMIC OS exact-copy provider integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  let accountLedgerId: string;
  let previousIdentity: PreviousIdentity | null = null;
  const storedObjects = new Map<string, StoredObject>();
  const previousEnv = {
    enabled: process.env.AMIC_OS_VAULT_PROVIDER_ENABLED,
    token: process.env.AMIC_OS_VAULT_PROVIDER_TOKEN,
    revision: process.env.AMIC_OS_VAULT_PROVIDER_REVISION,
  };

  beforeAll(async () => {
    process.env.AMIC_OS_VAULT_PROVIDER_ENABLED = 'true';
    process.env.AMIC_OS_VAULT_PROVIDER_TOKEN = providerToken;
    process.env.AMIC_OS_VAULT_PROVIDER_REVISION = 'oa12-integration-v1';
    accountLedgerId = `user_amic_oa12_${randomUUID().replaceAll('-', '')}`;
    previousIdentity = await withClient(createOwnerClient(), async (client) => {
      const previous = await client.query<PreviousIdentity>(
        `SELECT identity_value_normalized, status
         FROM user_login_identities
         WHERE tenant_id = $1
           AND user_id = $2
           AND identity_type = 'account_ledger_id'
         LIMIT 1`,
        [tenantBetaId, betaOwnerUserId],
      );
      await client.query(
        `INSERT INTO user_login_identities (
           tenant_id, user_id, identity_type, identity_value_normalized, status
         )
         VALUES ($1, $2, 'account_ledger_id', $3, 'active')
         ON CONFLICT (tenant_id, user_id, identity_type)
         DO UPDATE SET
           identity_value_normalized = EXCLUDED.identity_value_normalized,
           status = 'active',
           updated_at = now()`,
        [tenantBetaId, betaOwnerUserId, accountLedgerId],
      );
      return previous.rows[0] ?? null;
    });
    app = await NestFactory.create(AppModule, { logger: false });
    const storage = app.get(StorageService);
    vi.spyOn(storage, 'putTenantObject').mockImplementation(async (input) => {
      const bytes = await readStorageBody(input.body);
      if (bytes.byteLength !== input.contentLength) {
        throw new Error('in-memory integration storage length mismatch');
      }
      const key = [
        'tenants',
        input.tenantId.toLowerCase(),
        'matters',
        input.matterId.toLowerCase(),
        'documents',
        input.documentId.toLowerCase(),
        input.fileObjectId.toLowerCase(),
      ].join('/');
      const storageUri = `s3://${process.env.S3_BUCKET ?? 'amic-vault-dev'}/${key}`;
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
      storedObjects.delete(storageUri);
    });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    betaOwnerCookie = await loginBetaOwner(baseUrl);
  });

  afterAll(async () => {
    await app?.close();
    storedObjects.clear();
    vi.restoreAllMocks();
    await withClient(createOwnerClient(), async (client) => {
      if (previousIdentity) {
        await client.query(
          `UPDATE user_login_identities
           SET identity_value_normalized = $3, status = $4, updated_at = now()
           WHERE tenant_id = $1
             AND user_id = $2
             AND identity_type = 'account_ledger_id'`,
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
           WHERE tenant_id = $1
             AND user_id = $2
             AND identity_type = 'account_ledger_id'
             AND identity_value_normalized = $3`,
          [tenantBetaId, betaOwnerUserId, accountLedgerId],
        );
      }
    });
    if (previousEnv.enabled === undefined) delete process.env.AMIC_OS_VAULT_PROVIDER_ENABLED;
    else process.env.AMIC_OS_VAULT_PROVIDER_ENABLED = previousEnv.enabled;
    if (previousEnv.token === undefined) delete process.env.AMIC_OS_VAULT_PROVIDER_TOKEN;
    else process.env.AMIC_OS_VAULT_PROVIDER_TOKEN = previousEnv.token;
    if (previousEnv.revision === undefined) delete process.env.AMIC_OS_VAULT_PROVIDER_REVISION;
    else process.env.AMIC_OS_VAULT_PROVIDER_REVISION = previousEnv.revision;
  });

  it('authorizes one exact promoted version, rejects binding drift before bytes, consumes once, and proves audit readback', async () => {
    const marker = `OA12-${randomUUID()}`;
    const clientId = await createClient(baseUrl, betaOwnerCookie, marker);
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, marker);
    const lawosMatterId = `matter-lawos-${randomUUID()}`;
    await withClient(createOwnerClient(), (client) =>
      client.query(
        `UPDATE matters
         SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
           || jsonb_build_object('lawosMatterId', $2::text),
           updated_at = now()
         WHERE tenant_id = $1 AND matter_id = $3`,
        [tenantBetaId, lawosMatterId, matterId],
      ),
    );
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, marker);
    await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      bodyText: 'Clean AMIC OS exact-copy integration fixture.',
    });
    const target = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{
        version_id: string;
        file_object_id: string;
        sha256: string;
        size_bytes: string;
        mime_type: string;
        normalized_filename: string;
      }>(
        `SELECT dv.version_id, f.file_object_id, f.sha256, f.size_bytes::text,
                lower(f.mime_type) AS mime_type, f.normalized_filename
         FROM document_versions dv
         JOIN file_objects f
           ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
         WHERE dv.tenant_id = $1 AND dv.document_id = $2
         ORDER BY dv.version_no DESC
         LIMIT 1`,
        [tenantBetaId, uploaded.documentId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('OA12 exact version fixture missing');
      return row;
    });
    const exact: ExactVersion = {
      document_id: uploaded.documentId,
      version_id: target.version_id,
      file_object_id: target.file_object_id,
      sha256: target.sha256,
      byte_size: Number(target.size_bytes),
      mime_type: target.mime_type,
    };
    const operationId = `vaultop_${randomUUID().replaceAll('-', '')}`;
    const correlationId = `vaultcorr_${randomUUID().replaceAll('-', '')}`;
    const installationRef = createHash('sha256').update('oa12-installation').digest('hex');
    const composeTarget = createHash('sha256').update('oa12-compose').digest('hex');
    const authorize = providerBody({
      accountLedgerId,
      lawosMatterId,
      exact,
      operationId,
      correlationId,
      installationRef,
      composeTarget,
    });

    const unauthorized = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/exports/authorize`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: 'wrong-token' },
        body: JSON.stringify(authorize),
      },
    );
    expect(unauthorized.status, await unauthorized.text()).toBe(401);

    const authorizationResponse = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/exports/authorize`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify(authorize),
      },
    );
    const authorizationText = await authorizationResponse.text();
    expect(authorizationResponse.status, authorizationText).toBe(201);
    const authorization = JSON.parse(authorizationText) as Authorization;
    expect(authorization).toMatchObject({
      authority_kind: 'amic-vault-api',
      provider_revision: 'oa12-integration-v1',
      state: 'authorized',
      exact_version: exact,
      attachment_name: target.normalized_filename,
    });
    expect(authorizationText).not.toContain(providerToken);
    expect(authorizationText).not.toMatch(/storage_uri|presigned|token_hash/iu);

    const operation = {
      operation_id: operationId,
      correlation_id: correlationId,
      operation_kind: 'attach_outlook' as const,
      idempotency_key: authorize.idempotency_key,
    };
    const downloadBody = {
      principal: authorize.principal,
      lawos_matter_id: lawosMatterId,
      installation_ref_sha256: installationRef,
      compose_target_sha256: composeTarget,
      operation,
      authorization,
    };
    const drifted = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/exports/download`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify({ ...downloadBody, compose_target_sha256: 'f'.repeat(64) }),
      },
    );
    expect(drifted.status, await drifted.text()).toBe(403);
    const beforeConsume = await withClient(createOwnerClient(), (client) =>
      client.query<{ revoked_at: Date | null }>(
        `SELECT revoked_at FROM preview_access_sessions
         WHERE tenant_id = $1 AND preview_session_id = $2::uuid`,
        [tenantBetaId, authorization.provider_export_ref.slice('vault-export:'.length)],
      ),
    );
    expect(beforeConsume.rows[0]?.revoked_at).toBeNull();

    const downloadResponse = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/exports/download`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify(downloadBody),
      },
    );
    const downloadedBytes = Buffer.from(await downloadResponse.arrayBuffer());
    expect(downloadResponse.status).toBe(201);
    expect(downloadResponse.headers.get('cache-control')).toContain('no-store');
    expect(downloadResponse.headers.get('x-amic-vault-document-id')).toBe(exact.document_id);
    expect(downloadResponse.headers.get('x-amic-vault-version-id')).toBe(exact.version_id);
    expect(downloadResponse.headers.get('x-amic-vault-file-object-id')).toBe(exact.file_object_id);
    expect(downloadResponse.headers.get('x-amic-vault-sha256')).toBe(exact.sha256);
    expect(createHash('sha256').update(downloadedBytes).digest('hex')).toBe(exact.sha256);
    expect(downloadedBytes.byteLength).toBe(exact.byte_size);

    const downloadMetadata = {
      authority_kind: downloadResponse.headers.get('x-amic-vault-authority-kind'),
      authority_ref: downloadResponse.headers.get('x-amic-vault-authority-ref'),
      provider_revision: downloadResponse.headers.get('x-amic-vault-provider-revision'),
      state: 'downloaded',
      provider_export_ref: downloadResponse.headers.get('x-amic-vault-export-ref'),
      exact_version: exact,
      attachment_name: authorization.attachment_name,
      audit: {
        event_id: downloadResponse.headers.get('x-amic-vault-audit-event-id'),
        correlation_id: downloadResponse.headers.get('x-amic-vault-correlation-id'),
      },
    };
    const readbackResponse = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/exports/readback`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify({
          principal: authorize.principal,
          lawos_matter_id: lawosMatterId,
          installation_ref_sha256: installationRef,
          compose_target_sha256: composeTarget,
          operation: {
            operation_id: operationId,
            correlation_id: correlationId,
            operation_kind: 'attach_outlook',
          },
          authorization,
          download: downloadMetadata,
        }),
      },
    );
    const readbackText = await readbackResponse.text();
    expect(readbackResponse.status, readbackText).toBe(201);
    expect(JSON.parse(readbackText)).toMatchObject({
      state: 'consumed',
      provider_export_ref: authorization.provider_export_ref,
      exact_version: exact,
      audit: downloadMetadata.audit,
    });

    const replay = await fetch(`${baseUrl}/v1/integrations/amic-os/vault/exports/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
      body: JSON.stringify(downloadBody),
    });
    const replayBytes = Buffer.from(await replay.arrayBuffer());
    expect(replay.status).toBe(201);
    expect(createHash('sha256').update(replayBytes).digest('hex')).toBe(exact.sha256);
    expect(replayBytes).toEqual(downloadedBytes);
    const replayAuditEventId = replay.headers.get('x-amic-vault-audit-event-id');
    expect(replayAuditEventId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(replayAuditEventId).not.toBe(downloadMetadata.audit.event_id);

    const replayReadback = await fetch(
      `${baseUrl}/v1/integrations/amic-os/vault/exports/readback`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify({
          principal: authorize.principal,
          lawos_matter_id: lawosMatterId,
          installation_ref_sha256: installationRef,
          compose_target_sha256: composeTarget,
          operation: {
            operation_id: operationId,
            correlation_id: correlationId,
            operation_kind: 'attach_outlook',
          },
          authorization,
          download: {
            ...downloadMetadata,
            audit: {
              event_id: replayAuditEventId,
              correlation_id: replay.headers.get('x-amic-vault-correlation-id'),
            },
          },
        }),
      },
    );
    const replayReadbackText = await replayReadback.text();
    expect(replayReadback.status, replayReadbackText).toBe(201);
    expect(JSON.parse(replayReadbackText)).toMatchObject({
      state: 'consumed',
      exact_version: exact,
      audit: { event_id: replayAuditEventId, correlation_id: correlationId },
    });

    const ledger = await withClient(createOwnerClient(), async (client) => {
      const grant = await client.query<{ token_hash: string; revoked_at: Date | null }>(
        `SELECT token_hash, revoked_at
         FROM preview_access_sessions
         WHERE tenant_id = $1 AND preview_session_id = $2::uuid`,
        [tenantBetaId, authorization.provider_export_ref.slice('vault-export:'.length)],
      );
      const audit = await client.query<{ action: string; metadata_json: Record<string, unknown> }>(
        `SELECT action, metadata_json
         FROM audit_events
         WHERE tenant_id = $1 AND correlation_id = $2
         ORDER BY created_at, event_id`,
        [tenantBetaId, correlationId],
      );
      return { grant: grant.rows[0], audit: audit.rows };
    });
    expect(ledger.grant?.token_hash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(ledger.grant?.token_hash).not.toContain(providerToken);
    expect(ledger.grant?.revoked_at).toBeInstanceOf(Date);
    expect(ledger.audit.map(({ action }) => action)).toEqual(expect.arrayContaining([
      'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
      'OUTLOOK_DOCUMENT_INSERT_DENIED',
      'DOCUMENT_DOWNLOADED',
    ]));
    expect(
      ledger.audit
        .filter(({ action }) => action === 'DOCUMENT_DOWNLOADED')
        .map(({ metadata_json }) => metadata_json.reason_code),
    ).toEqual(['amic_os_exact_copy', 'amic_os_exact_copy_replay']);
    const serializedAudit = JSON.stringify(ledger.audit);
    expect(serializedAudit).not.toContain(providerToken);
    expect(serializedAudit).not.toMatch(/storage_uri|presigned|raw_token/iu);
    expect(
      ledger.audit.find(({ action }) => action === 'OUTLOOK_DOCUMENT_INSERT_REQUESTED')
        ?.metadata_json.client_request_hash,
    ).toMatch(/^[a-f0-9]{64}$/u);
  });
});
