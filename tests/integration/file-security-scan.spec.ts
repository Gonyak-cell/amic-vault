import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AuditService } from '../../apps/api/src/modules/audit/audit.service';
import { FileSecurityService } from '../../apps/api/src/modules/file-security/file-security.service';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, tenantBetaId, withClient } from './helpers/db';

const expectedSha256 = '8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860';

describe('file security scan integration', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let fileSecurity: FileSecurityService;
  let audit: AuditService;
  let storage: StorageService;
  let scanId: string;
  let quarantineRef: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    fileSecurity = app.get(FileSecurityService);
    audit = app.get(AuditService);
    storage = app.get(StorageService);
    const row = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{ matter_id: string; user_id: string }>(`
        SELECT m.matter_id, u.user_id FROM matters m JOIN users u ON u.tenant_id = m.tenant_id
        WHERE m.tenant_id = $1 LIMIT 1`, [tenantBetaId]);
      return result.rows[0];
    });
    if (!row) throw new Error('file security fixture missing');
    scanId = randomUUID(); quarantineRef = randomUUID();
    await withClient(createOwnerClient(), (client) => client.query(`
      INSERT INTO file_security_scans (scan_id, tenant_id, matter_id, quarantine_ref, quarantine_storage_uri, expected_sha256, size_bytes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 4, $7)`, [scanId, tenantBetaId, row.matter_id, quarantineRef, `s3://amic-vault-dev/tenants/${tenantBetaId}/quarantine/${quarantineRef}`, expectedSha256, row.user_id]));
  });

  afterAll(async () => { await withClient(createOwnerClient(), async (client) => { await client.query('DELETE FROM file_security_scan_attempts WHERE tenant_id = $1 AND scan_id = $2', [tenantBetaId, scanId]); await client.query('DELETE FROM file_security_scans WHERE tenant_id = $1 AND scan_id = $2', [tenantBetaId, scanId]); }); await app.close(); vi.unstubAllGlobals(); });

  it('records a clean result and audit only after the worker verdict', async () => {
    vi.spyOn(storage, 'getByStorageUri').mockResolvedValue({ body: Readable.from([Buffer.from('safe')]), key: 'ignored', contentLength: 4, contentType: 'application/octet-stream', etag: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ outcome: 'clean', engine_version: '1.4.3', signature_age_seconds: 1 }), { status: 200 })));
    await fileSecurity.handle({ tenantId: tenantBetaId, quarantineRef, expectedSha256 });
    await withClient(createOwnerClient(), async (client) => {
      const scan = await client.query<{ state: string; result_code: string }>('SELECT state, result_code FROM file_security_scans WHERE tenant_id = $1 AND scan_id = $2', [tenantBetaId, scanId]);
      const event = await client.query('SELECT event_id FROM audit_events WHERE tenant_id = $1 AND action = $2 AND target_id = $3', [tenantBetaId, 'FILE_SCAN_COMPLETED', scanId]);
      expect(scan.rows[0]).toEqual({ state: 'clean', result_code: 'clean' }); expect(event.rowCount).toBe(1);
    });
  });

  it('rolls back terminal state when its audit write fails', async () => {
    const auditLog = vi.spyOn(audit, 'log').mockRejectedValueOnce(new Error('audit unavailable'));
    await withClient(createOwnerClient(), (client) => client.query("UPDATE file_security_scans SET state = 'security_hold', result_code = 'manual_hold', observed_sha256 = NULL, engine_version = NULL, signature_at = NULL WHERE tenant_id = $1 AND scan_id = $2", [tenantBetaId, scanId]));
    await expect(fileSecurity.handle({ tenantId: tenantBetaId, quarantineRef, expectedSha256 })).rejects.toThrow('audit unavailable');
    await withClient(createOwnerClient(), async (client) => {
      const scan = await client.query<{ state: string }>('SELECT state FROM file_security_scans WHERE tenant_id = $1 AND scan_id = $2', [tenantBetaId, scanId]);
      expect(scan.rows[0]?.state).toBe('scanning');
    });
    auditLog.mockRestore();
  });
});
