import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { fetchIngestionWorker } from '../document/extraction/private-gateway.transport';
import { StorageService } from '../storage/storage.service';
import { StorageObjectAlreadyExistsError } from '../storage/storage-adapter.interface';
import { FilePromotionService } from './file-promotion.service';
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

interface DocumentEditTarget {
  subversion_id: string;
  matter_id: string;
  base_version_id: string;
  status: string;
  file_object_id: string;
  file_hash: string;
  storage_uri: string;
  size_bytes: string | number;
  mime_type: string;
  sha256: string;
}

interface DocumentEditScanRow {
  scan_id: string;
  matter_id: string;
  quarantine_ref: string;
  quarantine_storage_uri: string;
  expected_sha256: string;
  observed_sha256: string | null;
  size_bytes: string | number;
  state: string;
  result_code: string;
  signature_at: Date | null;
  created_by: string;
  promoted_document_id?: string | null;
  promoted_version_id?: string | null;
  promoted_file_object_id?: string | null;
  primary_sha256?: string | null;
  promoted_by?: string | null;
}

export interface DocumentEditSecurityBinding {
  tenantId: string;
  scanId: string;
  quarantineRef: string;
  matterId: string;
  subversionId: string;
  fileObjectId: string;
  sourceStorageUri: string;
  sha256: string;
  sizeBytes: number;
  actorUserId: string;
}

export interface BindDocumentEditPromotionInput {
  binding: DocumentEditSecurityBinding;
  documentId: string;
  versionId: string;
  fileObjectId: string;
  sha256: string;
  actorUserId: string;
}

const maxScanBytes = 1024 * 1024 * 1024;
const defaultScanTimeoutMs = 2 * 60 * 60 * 1000;
const defaultMaxSignatureAgeSeconds = 24 * 60 * 60;

function timeoutMs(): number {
  const value = Number(process.env.FILE_SECURITY_SCAN_TIMEOUT_MS ?? defaultScanTimeoutMs);
  return Number.isSafeInteger(value) && value > 0 && value <= 24 * 60 * 60 * 1000
    ? value
    : defaultScanTimeoutMs;
}
function validHash(value: string): boolean { return /^[a-f0-9]{64}$/u.test(value); }
function freshSignature(value: Date | null): boolean {
  const maximum = Number(process.env.FILE_SECURITY_MAX_SIGNATURE_AGE_SECONDS ?? defaultMaxSignatureAgeSeconds);
  const maximumSeconds = Number.isSafeInteger(maximum) && maximum > 0
    ? maximum
    : defaultMaxSignatureAgeSeconds;
  return value !== null && Date.now() - value.getTime() >= 0
    && Date.now() - value.getTime() <= maximumSeconds * 1000;
}
function isLegacyPromotionInputMissing(error: unknown): boolean {
  return error instanceof Error && error.message === 'FILE_SECURITY_PROMOTION_INPUT_MISSING';
}

