import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AuditService } from '../../apps/api/src/modules/audit/audit.service';
import { FileSecurityService } from '../../apps/api/src/modules/file-security/file-security.service';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { tenantAlphaId, tenantBetaId, createOwnerClient, withClient } from './helpers/db';

const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');

async function startVerdictServer(body: Record<string, unknown>, hang = false): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    if (hang) return;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test scanner server unavailable');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe('file security promotion fault integration', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let fileSecurity: FileSecurityService;
  let audit: AuditService;
  let storage: StorageService;
  let clientId: string;
  let matterId: string;
  let userId: string;
  const scanIds: string[] = [];
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    fileSecurity = app.get(FileSecurityService);
    audit = app.get(AuditService);
    storage = app.get(StorageService);
    const fixture = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{ user_id: string }>(
        `SELECT user_id
         FROM users
         WHERE tenant_id = $1
         LIMIT 1`,
        [tenantAlphaId],
      );
      return result.rows[0];
    });
    if (!fixture) throw new Error('file security fixture missing');
    clientId = randomUUID();
    matterId = randomUUID();
    userId = fixture.user_id;
    await withClient(createOwnerClient(), (client) => client.query(
      `WITH inserted_client AS (
        INSERT INTO clients (client_id, tenant_id, name, created_by)
        VALUES ($1, $2, 'File security promotion fault client', $3)
      )
      INSERT INTO matters (
        matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
        status, lead_lawyer_id, created_by
      ) VALUES ($4, $2, $1, $5, 'File security promotion fault fixture', 'contract', 'active', $3, $3)`,
      [clientId, tenantAlphaId, userId, matterId, `FPROM-${matterId}`],
    ));
  });

  afterAll(async () => {
    await withClient(createOwnerClient(), async (client) => {
      if (scanIds.length > 0) {
        await client.query('DELETE FROM file_security_scan_attempts WHERE tenant_id = $1 AND scan_id = ANY($2::uuid[])', [tenantAlphaId, scanIds]);
        await client.query('DELETE FROM file_security_scans WHERE tenant_id = $1 AND scan_id = ANY($2::uuid[])', [tenantAlphaId, scanIds]);
      }
      await client.query('DELETE FROM matters WHERE tenant_id = $1 AND matter_id = $2', [tenantAlphaId, matterId]);
      await client.query('DELETE FROM clients WHERE tenant_id = $1 AND client_id = $2', [tenantAlphaId, clientId]);
    });
    for (const storageUri of storageUris) await storage.deleteByStorageUri(tenantAlphaId, storageUri);
    await app.close();
  });

  async function createScan(body: Buffer, expectedSha256 = sha256(body)) {
    const quarantineRef = randomUUID();
    const scanId = randomUUID();
    const stored = await storage.putQuarantineObject({
      tenantId: tenantAlphaId,
      quarantineRef,
      body: Readable.from([body]),
      contentLength: body.length,
      contentType: 'application/pdf',
    });
    await withClient(createOwnerClient(), (client) => client.query(
      `INSERT INTO file_security_scans (
        scan_id, tenant_id, matter_id, quarantine_ref, quarantine_storage_uri,
        expected_sha256, size_bytes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [scanId, tenantAlphaId, matterId, quarantineRef, stored.storageUri, expectedSha256, body.length, userId],
    ));
    scanIds.push(scanId);
    storageUris.push(stored.storageUri);
    return { expectedSha256, quarantineRef, scanId };
  }

  async function state(scanId: string) {
    return withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{ state: string; result_code: string }>(
        'SELECT state, result_code FROM file_security_scans WHERE tenant_id = $1 AND scan_id = $2',
        [tenantAlphaId, scanId],
      );
      return result.rows[0];
    });
  }

  async function assertNoPromotion(scanId: string) {
    await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM file_security_promotions
         WHERE tenant_id = $1 AND scan_id = $2`,
        [tenantAlphaId, scanId],
      );
      expect(result.rows[0]?.count).toBe('0');
    });
  }

  it('keeps EICAR bytes infected with no promotion receipt or document surface', async () => {
    const eicar = Buffer.concat([
      Buffer.from('X5O!P%@AP[4'),
      Buffer.from([92]),
      Buffer.from('PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
    ]);
    const target = await createScan(eicar);

    await fileSecurity.handle({ tenantId: tenantAlphaId, quarantineRef: target.quarantineRef, expectedSha256: target.expectedSha256 });

    expect(await state(target.scanId)).toEqual({ state: 'infected', result_code: 'infected' });
    await assertNoPromotion(target.scanId);
    await withClient(createOwnerClient(), async (client) => {
      const auditEvent = await client.query(
        `SELECT event_id FROM audit_events
         WHERE tenant_id = $1 AND action = 'FILE_SCAN_COMPLETED' AND target_id = $2 AND result = 'success'`,
        [tenantAlphaId, target.scanId],
      );
      expect(auditEvent.rowCount).toBe(1);
      await expect(client.query(
        'UPDATE file_security_scans SET observed_sha256 = NULL WHERE tenant_id = $1 AND scan_id = $2',
        [tenantAlphaId, target.scanId],
      )).rejects.toThrow();
    });
  });

  it('fails closed for unavailable, timeout, stale, hash-mismatch, cross-tenant, and audit-failure paths', async () => {
    const originalWorkerUrl = process.env.INGESTION_WORKER_URL;
    const originalTimeout = process.env.FILE_SECURITY_SCAN_TIMEOUT_MS;
    const restore = () => {
      if (originalWorkerUrl === undefined) delete process.env.INGESTION_WORKER_URL;
      else process.env.INGESTION_WORKER_URL = originalWorkerUrl;
      if (originalTimeout === undefined) delete process.env.FILE_SECURITY_SCAN_TIMEOUT_MS;
      else process.env.FILE_SECURITY_SCAN_TIMEOUT_MS = originalTimeout;
    };
    try {
      const unavailable = await createScan(Buffer.from('%PDF-1.7\nunavailable'));
      process.env.INGESTION_WORKER_URL = 'http://127.0.0.1:1';
      await fileSecurity.handle({ tenantId: tenantAlphaId, quarantineRef: unavailable.quarantineRef, expectedSha256: unavailable.expectedSha256 });
      expect(await state(unavailable.scanId)).toEqual({ state: 'error', result_code: 'scanner_error' });
      await assertNoPromotion(unavailable.scanId);

      const hanging = await startVerdictServer({}, true);
      const timeout = await createScan(Buffer.from('%PDF-1.7\ntimeout'));
      process.env.INGESTION_WORKER_URL = hanging.url;
      process.env.FILE_SECURITY_SCAN_TIMEOUT_MS = '10';
      await fileSecurity.handle({ tenantId: tenantAlphaId, quarantineRef: timeout.quarantineRef, expectedSha256: timeout.expectedSha256 });
      await new Promise<void>((resolve) => hanging.server.close(() => resolve()));
      expect(await state(timeout.scanId)).toEqual({ state: 'error', result_code: 'scanner_timeout' });
      await assertNoPromotion(timeout.scanId);

      const staleServer = await startVerdictServer({ outcome: 'stale_signature', engine_version: 'test', signature_age_seconds: 1 });
      const stale = await createScan(Buffer.from('%PDF-1.7\nstale'));
      process.env.INGESTION_WORKER_URL = staleServer.url;
      await fileSecurity.handle({ tenantId: tenantAlphaId, quarantineRef: stale.quarantineRef, expectedSha256: stale.expectedSha256 });
      await new Promise<void>((resolve) => staleServer.server.close(() => resolve()));
      expect(await state(stale.scanId)).toEqual({ state: 'security_hold', result_code: 'stale_signature' });
      await assertNoPromotion(stale.scanId);

      const mismatch = await createScan(Buffer.from('%PDF-1.7\nhash-mismatch'), 'a'.repeat(64));
      await fileSecurity.handle({ tenantId: tenantAlphaId, quarantineRef: mismatch.quarantineRef, expectedSha256: mismatch.expectedSha256 });
      expect(await state(mismatch.scanId)).toEqual({ state: 'security_hold', result_code: 'hash_mismatch' });
      await assertNoPromotion(mismatch.scanId);

      const crossTenant = await createScan(Buffer.from('%PDF-1.7\ncross-tenant'));
      await expect(fileSecurity.handle({ tenantId: tenantBetaId, quarantineRef: crossTenant.quarantineRef, expectedSha256: crossTenant.expectedSha256 })).rejects.toThrow('FILE_SECURITY_SCAN_NOT_FOUND');
      expect(await state(crossTenant.scanId)).toEqual({ state: 'quarantined', result_code: 'pending' });
      await assertNoPromotion(crossTenant.scanId);

      const auditFailure = await createScan(Buffer.from('%PDF-1.7\naudit-failure'));
      const auditLog = vi.spyOn(audit, 'log').mockRejectedValueOnce(new Error('audit unavailable'));
      process.env.INGESTION_WORKER_URL = originalWorkerUrl;
      await expect(fileSecurity.handle({ tenantId: tenantAlphaId, quarantineRef: auditFailure.quarantineRef, expectedSha256: auditFailure.expectedSha256 })).rejects.toThrow('audit unavailable');
      auditLog.mockRestore();
      expect(await state(auditFailure.scanId)).toEqual({ state: 'scanning', result_code: 'pending' });
      await assertNoPromotion(auditFailure.scanId);
    } finally {
      restore();
    }
  }, 15_000);
});
