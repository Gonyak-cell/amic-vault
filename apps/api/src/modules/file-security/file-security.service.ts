import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import type { FileSecurityScanJobPayload } from './file-security.types';

type Verdict = 'clean' | 'infected' | 'error' | 'stale_signature';
type ScanState = 'clean' | 'infected' | 'error' | 'security_hold';
type ResultCode = 'clean' | 'infected' | 'scanner_error' | 'scanner_timeout' | 'malformed_response' | 'stale_signature' | 'hash_mismatch';

interface ScanTarget {
  scanId: string;
  matterId: string;
  storageUri: string;
  sizeBytes: number;
  attemptNo: number;
}

function workerUrl(): string { return `${(process.env.INGESTION_WORKER_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')}/security/scan`; }
function timeoutMs(): number { const value = Number(process.env.FILE_SECURITY_SCAN_TIMEOUT_MS ?? '10000'); return Number.isInteger(value) && value > 0 ? value : 10000; }
function validHash(value: string): boolean { return /^[a-f0-9]{64}$/u.test(value); }

@Injectable()
export class FileSecurityService {
  constructor(private readonly auditService: AuditService, private readonly storageService: StorageService) {}

  async handle(payload: FileSecurityScanJobPayload): Promise<void> {
    if (!validHash(payload.expectedSha256)) throw new Error('FILE_SECURITY_PAYLOAD_INVALID');
    const target = await this.claim(payload);
    if (!target) return;
    const result = await this.scan(target, payload);
    await this.complete(target, payload, result);
  }

