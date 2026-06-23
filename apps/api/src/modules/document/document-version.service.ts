import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DocumentStatusValue } from '@amic-vault/domain';
import type {
  DocumentVersionDto,
  DocumentVersionListDto,
  DocumentVersionStatus,
  ListDocumentVersionsQueryDto,
  PermissionDecision,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { SearchIndexSyncHook } from '../search/index/index-sync.hook';
import { TenantContextService } from '../tenant/tenant-context';
import { ExtractionQueueService } from './extraction/extraction-queue.service';
import { assertDocumentMutationAllowed } from './guards/immutable-state.guard';
import { VersionNumberResolver } from './version-number.resolver';

interface DocumentVersionRow {
  version_id: string;
  document_id: string;
  version_no: number;
  version_status: DocumentVersionStatus;
  file_object_id: string;
  file_hash: string;
  created_by: string;
  created_at: Date;
  supersedes_version_id: string | null;
  promoted_from_subversion_id: string | null;
}

interface CurrentVersionRow {
  version_id: string;
  version_no: number;
}

export interface DocumentVersionTarget {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  document_family_id: string;
  status: DocumentStatusValue;
  matter_status: string;
}

export interface CreateInitialDocumentVersionInput {
  tenantId: TenantId;
  documentId: string;
  fileObjectId: string;
  fileHash: string;
  createdBy: string;
}

export type AddNextDocumentVersionInput = CreateInitialDocumentVersionInput;

export interface DocumentVersionDuplicateCandidate {
  documentId: string;
  fileObjectId: string;
  sha256: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function mapVersion(row: DocumentVersionRow): DocumentVersionDto {
  return {
    versionId: row.version_id,
    documentId: row.document_id,
    versionNo: row.version_no,
    versionStatus: row.version_status,
    fileObjectId: row.file_object_id,
    fileHash: row.file_hash,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    supersedesVersionId: row.supersedes_version_id,
    promotedFromSubversionId: row.promoted_from_subversion_id,
  };
}

function assertVersionableDocument(row: DocumentVersionTarget): void {
  assertDocumentMutationAllowed({
    documentStatus: row.status,
    matterStatus: row.matter_status,
  });
}

@Injectable()
export class DocumentVersionService {
  private readonly logger = new Logger(DocumentVersionService.name);
  private promotedFromSubversionColumnAvailable: boolean | undefined;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(VersionNumberResolver) private readonly versionNumberResolver: VersionNumberResolver,
    @Optional()
    @Inject(ExtractionQueueService)
    private readonly extractionQueue?: ExtractionQueueService,
    @Optional()
    @Inject(SearchIndexSyncHook)
    private readonly searchIndexSync?: SearchIndexSyncHook,
  ) {}

  async createInitialVersion(
    input: CreateInitialDocumentVersionInput,
    client: PoolClient,
  ): Promise<DocumentVersionDto> {
    const result = await client.query(
      `
        INSERT INTO document_versions (
          tenant_id, document_id, version_no, version_status, file_object_id, file_hash,
          created_by, supersedes_version_id
        )
        VALUES ($1, $2, $3, 'current', $4, $5, $6, NULL)
        RETURNING version_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, created_at, supersedes_version_id,
          NULL::uuid AS promoted_from_subversion_id
      `,
      [
        input.tenantId,
        input.documentId,
        this.versionNumberResolver.initial(),
        input.fileObjectId,
        input.fileHash,
        input.createdBy,
      ],
    );
    const row = result.rows[0] as DocumentVersionRow | undefined;
    if (!row) throw new Error('document version insert returned no row');
    const version = mapVersion(row);
    await this.extractionQueue?.enqueueVersionCreated(
      {
        tenantId: input.tenantId,
        documentId: input.documentId,
        versionId: version.versionId,
        fileObjectId: input.fileObjectId,
      },
      client,
    );
    return version;
  }

  async addNextVersion(
    input: AddNextDocumentVersionInput,
    client: PoolClient,
  ): Promise<DocumentVersionDto> {
    const target = await this.findTargetForTenant(input.tenantId, input.documentId, client, true);
    if (!target) throw notFoundDenied();
    assertVersionableDocument(target);

    const current = await this.findCurrentVersion(input.tenantId, input.documentId, client);
    if (!current) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
    const nextVersionNo = this.versionNumberResolver.nextAfter(current.version_no);

    const superseded = await client.query(
      `
        UPDATE document_versions
        SET version_status = 'superseded'
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_id = $3
          AND version_status = 'current'
      `,
      [input.tenantId, input.documentId, current.version_id],
    );
    if (superseded.rowCount !== 1) throw validationFailed('DOCUMENT_VERSION_CONFLICT');
    await this.searchIndexSync?.enqueueVersion(
      { tenantId: input.tenantId, documentId: input.documentId, versionId: current.version_id },
      client,
    );

    const inserted = await client.query(
      `
        INSERT INTO document_versions (
          tenant_id, document_id, version_no, version_status, file_object_id, file_hash,
          created_by, supersedes_version_id
        )
        VALUES ($1, $2, $3, 'current', $4, $5, $6, $7)
        RETURNING version_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, created_at, supersedes_version_id,
          NULL::uuid AS promoted_from_subversion_id
      `,
      [
        input.tenantId,
        input.documentId,
        nextVersionNo,
        input.fileObjectId,
        input.fileHash,
        input.createdBy,
        current.version_id,
      ],
    );
    const row = inserted.rows[0] as DocumentVersionRow | undefined;
    if (!row) throw new Error('document version insert returned no row');
    const version = mapVersion(row);
    await this.extractionQueue?.enqueueVersionCreated(
      {
        tenantId: input.tenantId,
        documentId: input.documentId,
        versionId: version.versionId,
        fileObjectId: input.fileObjectId,
      },
      client,
    );
    return version;
  }

  async findVersionTarget(
    tenantId: TenantId,
    documentId: string,
  ): Promise<DocumentVersionTarget | null> {
    return this.auditService.transaction(tenantId, (tx) =>
      this.findTargetForTenant(tenantId, documentId, tx, false),
    );
  }

  async listVersions(
    actorUserId: string,
    documentId: string,
    query: ListDocumentVersionsQueryDto,
  ): Promise<DocumentVersionListDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTargetForTenant(context.tenantId, documentId, tx, false);
      if (!target) throw notFoundDenied();
      await this.assertCanReadDocument(context.tenantId, actorUserId, documentId);

      const params: unknown[] = [context.tenantId, documentId];
      const filters = ['tenant_id = $1', 'document_id = $2'];
      if (query.status) {
        params.push(query.status);
        filters.push(`version_status = $${params.length}`);
      }
      const promotedFromSubversionIdProjection =
        await this.promotedFromSubversionIdProjection(tx);
      const result = await tx.query(
        `
          SELECT version_id, document_id, version_no, version_status, file_object_id,
            file_hash, created_by, created_at, supersedes_version_id,
            ${promotedFromSubversionIdProjection}
          FROM document_versions
          WHERE ${filters.join(' AND ')}
          ORDER BY version_no DESC, created_at DESC, version_id DESC
        `,
        params,
      );
      return { items: (result.rows as DocumentVersionRow[]).map(mapVersion) };
    });
  }

  async findDuplicateVersionCandidates(
    input: {
      tenantId: TenantId;
      documentId: string;
      fileObjectId: string;
      sha256: string;
      limit?: number;
    },
    client: QueryClient,
  ): Promise<DocumentVersionDuplicateCandidate[]> {
    const result = await client.query(
      `
        SELECT document_id, file_object_id, file_hash AS sha256
        FROM document_versions
        WHERE tenant_id = $1
          AND document_id = $2
          AND file_hash = $3
          AND file_object_id <> $4
        ORDER BY version_no DESC, created_at DESC
        LIMIT $5
      `,
      [input.tenantId, input.documentId, input.sha256, input.fileObjectId, input.limit ?? 10],
    );
    return (
      result.rows as Array<{
        document_id: string;
        file_object_id: string;
        sha256: string;
      }>
    ).map((row) => ({
      documentId: row.document_id,
      fileObjectId: row.file_object_id,
      sha256: row.sha256,
    }));
  }

  private async assertCanReadDocument(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadDocument(
        { tenantId, userId: actorUserId },
        documentId,
      );
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
    }
    if (decision?.effect === 'ALLOW') return;
    throw notFoundDenied();
  }

  private async findTargetForTenant(
    tenantId: TenantId,
    documentId: string,
    client: QueryClient,
    lockDocument: boolean,
  ): Promise<DocumentVersionTarget | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.document_family_id, d.status,
          m.status AS matter_status
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
        ${lockDocument ? 'FOR UPDATE OF d' : ''}
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DocumentVersionTarget | undefined) ?? null;
  }

  private async findCurrentVersion(
    tenantId: TenantId,
    documentId: string,
    client: QueryClient,
  ): Promise<CurrentVersionRow | null> {
    const result = await client.query(
      `
        SELECT version_id, version_no
        FROM document_versions
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_status = 'current'
        ORDER BY version_no DESC
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as CurrentVersionRow | undefined) ?? null;
  }

  private async promotedFromSubversionIdProjection(client: QueryClient): Promise<string> {
    if (this.promotedFromSubversionColumnAvailable === undefined) {
      const result = await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'document_versions'
              AND column_name = 'promoted_from_subversion_id'
          ) AS exists
        `,
      );
      const row = result.rows[0] as { exists?: boolean | 't' | 'f' } | undefined;
      this.promotedFromSubversionColumnAvailable = row?.exists === true || row?.exists === 't';
    }

    return this.promotedFromSubversionColumnAvailable
      ? 'promoted_from_subversion_id'
      : 'NULL::uuid AS promoted_from_subversion_id';
  }
}
