import { createReadStream } from 'node:fs';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { isDeepStrictEqual } from 'node:util';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  QuarantinedIntakeResponseDto,
  TenantId,
  UploadDocumentFieldsDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  MatterSourcePolicyService,
  type AuthoritativeMatterAppSource,
} from '../integrations/matter-app/matter-source-policy';
import { PermissionService } from '../permission/permission.service';
import { StorageObjectAlreadyExistsError } from '../storage/storage-adapter.interface';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { assertActiveUserLifecycleFence } from '../user/active-user-lifecycle-fence';
import type { UploadedDiskFile } from '../document/document-upload.service';
import { sha256File } from '../document/integrity/sha256.util';
import { FileExtensionValidator } from '../document/validators/file-extension.validator';
import { FileSizeValidator } from '../document/validators/file-size.validator';
import { MimeTypeValidator } from '../document/validators/mime-type.validator';
import { FileScanQueueService } from './file-scan-queue.service';

export interface QuarantineIntakeInput {
  actorUserId: string;
  matterId: string;
  fields: UploadDocumentFieldsDto;
  file: UploadedDiskFile | undefined;
  sourceSystem?: 'upload' | 'email_ingest' | 'migration';
}

export interface QuarantineBufferedIntakeInput {
  actorUserId: string;
  matterId: string;
  fields: UploadDocumentFieldsDto;
  originalFilename: string;
  mimeType: string;
  body: Buffer;
  sourceSystem?: 'upload' | 'email_ingest' | 'migration';
}

export interface BoundQuarantineBinding {
  quarantineRef: string;
  expectedSha256: string;
  preflightAuditEventId: string;
  preflightTargetId: string;
  preflightClientBindingHash: string;
  correlationId: string;
  requestFingerprint: string;
  idempotencyHash: string;
  expiresAt: string;
}

export interface BoundQuarantineIntakeInput extends QuarantineIntakeInput {
  authoritativeMatterSource?: AuthoritativeMatterAppSource;
  binding: BoundQuarantineBinding;
}

export interface BoundStoredQuarantineIntakeInput {
  actorUserId: string;
  authoritativeMatterSource?: AuthoritativeMatterAppSource;
  matterId: string;
  fields: UploadDocumentFieldsDto;
  sourceSystem?: 'upload' | 'email_ingest' | 'migration';
  file: {
    originalFilename: string;
    mimeType: string;
    byteSize: number;
  };
  binding: BoundQuarantineBinding;
}

export interface BoundQuarantineIntakeResult extends QuarantinedIntakeResponseDto {
  scanId: string;
  auditEventId: string;
  expectedSha256: string;
  byteSize: number;
  mimeType: string;
  replayed: boolean;
}

interface PreparedQuarantineFile {
  sourceSystem: 'upload' | 'email_ingest' | 'migration';
  originalFilename: string;
  normalizedFilename: string;
  mimeType: string;
  expectedSha256: string;
}

