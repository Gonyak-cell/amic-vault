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
  Optional,
} from '@nestjs/common';
import { initialDocumentFamilyId } from '@amic-vault/domain';
import type {
  AddDocumentVersionFieldsDto,
  AddDocumentVersionResponseDto,
  TenantId,
  UploadDocumentFieldsDto,
  UploadDocumentResponseDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { documentUploadedAudit, documentVersionAddedAudit } from '../audit/events/document-events';
import { GraphSyncOutboxWorker } from '../graph/graph-sync-outbox.worker';
import {
  MatterSourcePolicyService,
  type MatterSourceMutationDecision,
} from '../integrations/matter-app/matter-source-policy';
import { PermissionService } from '../permission/permission.service';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { DocumentVersionService } from './document-version.service';
import { DocumentFolderService } from './document-folder.service';
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
  sourceSystem?: 'upload' | 'email_ingest' | 'migration';
  afterUploadAudit?: (
    client: QueryClient,
    uploaded: {
      documentId: string;
      matterId: string;
      fileObjectId: string;
      versionId: string;
      sha256: string;
      title: string;
    },
  ) => Promise<void>;
}

export interface UploadBufferedDocumentInput {
  actorUserId: string;
  matterId: string;
  fields: UploadDocumentFieldsDto;
  originalFilename: string;
  mimeType: string;
  body: Buffer;
  sourceSystem?: 'upload' | 'email_ingest' | 'migration';
  afterUploadAudit?: UploadDocumentInput['afterUploadAudit'];
}

