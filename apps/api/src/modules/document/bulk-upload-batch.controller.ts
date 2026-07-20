import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { uploadDocumentFieldsSchema, type RegisterBulkUploadBatchDto } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { BulkUploadBatchService } from './bulk-upload-batch.service';
import { BulkUploadQueueService } from './bulk-upload-queue.service';
import { multipartBatchUploadOptions, multipartFieldName } from './multipart.config';
import type { UploadedDiskFile } from './document-upload.service';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

function parseSourceRelativePaths(value: unknown, expectedCount: number): string[] {
  if (value === undefined) return [];
  const parsed =
    typeof value === 'string' && value.trim().startsWith('[')
      ? (JSON.parse(value) as unknown)
      : value;
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) throw validationFailed();
  return parsed.map((entry) => {
    if (typeof entry !== 'string' || entry.trim().length === 0 || entry.length > 1000) {
      throw validationFailed();
    }
    return entry;
  });
}

function parseStageUploadBody(body: unknown, expectedCount: number) {
  const record = bodyRecord(body);
  const { sourceRelativePaths, ...fieldRecord } = record;
  try {
    return {
      fields: uploadDocumentFieldsSchema.parse(fieldRecord),
      sourceRelativePaths: parseSourceRelativePaths(sourceRelativePaths, expectedCount),
    };
  } catch {
    throw validationFailed();
  }
}

function isUploadedDiskFile(file: UploadedDiskFile | undefined): file is UploadedDiskFile {
  return (
    typeof file?.path === 'string' &&
    typeof file.originalname === 'string' &&
    typeof file.mimetype === 'string' &&
    Number.isSafeInteger(file.size)
  );
}

async function cleanupFiles(files: readonly UploadedDiskFile[]): Promise<void> {
  await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
}

@Controller('matters/:matterId/documents/bulk-upload-batches')
export class BulkUploadBatchController {
  constructor(
    @Inject(BulkUploadBatchService)
    private readonly batchService: BulkUploadBatchService,
    @Inject(BulkUploadQueueService)
    private readonly queueService: BulkUploadQueueService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
    @Inject(TenantContextService)
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  async register(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const actorUserId = sessionUserId(request);
    const context = this.tenantContext.require();
    const parsedMatterId = parseUuid(matterId);
    await this.assertCanUpload(context.tenantId, actorUserId, parsedMatterId);
    return this.batchService.registerBatch(
      {
        actorUserId,
        body,
        matterId: parsedMatterId,
        tenantId: context.tenantId,
        tenantSlug: context.slug,
      },
      (payload, client) => this.queueService.enqueueJob(payload, client),
    );
  }

  @Post('stage')
  @UseInterceptors(FilesInterceptor(multipartFieldName, 5000, multipartBatchUploadOptions()))
  async stage(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
    @UploadedFiles() stagedFiles: UploadedDiskFile[] | undefined,
  ) {
    const files = stagedFiles ?? [];
    try {
      if (files.length === 0 || files.some((file) => !isUploadedDiskFile(file))) {
        throw validationFailed();
      }
      const actorUserId = sessionUserId(request);
      const context = this.tenantContext.require();
      const parsedMatterId = parseUuid(matterId);
      await this.assertCanUpload(context.tenantId, actorUserId, parsedMatterId);
      const { fields, sourceRelativePaths } = parseStageUploadBody(body, files.length);
      const payload: RegisterBulkUploadBatchDto = {
        items: files.map((file, index) => ({
          itemId: `web-${index}-${randomUUID()}`,
          fields:
            files.length === 1
              ? { ...fields, sourceRelativePath: sourceRelativePaths[index] ?? fields.sourceRelativePath }
              : {
                  ...fields,
                  sourceRelativePath: sourceRelativePaths[index],
                  title: undefined,
                },
          file: {
            path: file.path,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          },
        })),
      };
      return await this.batchService.registerBatch(
        {
          actorUserId,
          body: payload,
          matterId: parsedMatterId,
          tenantId: context.tenantId,
          tenantSlug: context.slug,
        },
        (jobPayload, client) => this.queueService.enqueueJob(jobPayload, client),
      );
    } catch (error) {
      await cleanupFiles(files);
      throw error;
    }
  }

  @Get(':batchId')
  get(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('batchId') batchId: string,
  ) {
    const context = this.tenantContext.require();
    const parsedMatterId = parseUuid(matterId);
    return this.batchService.getBatch({
      actorUserId: sessionUserId(request),
      batchId: parseUuid(batchId),
      matterId: parsedMatterId,
      tenantId: context.tenantId,
    });
  }

  @Post(':batchId/items/:itemId/retry')
  retry(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('batchId') batchId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    const actorUserId = sessionUserId(request);
    const context = this.tenantContext.require();
    const parsedMatterId = parseUuid(matterId);
    return this.batchService.retryItem(
      {
        actorUserId,
        batchId: parseUuid(batchId),
        body,
        itemId,
        matterId: parsedMatterId,
        tenantId: context.tenantId,
        tenantSlug: context.slug,
      },
      (payload, client) => this.queueService.enqueueJob(payload, client),
    );
  }

  private async assertCanUpload(
    tenantId: string,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService
      .canUploadToMatter({ tenantId, userId: actorUserId }, matterId)
      .catch(() => undefined);
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }
}