interface BoundScanRow {
  scan_id: string;
  matter_id: string;
  quarantine_storage_uri: string;
  expected_sha256: string;
  size_bytes: string;
  created_by: string;
  original_filename: string;
  normalized_filename: string;
  mime_type: string;
  source_system: 'upload' | 'email_ingest' | 'migration';
  promotion_created_by: string;
  fields_json: unknown;
  audit_event_id: string | null;
  audit_correlation_id: string | null;
  audit_metadata_json: Record<string, unknown> | null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const uuidV5Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function isUploadedDiskFile(file: UploadedDiskFile | undefined): file is UploadedDiskFile {
  return typeof file?.path === 'string' && typeof file.originalname === 'string' &&
    typeof file.mimetype === 'string' && Number.isSafeInteger(file.size);
}

function normalizeTransportFilename(filename: string): string {
  if ([...filename].some((char) => (char.codePointAt(0) ?? 0) > 0xff)) return filename;
  const repaired = Buffer.from(filename, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? filename : repaired;
}

@Injectable()
export class QuarantineIntakeService {
  private readonly logger = new Logger(QuarantineIntakeService.name);
  private readonly extensionValidator = new FileExtensionValidator();
  private readonly fileSizeValidator = new FileSizeValidator();
  private readonly mimeTypeValidator = new MimeTypeValidator();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FileScanQueueService) private readonly queueService: FileScanQueueService,
    @Inject(MatterSourcePolicyService) private readonly matterSourcePolicy: MatterSourcePolicyService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async intake(input: QuarantineIntakeInput): Promise<QuarantinedIntakeResponseDto> {
    const context = this.tenantContext.require();
    const file = input.file;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }
    try {
      const prepared = await this.prepareFile(context.tenantId, input, file);
      const quarantineRef = randomUUID();
      const stored = await this.putQuarantineFile({
        tenantId: context.tenantId,
        quarantineRef,
        path: file.path,
        contentLength: file.size,
        contentType: prepared.mimeType,
      });
      try {
        await this.auditService.transaction(context.tenantId, async (tx) => {
          await assertActiveUserLifecycleFence(tx, context.tenantId, input.actorUserId);
          const inserted = await tx.query<{ scan_id: string }>(`
            INSERT INTO file_security_scans (
              tenant_id, matter_id, quarantine_ref, quarantine_storage_uri,
              expected_sha256, size_bytes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING scan_id`, [
            context.tenantId,
            input.matterId,
            quarantineRef,
            stored.storageUri,
            prepared.expectedSha256,
            file.size,
            input.actorUserId,
          ]);
          const scanId = inserted.rows[0]?.scan_id;
          if (!scanId) throw new Error('FILE_SECURITY_SCAN_INSERT_FAILED');
          await tx.query(
            `
              INSERT INTO file_security_promotion_inputs (
                scan_id, tenant_id, original_filename, normalized_filename, mime_type,
                source_system, created_by, fields_json
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            `,
            [
              scanId,
              context.tenantId,
              prepared.originalFilename,
              prepared.normalizedFilename,
              prepared.mimeType,
              prepared.sourceSystem,
              input.actorUserId,
              JSON.stringify(input.fields),
            ],
          );
          await this.queueService.enqueue({
            tenantId: context.tenantId,
            quarantineRef,
            expectedSha256: prepared.expectedSha256,
          }, tx);
          await this.auditService.log({
            tenantId: context.tenantId,
            actorId: input.actorUserId,
            action: 'FILE_QUARANTINED',
            targetType: 'file_security_scan',
            targetId: scanId,
            matterId: input.matterId,
            result: 'success',
            metadata: { hash: prepared.expectedSha256, queue_name: 'security.file-scan' },
          }, tx);
        });
      } catch (error) {
        await this.compensateStorageObject(context.tenantId, stored.storageUri);
        throw error;
      }
      return { status: 'quarantined', matterId: input.matterId, quarantineRef };
    } finally {
      await this.unlinkTempFile(file);
    }
  }

  async intakeBound(input: BoundQuarantineIntakeInput): Promise<BoundQuarantineIntakeResult> {
    const context = this.tenantContext.require();
    const file = input.file;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }
    const binding = input.binding;
    if (
      !uuidV5Pattern.test(binding.quarantineRef) ||
      !uuidPattern.test(binding.preflightAuditEventId) ||
      !uuidV5Pattern.test(binding.preflightTargetId) ||
      !sha256Pattern.test(binding.expectedSha256) ||
      !sha256Pattern.test(binding.preflightClientBindingHash) ||
      !sha256Pattern.test(binding.requestFingerprint) ||
      !sha256Pattern.test(binding.idempotencyHash) ||
      !Number.isFinite(Date.parse(binding.expiresAt))
    ) {
      await this.unlinkTempFile(file);
      throw validationFailed('BOUND_QUARANTINE_BINDING_INVALID');
    }

