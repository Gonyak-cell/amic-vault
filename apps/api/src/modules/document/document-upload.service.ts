import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { UploadDocumentFieldsDto, UploadDocumentResponseDto } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { DocumentService } from './document.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';
import { sha256File } from './integrity/sha256.util';
import { FileExtensionValidator } from './validators/file-extension.validator';
import { parseFilenameMetadata } from './filename-metadata.parser';
import { FileSizeValidator } from './validators/file-size.validator';
import { MimeTypeValidator } from './validators/mime-type.validator';

export interface UploadedDiskFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadDocumentInput {
  actorUserId: string;
  matterId: string;
  fields: UploadDocumentFieldsDto;
  file: UploadedDiskFile | undefined;
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function isUploadedDiskFile(file: UploadedDiskFile | undefined): file is UploadedDiskFile {
  return (
    typeof file?.path === 'string' &&
    typeof file.originalname === 'string' &&
    typeof file.mimetype === 'string' &&
    Number.isSafeInteger(file.size)
  );
}

function titleFromFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return base.trim() || filename;
}

function normalizeTransportFilename(filename: string): string {
  const repaired = Buffer.from(filename, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? filename : repaired;
}

@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);
  private readonly extensionValidator = new FileExtensionValidator();
  private readonly fileSizeValidator = new FileSizeValidator();
  private readonly mimeTypeValidator = new MimeTypeValidator();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentService) private readonly documentService: DocumentService,
    @Inject(DuplicateDetectorService)
    private readonly duplicateDetector: DuplicateDetectorService,
    @Inject(FileObjectService) private readonly fileObjectService: FileObjectService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async upload(input: UploadDocumentInput): Promise<UploadDocumentResponseDto> {
    const context = this.tenantContext.require();
    const file = input.file;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }

    try {
      this.fileSizeValidator.validate(file.size);
      await this.assertCanUpload(context.tenantId, input.actorUserId, input.matterId);
      const originalFilename = normalizeTransportFilename(file.originalname);
      const { extension, normalizedFilename } = this.extensionValidator.validate(originalFilename);
      const sniffed = await this.mimeTypeValidator.validate({
        path: file.path,
        sizeBytes: file.size,
        extension,
        declaredMimeType: file.mimetype,
      });
      const sha256 = await sha256File(file.path);
      const title = input.fields.title?.trim() || titleFromFilename(normalizedFilename);
      const metadataSuggestion = parseFilenameMetadata(normalizedFilename);
      const documentId = randomUUID();
      const fileObjectId = randomUUID();
      const storage = await this.storageService.putTenantObject({
        tenantId: context.tenantId,
        matterId: input.matterId,
        documentId,
        fileObjectId,
        body: createReadStream(file.path),
        contentLength: file.size,
        contentType: sniffed.mimeType,
      });

      let uploaded:
        | {
            document: Awaited<ReturnType<DocumentService['createDraft']>>;
            duplicates: UploadDocumentResponseDto['duplicates'];
          }
        | undefined;
      try {
        uploaded = await this.auditService.transaction(context.tenantId, async (tx) => {
          const document = await this.documentService.createDraft(
            {
              documentId,
              tenantId: context.tenantId,
              matterId: input.matterId,
              documentFamilyId: documentId,
              title,
              documentType: input.fields.documentType,
              subtype: input.fields.subtype,
              confidentialityLevel: input.fields.confidentialityLevel,
              privilegeStatus: input.fields.privilegeStatus,
              createdBy: input.actorUserId,
            },
            tx,
          );
          await this.fileObjectService.create(
            {
              fileObjectId,
              tenantId: context.tenantId,
              storageUri: storage.storageUri,
              originalFilename,
              normalizedFilename,
              mimeType: sniffed.mimeType,
              sizeBytes: file.size,
              sha256,
              encryptionKeyId: storage.encryptionKeyId,
              createdBy: input.actorUserId,
            },
            tx,
          );
          const duplicates = await this.duplicateDetector.findCandidates(
            {
              tenantId: context.tenantId,
              matterId: input.matterId,
              documentId,
              sha256,
            },
            tx,
          );
          return { document, duplicates };
        });
      } catch (error) {
        await this.compensateStorageObject(context.tenantId, storage.storageUri);
        throw error;
      }
      if (!uploaded) throw new Error('document upload transaction returned no result');

      return {
        documentId,
        matterId: input.matterId,
        fileObjectId,
        status: 'draft',
        title: uploaded.document.title,
        documentType: uploaded.document.documentType,
        subtype: uploaded.document.subtype,
        confidentialityLevel: uploaded.document.confidentialityLevel,
        privilegeStatus: uploaded.document.privilegeStatus,
        metadataSuggestion,
        duplicates: uploaded.duplicates,
      };
    } finally {
      await this.unlinkTempFile(file);
    }
  }

  private async assertCanUpload(
    tenantId: string,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: Awaited<ReturnType<PermissionService['canUploadToMatter']>> | undefined;
    try {
      decision = await this.permissionService.canUploadToMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
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
      this.logger.warn({ code: 'STORAGE_COMPENSATION_FAILED', storageUri });
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
