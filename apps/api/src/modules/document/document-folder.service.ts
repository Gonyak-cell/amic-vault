import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  DocumentFolderDto,
  DocumentTagListDto,
  PermissionDecision,
  TenantId,
  UpdateDocumentFolderDto,
  UpdateDocumentTagsDto,
} from '@amic-vault/shared';
import { updateDocumentFolderSchema, updateDocumentTagsSchema } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  documentFolderCreatedAudit,
  documentFolderMovedAudit,
  documentFolderRenamedAudit,
  documentTagsChangedAudit,
} from '../audit/events/document-events';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';

interface FolderRow {
  folder_id: string;
  matter_id: string;
  parent_folder_id: string | null;
  name: string;
  path?: string;
  created_at: Date;
  updated_at: Date;
}

interface DocumentFolderTargetRow {
  document_id: string;
  matter_id: string;
}

export interface UploadOrganizationInput {
  actorUserId: string;
  folderId?: string | undefined;
  matterId: string;
  sourceRelativePath?: string | undefined;
  tags?: string[] | undefined;
  tenantId: TenantId;
}

export interface UploadOrganizationResolution {
  folderId: string | null;
  folderPath: string | null;
  tags: string[];
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

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function normalizeTags(tags: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = raw.trim();
    if (
      tag.length === 0 ||
      tag.length > 80 ||
      [...tag].some((char) => {
        const code = char.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
      })
    ) {
      throw validationFailed('INVALID_DOCUMENT_TAG');
    }
    const key = tag.toLocaleLowerCase('ko-KR');
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(tag);
    }
  }
  if (normalized.length > 50) throw validationFailed('TOO_MANY_DOCUMENT_TAGS');
  return normalized;
}

function pathSegmentsFromSourceRelativePath(sourceRelativePath: string | undefined): string[] {
  if (!sourceRelativePath) return [];
  const normalized = sourceRelativePath.trim().replace(/\\/g, '/');
  if (
    normalized.length === 0 ||
    normalized.length > 1000 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw validationFailed('INVALID_SOURCE_RELATIVE_PATH');
  }
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.length > 160)) {
    throw validationFailed('INVALID_SOURCE_RELATIVE_PATH');
  }
  if (segments.length <= 1) return [];
  return segments.slice(0, -1);
}