export interface AddDocumentVersionInput {
  actorUserId: string;
  documentId: string;
  fields: AddDocumentVersionFieldsDto;
  file: UploadedDiskFile | undefined;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
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
  if ([...filename].some((char) => (char.codePointAt(0) ?? 0) > 0xff)) return filename;
  const repaired = Buffer.from(filename, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? filename : repaired;
}

type DuplicateDecisionAudit = {
  decision: 'new_document' | 'new_version';
  candidateCount: number;
};

@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);
  private readonly extensionValidator = new FileExtensionValidator();
  private readonly fileSizeValidator = new FileSizeValidator();
  private readonly mimeTypeValidator = new MimeTypeValidator();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentService) private readonly documentService: DocumentService,
    @Inject(DocumentVersionService) private readonly documentVersionService: DocumentVersionService,
    @Inject(DuplicateDetectorService)
    private readonly duplicateDetector: DuplicateDetectorService,
    @Inject(FileObjectService) private readonly fileObjectService: FileObjectService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Optional()
    @Inject(MatterSourcePolicyService)
    private readonly matterSourcePolicy?: MatterSourcePolicyService,
    @Optional()
    @Inject(DocumentFolderService)
    private readonly documentFolderService?: DocumentFolderService,
    @Optional()
    @Inject(GraphSyncOutboxWorker)
    private readonly graphSyncOutbox?: GraphSyncOutboxWorker,
  ) {}

  async uploadBuffer(input: UploadBufferedDocumentInput): Promise<UploadDocumentResponseDto> {
    const dir = await mkdtemp(join(tmpdir(), 'amic-vault-buffer-upload-'));
    const path = join(dir, 'payload');
    await writeFile(path, input.body);
    try {
      return await this.upload({
        actorUserId: input.actorUserId,
        matterId: input.matterId,
        fields: input.fields,
        sourceSystem: input.sourceSystem ?? 'upload',
        ...(input.afterUploadAudit ? { afterUploadAudit: input.afterUploadAudit } : {}),
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

  async upload(input: UploadDocumentInput): Promise<UploadDocumentResponseDto> {
    const context = this.tenantContext.require();
    const file = input.file;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }

    try {
      const sourceSystem = input.sourceSystem ?? 'upload';
      this.fileSizeValidator.validate(file.size, { sourceSystem });
      const matterSourceDecision = await this.assertMatterUploadReady(
        context.tenantId,
        input.actorUserId,
        input.matterId,
        'document_upload',
        input.fields.uploadPreflightRef,
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
      const sha256 = await sha256File(file.path);
      const duplicateDecision = await this.assertUploadDuplicateDecision({
        tenantId: context.tenantId,
        matterId: input.matterId,
        sha256,
        decision: input.fields.duplicateDecision,
      });
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
            version: Awaited<ReturnType<DocumentVersionService['createInitialVersion']>>;
            duplicates: UploadDocumentResponseDto['duplicates'];
            folderPath: string | null;
            tags: string[];
          }
        | undefined;
      try {
        uploaded = await this.auditService.transaction(context.tenantId, async (tx) => {
          const organization = await this.resolveUploadOrganization(tx, {
            actorUserId: input.actorUserId,
            folderId: input.fields.folderId,
            matterId: input.matterId,
            sourceRelativePath: input.fields.sourceRelativePath,
            tags: input.fields.tags,
            tenantId: context.tenantId,
          });
          const document = await this.documentService.createDraft(
            {
              documentId,
              tenantId: context.tenantId,
              matterId: input.matterId,
              documentFamilyId: initialDocumentFamilyId({ documentId }),
              title,
              documentType: input.fields.documentType,
              subtype: input.fields.subtype,
              confidentialityLevel: input.fields.confidentialityLevel,
              privilegeStatus: input.fields.privilegeStatus,
              source: input.fields.source,
              aiAllowed: input.fields.aiAllowed,
              folderId: organization.folderId,
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
              sourceSystem,
              createdBy: input.actorUserId,
            },
            tx,
          );
          const version = await this.documentVersionService.createInitialVersion(
            {
              tenantId: context.tenantId,
              documentId,
              fileObjectId,
              fileHash: sha256,
              createdBy: input.actorUserId,
              versionLabel: input.fields.versionLabel ?? metadataSuggestion.versionLabel ?? null,
              versionSignificance:
                input.fields.versionSignificance ??
                metadataSuggestion.versionSignificance ??
                'internal_draft',
              renditionType: input.fields.renditionType ?? 'clean',
              baseCleanVersionId: null,
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
          if (organization.tags.length > 0) {
            await this.requireDocumentFolderService().applyUploadTags(tx, {
              actorUserId: input.actorUserId,
              documentId,
              matterId: input.matterId,
              tags: organization.tags,
              tenantId: context.tenantId,
            });
          }
          await this.auditService.log(
            documentUploadedAudit({
              tenantId: context.tenantId,
              actorId: input.actorUserId,
              documentId,
              matterId: input.matterId,
              versionId: version.versionId,
              hash: sha256,
              ...(matterSourceDecision ? { matterSourceDecision } : {}),
              ...(duplicateDecision ? { duplicateDecision } : {}),
            }),
            tx,
          );
          await input.afterUploadAudit?.(tx, {
            documentId,
            matterId: input.matterId,
            fileObjectId,
            versionId: version.versionId,
            sha256,
            title: document.title,
          });
          await this.graphSyncOutbox?.enqueue(
            {
              tenantId: context.tenantId,
              matterId: input.matterId,
              reasonCode: 'document_uploaded',
              requestedBy: input.actorUserId,
            },
            tx,
          );
          return { document, version, duplicates, folderPath: organization.folderPath, tags: organization.tags };
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
        source: uploaded.document.source,
        aiAllowed: uploaded.document.aiAllowed,
        folderId: uploaded.document.folderId ?? null,
        folderPath: uploaded.folderPath,
        tags: uploaded.tags,
        versionLabel: uploaded.version.versionLabel,
        versionSignificance: uploaded.version.versionSignificance,
        renditionType: uploaded.version.renditionType,
        metadataSuggestion,
        duplicates: uploaded.duplicates,
      };
    } finally {
      await this.unlinkTempFile(file);
    }
  }

  async addVersion(input: AddDocumentVersionInput): Promise<AddDocumentVersionResponseDto> {
    const context = this.tenantContext.require();
    const file = input.file;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }

    try {
      this.fileSizeValidator.validate(file.size);
      const target = await this.documentVersionService.findVersionTarget(
        context.tenantId,
        input.documentId,
      );
      if (!target) throw permissionDenied();
      const matterSourceDecision = await this.assertMatterUploadReady(
        context.tenantId,
        input.actorUserId,
        target.matter_id,
        'document_version',
        input.fields.uploadPreflightRef,
      );

      const originalFilename = normalizeTransportFilename(file.originalname);
      const { extension, normalizedFilename } = this.extensionValidator.validate(originalFilename);
      const sniffed = await this.mimeTypeValidator.validate({
        path: file.path,
        sizeBytes: file.size,
        extension,
        declaredMimeType: file.mimetype,
      });
      const sha256 = await sha256File(file.path);
      const fileObjectId = randomUUID();
      const duplicateDecision = await this.assertVersionDuplicateDecision({
        tenantId: context.tenantId,
        matterId: target.matter_id,
        documentId: input.documentId,
        fileObjectId,
        sha256,
        decision: input.fields.duplicateDecision,
      });
      const metadataSuggestion = parseFilenameMetadata(normalizedFilename);
      const storage = await this.storageService.putTenantObject({
        tenantId: context.tenantId,
        matterId: target.matter_id,
        documentId: input.documentId,
        fileObjectId,
        body: createReadStream(file.path),
        contentLength: file.size,
        contentType: sniffed.mimeType,
      });

      let added: AddDocumentVersionResponseDto | undefined;
      try {
        added = await this.auditService.transaction(context.tenantId, async (tx) => {
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
          const version = await this.documentVersionService.addNextVersion(
            {
              tenantId: context.tenantId,
              documentId: input.documentId,
              fileObjectId,
              fileHash: sha256,
              createdBy: input.actorUserId,
              versionLabel: input.fields.versionLabel ?? metadataSuggestion.versionLabel ?? null,
              versionSignificance:
                input.fields.versionSignificance ??
                metadataSuggestion.versionSignificance ??
                'internal_draft',
              renditionType: input.fields.renditionType ?? 'clean',
              baseCleanVersionId: input.fields.baseCleanVersionId ?? null,
            },
            tx,
          );
          const versionDuplicates =
            await this.documentVersionService.findDuplicateVersionCandidates(
              {
                tenantId: context.tenantId,
                documentId: input.documentId,
                fileObjectId,
                sha256,
              },
              tx,
            );
          const documentDuplicates = await this.duplicateDetector.findCandidates(
            {
              tenantId: context.tenantId,
              matterId: target.matter_id,
              documentId: input.documentId,
              sha256,
            },
            tx,
          );
          await this.auditService.log(
            documentVersionAddedAudit({
              tenantId: context.tenantId,
              actorId: input.actorUserId,
              documentId: input.documentId,
              matterId: target.matter_id,
              versionId: version.versionId,
              hash: sha256,
              ...(matterSourceDecision ? { matterSourceDecision } : {}),
              ...(duplicateDecision ? { duplicateDecision } : {}),
            }),
            tx,
          );
          await this.graphSyncOutbox?.enqueue(
            {
              tenantId: context.tenantId,
              matterId: target.matter_id,
              reasonCode: 'document_version_added',
              requestedBy: input.actorUserId,
            },
            tx,
          );
          return {
            documentId: input.documentId,
            matterId: target.matter_id,
            versionId: version.versionId,
            versionNo: version.versionNo,
            versionStatus: 'current',
            fileObjectId,
            sha256,
            versionLabel: version.versionLabel,
            versionSignificance: version.versionSignificance,
            renditionType: version.renditionType,
            baseCleanVersionId: version.baseCleanVersionId,
            metadataSuggestion,
            duplicates: [...versionDuplicates, ...documentDuplicates],
          };
        });
      } catch (error) {
        await this.compensateStorageObject(context.tenantId, storage.storageUri);
        throw error;
      }
      if (!added) throw new Error('document version transaction returned no result');
      return added;
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

  private async assertMatterUploadReady(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
    purpose: 'document_upload' | 'document_version',
    uploadPreflightRef: string | undefined,
  ): Promise<MatterSourceMutationDecision | undefined> {
    if (this.matterSourcePolicy) {
      return this.matterSourcePolicy.assertUploadMutationAllowed({
        actorUserId,
        matterId,
        tenantId,
        purpose,
        uploadPreflightRef,
      });
    }
    await this.assertCanUpload(tenantId, actorUserId, matterId);
    return undefined;
  }

  private async resolveUploadOrganization(
    client: QueryClient,
    input: {
      actorUserId: string;
      folderId?: string | undefined;
      matterId: string;
      sourceRelativePath?: string | undefined;
      tags?: string[] | undefined;
      tenantId: TenantId;
    },
  ) {
    if (!this.documentFolderService) {
      if (input.folderId || input.sourceRelativePath || (input.tags?.length ?? 0) > 0) {
        throw validationFailed('DOCUMENT_ORGANIZATION_UNAVAILABLE');
      }
      return { folderId: null, folderPath: null, tags: [] };
    }
    return this.documentFolderService.resolveUploadOrganization(client, input);
  }

  private requireDocumentFolderService(): DocumentFolderService {
    if (!this.documentFolderService) throw validationFailed('DOCUMENT_ORGANIZATION_UNAVAILABLE');
    return this.documentFolderService;
  }

  private async assertUploadDuplicateDecision(input: {
    tenantId: TenantId;
    matterId: string;
    sha256: string;
    decision: UploadDocumentFieldsDto['duplicateDecision'];
  }): Promise<DuplicateDecisionAudit | undefined> {
    if (input.decision === 'cancel') throw validationFailed('DUPLICATE_UPLOAD_CANCELLED');
    if (input.decision === 'new_version') {
      throw validationFailed('DUPLICATE_VERSION_ENDPOINT_REQUIRED');
    }

    const candidates = await this.auditService.transaction(input.tenantId, (tx) =>
      this.duplicateDetector.findSafeUploadCandidates(
        {
          tenantId: input.tenantId,
          matterId: input.matterId,
          sha256: input.sha256,
          limit: 10,
        },
        tx,
      ),
    );
    if (candidates.length > 0 && input.decision !== 'new_document') {
      throw validationFailed('DUPLICATE_DECISION_REQUIRED');
    }
    if (input.decision === 'new_document') {
      return { decision: 'new_document', candidateCount: candidates.length };
    }
    return undefined;
  }

  private async assertVersionDuplicateDecision(input: {
    tenantId: TenantId;
    matterId: string;
    documentId: string;
    fileObjectId: string;
    sha256: string;
    decision: AddDocumentVersionFieldsDto['duplicateDecision'];
  }): Promise<DuplicateDecisionAudit | undefined> {
    if (input.decision === 'cancel') throw validationFailed('DUPLICATE_UPLOAD_CANCELLED');
    if (input.decision === 'new_document') {
      throw validationFailed('DUPLICATE_DOCUMENT_ENDPOINT_REQUIRED');
    }

    const candidateCount = await this.auditService.transaction(input.tenantId, async (tx) => {
      const versionDuplicates = await this.documentVersionService.findDuplicateVersionCandidates(
        {
          tenantId: input.tenantId,
          documentId: input.documentId,
          fileObjectId: input.fileObjectId,
          sha256: input.sha256,
          limit: 10,
        },
        tx,
      );
      const documentDuplicates = await this.duplicateDetector.findCandidates(
        {
          tenantId: input.tenantId,
          matterId: input.matterId,
          documentId: input.documentId,
          sha256: input.sha256,
          limit: 10,
        },
        tx,
      );
      return versionDuplicates.length + documentDuplicates.length;
    });
    if (candidateCount > 0 && input.decision !== 'new_version') {
      throw validationFailed('DUPLICATE_DECISION_REQUIRED');
    }
    if (input.decision === 'new_version') {
      return { decision: 'new_version', candidateCount };
    }
    return undefined;
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
