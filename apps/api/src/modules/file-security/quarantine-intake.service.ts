import { createReadStream } from 'node:fs';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { AuditService } from '../audit/audit.service';
import { MatterSourcePolicyService } from '../integrations/matter-app/matter-source-policy';
import { PermissionService } from '../permission/permission.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
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
      const sourceSystem = input.sourceSystem ?? 'upload';
      this.fileSizeValidator.validate(file.size, { sourceSystem });
      await this.assertMatterUploadReady(
        context.tenantId,
        input.actorUserId,
        input.matterId,
        input.fields.uploadPreflightRef,
      );
      const originalFilename = normalizeTransportFilename(file.originalname);
      const { extension } = this.extensionValidator.validate(originalFilename);
      const sniffed = await this.mimeTypeValidator.validate({
        path: file.path,
        sizeBytes: file.size,
        extension,
        declaredMimeType: file.mimetype,
        allowImageExtensionMismatch: sourceSystem === 'migration',
      });
      const expectedSha256 = await sha256File(file.path);
      const quarantineRef = randomUUID();
      const stored = await this.storageService.putQuarantineObject({
        tenantId: context.tenantId,
        quarantineRef,
        body: createReadStream(file.path),
        contentLength: file.size,
        contentType: sniffed.mimeType,
      });
      try {
        await this.auditService.transaction(context.tenantId, async (tx) => {
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
            expectedSha256,
            file.size,
            input.actorUserId,
          ]);
          const scanId = inserted.rows[0]?.scan_id;
          if (!scanId) throw new Error('FILE_SECURITY_SCAN_INSERT_FAILED');
          await this.queueService.enqueue({ tenantId: context.tenantId, quarantineRef, expectedSha256 }, tx);
          await this.auditService.log({
            tenantId: context.tenantId,
            actorId: input.actorUserId,
            action: 'FILE_QUARANTINED',
            targetType: 'file_security_scan',
            targetId: scanId,
            matterId: input.matterId,
            result: 'success',
            metadata: { hash: expectedSha256, queue_name: 'security.file-scan' },
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

  private async assertMatterUploadReady(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
    uploadPreflightRef: string | undefined,
  ): Promise<void> {
    await this.matterSourcePolicy.assertUploadMutationAllowed({
      actorUserId,
      matterId,
      tenantId,
      purpose: 'document_upload',
      uploadPreflightRef,
    });
    let decision: Awaited<ReturnType<PermissionService['canUploadToMatter']>> | undefined;
    try {
      decision = await this.permissionService.canUploadToMatter({ tenantId, userId: actorUserId }, matterId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
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

  private async unlinkTempFile(file: UploadedDiskFile | undefined): Promise<void> {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch {
      this.logger.warn({ code: 'UPLOAD_TEMP_UNLINK_FAILED' });
    }
  }
}