function toFolderDto(row: FolderRow): DocumentFolderDto {
  return {
    folderId: row.folder_id,
    matterId: row.matter_id,
    parentFolderId: row.parent_folder_id,
    name: row.name,
    path: row.path ?? row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

@Injectable()
export class DocumentFolderService {
  private readonly logger = new Logger(DocumentFolderService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async resolveUploadOrganization(
    client: QueryClient,
    input: UploadOrganizationInput,
  ): Promise<UploadOrganizationResolution> {
    const tags = normalizeTags(input.tags);
    if (input.folderId) {
      const folder = await this.findFolder(client, input.tenantId, input.matterId, input.folderId);
      if (!folder) throw validationFailed('DOCUMENT_FOLDER_NOT_FOUND');
      return {
        folderId: folder.folder_id,
        folderPath: await this.folderPath(client, input.tenantId, folder.folder_id),
        tags,
      };
    }
    const segments = pathSegmentsFromSourceRelativePath(input.sourceRelativePath);
    if (segments.length === 0) return { folderId: null, folderPath: null, tags };
    const folder = await this.ensureFolderPath(client, {
      actorUserId: input.actorUserId,
      matterId: input.matterId,
      segments,
      tenantId: input.tenantId,
    });
    return {
      folderId: folder.folder_id,
      folderPath: folder.path ?? (await this.folderPath(client, input.tenantId, folder.folder_id)),
      tags,
    };
  }

  async applyUploadTags(
    client: QueryClient,
    input: {
      actorUserId: string;
      documentId: string;
      matterId: string;
      tags: readonly string[];
      tenantId: TenantId;
    },
  ): Promise<void> {
    await this.replaceDocumentTags(client, input);
  }

  async listFolders(actorUserId: string, matterId: string): Promise<DocumentFolderDto[]> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const result = await tx.query(
        `
          WITH RECURSIVE folder_tree AS (
            SELECT folder_id, tenant_id, matter_id, parent_folder_id, name,
              name::text AS path, created_at, updated_at
            FROM document_folders
            WHERE tenant_id = $1
              AND matter_id = $2
              AND parent_folder_id IS NULL
            UNION ALL
            SELECT child.folder_id, child.tenant_id, child.matter_id, child.parent_folder_id,
              child.name, folder_tree.path || '/' || child.name, child.created_at, child.updated_at
            FROM document_folders child
            JOIN folder_tree
              ON folder_tree.tenant_id = child.tenant_id
             AND folder_tree.matter_id = child.matter_id
             AND folder_tree.folder_id = child.parent_folder_id
          )
          SELECT folder_id, matter_id, parent_folder_id, name, path, created_at, updated_at
          FROM folder_tree
          ORDER BY path ASC, folder_id ASC
        `,
        [context.tenantId, matterId],
      );
      return (result.rows as FolderRow[]).map(toFolderDto);
    });
  }

  async listTags(actorUserId: string, matterId: string): Promise<DocumentTagListDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const result = (await tx.query(
        `
          SELECT DISTINCT tag
          FROM document_tags
          WHERE tenant_id = $1
            AND matter_id = $2
          ORDER BY tag ASC
        `,
        [context.tenantId, matterId],
      )) as { rows: Array<{ tag: string }>; rowCount: number | null };
      return { tags: result.rows.map((row) => row.tag) };
    });
  }

  async updateFolder(
    actorUserId: string,
    matterId: string,
    folderId: string,
    body: unknown,
  ): Promise<DocumentFolderDto> {
    const input = this.parseUpdateFolder(body);
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const before = await this.findFolder(tx, context.tenantId, matterId, folderId);
      if (!before) throw notFoundDenied();
      await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
      if (input.parentFolderId === folderId) throw validationFailed('DOCUMENT_FOLDER_CYCLE');
      if (input.parentFolderId) {
        const parent = await this.findFolder(tx, context.tenantId, matterId, input.parentFolderId);
        if (!parent) throw validationFailed('DOCUMENT_FOLDER_PARENT_NOT_FOUND');
        if (await this.isDescendant(tx, context.tenantId, folderId, input.parentFolderId)) {
          throw validationFailed('DOCUMENT_FOLDER_CYCLE');
        }
      }
      const beforePath = await this.folderPath(tx, context.tenantId, folderId);
      const result = (await tx.query(
        `
          UPDATE document_folders
          SET name = COALESCE($4, name),
              parent_folder_id = CASE WHEN $5 THEN $6::uuid ELSE parent_folder_id END,
              updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
            AND folder_id = $3
          RETURNING folder_id, matter_id, parent_folder_id, name, created_at, updated_at
        `,
        [
          context.tenantId,
          matterId,
          folderId,
          input.name ?? null,
          input.parentFolderId !== undefined,
          input.parentFolderId ?? null,
        ],
      )) as { rows: FolderRow[]; rowCount: number | null };
      const updated = result.rows[0];
      if (!updated) throw notFoundDenied();
      const afterPath = await this.folderPath(tx, context.tenantId, folderId);
      if (input.name !== undefined && beforePath !== afterPath) {
        await this.auditService.log(
          documentFolderRenamedAudit({
            actorId: actorUserId,
            afterPath,
            beforePath,
            folderId,
            matterId,
            tenantId: context.tenantId,
          }),
          tx,
        );
      }
      if (input.parentFolderId !== undefined && before.parent_folder_id !== updated.parent_folder_id) {
        await this.auditService.log(
          documentFolderMovedAudit({
            actorId: actorUserId,
            afterPath,
            beforePath,
            folderId,
            matterId,
            tenantId: context.tenantId,
          }),
          tx,
        );
      }
      return toFolderDto({ ...updated, path: afterPath });
    });
  }

  async setDocumentTags(
    actorUserId: string,
    documentId: string,
    body: unknown,
  ): Promise<DocumentTagListDto> {
    const input = this.parseUpdateTags(body);
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const document = await this.findDocumentTarget(tx, context.tenantId, documentId);
      if (!document) throw notFoundDenied();
      await this.assertCanEditMatter(context.tenantId, actorUserId, document.matter_id);
      const tags = normalizeTags(input.tags);
      await this.replaceDocumentTags(tx, {
        actorUserId,
        documentId,
        matterId: document.matter_id,
        tags,
        tenantId: context.tenantId,
      });
      return { tags };
    });
  }

  private parseUpdateFolder(body: unknown): UpdateDocumentFolderDto {
    const parsed = updateDocumentFolderSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return parsed.data;
  }

  private parseUpdateTags(body: unknown): UpdateDocumentTagsDto {
    const parsed = updateDocumentTagsSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return parsed.data;
  }

  private async ensureFolderPath(
    client: QueryClient,
    input: {
      actorUserId: string;
      matterId: string;
      segments: readonly string[];
      tenantId: TenantId;
    },
  ): Promise<FolderRow> {
    let parentFolderId: string | null = null;
    let path = '';
    let folder: FolderRow | null = null;
    for (const segment of input.segments) {
      folder = await this.findChildFolder(
        client,
        input.tenantId,
        input.matterId,
        parentFolderId,
        segment,
      );
      if (!folder) {
        folder = await this.insertFolder(client, {
          actorUserId: input.actorUserId,
          matterId: input.matterId,
          name: segment,
          parentFolderId,
          tenantId: input.tenantId,
        });
        await this.auditService.log(
          documentFolderCreatedAudit({
            actorId: input.actorUserId,
            folderId: folder.folder_id,
            folderPath: path ? `${path}/${folder.name}` : folder.name,
            matterId: input.matterId,
            parentFolderId,
            tenantId: input.tenantId,
          }),
          client,
        );
      }
      parentFolderId = folder.folder_id;
      path = path ? `${path}/${folder.name}` : folder.name;
    }
    if (!folder) throw validationFailed('DOCUMENT_FOLDER_PATH_REQUIRED');
    return { ...folder, path };
  }

  private async insertFolder(
    client: QueryClient,
    input: {
      actorUserId: string;
      matterId: string;
      name: string;
      parentFolderId: string | null;
      tenantId: TenantId;
    },
  ): Promise<FolderRow> {
    try {
      const result = (await client.query(
        `
          INSERT INTO document_folders (
            tenant_id, matter_id, parent_folder_id, name, created_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING folder_id, matter_id, parent_folder_id, name, created_at, updated_at
        `,
        [input.tenantId, input.matterId, input.parentFolderId, input.name, input.actorUserId],
      )) as { rows: FolderRow[]; rowCount: number | null };
      const row = result.rows[0];
      if (!row) throw new Error('document folder insert returned no row');
      return row;
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
      const folder = await this.findChildFolder(
        client,
        input.tenantId,
        input.matterId,
        input.parentFolderId,
        input.name,
      );
      if (!folder) throw error;
      return folder;
    }
  }

  private async replaceDocumentTags(
    client: QueryClient,
    input: {
      actorUserId: string;
      documentId: string;
      matterId: string;
      tags: readonly string[];
      tenantId: TenantId;
    },
  ): Promise<void> {
    const tags = normalizeTags(input.tags);
    const beforeResult = (await client.query(
      `
        SELECT tag
        FROM document_tags
        WHERE tenant_id = $1
          AND document_id = $2
        ORDER BY tag ASC
      `,
      [input.tenantId, input.documentId],
    )) as { rows: Array<{ tag: string }>; rowCount: number | null };
    const beforeTags = beforeResult.rows.map((row) => row.tag);
    const sortedTags = [...tags].sort((left, right) => left.localeCompare(right));
    if (sameTags(beforeTags, sortedTags)) return;
    await client.query(
      `
        DELETE FROM document_tags
        WHERE tenant_id = $1
          AND document_id = $2
          AND NOT (tag = ANY($3::text[]))
      `,
      [input.tenantId, input.documentId, sortedTags],
    );
    for (const tag of sortedTags) {
      await client.query(
        `
          INSERT INTO document_tags (
            tenant_id, matter_id, document_id, tag, created_by
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, document_id, tag) DO NOTHING
        `,
        [input.tenantId, input.matterId, input.documentId, tag, input.actorUserId],
      );
    }
    await this.auditService.log(
      documentTagsChangedAudit({
        actorId: input.actorUserId,
        afterTags: sortedTags,
        beforeTags,
        documentId: input.documentId,
        matterId: input.matterId,
        tenantId: input.tenantId,
      }),
      client,
    );
  }

  private async findFolder(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    folderId: string,
  ): Promise<FolderRow | null> {
    const result = (await client.query(
      `
        SELECT folder_id, matter_id, parent_folder_id, name, created_at, updated_at
        FROM document_folders
        WHERE tenant_id = $1
          AND matter_id = $2
          AND folder_id = $3
        LIMIT 1
      `,
      [tenantId, matterId, folderId],
    )) as { rows: FolderRow[]; rowCount: number | null };
    return result.rows[0] ?? null;
  }

  private async findChildFolder(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    parentFolderId: string | null,
    name: string,
  ): Promise<FolderRow | null> {
    const result = (await client.query(
      `
        SELECT folder_id, matter_id, parent_folder_id, name, created_at, updated_at
        FROM document_folders
        WHERE tenant_id = $1
          AND matter_id = $2
          AND (($3::uuid IS NULL AND parent_folder_id IS NULL) OR parent_folder_id = $3::uuid)
          AND lower(name) = lower($4)
        LIMIT 1
      `,
      [tenantId, matterId, parentFolderId, name],
    )) as { rows: FolderRow[]; rowCount: number | null };
    return result.rows[0] ?? null;
  }

  private async findDocumentTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<DocumentFolderTargetRow | null> {
    const result = (await client.query(
      `
        SELECT document_id, matter_id
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    )) as { rows: DocumentFolderTargetRow[]; rowCount: number | null };
    return result.rows[0] ?? null;
  }

  private async folderPath(
    client: QueryClient,
    tenantId: TenantId,
    folderId: string,
  ): Promise<string> {
    const result = (await client.query(
      `
        WITH RECURSIVE ancestors AS (
          SELECT folder_id, parent_folder_id, name, 0 AS depth
          FROM document_folders
          WHERE tenant_id = $1
            AND folder_id = $2
          UNION ALL
          SELECT parent.folder_id, parent.parent_folder_id, parent.name, ancestors.depth + 1
          FROM ancestors
          JOIN document_folders parent
            ON parent.tenant_id = $1
           AND parent.folder_id = ancestors.parent_folder_id
        )
        SELECT string_agg(name, '/' ORDER BY depth DESC) AS path
        FROM ancestors
      `,
      [tenantId, folderId],
    )) as { rows: Array<{ path: string }>; rowCount: number | null };
    const path = result.rows[0]?.path;
    if (!path) throw validationFailed('DOCUMENT_FOLDER_NOT_FOUND');
    return path;
  }

  private async isDescendant(
    client: QueryClient,
    tenantId: TenantId,
    folderId: string,
    candidateParentId: string,
  ): Promise<boolean> {
    const result = (await client.query(
      `
        WITH RECURSIVE descendants AS (
          SELECT folder_id
          FROM document_folders
          WHERE tenant_id = $1
            AND parent_folder_id = $2
          UNION ALL
          SELECT child.folder_id
          FROM document_folders child
          JOIN descendants
            ON descendants.folder_id = child.parent_folder_id
          WHERE child.tenant_id = $1
        )
        SELECT EXISTS (
          SELECT 1 FROM descendants WHERE folder_id = $3
        ) AS found
      `,
      [tenantId, folderId, candidateParentId],
    )) as { rows: Array<{ found: boolean }>; rowCount: number | null };
    return result.rows[0]?.found === true;
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadMatter({ tenantId, userId: actorUserId }, matterId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canEditMatter({ tenantId, userId: actorUserId }, matterId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }
}
