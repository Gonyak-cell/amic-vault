import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import {
  type TenantId,
  uploadDocumentFieldsSchema,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../../common/db/database.service';
import { tenantQuery } from '../../common/db/tenant-query';
import { DocumentUploadService } from '../document/document-upload.service';
import type { AuthoritativeMatterAppSource } from '../integrations/matter-app/matter-source-policy';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import type { FileSecurityScanJobPayload } from './file-security.types';

const defaultMaxSignatureAgeSeconds = 24 * 60 * 60;

type PromotionRow = {
  scan_id: string;
  tenant_id: string;
  matter_id: string;
  client_scope_id?: string | null;
  quarantine_storage_uri: string;
  expected_sha256: string;
  observed_sha256: string | null;
  size_bytes: string;
  state: string;
  result_code: string;
  signature_at: Date | null;
  original_filename: string | null;
  normalized_filename: string | null;
  mime_type: string | null;
  source_system: 'upload' | 'email_ingest' | 'migration' | null;
  created_by: string | null;
  fields_json: unknown;
  slug: string;
  tenant_status: 'active' | 'suspended' | 'disabled';
  document_id: string | null;
  version_id: string | null;
  file_object_id: string | null;
};

type QuarantineAuditBinding = {
  correlation_id: string | null;
  metadata_json: Record<string, unknown>;
};

export interface FilePromotionResult {
  documentId: string;
  versionId: string;
  fileObjectId: string;
  promoted: boolean;
}

function maxSignatureAgeSeconds(): number {
  const value = Number(process.env.FILE_SECURITY_MAX_SIGNATURE_AGE_SECONDS ?? defaultMaxSignatureAgeSeconds);
  return Number.isSafeInteger(value) && value > 0 ? value : defaultMaxSignatureAgeSeconds;
}

function isFreshSignature(value: Date | null): boolean {
  return value !== null && Date.now() - value.getTime() >= 0 && Date.now() - value.getTime() <= maxSignatureAgeSeconds() * 1000;
}

function promotionFailure(code: string): Error {
  return new Error(code);
}

function parseFields(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return uploadDocumentFieldsSchema.parse(parsed);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function authoritativeMatterSource(
  metadata: Record<string, unknown>,
): AuthoritativeMatterAppSource | undefined {
  const mode = metadata.matter_source_mode;
  const sourceRevision = metadata.matter_source_revision;
  const sourceUpdatedAt = metadata.matter_source_updated_at;
  const operationExpiresAt = metadata.expires_at;
  if (mode === undefined && sourceRevision === undefined && sourceUpdatedAt === undefined) {
    return undefined;
  }
  if (
    mode !== 'matter_app_api' ||
    typeof sourceRevision !== 'string' ||
    !sourceRevision.trim() ||
    sourceRevision.length > 256 ||
    !isCanonicalInstant(sourceUpdatedAt) ||
    !isCanonicalInstant(operationExpiresAt) ||
    Date.parse(operationExpiresAt) <= Date.now()
  ) {
    throw promotionFailure('FILE_SECURITY_PROMOTION_SOURCE_PROOF_INVALID');
  }
  return {
    mode,
    operationExpiresAt,
    sourceRevision,
    sourceUpdatedAt,
  };
}

@Injectable()
export class FilePromotionService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(DocumentUploadService) private readonly documentUploadService: DocumentUploadService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async promote(payload: FileSecurityScanJobPayload): Promise<FilePromotionResult | null> {
    const row = await this.findPromotionRow(payload);
    if (!row) throw promotionFailure('FILE_SECURITY_SCAN_NOT_FOUND');
    // Client promotion requires a fresh guarded completion command; workers never grant it.
    if (row.client_scope_id) return null;
    if (row.state === 'promoted') return this.existingPromotion(row);
    if (row.state !== 'clean') return null;
    if (
      row.result_code !== 'clean' ||
      row.observed_sha256 !== row.expected_sha256 ||
      !isFreshSignature(row.signature_at)
    ) {
      throw promotionFailure('FILE_SECURITY_PROMOTION_DENIED');
    }
    if (!row.original_filename || !row.normalized_filename || !row.mime_type || !row.source_system || !row.created_by) {
      throw promotionFailure('FILE_SECURITY_PROMOTION_INPUT_MISSING');
    }

    const intakeBinding = await this.findQuarantineAudit(payload.tenantId, row.scan_id);
    const sourceAuthority = authoritativeMatterSource(intakeBinding.metadata_json);
    const fields = parseFields(row.fields_json);
    const dir = await mkdtemp(join(tmpdir(), 'amic-vault-file-promotion-'));
    const path = join(dir, 'quarantine-promotion');
    try {
      const source = await this.storageService.getByStorageUri(payload.tenantId, row.quarantine_storage_uri);
      await pipeline(source.body, createWriteStream(path, { flags: 'wx' }));
      let finalizedVersionId: string | undefined;
      const promoted = await this.tenantContext.run(
        {
          tenantId: payload.tenantId as TenantId,
          slug: row.slug,
          status: row.tenant_status,
          source: 'session',
        },
        () =>
          this.documentUploadService.upload({
            actorUserId: row.created_by as string,
            matterId: row.matter_id,
            fields,
            file: {
              path,
              originalname: row.original_filename as string,
              mimetype: row.mime_type as string,
              size: Number(row.size_bytes),
            },
            sourceSystem: row.source_system as 'upload' | 'email_ingest' | 'migration',
            ...(sourceAuthority ? { authoritativeMatterSource: sourceAuthority } : {}),
            afterUploadAudit: async (tx, uploaded) => {
              const current = await tx.query(`
                SELECT state, result_code, expected_sha256, observed_sha256, signature_at
                FROM file_security_scans
                WHERE tenant_id = $1 AND scan_id = $2
                FOR UPDATE
              `, [payload.tenantId, row.scan_id]) as {
                rows: Array<{
                  state: string;
                  result_code: string;
                  expected_sha256: string;
                  observed_sha256: string | null;
                  signature_at: Date | null;
                }>;
              };
              const scan = current.rows[0];
              if (!scan || scan.state !== 'clean' || scan.result_code !== 'clean' || scan.expected_sha256 !== uploaded.sha256 || scan.observed_sha256 !== uploaded.sha256 || !isFreshSignature(scan.signature_at)) {
                throw promotionFailure('FILE_SECURITY_PROMOTION_RECHECK_DENIED');
              }
              const primary = await tx.query(
                'SELECT storage_uri FROM file_objects WHERE tenant_id = $1 AND file_object_id = $2',
                [payload.tenantId, uploaded.fileObjectId],
              ) as { rows: Array<{ storage_uri: string }> };
              const storageUri = primary.rows[0]?.storage_uri;
              if (!storageUri || await this.storageService.sha256ByStorageUri(payload.tenantId, storageUri) !== uploaded.sha256) {
                throw promotionFailure('FILE_SECURITY_PRIMARY_HASH_MISMATCH');
              }
              await tx.query(
                `
                  INSERT INTO file_security_promotions (
                    scan_id, tenant_id, document_id, version_id, file_object_id, primary_sha256, promoted_by
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `,
                [row.scan_id, payload.tenantId, uploaded.documentId, uploaded.versionId, uploaded.fileObjectId, uploaded.sha256, row.created_by],
              );
              const updated = await tx.query(
                `UPDATE file_security_scans
                 SET state = 'promoted', promoted_at = now(), updated_at = now()
                 WHERE tenant_id = $1 AND scan_id = $2 AND state = 'clean' AND result_code = 'clean'`,
                [payload.tenantId, row.scan_id],
              );
              if (updated.rowCount !== 1) throw promotionFailure('FILE_SECURITY_PROMOTION_RACE');
              const requestId = intakeBinding.metadata_json.request_id;
              const idempotencyHash = intakeBinding.metadata_json.idempotency_hash;
              await this.auditService.log(
                {
                  tenantId: payload.tenantId,
                  actorId: row.created_by,
                  action: 'FILE_PROMOTED',
                  targetType: 'file_security_scan',
                  targetId: row.scan_id,
                  matterId: row.matter_id,
                  result: 'success',
                  metadata: {
                    hash: uploaded.sha256,
                    ...(typeof intakeBinding.correlation_id === 'string'
                      ? { correlation_id: intakeBinding.correlation_id }
                      : {}),
                    ...(typeof requestId === 'string' ? { request_id: requestId } : {}),
                    ...(typeof idempotencyHash === 'string'
                      ? { idempotency_hash: idempotencyHash }
                      : {}),
                  },
                },
                tx,
              );
              finalizedVersionId = uploaded.versionId;
            },
          }),
      );
      if (!finalizedVersionId) throw promotionFailure('FILE_SECURITY_PROMOTION_FINALIZATION_MISSING');
      return {
        documentId: promoted.documentId,
        versionId: finalizedVersionId,
        fileObjectId: promoted.fileObjectId,
        promoted: true,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async findPromotionRow(payload: FileSecurityScanJobPayload): Promise<PromotionRow | null> {
    const result = await tenantQuery<PromotionRow>(
      this.databaseService,
      payload.tenantId,
      `
        SELECT s.scan_id, s.tenant_id, s.matter_id, s.client_scope_id, s.quarantine_storage_uri,
          s.expected_sha256, s.observed_sha256, s.size_bytes::text, s.state, s.result_code,
          s.signature_at, i.original_filename, i.normalized_filename, i.mime_type,
          i.source_system, i.created_by, i.fields_json, t.slug, t.status AS tenant_status,
          p.document_id, p.version_id, p.file_object_id
        FROM file_security_scans s
        JOIN tenants t ON t.tenant_id = s.tenant_id
        LEFT JOIN file_security_promotion_inputs i
          ON i.tenant_id = s.tenant_id AND i.scan_id = s.scan_id
        LEFT JOIN file_security_promotions p
          ON p.tenant_id = s.tenant_id AND p.scan_id = s.scan_id
        WHERE s.tenant_id = $1 AND s.quarantine_ref = $2 AND s.expected_sha256 = $3
        LIMIT 1
      `,
      [payload.tenantId, payload.quarantineRef, payload.expectedSha256],
    );
    return result.rows[0] ?? null;
  }

  private async findQuarantineAudit(
    tenantId: string,
    scanId: string,
  ): Promise<QuarantineAuditBinding> {
    const result = await tenantQuery<QuarantineAuditBinding>(
      this.databaseService,
      tenantId,
      `
        SELECT correlation_id, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'FILE_QUARANTINED'
          AND target_type = 'file_security_scan'
          AND target_id = $2
        ORDER BY seq
        LIMIT 2
      `,
      [tenantId, scanId],
    );
    const binding = result.rows[0];
    if (result.rows.length !== 1 || !binding) {
      throw promotionFailure('FILE_SECURITY_QUARANTINE_AUDIT_MISSING');
    }
    return binding;
  }

  private existingPromotion(row: PromotionRow): FilePromotionResult {
    if (!row.document_id || !row.version_id || !row.file_object_id) {
      throw promotionFailure('FILE_SECURITY_PROMOTION_RECEIPT_MISSING');
    }
    return {
      documentId: row.document_id,
      versionId: row.version_id,
      fileObjectId: row.file_object_id,
      promoted: false,
    };
  }
}