  private async claim(payload: FileSecurityScanJobPayload): Promise<ScanTarget | null> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const found = await tx.query<{ scan_id: string; matter_id: string; quarantine_storage_uri: string; size_bytes: string; state: string }>(`
        SELECT scan_id, matter_id, quarantine_storage_uri, size_bytes, state
        FROM file_security_scans
        WHERE tenant_id = $1 AND quarantine_ref = $2 AND expected_sha256 = $3
        FOR UPDATE`, [payload.tenantId, payload.quarantineRef, payload.expectedSha256]);
      const row = found.rows[0];
      if (!row) throw new Error('FILE_SECURITY_SCAN_NOT_FOUND');
      if (!['quarantined', 'error', 'security_hold'].includes(row.state)) return null;
      const attempt = await tx.query<{ attempt_no: number }>(`
        SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no FROM file_security_scan_attempts
        WHERE tenant_id = $1 AND scan_id = $2`, [payload.tenantId, row.scan_id]);
      const attemptNo = attempt.rows[0]?.attempt_no;
      if (!attemptNo) throw new Error('FILE_SECURITY_ATTEMPT_UNAVAILABLE');
      await tx.query(`UPDATE file_security_scans SET state = 'scanning', updated_at = now() WHERE tenant_id = $1 AND scan_id = $2`, [payload.tenantId, row.scan_id]);
      await tx.query(`INSERT INTO file_security_scan_attempts (tenant_id, scan_id, attempt_no, expected_sha256) VALUES ($1, $2, $3, $4)`, [payload.tenantId, row.scan_id, attemptNo, payload.expectedSha256]);
      return { scanId: row.scan_id, matterId: row.matter_id, storageUri: row.quarantine_storage_uri, sizeBytes: Number(row.size_bytes), attemptNo };
    });
  }

  private async scan(target: ScanTarget, payload: FileSecurityScanJobPayload): Promise<{ state: ScanState; code: ResultCode; observedSha256: string | null; engineVersion: string | null; signatureAt: Date | null }> {
    try {
      if (!Number.isSafeInteger(target.sizeBytes) || target.sizeBytes < 0 || target.sizeBytes > 25 * 1024 * 1024) return this.failure('scanner_error');
      const object = await this.storageService.getByStorageUri(payload.tenantId, target.storageUri);
      const chunks: Buffer[] = []; let total = 0; const hash = createHash('sha256');
      for await (const part of object.body) { const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part); total += chunk.length; if (total > 25 * 1024 * 1024) return this.failure('scanner_error'); hash.update(chunk); chunks.push(chunk); }
      const observedSha256 = hash.digest('hex');
      if (observedSha256 !== payload.expectedSha256) return { ...this.failure('hash_mismatch'), observedSha256 };
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs());
      try {
        const form = new FormData(); form.append('quarantine_ref', payload.quarantineRef); form.append('expected_sha256', payload.expectedSha256); form.append('file', new Blob([new Uint8Array(Buffer.concat(chunks))]), 'quarantine.bin');
        const response = await fetch(workerUrl(), { method: 'POST', headers: { 'x-amic-tenant-id': payload.tenantId }, body: form, signal: controller.signal });
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!response.ok || !body || !['clean', 'infected', 'error', 'stale_signature'].includes(String(body.outcome))) return this.failure('malformed_response', observedSha256);
        const verdict = body.outcome as Verdict;
        const engineVersion = typeof body.engine_version === 'string' && body.engine_version.length <= 128 ? body.engine_version : null;
        const signatureAge = typeof body.signature_age_seconds === 'number' && Number.isSafeInteger(body.signature_age_seconds) && body.signature_age_seconds >= 0 ? body.signature_age_seconds : null;
        if ((verdict === 'clean' || verdict === 'infected') && (!engineVersion || signatureAge === null)) return this.failure('malformed_response', observedSha256);
        const signatureAt = signatureAge === null ? null : new Date(Date.now() - signatureAge * 1000);
        if (verdict === 'clean') return { state: 'clean', code: 'clean', observedSha256, engineVersion, signatureAt };
        if (verdict === 'infected') return { state: 'infected', code: 'infected', observedSha256, engineVersion, signatureAt };
        if (verdict === 'stale_signature') return { state: 'security_hold', code: 'stale_signature', observedSha256, engineVersion, signatureAt };
        return this.failure('scanner_error', observedSha256);
      } finally { clearTimeout(timer); }
    } catch (error) { return this.failure(error instanceof DOMException && error.name === 'AbortError' ? 'scanner_timeout' : 'scanner_error'); }
  }

  private failure(code: Extract<ResultCode, 'scanner_error' | 'scanner_timeout' | 'malformed_response' | 'hash_mismatch'>, observedSha256: string | null = null) { return { state: code === 'hash_mismatch' ? 'security_hold' as const : 'error' as const, code, observedSha256, engineVersion: null, signatureAt: null }; }

  private async complete(target: ScanTarget, payload: FileSecurityScanJobPayload, result: Awaited<ReturnType<FileSecurityService['scan']>>): Promise<void> {
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      await this.updateScan(tx, target, payload, result);
      await this.auditService.log({ tenantId: payload.tenantId, actorType: 'system', action: result.state === 'security_hold' ? 'FILE_SECURITY_HELD' : 'FILE_SCAN_COMPLETED', targetType: 'file_security_scan', targetId: target.scanId, matterId: target.matterId, result: result.state === 'error' ? 'failure' : 'success', metadata: { hash: result.observedSha256 ?? payload.expectedSha256, queue_name: 'security.file-scan', reason_code: result.code } }, tx);
    });
  }

  private async updateScan(tx: PoolClient, target: ScanTarget, payload: FileSecurityScanJobPayload, result: Awaited<ReturnType<FileSecurityService['scan']>>): Promise<void> {
    const values = [payload.tenantId, target.scanId, target.attemptNo, result.state, result.code, result.observedSha256, result.engineVersion, result.signatureAt];
    await tx.query(`UPDATE file_security_scan_attempts SET state = $4, result_code = $5, observed_sha256 = $6, engine_version = $7, signature_at = $8, finished_at = now() WHERE tenant_id = $1 AND scan_id = $2 AND attempt_no = $3`, values);
    await tx.query(`UPDATE file_security_scans SET state = $3, result_code = $4, observed_sha256 = $5, engine_version = $6, signature_at = $7, updated_at = now() WHERE tenant_id = $1 AND scan_id = $2 AND state = 'scanning'`, [payload.tenantId, target.scanId, result.state, result.code, result.observedSha256, result.engineVersion, result.signatureAt]);
  }
}