@Injectable()
export class FileSecurityService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FilePromotionService) private readonly filePromotionService: FilePromotionService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  async handle(payload: FileSecurityScanJobPayload): Promise<void> {
    if (!validHash(payload.expectedSha256)) throw new Error('FILE_SECURITY_PAYLOAD_INVALID');
    const target = await this.claim(payload);
    if (!target) {
      try {
        await this.filePromotionService.promote(payload);
      } catch (error) {
        if (!isLegacyPromotionInputMissing(error)) throw error;
      }
      return;
    }
    const result = await this.scan(target, payload);
    await this.complete(target, payload, result);
    if (result.state === 'clean') {
      try {
        await this.filePromotionService.promote(payload);
      } catch (error) {
        if (!isLegacyPromotionInputMissing(error)) throw error;
      }
    }
  }

  async prepareDocumentEditPromotion(input: {
    tenantId: string;
    actorUserId: string;
    documentId: string;
    subversionId: string;
    expectedBaseVersionId: string;
  }): Promise<DocumentEditSecurityBinding> {
    const target = await this.auditService.transaction(input.tenantId, async (tx) => {
      const result = await tx.query<DocumentEditTarget>(`
        SELECT sv.subversion_id, d.matter_id, sv.base_version_id, sv.status,
          sv.file_object_id, sv.file_hash, f.storage_uri, f.size_bytes,
          f.mime_type, f.sha256
        FROM document_subversions sv
        JOIN documents d
          ON d.tenant_id = sv.tenant_id AND d.document_id = sv.document_id
        JOIN file_objects f
          ON f.tenant_id = sv.tenant_id AND f.file_object_id = sv.file_object_id
        WHERE sv.tenant_id = $1 AND sv.document_id = $2 AND sv.subversion_id = $3
        LIMIT 1
      `, [input.tenantId, input.documentId, input.subversionId]);
      return result.rows[0] ?? null;
    });
    const sizeBytes = Number(target?.size_bytes);
    if (!target) throw new Error('FILE_SECURITY_EDIT_TARGET_NOT_FOUND');
    if (target.base_version_id !== input.expectedBaseVersionId) {
      throw new Error('FILE_SECURITY_EDIT_BASE_VERSION_STALE');
    }
    if (!['submitted', 'promoted'].includes(target.status)) {
      throw new Error('FILE_SECURITY_EDIT_SUBVERSION_NOT_PROMOTABLE');
    }
    if (
      target.file_hash !== target.sha256 ||
      !validHash(target.sha256) ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > maxScanBytes
    ) {
      throw new Error('FILE_SECURITY_EDIT_TARGET_INVALID');
    }

    const quarantineRef = target.subversion_id;
    const quarantineStorageUri = this.storageService.quarantineStorageUri(
      input.tenantId,
      quarantineRef,
    );
    await this.ensureDocumentEditQuarantine({
      tenantId: input.tenantId,
      quarantineRef,
      quarantineStorageUri,
      sourceStorageUri: target.storage_uri,
      sizeBytes,
      mimeType: target.mime_type,
      sha256: target.sha256,
    });

    const scan = await this.auditService.transaction(input.tenantId, async (tx) => {
      const inserted = await tx.query<{ scan_id: string }>(`
        INSERT INTO file_security_scans (
          tenant_id, matter_id, quarantine_ref, quarantine_storage_uri,
          expected_sha256, size_bytes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, quarantine_ref) DO NOTHING
        RETURNING scan_id
      `, [input.tenantId, target.matter_id, quarantineRef, quarantineStorageUri,
        target.sha256, sizeBytes, input.actorUserId]);
      const found = await tx.query<DocumentEditScanRow>(`
        SELECT scan_id, matter_id, quarantine_ref, quarantine_storage_uri,
          expected_sha256, observed_sha256, size_bytes, state, result_code,
          signature_at, created_by
        FROM file_security_scans
        WHERE tenant_id = $1 AND quarantine_ref = $2
        FOR UPDATE
      `, [input.tenantId, quarantineRef]);
      const row = found.rows[0];
      if (!row || row.matter_id !== target.matter_id
          || row.quarantine_storage_uri !== quarantineStorageUri
          || row.expected_sha256 !== target.sha256
          || Number(row.size_bytes) !== sizeBytes) {
        throw new Error('FILE_SECURITY_EDIT_SCAN_CONFLICT');
      }
      if (inserted.rows[0]?.scan_id) {
        await this.auditService.log({
          tenantId: input.tenantId,
          actorId: input.actorUserId,
          action: 'FILE_QUARANTINED',
          targetType: 'file_security_scan',
          targetId: row.scan_id,
          matterId: target.matter_id,
          result: 'success',
          metadata: {
            hash: target.sha256,
            queue_name: 'security.file-scan',
            source: 'document_edit',
            subversion_id: input.subversionId,
          },
        }, tx);
      }
      return row;
    });

    await this.handle({
      tenantId: input.tenantId,
      quarantineRef,
      expectedSha256: target.sha256,
    });
    const verified = await this.auditService.transaction(input.tenantId, async (tx) => {
      const result = await tx.query<DocumentEditScanRow>(`
        SELECT scan_id, matter_id, quarantine_ref, quarantine_storage_uri,
          expected_sha256, observed_sha256, size_bytes, state, result_code,
          signature_at, created_by
        FROM file_security_scans
        WHERE tenant_id = $1 AND scan_id = $2
      `, [input.tenantId, scan.scan_id]);
      return result.rows[0] ?? null;
    });
    if (!verified || !['clean', 'promoted'].includes(verified.state)
        || verified.result_code !== 'clean'
        || verified.expected_sha256 !== target.sha256
        || verified.observed_sha256 !== target.sha256
        || !freshSignature(verified.signature_at)) {
      throw new Error('FILE_SECURITY_EDIT_PROMOTION_DENIED');
    }
    return {
      tenantId: input.tenantId,
      scanId: verified.scan_id,
      quarantineRef,
      matterId: target.matter_id,
      subversionId: input.subversionId,
      fileObjectId: target.file_object_id,
      sourceStorageUri: target.storage_uri,
      sha256: target.sha256,
      sizeBytes,
      actorUserId: input.actorUserId,
    };
  }

  async bindDocumentEditPromotion(
    input: BindDocumentEditPromotionInput,
    tx: PoolClient,
  ): Promise<boolean> {
    const binding = input.binding;
    if (
      binding.fileObjectId !== input.fileObjectId ||
      binding.sha256 !== input.sha256 ||
      binding.actorUserId !== input.actorUserId ||
      !validHash(input.sha256)
    ) {
      throw new Error('FILE_SECURITY_EDIT_PROMOTION_BINDING_INVALID');
    }
    const file = await tx.query<{
      storage_uri: string;
      size_bytes: string | number;
      sha256: string;
    }>(`
      SELECT storage_uri, size_bytes, sha256
      FROM file_objects
      WHERE tenant_id = $1 AND file_object_id = $2
    `, [binding.tenantId, input.fileObjectId]);
    const fileRow = file.rows[0];
    if (!fileRow || fileRow.storage_uri !== binding.sourceStorageUri
        || Number(fileRow.size_bytes) !== binding.sizeBytes
        || fileRow.sha256 !== input.sha256) {
      throw new Error('FILE_SECURITY_EDIT_PRIMARY_MISMATCH');
    }
    const result = await tx.query<DocumentEditScanRow>(`
      SELECT s.scan_id, s.matter_id, s.quarantine_ref, s.quarantine_storage_uri,
        s.expected_sha256, s.observed_sha256, s.size_bytes, s.state,
        s.result_code, s.signature_at, s.created_by,
        p.document_id AS promoted_document_id,
        p.version_id AS promoted_version_id,
        p.file_object_id AS promoted_file_object_id,
        p.primary_sha256, p.promoted_by
      FROM file_security_scans s
      LEFT JOIN file_security_promotions p
        ON p.tenant_id = s.tenant_id AND p.scan_id = s.scan_id
      WHERE s.tenant_id = $1 AND s.scan_id = $2
      FOR UPDATE OF s
    `, [binding.tenantId, binding.scanId]);
    const scan = result.rows[0];
    if (!scan || scan.matter_id !== binding.matterId
        || scan.quarantine_ref !== binding.quarantineRef
        || scan.expected_sha256 !== input.sha256
        || scan.observed_sha256 !== input.sha256
        || Number(scan.size_bytes) !== binding.sizeBytes
        || scan.result_code !== 'clean'
        || !freshSignature(scan.signature_at)) {
      throw new Error('FILE_SECURITY_EDIT_PROMOTION_RECHECK_DENIED');
    }
    if (scan.promoted_version_id) {
      if (scan.state !== 'promoted'
          || scan.promoted_document_id !== input.documentId
          || scan.promoted_version_id !== input.versionId
          || scan.promoted_file_object_id !== input.fileObjectId
          || scan.primary_sha256 !== input.sha256) {
        throw new Error('FILE_SECURITY_EDIT_PROMOTION_RECEIPT_CONFLICT');
      }
      return false;
    }
    if (scan.state !== 'clean') throw new Error('FILE_SECURITY_EDIT_PROMOTION_RECHECK_DENIED');
    await tx.query(`
      INSERT INTO file_security_promotions (
        scan_id, tenant_id, document_id, version_id, file_object_id,
        primary_sha256, promoted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [scan.scan_id, binding.tenantId, input.documentId, input.versionId,
      input.fileObjectId, input.sha256, input.actorUserId]);
    const updated = await tx.query(`
      UPDATE file_security_scans
      SET state = 'promoted', promoted_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND scan_id = $2
        AND state = 'clean' AND result_code = 'clean'
    `, [binding.tenantId, scan.scan_id]);
    if (updated.rowCount !== 1) throw new Error('FILE_SECURITY_EDIT_PROMOTION_RACE');
    await this.auditService.log({
      tenantId: binding.tenantId,
      actorId: input.actorUserId,
      action: 'FILE_PROMOTED',
      targetType: 'file_security_scan',
      targetId: scan.scan_id,
      matterId: binding.matterId,
      result: 'success',
      metadata: {
        hash: input.sha256,
        source: 'document_edit',
        subversion_id: binding.subversionId,
        version_id: input.versionId,
      },
    }, tx);
    return true;
  }

  private async ensureDocumentEditQuarantine(input: {
    tenantId: string;
    quarantineRef: string;
    quarantineStorageUri: string;
    sourceStorageUri: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
  }): Promise<void> {
    const existing = await this.storageService.headByStorageUri(
      input.tenantId,
      input.quarantineStorageUri,
    );
    if (!existing) {
      const sourceHash = await this.storageService.sha256ByStorageUri(
        input.tenantId,
        input.sourceStorageUri,
      );
      const source = await this.storageService.getByStorageUri(
        input.tenantId,
        input.sourceStorageUri,
      );
      try {
        if (sourceHash !== input.sha256 || source.contentLength !== input.sizeBytes
            || source.contentType?.toLowerCase() !== input.mimeType.toLowerCase()) {
          throw new Error('FILE_SECURITY_EDIT_PRIMARY_MISMATCH');
        }
        await this.storageService.putQuarantineObject({
          tenantId: input.tenantId,
          quarantineRef: input.quarantineRef,
          body: source.body,
          contentLength: input.sizeBytes,
          contentType: input.mimeType,
        });
      } catch (error) {
        if (!(error instanceof StorageObjectAlreadyExistsError)) throw error;
      } finally {
        source.body.destroy();
      }
    }
    const stored = await this.storageService.headByStorageUri(
      input.tenantId,
      input.quarantineStorageUri,
    );
    if (!stored || stored.contentLength !== input.sizeBytes
        || stored.contentType?.toLowerCase() !== input.mimeType.toLowerCase()
        || await this.storageService.sha256ByStorageUri(
          input.tenantId,
          input.quarantineStorageUri,
        ) !== input.sha256) {
      throw new Error('FILE_SECURITY_EDIT_QUARANTINE_MISMATCH');
    }
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
      await tx.query(`UPDATE file_security_scans SET state = 'scanning', result_code = 'pending', observed_sha256 = NULL, engine_version = NULL, signature_at = NULL, updated_at = now() WHERE tenant_id = $1 AND scan_id = $2`, [payload.tenantId, row.scan_id]);
      await tx.query(`INSERT INTO file_security_scan_attempts (tenant_id, scan_id, attempt_no, expected_sha256) VALUES ($1, $2, $3, $4)`, [payload.tenantId, row.scan_id, attemptNo, payload.expectedSha256]);
      return { scanId: row.scan_id, matterId: row.matter_id, storageUri: row.quarantine_storage_uri, sizeBytes: Number(row.size_bytes), attemptNo };
    });
  }

  private async scan(target: ScanTarget, payload: FileSecurityScanJobPayload): Promise<{ state: ScanState; code: ResultCode; observedSha256: string | null; engineVersion: string | null; signatureAt: Date | null }> {
    try {
      if (!Number.isSafeInteger(target.sizeBytes) || target.sizeBytes < 1 || target.sizeBytes > maxScanBytes) return this.failure('scanner_error');
      const object = await this.storageService.getByStorageUri(payload.tenantId, target.storageUri);
      if (object.contentLength !== target.sizeBytes) {
        object.body.destroy();
        return this.failure('scanner_error');
      }
      const boundary = `amic-vault-scan-${randomBytes(18).toString('hex')}`;
      const prefix = Buffer.from(
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="quarantine_ref"\r\n\r\n' +
        `${payload.quarantineRef}\r\n` +
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="expected_sha256"\r\n\r\n' +
        `${payload.expectedSha256}\r\n` +
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="quarantine.bin"\r\n' +
        'Content-Type: application/octet-stream\r\n\r\n',
        'utf8',
      );
      const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      const hash = createHash('sha256');
      let total = 0;
      let complete = false;
      const multipart = Readable.from((async function* () {
        yield prefix;
        for await (const part of object.body) {
          const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
          total += chunk.byteLength;
          if (total > target.sizeBytes || total > maxScanBytes) {
            throw new Error('FILE_SECURITY_SCAN_SIZE_MISMATCH');
          }
          hash.update(chunk);
          yield chunk;
        }
        if (total !== target.sizeBytes) throw new Error('FILE_SECURITY_SCAN_SIZE_MISMATCH');
        complete = true;
        yield suffix;
      })());
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs());
      try {
        const response = await fetchIngestionWorker('/security/scan', {
          method: 'POST',
          headers: {
            'content-length': String(prefix.byteLength + target.sizeBytes + suffix.byteLength),
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'x-amic-tenant-id': payload.tenantId,
          },
          body: Readable.toWeb(multipart) as unknown as BodyInit,
          signal: controller.signal,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' });
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!complete || total !== target.sizeBytes) return this.failure('scanner_error');
        const observedSha256 = hash.digest('hex');
        if (observedSha256 !== payload.expectedSha256) {
          return { ...this.failure('hash_mismatch'), observedSha256 };
        }
        if (!response.ok || !body || !['clean', 'infected', 'error', 'stale_signature'].includes(String(body.outcome))) return this.failure('malformed_response', observedSha256);
        const verdict = body.outcome as Verdict;
        const engineVersion = typeof body.engine_version === 'string' && body.engine_version.length <= 128 ? body.engine_version : null;
        const signatureAge = typeof body.signature_age_seconds === 'number' && Number.isSafeInteger(body.signature_age_seconds) && body.signature_age_seconds >= 0 ? body.signature_age_seconds : null;
        if (verdict === 'clean' && (!engineVersion || signatureAge === null)) return this.failure('malformed_response', observedSha256);
        const signatureAt = signatureAge === null ? null : new Date(Date.now() - signatureAge * 1000);
        if (verdict === 'clean') return { state: 'clean', code: 'clean', observedSha256, engineVersion, signatureAt };
        if (verdict === 'infected') return { state: 'infected', code: 'infected', observedSha256, engineVersion, signatureAt };
        if (verdict === 'stale_signature') return { state: 'security_hold', code: 'stale_signature', observedSha256, engineVersion, signatureAt };
        return this.failure('scanner_error', observedSha256);
      } finally {
        clearTimeout(timer);
        multipart.destroy();
        object.body.destroy();
      }
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