    let createdStorageUri: string | null = null;
    try {
      const prepared = await this.prepareFile(
        context.tenantId,
        input,
        file,
        input.authoritativeMatterSource,
      );
      if (prepared.expectedSha256 !== binding.expectedSha256) {
        throw validationFailed('BOUND_QUARANTINE_HASH_MISMATCH');
      }
      const storageUri = this.storageService.quarantineStorageUri(
        context.tenantId,
        binding.quarantineRef,
      );
      try {
        return await this.auditService.transaction(context.tenantId, async (tx) => {
          await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `${context.tenantId}:${binding.quarantineRef}`,
          ]);
          await assertActiveUserLifecycleFence(tx, context.tenantId, input.actorUserId);

          const existing = await this.readBoundScan(tx, context.tenantId, binding.quarantineRef);
          if (existing) {
            await this.assertBoundPreflight(tx, input, true);
            this.assertBoundScan(existing, input, prepared, storageUri);
            return {
              status: 'quarantined' as const,
              matterId: input.matterId,
              quarantineRef: binding.quarantineRef,
              scanId: existing.scan_id,
              auditEventId: existing.audit_event_id as string,
              expectedSha256: prepared.expectedSha256,
              byteSize: file.size,
              mimeType: prepared.mimeType,
              replayed: true,
            };
          }
          await this.assertBoundPreflight(tx, input, false);

          try {
            const stored = await this.putQuarantineFile({
              tenantId: context.tenantId,
              quarantineRef: binding.quarantineRef,
              path: file.path,
              contentLength: file.size,
              contentType: prepared.mimeType,
            });
            if (stored.storageUri !== storageUri) {
              throw validationFailed('BOUND_QUARANTINE_STORAGE_MISMATCH');
            }
            createdStorageUri = stored.storageUri;
          } catch (error) {
            if (!(error instanceof StorageObjectAlreadyExistsError)) throw error;
            await this.assertExistingStorageObject(
              context.tenantId,
              storageUri,
              file.size,
              prepared.mimeType,
              prepared.expectedSha256,
            );
          }

          const inserted = await tx.query<{ scan_id: string }>(
            `
              INSERT INTO file_security_scans (
                tenant_id, matter_id, quarantine_ref, quarantine_storage_uri,
                expected_sha256, size_bytes, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING scan_id
            `,
            [
              context.tenantId,
              input.matterId,
              binding.quarantineRef,
              storageUri,
              prepared.expectedSha256,
              file.size,
              input.actorUserId,
            ],
          );
          const scanId = inserted.rows[0]?.scan_id;
          if (!scanId) throw new Error('FILE_SECURITY_SCAN_INSERT_FAILED');
          await tx.query(
            `
              INSERT INTO file_security_promotion_inputs (
                scan_id, tenant_id, original_filename, normalized_filename, mime_type,
                source_system, created_by, fields_json
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            `,
            [
              scanId,
              context.tenantId,
              prepared.originalFilename,
              prepared.normalizedFilename,
              prepared.mimeType,
              prepared.sourceSystem,
              input.actorUserId,
              JSON.stringify(input.fields),
            ],
          );
          await this.queueService.enqueue(
            {
              tenantId: context.tenantId,
              quarantineRef: binding.quarantineRef,
              expectedSha256: prepared.expectedSha256,
            },
            tx,
          );
          const audit = await this.auditService.log(
            {
              tenantId: context.tenantId,
              actorId: input.actorUserId,
              action: 'FILE_QUARANTINED',
              targetType: 'file_security_scan',
              targetId: scanId,
              matterId: input.matterId,
              result: 'success',
              metadata: {
                hash: prepared.expectedSha256,
                queue_name: 'security.file-scan',
                request_id: binding.requestFingerprint,
                correlation_id: binding.correlationId,
                idempotency_hash: binding.idempotencyHash,
                expires_at: binding.expiresAt,
                ...(input.authoritativeMatterSource ? {
                  matter_source_mode: input.authoritativeMatterSource.mode,
                  matter_source_revision: input.authoritativeMatterSource.sourceRevision,
                  matter_source_updated_at: input.authoritativeMatterSource.sourceUpdatedAt,
                } : {}),
              },
            },
            tx,
          );
          return {
            status: 'quarantined' as const,
            matterId: input.matterId,
            quarantineRef: binding.quarantineRef,
            scanId,
            auditEventId: audit.eventId,
            expectedSha256: prepared.expectedSha256,
            byteSize: file.size,
            mimeType: prepared.mimeType,
            replayed: false,
          };
        });
      } catch (error) {
        if (createdStorageUri) {
          await this.compensateStorageObject(context.tenantId, createdStorageUri);
        }
        throw error;
      }
    } finally {
      await this.unlinkTempFile(file);
    }
  }

  async intakeBoundStored(
    input: BoundStoredQuarantineIntakeInput,
  ): Promise<BoundQuarantineIntakeResult> {
    const context = this.tenantContext.require();
    const binding = input.binding;
    if (
      !uuidV5Pattern.test(binding.quarantineRef) ||
      !uuidPattern.test(binding.preflightAuditEventId) ||
      !uuidV5Pattern.test(binding.preflightTargetId) ||
      !sha256Pattern.test(binding.expectedSha256) ||
      !sha256Pattern.test(binding.preflightClientBindingHash) ||
      !sha256Pattern.test(binding.requestFingerprint) ||
      !sha256Pattern.test(binding.idempotencyHash) ||
      !Number.isFinite(Date.parse(binding.expiresAt))
    ) {
      throw validationFailed('BOUND_QUARANTINE_BINDING_INVALID');
    }

    const sourceSystem = input.sourceSystem ?? 'upload';
    this.fileSizeValidator.validate(input.file.byteSize, { sourceSystem });
    await this.assertMatterUploadReady(
      context.tenantId,
      input.actorUserId,
      input.matterId,
      input.fields.uploadPreflightRef,
      input.authoritativeMatterSource,
    );
    const originalFilename = normalizeTransportFilename(input.file.originalFilename);
    const { extension, normalizedFilename } = this.extensionValidator.validate(originalFilename);
    const declared = this.mimeTypeValidator.validateDeclaration({
      extension,
      declaredMimeType: input.file.mimeType,
    });
    const prepared: PreparedQuarantineFile = {
      sourceSystem,
      originalFilename,
      normalizedFilename,
      mimeType: declared.mimeType,
      expectedSha256: binding.expectedSha256,
    };
    const storageUri = this.storageService.quarantineStorageUri(
      context.tenantId,
      binding.quarantineRef,
    );
    const head = await this.storageService.headByStorageUri(context.tenantId, storageUri);
    if (
      !head ||
      head.contentLength !== input.file.byteSize ||
      head.contentType?.toLowerCase() !== prepared.mimeType.toLowerCase()
    ) {
      throw validationFailed('BOUND_QUARANTINE_ORPHAN_MISMATCH');
    }

    return this.auditService.transaction(context.tenantId, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${context.tenantId}:${binding.quarantineRef}`,
      ]);
      await assertActiveUserLifecycleFence(tx, context.tenantId, input.actorUserId);

      const existing = await this.readBoundScan(tx, context.tenantId, binding.quarantineRef);
      if (existing) {
        await this.assertStoredBoundPreflight(tx, input, true);
        this.assertStoredBoundScan(existing, input, prepared, storageUri);
        return {
          status: 'quarantined' as const,
          matterId: input.matterId,
          quarantineRef: binding.quarantineRef,
          scanId: existing.scan_id,
          auditEventId: existing.audit_event_id as string,
          expectedSha256: prepared.expectedSha256,
          byteSize: input.file.byteSize,
          mimeType: prepared.mimeType,
          replayed: true,
        };
      }
      await this.assertStoredBoundPreflight(tx, input, false);

      const inserted = await tx.query<{ scan_id: string }>(
        `
          INSERT INTO file_security_scans (
            tenant_id, matter_id, quarantine_ref, quarantine_storage_uri,
            expected_sha256, size_bytes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING scan_id
        `,
        [
          context.tenantId,
          input.matterId,
          binding.quarantineRef,
          storageUri,
          prepared.expectedSha256,
          input.file.byteSize,
          input.actorUserId,
        ],
      );
      const scanId = inserted.rows[0]?.scan_id;
      if (!scanId) throw new Error('FILE_SECURITY_SCAN_INSERT_FAILED');
      await tx.query(
        `
          INSERT INTO file_security_promotion_inputs (
            scan_id, tenant_id, original_filename, normalized_filename, mime_type,
            source_system, created_by, fields_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          scanId,
          context.tenantId,
          prepared.originalFilename,
          prepared.normalizedFilename,
          prepared.mimeType,
          prepared.sourceSystem,
          input.actorUserId,
          JSON.stringify(input.fields),
        ],
      );
      await this.queueService.enqueue(
        {
          tenantId: context.tenantId,
          quarantineRef: binding.quarantineRef,
          expectedSha256: prepared.expectedSha256,
        },
        tx,
      );
      const audit = await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: input.actorUserId,
          action: 'FILE_QUARANTINED',
          targetType: 'file_security_scan',
          targetId: scanId,
          matterId: input.matterId,
          result: 'success',
          metadata: {
            hash: prepared.expectedSha256,
            queue_name: 'security.file-scan',
            request_id: binding.requestFingerprint,
            correlation_id: binding.correlationId,
            idempotency_hash: binding.idempotencyHash,
            expires_at: binding.expiresAt,
            ...(input.authoritativeMatterSource ? {
              matter_source_mode: input.authoritativeMatterSource.mode,
              matter_source_revision: input.authoritativeMatterSource.sourceRevision,
              matter_source_updated_at: input.authoritativeMatterSource.sourceUpdatedAt,
            } : {}),
          },
        },
        tx,
      );
      return {
        status: 'quarantined' as const,
        matterId: input.matterId,
        quarantineRef: binding.quarantineRef,
        scanId,
        auditEventId: audit.eventId,
        expectedSha256: prepared.expectedSha256,
        byteSize: input.file.byteSize,
        mimeType: prepared.mimeType,
        replayed: false,
      };
    });
  }

  async intakeBuffer(input: QuarantineBufferedIntakeInput): Promise<QuarantinedIntakeResponseDto> {
    const dir = await mkdtemp(join(tmpdir(), 'amic-vault-quarantine-intake-'));
    const path = join(dir, 'payload');
    await writeFile(path, input.body);
    try {
      return await this.intake({
        actorUserId: input.actorUserId,
        matterId: input.matterId,
        fields: input.fields,
        sourceSystem: input.sourceSystem ?? 'upload',
        file: {
          path,
          originalname: input.originalFilename,
          mimetype: input.mimeType,
          size: input.body.length,
        },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async prepareFile(
    tenantId: TenantId,
    input: QuarantineIntakeInput,
    file: UploadedDiskFile,
    authoritativeMatterSource?: AuthoritativeMatterAppSource,
  ): Promise<PreparedQuarantineFile> {
    const sourceSystem = input.sourceSystem ?? 'upload';
    this.fileSizeValidator.validate(file.size, { sourceSystem });
    await this.assertMatterUploadReady(
      tenantId,
      input.actorUserId,
      input.matterId,
      input.fields.uploadPreflightRef,
      authoritativeMatterSource,
    );
    const originalFilename = normalizeTransportFilename(file.originalname);
    const { extension, normalizedFilename } = this.extensionValidator.validate(originalFilename);
    const sniffed = await this.mimeTypeValidator.validate({
      path: file.path,
      sizeBytes: file.size,
      extension,
      declaredMimeType: file.mimetype,
      allowImageExtensionMismatch: sourceSystem === 'migration',
    });
    return {
      sourceSystem,
      originalFilename,
      normalizedFilename,
      mimeType: sniffed.mimeType,
      expectedSha256: await sha256File(file.path),
    };
  }

  private async assertBoundPreflight(
    tx: QueryClient,
    input: BoundQuarantineIntakeInput,
    allowExpired: boolean,
  ): Promise<void> {
    const result = await tx.query(
      `
        SELECT created_at, metadata_json
        FROM audit_events
        WHERE tenant_id = $1::uuid
          AND event_id = $2::uuid
          AND actor_id = $3::uuid
          AND action = 'OUTLOOK_DOCUMENT_INSERT_REQUESTED'
          AND target_type = 'amic_os_vault_upload_preflight'
          AND target_id = $4::uuid
          AND matter_id = $5::uuid
          AND correlation_id = $6
          AND metadata_json ->> 'metadata_hash' = $7
          AND metadata_json ->> 'expires_at' = $8
        LIMIT 2
      `,
      [
        this.tenantContext.require().tenantId,
        input.binding.preflightAuditEventId,
        input.actorUserId,
        input.binding.preflightTargetId,
        input.matterId,
        input.binding.correlationId,
        input.binding.preflightClientBindingHash,
        input.binding.expiresAt,
      ],
    );
    if (
      result.rowCount !== 1 ||
      (!allowExpired && Date.parse(input.binding.expiresAt) <= Date.now())
    ) {
      throw validationFailed('BOUND_QUARANTINE_PREFLIGHT_INVALID');
    }
  }

  private assertStoredBoundPreflight(
    tx: QueryClient,
    input: BoundStoredQuarantineIntakeInput,
    allowExpired: boolean,
  ): Promise<void> {
    return this.assertBoundPreflight(
      tx,
      {
        actorUserId: input.actorUserId,
        matterId: input.matterId,
        fields: input.fields,
        ...(input.sourceSystem ? { sourceSystem: input.sourceSystem } : {}),
        file: undefined,
        binding: input.binding,
      },
      allowExpired,
    );
  }

  private async readBoundScan(
    tx: QueryClient,
    tenantId: string,
    quarantineRef: string,
  ): Promise<BoundScanRow | null> {
    const result = await tx.query(
      `
        SELECT s.scan_id, s.matter_id, s.quarantine_storage_uri,
          s.expected_sha256, s.size_bytes::text, s.created_by,
          i.original_filename, i.normalized_filename, i.mime_type, i.source_system,
          i.created_by AS promotion_created_by, i.fields_json,
          a.event_id AS audit_event_id, a.correlation_id AS audit_correlation_id,
          a.metadata_json AS audit_metadata_json
        FROM file_security_scans s
        JOIN file_security_promotion_inputs i
          ON i.tenant_id = s.tenant_id AND i.scan_id = s.scan_id
        LEFT JOIN LATERAL (
          SELECT event_id, correlation_id, metadata_json
          FROM audit_events
          WHERE tenant_id = s.tenant_id
            AND action = 'FILE_QUARANTINED'
            AND target_type = 'file_security_scan'
            AND target_id = s.scan_id
          ORDER BY seq
          LIMIT 1
        ) a ON true
        WHERE s.tenant_id = $1::uuid
          AND s.quarantine_ref = $2::uuid
        LIMIT 1
      `,
      [tenantId, quarantineRef],
    );
    return (result.rows[0] as BoundScanRow | undefined) ?? null;
  }

  private assertBoundScan(
    row: BoundScanRow,
    input: BoundQuarantineIntakeInput,
    prepared: PreparedQuarantineFile,
    storageUri: string,
  ): void {
    const metadata = row.audit_metadata_json;
    const storedFields = typeof row.fields_json === 'string'
      ? JSON.parse(row.fields_json) as unknown
      : row.fields_json;
    if (
      row.matter_id !== input.matterId ||
      row.quarantine_storage_uri !== storageUri ||
      row.expected_sha256 !== prepared.expectedSha256 ||
      Number(row.size_bytes) !== input.file?.size ||
      row.created_by !== input.actorUserId ||
      row.promotion_created_by !== input.actorUserId ||
      row.original_filename !== prepared.originalFilename ||
      row.normalized_filename !== prepared.normalizedFilename ||
      row.mime_type !== prepared.mimeType ||
      row.source_system !== prepared.sourceSystem ||
      !isDeepStrictEqual(storedFields, input.fields) ||
      !row.audit_event_id ||
      row.audit_correlation_id !== input.binding.correlationId ||
      metadata?.request_id !== input.binding.requestFingerprint ||
      metadata?.hash !== prepared.expectedSha256 ||
      metadata?.idempotency_hash !== input.binding.idempotencyHash
    ) {
      throw validationFailed('BOUND_QUARANTINE_CONFLICT');
    }
  }

  private assertStoredBoundScan(
    row: BoundScanRow,
    input: BoundStoredQuarantineIntakeInput,
    prepared: PreparedQuarantineFile,
    storageUri: string,
  ): void {
    const metadata = row.audit_metadata_json;
    const storedFields = typeof row.fields_json === 'string'
      ? JSON.parse(row.fields_json) as unknown
      : row.fields_json;
    if (
      row.matter_id !== input.matterId ||
      row.quarantine_storage_uri !== storageUri ||
      row.expected_sha256 !== prepared.expectedSha256 ||
      Number(row.size_bytes) !== input.file.byteSize ||
      row.created_by !== input.actorUserId ||
      row.promotion_created_by !== input.actorUserId ||
      row.original_filename !== prepared.originalFilename ||
      row.normalized_filename !== prepared.normalizedFilename ||
      row.mime_type !== prepared.mimeType ||
      row.source_system !== prepared.sourceSystem ||
      !isDeepStrictEqual(storedFields, input.fields) ||
      !row.audit_event_id ||
      row.audit_correlation_id !== input.binding.correlationId ||
      metadata?.request_id !== input.binding.requestFingerprint ||
      metadata?.hash !== prepared.expectedSha256 ||
      metadata?.idempotency_hash !== input.binding.idempotencyHash
    ) {
      throw validationFailed('BOUND_QUARANTINE_CONFLICT');
    }
  }

  private async assertExistingStorageObject(
    tenantId: string,
    storageUri: string,
    byteSize: number,
    mimeType: string,
    expectedSha256: string,
  ): Promise<void> {
    const head = await this.storageService.headByStorageUri(tenantId, storageUri);
    if (
      !head ||
      head.contentLength !== byteSize ||
      head.contentType?.toLowerCase() !== mimeType.toLowerCase() ||
      await this.storageService.sha256ByStorageUri(tenantId, storageUri) !== expectedSha256
    ) {
      throw validationFailed('BOUND_QUARANTINE_ORPHAN_MISMATCH');
    }
  }

  private async assertMatterUploadReady(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
    uploadPreflightRef: string | undefined,
    authoritativeMatterSource?: AuthoritativeMatterAppSource,
  ): Promise<void> {
    await this.matterSourcePolicy.assertUploadMutationAllowed({
      actorUserId,
      ...(authoritativeMatterSource
        ? { authoritativeSource: authoritativeMatterSource }
        : {}),
      matterId,
      tenantId,
      purpose: 'document_upload',
      uploadPreflightRef,
    });
    let decision: Awaited<ReturnType<PermissionService['canUploadToMatter']>> | undefined;
    try {
      decision = await this.permissionService.canUploadToMatter({ tenantId, userId: actorUserId }, matterId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR' });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private async compensateStorageObject(tenantId: string, storageUri: string): Promise<void> {
    try {
      await this.storageService.deleteByStorageUri(tenantId, storageUri);
    } catch {
      this.logger.warn({ code: 'QUARANTINE_STORAGE_COMPENSATION_FAILED' });
    }
  }

  private async putQuarantineFile(input: {
    tenantId: string;
    quarantineRef: string;
    path: string;
    contentLength: number;
    contentType: string;
  }) {
    const body = createReadStream(input.path);
    try {
      return await this.storageService.putQuarantineObject({
        tenantId: input.tenantId,
        quarantineRef: input.quarantineRef,
        body,
        contentLength: input.contentLength,
        contentType: input.contentType,
      });
    } finally {
      body.destroy();
      await finished(body).catch(() => undefined);
    }
  }

  private async unlinkTempFile(file: UploadedDiskFile | undefined): Promise<void> {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.logger.warn({ code: 'UPLOAD_TEMP_UNLINK_FAILED' });
    }
  }
}
