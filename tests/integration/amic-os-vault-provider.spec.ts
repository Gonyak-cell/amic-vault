import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { DocumentPermissionService } from '../../apps/api/src/modules/permission/document-permission.service';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { PreviewConvertJob, previewConvertQueueName } from '../../apps/api/src/modules/preview/preview-convert.job';
import { PreviewPrecreateQueueService, type PreviewPrecreateJobPayload } from '../../apps/api/src/modules/preview/preview-precreate-queue.service';
import { PREVIEW_CHUNK_BYTES } from '../../apps/api/src/modules/preview/preview.service';
import {
  addBetaMember,
  betaMemberUserId,
  betaOwnerUserId,
  auditCount,
  createClient,
  createMatter,
  loginBetaOwner,
  markCanonicalReadyFixture,
  uploadPdf,
  uploadDocx,
  uploadDocxVersion,
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
  let memberAccountLedgerId: string;
  let previousIdentity: PreviousIdentity | null = null;
  let previousMemberIdentity: PreviousIdentity | null = null;
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
    memberAccountLedgerId = `user_amic_latest_${randomUUID().replaceAll('-', '')}`;
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
    previousMemberIdentity = await withClient(createOwnerClient(), async (client) => {
      const previous = await client.query<PreviousIdentity>(
        `SELECT identity_value_normalized, status
         FROM user_login_identities
         WHERE tenant_id = $1
           AND user_id = $2
           AND identity_type = 'account_ledger_id'
         LIMIT 1`,
        [tenantBetaId, betaMemberUserId],
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
        [tenantBetaId, betaMemberUserId, memberAccountLedgerId],
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
    vi.spyOn(storage, 'getRangeByStorageUri').mockImplementation(async (tenantId, storageUri, start, end) => {
      const stored = storedObjects.get(storageUri);
      if (!stored || !stored.key.startsWith(`tenants/${tenantId.toLowerCase()}/`)) {
        throw new Error('in-memory integration storage range object missing');
      }
      const bytes = Buffer.from(stored.bytes.subarray(start, end + 1));
      return { key: stored.key, contentLength: bytes.byteLength, contentType: stored.contentType,
        etag: null, body: Readable.from([bytes]) };
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
      if (previousMemberIdentity) {
        await client.query(
          `UPDATE user_login_identities
           SET identity_value_normalized = $3, status = $4, updated_at = now()
           WHERE tenant_id = $1
             AND user_id = $2
             AND identity_type = 'account_ledger_id'`,
          [
            tenantBetaId,
            betaMemberUserId,
            previousMemberIdentity.identity_value_normalized,
            previousMemberIdentity.status,
          ],
        );
      } else {
        await client.query(
          `DELETE FROM user_login_identities
           WHERE tenant_id = $1
             AND user_id = $2
             AND identity_type = 'account_ledger_id'
             AND identity_value_normalized = $3`,
          [tenantBetaId, betaMemberUserId, memberAccountLedgerId],
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

  it('linearizes latest metadata against an actual concurrent member revoke and fails closed after revoke', async () => {
    const marker = `LATEST-RACE-${randomUUID()}`;
    const clientId = await createClient(baseUrl, betaOwnerCookie, marker);
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, marker);
    const lawosMatterId = `matter-lawos-${randomUUID()}`;
    await withClient(createOwnerClient(), (client) => client.query(
      `UPDATE matters
       SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
         || jsonb_build_object('lawosMatterId', $2::text),
         updated_at = now()
       WHERE tenant_id = $1 AND matter_id = $3`,
      [tenantBetaId, lawosMatterId, matterId],
    ));
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, marker);
    await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      bodyText: 'Clean latest authority race fixture.',
    });

    const requestLatest = async () => {
      const response = await fetch(`${baseUrl}/v1/integrations/amic-os/vault/read/latest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify({
          principal: { tenant_id: 'lawos-tenant-correlation', user_id: memberAccountLedgerId },
          lawos_matter_id: lawosMatterId,
          document_id: uploaded.documentId,
        }),
      });
      return { response, text: await response.text() };
    };
    const removeMember = () => fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${betaMemberUserId}`,
      { method: 'DELETE', headers: { cookie: betaOwnerCookie } },
    );

    let permissionObservedResolve!: () => void;
    const permissionObserved = new Promise<void>((resolve) => {
      permissionObservedResolve = resolve;
    });
    let releasePermissionResolve!: () => void;
    const releasePermission = new Promise<void>((resolve) => {
      releasePermissionResolve = resolve;
    });
    const permissionService = app.get(DocumentPermissionService);
    const originalCanRead = permissionService.canReadDocument.bind(permissionService);
    let heldFirstDecision = false;
    const permissionSpy = vi.spyOn(permissionService, 'canReadDocument').mockImplementation(
      async (context, documentId) => {
        const decision = await originalCanRead(context, documentId);
        if (!heldFirstDecision
            && context.userId === betaMemberUserId
            && documentId === uploaded.documentId
            && decision.effect === 'ALLOW') {
          heldFirstDecision = true;
          permissionObservedResolve();
          await releasePermission;
        }
        return decision;
      },
    );

    let removePromise: Promise<Response> | undefined;
    try {
      const latestPromise = requestLatest();
      await expect(Promise.race([
        permissionObserved.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
      ])).resolves.toBe(true);

      removePromise = removeMember();
      const blockedWriter = await withClient(createOwnerClient(), async (client) => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          const result = await client.query<{
            pid: number;
            wait_event_type: string | null;
            wait_event: string | null;
            blockers: number[];
          }>(
            `SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity
             WHERE datname = current_database()
               AND state = 'active'
               AND query LIKE '%DELETE FROM matter_members%'
               AND cardinality(pg_blocking_pids(pid)) > 0
             ORDER BY pid
             LIMIT 1`,
          );
          const row = result.rows[0];
          if (row?.wait_event_type === 'Lock' && row.blockers.length > 0) return row;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return null;
      });
      expect(blockedWriter).toMatchObject({ wait_event_type: 'Lock' });

      releasePermissionResolve();
      const [latest, removed] = await Promise.all([latestPromise, removePromise]);
      expect(latest.response.status, latest.text).toBe(200);
      expect(JSON.parse(latest.text)).toMatchObject({
        authority_kind: 'amic-vault-api',
        matter_id: lawosMatterId,
        exact_version: { document_id: uploaded.documentId, mime_type: 'application/pdf' },
        raw_bytes_included: false,
        storage_locator_returned: false,
        history_included: false,
      });
      expect(removed.status, await removed.text()).toBe(204);

      const afterRevoke = await requestLatest();
      expect(afterRevoke.response.status, afterRevoke.text).toBe(403);

      await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
      const revokeFirst = await removeMember();
      expect(revokeFirst.status, await revokeFirst.text()).toBe(204);
      const afterCompletedRevoke = await requestLatest();
      expect(afterCompletedRevoke.response.status, afterCompletedRevoke.text).toBe(403);
    } finally {
      releasePermissionResolve();
      permissionSpy.mockRestore();
      await removePromise?.catch(() => undefined);
    }
  });

  it('returns a clean promoted latest version and rejects unpromoted or DLP-positive current content', async () => {
    const marker = `LATEST-GATES-${randomUUID()}`;
    const clientId = await createClient(baseUrl, betaOwnerCookie, marker);
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, marker);
    const lawosMatterId = `matter-lawos-${randomUUID()}`;
    await withClient(createOwnerClient(), (client) => client.query(
      `UPDATE matters
       SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
         || jsonb_build_object('lawosMatterId', $2::text),
         updated_at = now()
       WHERE tenant_id = $1 AND matter_id = $3`,
      [tenantBetaId, lawosMatterId, matterId],
    ));
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, marker);
    const versionId = await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      bodyText: 'Clean promoted latest authority fixture.',
    });
    const requestLatest = async () => {
      const response = await fetch(`${baseUrl}/v1/integrations/amic-os/vault/read/latest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [providerHeader]: providerToken },
        body: JSON.stringify({
          principal: { tenant_id: 'lawos-tenant-correlation', user_id: accountLedgerId },
          lawos_matter_id: lawosMatterId,
          document_id: uploaded.documentId,
        }),
      });
      return { response, text: await response.text() };
    };

    const clean = await requestLatest();
    expect(clean.response.status, clean.text).toBe(200);
    expect(JSON.parse(clean.text)).toMatchObject({
      exact_version: { document_id: uploaded.documentId, version_id: versionId },
    });

    const unpromoted = await uploadDocxVersion(
      baseUrl,
      betaOwnerCookie,
      uploaded.documentId,
      `${marker}-unpromoted`,
      'Clean but unpromoted latest content.',
      { markPromoted: false },
    );
    await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      versionId: unpromoted.versionId,
      bodyText: 'Clean but unpromoted latest content.',
      extractionMethod: 'docx',
    });
    const deniedUnpromoted = await requestLatest();
    expect(deniedUnpromoted.response.status, deniedUnpromoted.text).toBe(403);

    const dlpVersion = await uploadDocxVersion(
      baseUrl,
      betaOwnerCookie,
      uploaded.documentId,
      `${marker}-dlp`,
      'Synthetic reserved passport fixture M12345678.',
    );
    await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      versionId: dlpVersion.versionId,
      bodyText: 'Synthetic reserved passport fixture M12345678.',
      extractionMethod: 'docx',
    });
    const deniedDlp = await requestLatest();
    expect(deniedDlp.response.status, deniedDlp.text).toBe(403);
    const dlp = await withClient(createOwnerClient(), (client) => client.query<{
      scan_state: string;
      restricted_finding_count: number;
    }>(
      `SELECT scan_state, restricted_finding_count
       FROM dlp_scan_assessments
       WHERE tenant_id = $1 AND document_id = $2 AND version_id = $3
       ORDER BY created_at DESC, assessment_id DESC
       LIMIT 1`,
      [tenantBetaId, uploaded.documentId, dlpVersion.versionId],
    ));
    expect(dlp.rows[0]).toMatchObject({ scan_state: 'findings', restricted_finding_count: 1 });
  });

  it('queues exact Office preview, preserves its source, streams bounded PDF chunks and denies revoked sessions', async () => {
    const profile = vi.spyOn(app.get(PreviewConvertJob), 'getProfileSha256').mockResolvedValue('c'.repeat(64));
    const marker = `WEB-PREVIEW-${randomUUID()}`;
    const clientId = await createClient(baseUrl, betaOwnerCookie, marker);
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, marker);
    const lawosMatterId = `matter-lawos-${randomUUID()}`;
    await withClient(createOwnerClient(), client => client.query(
      `UPDATE matters SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('lawosMatterId', $2::text)
       WHERE tenant_id = $1 AND matter_id = $3`,
      [tenantBetaId, lawosMatterId, matterId],
    ));
    const uploaded = await uploadDocx(baseUrl, betaOwnerCookie, matterId, marker);
    const row = await withClient(createOwnerClient(), async client => {
      const result = await client.query<ExactVersion & { storage_uri: string }>(
        `SELECT dv.document_id, dv.version_id, f.file_object_id, f.sha256,
                f.size_bytes::integer AS byte_size, f.mime_type, f.storage_uri
         FROM document_versions dv JOIN file_objects f
           ON f.tenant_id = dv.tenant_id AND f.file_object_id = dv.file_object_id
         WHERE dv.tenant_id = $1 AND dv.document_id = $2 AND dv.version_status = 'current'`,
        [tenantBetaId, uploaded.documentId],
      );
      if (!result.rows[0]) throw new Error('Preview source fixture missing');
      return result.rows[0];
    });
    const { storage_uri: sourceUri, ...exact } = row;
    const sourceBytes = Buffer.from(storedObjects.get(sourceUri)?.bytes ?? []);
    expect(sourceBytes.byteLength).toBe(exact.byte_size);
    const base = { principal: { tenant_id: 'lawos-correlation', user_id: accountLedgerId },
      lawos_matter_id: lawosMatterId, requested_exact_version: exact };
    const request = async (action: string, extra: Record<string, unknown> = {}, token = providerToken) => {
      const response = await fetch(`${baseUrl}/v1/integrations/amic-os/vault/read/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json', [providerHeader]: token },
        body: JSON.stringify({ ...base, ...extra }),
      });
      const text = await response.text();
      return { response, text, body: JSON.parse(text) as Record<string, unknown> };
    };
    expect((await request('preview-prepare', { enqueue: true }, 'invalid-token')).response.status).toBe(401);
    expect((await request('preview-prepare', { enqueue: false })).body).toMatchObject({ status: 'pending', preview: null });
    expect((await request('preview-sessions')).response.status).toBe(400);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);
    for (const prepared of await Promise.all([
      request('preview-prepare', { enqueue: true }), request('preview-prepare', { enqueue: true }),
    ])) {
      expect(prepared.response.status, prepared.text).toBe(200);
      expect(prepared.body).toMatchObject({ status: 'pending', exact_version: exact });
    }
    const jobs = await withClient(createOwnerClient(), async client => (await client.query<{
      id: string; data: PreviewPrecreateJobPayload;
    }>(`SELECT id, data FROM pgboss.job WHERE name = $1 AND singleton_key = $2`, [previewConvertQueueName, exact.version_id])).rows);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toMatchObject({ tenantId: tenantBetaId, actorUserId: betaOwnerUserId,
      documentId: exact.document_id, versionId: exact.version_id, fileObjectId: exact.file_object_id });
    if (!jobs[0]) throw new Error('Queued preview fixture missing');
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(PREVIEW_CHUNK_BYTES, 32), Buffer.from('\n%%EOF')]);
    const converter = vi.spyOn(app.get(PreviewConvertJob), 'convertOfficeToPdf').mockResolvedValueOnce(pdf);
    try {
      await app.get(PreviewPrecreateQueueService).handle(jobs[0].data);
      expect(converter).toHaveBeenCalledWith(expect.objectContaining({ body: sourceBytes }));
    } finally {
      converter.mockRestore();
      await withClient(createOwnerClient(), client => client.query(
        `DELETE FROM pgboss.job WHERE name = $1 AND id = $2`, [previewConvertQueueName, jobs[0]?.id],
      ));
    }
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(0);
    const ready = await request('preview-prepare', { enqueue: false });
    expect(ready.body).toMatchObject({ status: 'ready', exact_version: exact,
      preview: { byte_size: pdf.byteLength, mime_type: 'application/pdf', sha256: createHash('sha256').update(pdf).digest('hex') } });
    expect(ready.text).not.toMatch(/storage_uri|s3:\/\//);
    const beforeProfileChange = ready.body.preview as { file_object_id: string };
    profile.mockResolvedValue('d'.repeat(64));
    const outdated = await request('preview-prepare', { enqueue: false });
    expect(outdated.body).toMatchObject({ status: 'pending', preview: null, exact_version: exact });
    expect((await request('preview-sessions')).response.status).toBe(400);
    expect((await request('preview-prepare', { enqueue: true })).body).toMatchObject({ status: 'pending' });
    const replacementJob = await withClient(createOwnerClient(), async client => (await client.query<{
      id: string; data: PreviewPrecreateJobPayload;
    }>(`SELECT id, data FROM pgboss.job WHERE name = $1 AND singleton_key = $2`,
    [previewConvertQueueName, exact.version_id])).rows);
    expect(replacementJob).toHaveLength(1);
    if (!replacementJob[0]) throw new Error('Replacement preview job missing');
    const changedConverter = vi.spyOn(app.get(PreviewConvertJob), 'convertOfficeToPdf').mockResolvedValue(pdf);
    try {
      await app.get(PreviewPrecreateQueueService).handle(replacementJob[0].data);
      await app.get(PreviewPrecreateQueueService).handle(replacementJob[0].data);
      expect(changedConverter).toHaveBeenCalledTimes(1);
      expect(changedConverter).toHaveBeenCalledWith(expect.objectContaining({
        body: sourceBytes, converterProfileSha256: 'd'.repeat(64),
      }));
    } finally {
      changedConverter.mockRestore();
      await withClient(createOwnerClient(), client => client.query(
        `DELETE FROM pgboss.job WHERE name = $1 AND id = $2`, [previewConvertQueueName, replacementJob[0]?.id],
      ));
    }
    const replaced = await request('preview-prepare', { enqueue: false });
    expect(replaced.body).toMatchObject({ status: 'ready', exact_version: exact });
    expect((replaced.body.preview as { file_object_id: string }).file_object_id).not.toBe(beforeProfileChange.file_object_id);
    const stale = await request('preview-sessions', { requested_exact_version: { ...exact, sha256: 'f'.repeat(64) } });
    expect(stale.response.status).toBe(404);
    const issued = await request('preview-sessions');
    expect(issued.response.status, issued.text).toBe(200);
    expect(issued.response.headers.get('cache-control')?.split(',').map(value => value.trim()).sort())
      .toEqual(['private', 'no-store', 'no-cache', 'max-age=0', 'must-revalidate'].sort());
    expect(issued.response.headers.get('pragma')).toBe('no-cache');
    expect(issued.response.headers.get('expires')).toBe('0');
    const session = issued.body.session as { previewSessionId: string; token: string };
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
    const chunkRequest = { preview_session_id: session.previewSessionId, token: session.token, preview: issued.body.preview };
    const downloaded: Buffer[] = [];
    for (let offset = 0; offset < pdf.byteLength; offset += PREVIEW_CHUNK_BYTES) {
      const result = await request('preview-chunk', { ...chunkRequest, offset });
      expect(result.response.status, result.text.slice(0, 300)).toBe(200);
      const chunk = result.body.chunk as { byte_size: number; content_base64: string; sha256: string };
      const bytes = Buffer.from(chunk.content_base64, 'base64');
      expect(bytes.byteLength).toBe(Math.min(PREVIEW_CHUNK_BYTES, pdf.byteLength - offset));
      expect(chunk.byte_size).toBe(bytes.byteLength);
      expect(chunk.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(result.body.final_chunk).toBe(offset + bytes.byteLength === pdf.byteLength);
      expect(result.text).not.toContain(session.token);
      downloaded.push(bytes);
    }
    expect(Buffer.concat(downloaded).equals(pdf)).toBe(true);
    expect(storedObjects.get(sourceUri)?.bytes).toEqual(sourceBytes);
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_VIEWED')).toBe(1);
    const finalState = await withClient(createOwnerClient(), async client => {
      const versions = await client.query(`SELECT file_object_id FROM document_versions WHERE tenant_id = $1 AND document_id = $2`, [tenantBetaId, exact.document_id]);
      const artifact = await client.query(`SELECT status, file_object_id, source_sha256, converter_profile_sha256
        FROM document_preview_artifacts WHERE tenant_id = $1 AND version_id = $2`, [tenantBetaId, exact.version_id]);
      await client.query(`UPDATE preview_access_sessions SET revoked_at = now() WHERE tenant_id = $1 AND preview_session_id = $2`, [tenantBetaId, session.previewSessionId]);
      return { versions: versions.rows, artifact: artifact.rows };
    });
    expect(finalState.versions).toEqual([{ file_object_id: exact.file_object_id }]);
    expect(finalState.artifact).toEqual([{ status: 'ready', file_object_id: (issued.body.preview as { file_object_id: string }).file_object_id,
      source_sha256: exact.sha256, converter_profile_sha256: 'd'.repeat(64) }]);
    expect(finalState.artifact[0]?.file_object_id).not.toBe(exact.file_object_id);
    const denied = await request('preview-chunk', { ...chunkRequest, offset: 0 });
    expect(denied.response.status).toBe(404);
    expect(denied.text).not.toMatch(/content_base64|storage_uri/);
    profile.mockRestore();
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
