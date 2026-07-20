import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import {
  ddMappingSuggestionReviewResponseSchema,
  ddDataRoomMappingListResponseSchema,
  ddDataRoomMappingSchema,
  ddIssueCitationRequiredReason,
  ddIssueListResponseSchema,
  ddIssueSchema,
  ddNegotiationIssueExportResponseSchema,
  ddReportExportResponseSchema,
  ddRfiListResponseSchema,
  ddRfiGapListResponseSchema,
  ddRfiSchema,
  ddRfiTemplateInstantiationResponseSchema,
  ddRiskListResponseSchema,
  ddRiskSchema,
  ddTraceabilityResponseSchema,
  type CreateDdDataRoomMappingRequestDto,
  type CreateDdIssueRequestDto,
  type CreateDdNegotiationIssueExportRequestDto,
  type CreateDdReportExportRequestDto,
  type CreateDdRfiRequestDto,
  type CreateDdRiskRequestDto,
  type ContractType,
  type DdDataRoomMappingDto,
  type DdDataRoomMappingQueryDto,
  type DdDataRoomMappingListResponseDto,
  type DdMappingSuggestionReviewResponseDto,
  type DdNegotiationIssueExportResponseDto,
  type DdReportExportResponseDto,
  type DdIssueDto,
  type DdIssueQueryDto,
  type DdIssueListResponseDto,
  type DdRfiCategory,
  type DdRfiDto,
  type DdRfiQueryDto,
  type DdRfiListResponseDto,
  type DdRfiGapQueryDto,
  type DdRfiGapListResponseDto,
  type DdRfiTemplateInstantiateRequestDto,
  type DdRfiTemplateInstantiationResponseDto,
  type DdRiskDto,
  type DdRiskQueryDto,
  type DdRiskListResponseDto,
  type DdTraceabilityItemDto,
  type DdTraceabilityQueryDto,
  type DdTraceabilityResponseDto,
  type PermissionContext,
  type ReviewDdMappingSuggestionRequestDto,
  type UpdateDdIssueRequestDto,
  type UpdateDdRfiRequestDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { classifyContractText } from '../contract-intel/contract-classifier';
import { ContractIntelService } from '../contract-intel/contract-intel.service';
import { DocumentUploadService } from '../document/document-upload.service';
import { DocumentPermissionService } from '../permission/document-permission.service';
import { PermissionService } from '../permission/permission.service';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../search/permission/search-permission-scope.provider';
import { GraphSyncOutboxWorker } from '../graph/graph-sync-outbox.worker';
import {
  SearchFilterBuilder,
  type SearchSqlFragment,
  type SearchSqlValue,
} from '../search/query/search-filter.builder';
import { WorkService } from '../work/work.service';
import { buildDdReportDocx, buildNegotiationIssuesDocx } from './dd-report-docx';

interface DdRfiRow {
  rfi_id: string;
  matter_id: string;
  rfi_code: string;
  category: string;
  title: string;
  status: string;
  priority: string;
  owner_user_id: string | null;
  due_date: Date | string | null;
  overdue: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DdMappingRow {
  mapping_id: string;
  matter_id: string;
  rfi_id: string | null;
  document_id: string | null;
  version_id: string | null;
  internal_label: string;
  section_path: string;
  mapping_status: string;
  supplement_requested_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DdIssueRow {
  issue_id: string;
  matter_id: string;
  rfi_id: string | null;
  document_id: string | null;
  issue_code: string;
  title: string;
  severity: string;
  status: string;
  citation_refs: string[];
  report_inclusion: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DdRiskRow {
  risk_id: string;
  matter_id: string;
  issue_id: string | null;
  risk_code: string;
  category: string;
  severity: string;
  likelihood: string;
  status: string;
  citation_refs: string[];
  created_at: Date;
  updated_at: Date;
}

interface MatterLabelRow {
  matter_code: string;
  matter_name: string;
}

interface DocumentVersionRow {
  matter_id: string;
  document_id: string;
  version_id: string;
}

interface MatterRefRow {
  matter_id: string;
}

interface DdRfiTemplateRow {
  template_id: string;
  items_json: unknown;
}

interface DdRfiTemplateItem {
  rfi_code: string;
  category: string;
  title: string;
  description: string | null;
  priority: string;
}

interface DdMappingSuggestionInput {
  tenantId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  bodyText: string;
  sourceArtifactId?: string | undefined;
  sourceHash?: string | undefined;
}

interface DdAiPrepMappingSuggestionInput extends DdMappingSuggestionInput {
  sourceArtifactId: string;
  sourceHash: string;
}

interface DdMappingSuggestionRfiRow {
  rfi_id: string;
  rfi_code: string;
  category: DdRfiCategory;
  title: string;
  owner_user_id: string | null;
  assignee_user_id: string | null;
}

type StatusAudit = {
  status_before?: string | undefined;
  status_after?: string | undefined;
};

type PgParam = SearchSqlValue | null;

const contractCategoryMap: Partial<Record<ContractType, DdRfiCategory>> = {
  nda: 'corporate',
  msa: 'corporate',
  share_purchase: 'corporate',
  employment: 'employment',
  lease: 'general',
  loan: 'finance',
};

const mappingReviewDueMs = 48 * 60 * 60 * 1000;

@Injectable()
export class DdService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermission: DocumentPermissionService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder,
    @Inject(GraphSyncOutboxWorker) private readonly graphSyncOutbox: GraphSyncOutboxWorker,
    @Inject(WorkService) private readonly workService: WorkService,
    @Inject(DocumentUploadService) private readonly documentUpload: DocumentUploadService,
    @Inject(ContractIntelService) private readonly contractIntel: ContractIntelService,
  ) {}

  async createRfi(
    ctx: PermissionContext,
    input: CreateDdRfiRequestDto,
  ): Promise<DdRfiDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<DdRfiRow>(
        `
          INSERT INTO dd_rfis (
            tenant_id, matter_id, rfi_code, category, title, description,
            status, priority, owner_user_id, due_date, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $11)
          RETURNING
            rfi_id, matter_id, rfi_code, category, title, status, priority,
            owner_user_id, due_date, (due_date IS NOT NULL AND due_date < current_date
              AND status NOT IN ('complete', 'reported')) AS overdue,
            created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.rfiCode,
          input.category,
          input.title,
          input.description ?? null,
          input.status,
          input.priority,
          input.ownerUserId ?? null,
          input.dueDate ?? null,
          ctx.userId,
        ],
      );
      const rfi = parseRfiRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_RFI_CHANGED',
          targetType: 'dd_rfi',
          targetId: rfi.rfiId,
          matterId: rfi.matterId,
          metadata: {
            matter_id: rfi.matterId,
            rfi_id: rfi.rfiId,
            status_after: rfi.status,
            priority: rfi.priority,
          },
        },
        client,
      );
      return rfi;
    });
  }

  async listRfis(
    ctx: PermissionContext,
    input: DdRfiQueryDto,
  ): Promise<DdRfiListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rfis = await this.queryRfis(client, ctx.tenantId, input);
      return ddRfiListResponseSchema.parse({ matterId: input.matterId, rfis });
    });
  }

  async listRfiGaps(
    ctx: PermissionContext,
    input: DdRfiGapQueryDto,
  ): Promise<DdRfiGapListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rfis = await this.queryRfiGaps(client, ctx.tenantId, input);
      return ddRfiGapListResponseSchema.parse({ matterId: input.matterId, rfis });
    });
  }

  async instantiateRfiTemplate(
    ctx: PermissionContext,
    templateId: string,
    input: DdRfiTemplateInstantiateRequestDto,
  ): Promise<DdRfiTemplateInstantiationResponseDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const template = await this.findRfiTemplate(client, ctx.tenantId, templateId);
      if (!template) throw validationFailed();
      const items = parseTemplateItems(template.items_json);
      const result = await client.query<DdRfiRow>(
        `
          WITH template_items AS (
            SELECT *
            FROM jsonb_to_recordset($4::jsonb) AS item(
              rfi_code text,
              category text,
              title text,
              description text,
              priority text
            )
          )
          INSERT INTO dd_rfis (
            tenant_id, matter_id, rfi_code, category, title, description,
            status, priority, owner_user_id, due_date, created_by, updated_by
          )
          SELECT
            $1,
            $2,
            rfi_code,
            category,
            title,
            description,
            'requested',
            priority,
            $5::uuid,
            $6::date,
            $3,
            $3
          FROM template_items
          ORDER BY rfi_code
          RETURNING
            rfi_id, matter_id, rfi_code, category, title, status, priority,
            owner_user_id, due_date, (due_date IS NOT NULL AND due_date < current_date
              AND status NOT IN ('complete', 'reported')) AS overdue,
            created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          ctx.userId,
          JSON.stringify(items),
          input.ownerUserId ?? ctx.userId,
          input.dueDate ?? null,
        ],
      );
      const rfis = result.rows.map(parseRfiRow);
      for (const rfi of rfis) {
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'DD_RFI_CHANGED',
            targetType: 'dd_rfi',
            targetId: rfi.rfiId,
            matterId: rfi.matterId,
            metadata: {
              matter_id: rfi.matterId,
              rfi_id: rfi.rfiId,
              template_id: template.template_id,
              rfi_code: rfi.rfiCode,
              status_after: rfi.status,
              priority: rfi.priority,
            },
          },
          client,
        );
      }
      return ddRfiTemplateInstantiationResponseSchema.parse({
        templateId: template.template_id,
        matterId: input.matterId,
        createdCount: rfis.length,
        rfis,
      });
    });
  }

  async updateRfi(
    ctx: PermissionContext,
    rfiId: string,
    input: UpdateDdRfiRequestDto,
  ): Promise<DdRfiDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const before = await this.findRfi(client, ctx.tenantId, rfiId);
      if (!before) throw validationFailed();
      await this.assertCanEditMatter(ctx, before.matter_id);
      const updates = buildRfiUpdate(input, ctx.userId);
      const result = await client.query<DdRfiRow>(
        `
          UPDATE dd_rfis
          SET ${updates.setSql}
          WHERE tenant_id = $1
            AND rfi_id = $2
          RETURNING
            rfi_id, matter_id, rfi_code, category, title, status, priority,
            owner_user_id, due_date, (due_date IS NOT NULL AND due_date < current_date
              AND status NOT IN ('complete', 'reported')) AS overdue,
            created_at, updated_at
        `,
        [ctx.tenantId, rfiId, ...updates.params],
      );
      const rfi = parseRfiRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_RFI_CHANGED',
          targetType: 'dd_rfi',
          targetId: rfi.rfiId,
          matterId: rfi.matterId,
          metadata: {
            matter_id: rfi.matterId,
            rfi_id: rfi.rfiId,
            ...statusAudit(before.status, rfi.status),
            priority: rfi.priority,
            diff_keys: updates.diffKeys,
          },
        },
        client,
      );
      return rfi;
    });
  }

  async createMapping(
    ctx: PermissionContext,
    input: CreateDdDataRoomMappingRequestDto,
  ): Promise<DdDataRoomMappingDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    let version: DocumentVersionRow | null = null;
    if (input.documentId) {
      await this.assertCanReadDocument(ctx, input.documentId);
    }
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.rfiId) {
        await this.assertRfiBelongsToMatter(client, ctx.tenantId, input.rfiId, input.matterId);
      }
      if (input.documentId) {
        version = await this.findDocumentVersion(
          client,
          ctx.tenantId,
          input.documentId,
          input.versionId,
        );
        if (!version || version.matter_id !== input.matterId) throw validationFailed();
      }
      const result = await client.query<DdMappingRow>(
        `
          INSERT INTO dd_data_room_mappings (
            tenant_id, matter_id, rfi_id, document_id, version_id, internal_label,
            section_path, mapping_status, supplement_requested_at, mapped_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
            CASE WHEN $8 = 'supplement_requested' THEN now() ELSE NULL END,
            $9
          )
          RETURNING
            mapping_id, matter_id, rfi_id, document_id, version_id, internal_label,
            section_path, mapping_status, supplement_requested_at, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.rfiId ?? null,
          version?.document_id ?? null,
          version?.version_id ?? null,
          input.internalLabel,
          input.sectionPath,
          input.mappingStatus,
          ctx.userId,
        ],
      );
      const mapping = parseMappingRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_DATA_ROOM_MAPPED',
          targetType: 'dd_data_room_mapping',
          targetId: mapping.mappingId,
          matterId: mapping.matterId,
          metadata: {
            matter_id: mapping.matterId,
            rfi_id: mapping.rfiId,
            mapping_id: mapping.mappingId,
            document_id: mapping.documentId,
            version_id: mapping.versionId,
            mapping_status: mapping.mappingStatus,
          },
        },
        client,
      );
      return mapping;
    });
  }

  async listMappings(
    ctx: PermissionContext,
    input: DdDataRoomMappingQueryDto,
  ): Promise<DdDataRoomMappingListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const mappings = await this.queryMappings(client, scope.scope, input);
      return ddDataRoomMappingListResponseSchema.parse({
        matterId: input.matterId,
        mappings,
      });
    });
  }

  async suggestMappingsFromExtraction(
    client: QueryClient,
    input: DdMappingSuggestionInput,
  ): Promise<{ suggestedCount: number; mappingIds: string[] }> {
    const text = input.bodyText.trim();
    if (!text) return { suggestedCount: 0, mappingIds: [] };
    const classification = classifyContractText({
      documentId: input.documentId,
      versionId: input.versionId,
      matterId: input.matterId,
      text,
    });
    const category = contractCategoryMap[classification.contractType];
    if (!category || classification.unsupported) return { suggestedCount: 0, mappingIds: [] };

    const rfiResult = await client.query(
      `
        SELECT
          r.rfi_id,
          r.rfi_code,
          r.category,
          r.title,
          r.owner_user_id,
          COALESCE(
            r.owner_user_id,
            (
              SELECT mm.user_id
              FROM matter_members mm
              WHERE mm.tenant_id = r.tenant_id
                AND mm.matter_id = r.matter_id
                AND mm.access_level = 'edit'
              ORDER BY (mm.matter_role = 'owner') DESC, mm.added_at ASC, mm.user_id
              LIMIT 1
            )
          ) AS assignee_user_id
        FROM dd_rfis r
        WHERE r.tenant_id = $1
          AND r.matter_id = $2
          AND r.category = $3
          AND r.status NOT IN ('complete', 'reported')
          AND NOT EXISTS (
            SELECT 1
            FROM dd_data_room_mappings existing
            WHERE existing.tenant_id = r.tenant_id
              AND existing.rfi_id = r.rfi_id
              AND existing.mapping_status IN ('mapped', 'suggested')
          )
        ORDER BY
          (r.owner_user_id IS NULL) ASC,
          CASE r.priority
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END,
          r.due_date NULLS LAST,
          r.created_at ASC
        LIMIT 1
      `,
      [input.tenantId, input.matterId, category],
    );
    const rfi = rfiResult.rows[0] as DdMappingSuggestionRfiRow | undefined;
    if (!rfi?.assignee_user_id) return { suggestedCount: 0, mappingIds: [] };

    const mappingResult = await client.query(
      `
        INSERT INTO dd_data_room_mappings (
          tenant_id, matter_id, rfi_id, document_id, version_id, internal_label,
          section_path, mapping_status, supplement_requested_at, mapped_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'suggested', NULL, $8)
        ON CONFLICT (tenant_id, matter_id, rfi_id, document_id, version_id)
          WHERE mapping_status = 'suggested'
        DO UPDATE SET
          internal_label = EXCLUDED.internal_label,
          section_path = EXCLUDED.section_path,
          mapped_by = EXCLUDED.mapped_by,
          updated_at = now()
        RETURNING
          mapping_id, matter_id, rfi_id, document_id, version_id, internal_label,
          section_path, mapping_status, supplement_requested_at, created_at, updated_at
      `,
      [
        input.tenantId,
        input.matterId,
        rfi.rfi_id,
        input.documentId,
        input.versionId,
        `${rfi.rfi_code} suggested ${classification.contractType}`,
        `${rfi.category}.${rfi.rfi_code}`,
        rfi.assignee_user_id,
      ],
    );
    const mapping = parseMappingRow(mappingResult.rows[0] as DdMappingRow | undefined);
    const audit = await this.auditService.log(
      {
        tenantId: input.tenantId,
        actorType: 'system',
        actorId: null,
        action: 'DD_DATA_ROOM_MAPPED',
        targetType: 'dd_data_room_mapping',
        targetId: mapping.mappingId,
        matterId: input.matterId,
        metadata: {
          matter_id: input.matterId,
          rfi_id: rfi.rfi_id,
          mapping_id: mapping.mappingId,
          document_id: input.documentId,
          version_id: input.versionId,
          ...(input.sourceArtifactId
            ? { ai_prep_artifact_id: input.sourceArtifactId }
            : {}),
          ...(input.sourceHash ? { hash: input.sourceHash } : {}),
          mapping_status: 'suggested',
          contract_type: classification.contractType,
          classifier_version: classification.classifierVersion,
          confidence: classification.confidence,
        },
      },
      client,
    );
    await this.workService.openWorkflowWork(client, {
      tenantId: input.tenantId,
      kind: 'dd_mapping_review',
      targetId: mapping.mappingId,
      matterId: input.matterId,
      documentId: input.documentId,
      assignedToUserId: rfi.assignee_user_id,
      dueAt: new Date(Date.now() + mappingReviewDueMs),
      actorUserId: rfi.assignee_user_id,
      auditEventId: audit.eventId,
    });
    return { suggestedCount: 1, mappingIds: [mapping.mappingId] };
  }

  async suggestMappingsFromAiPrepArtifact(
    client: QueryClient,
    input: DdAiPrepMappingSuggestionInput,
  ): Promise<{ suggestedCount: number; mappingIds: string[] }> {
    await this.assertAiPrepDocumentProfileArtifact(
      client,
      input.tenantId,
      input.sourceArtifactId,
      input.matterId,
      input.documentId,
      input.versionId,
      input.sourceHash,
    );
    return this.suggestMappingsFromExtraction(client, input);
  }

  async reviewMappingSuggestion(
    ctx: PermissionContext,
    mappingId: string,
    input: ReviewDdMappingSuggestionRequestDto,
  ): Promise<DdMappingSuggestionReviewResponseDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const currentResult = await client.query<DdMappingRow>(
        `
          SELECT
            mapping_id, matter_id, rfi_id, document_id, version_id, internal_label,
            section_path, mapping_status, supplement_requested_at, created_at, updated_at
          FROM dd_data_room_mappings
          WHERE tenant_id = $1
            AND mapping_id = $2
            AND mapping_status = 'suggested'
          FOR UPDATE
          LIMIT 1
        `,
        [ctx.tenantId, mappingId],
      );
      const current = currentResult.rows[0];
      if (!current) throw validationFailed();
      await this.assertCanEditMatter(ctx, current.matter_id);
      if (current.document_id) await this.assertCanReadDocument(ctx, current.document_id);

      if (input.decision === 'approve') {
        const approvedResult = await client.query<DdMappingRow>(
          `
            UPDATE dd_data_room_mappings
            SET mapping_status = 'mapped',
              supplement_requested_at = NULL,
              mapped_by = $3,
              updated_at = now()
            WHERE tenant_id = $1
              AND mapping_id = $2
            RETURNING
              mapping_id, matter_id, rfi_id, document_id, version_id, internal_label,
              section_path, mapping_status, supplement_requested_at, created_at, updated_at
          `,
          [ctx.tenantId, mappingId, ctx.userId],
        );
        const mapping = parseMappingRow(approvedResult.rows[0]);
        const audit = await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'DD_DATA_ROOM_MAPPED',
            targetType: 'dd_data_room_mapping',
            targetId: mapping.mappingId,
            matterId: mapping.matterId,
            metadata: {
              matter_id: mapping.matterId,
              rfi_id: mapping.rfiId,
              mapping_id: mapping.mappingId,
              document_id: mapping.documentId,
              version_id: mapping.versionId,
              mapping_status: mapping.mappingStatus,
              status_before: 'suggested',
              status_after: 'mapped',
              review_decision: 'approved',
            },
          },
          client,
        );
        await this.workService.completeWorkflowWork(client, {
          tenantId: ctx.tenantId,
          kind: 'dd_mapping_review',
          targetId: mapping.mappingId,
          actorUserId: ctx.userId,
          auditEventId: audit.eventId,
        });
        return ddMappingSuggestionReviewResponseSchema.parse({
          mappingId: mapping.mappingId,
          decision: input.decision,
          mapping,
        });
      }

      const currentMapping = parseMappingRow(current);
      const audit = await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_DATA_ROOM_MAPPED',
          targetType: 'dd_data_room_mapping',
          targetId: currentMapping.mappingId,
          matterId: currentMapping.matterId,
          metadata: {
            matter_id: currentMapping.matterId,
            rfi_id: currentMapping.rfiId,
            mapping_id: currentMapping.mappingId,
            document_id: currentMapping.documentId,
            version_id: currentMapping.versionId,
            mapping_status: 'suggested',
            status_before: 'suggested',
            status_after: 'deleted',
            review_decision: 'rejected',
          },
        },
        client,
      );
      await this.workService.completeWorkflowWork(client, {
        tenantId: ctx.tenantId,
        kind: 'dd_mapping_review',
        targetId: currentMapping.mappingId,
        actorUserId: ctx.userId,
        auditEventId: audit.eventId,
      });
      await client.query(
        `
          DELETE FROM dd_data_room_mappings
          WHERE tenant_id = $1
            AND mapping_id = $2
            AND mapping_status = 'suggested'
        `,
        [ctx.tenantId, currentMapping.mappingId],
      );
      return ddMappingSuggestionReviewResponseSchema.parse({
        mappingId: currentMapping.mappingId,
        decision: input.decision,
        mapping: null,
      });
    });
  }

  async createIssue(
    ctx: PermissionContext,
    input: CreateDdIssueRequestDto,
  ): Promise<DdIssueDto> {
    if (input.status !== 'open' && input.citationRefs.length === 0) {
      throw validationFailed(ddIssueCitationRequiredReason);
    }
    await this.assertCanEditMatter(ctx, input.matterId);
    if (input.documentId) {
      await this.assertCanReadDocument(ctx, input.documentId);
    }
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.rfiId) {
        await this.assertRfiBelongsToMatter(client, ctx.tenantId, input.rfiId, input.matterId);
      }
      if (input.documentId) {
        const version = await this.findDocumentVersion(client, ctx.tenantId, input.documentId);
        if (!version || version.matter_id !== input.matterId) throw validationFailed();
      }
      const result = await client.query<DdIssueRow>(
        `
          INSERT INTO dd_issues (
            tenant_id, matter_id, rfi_id, document_id, issue_code, title, severity,
            status, citation_refs, report_inclusion, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $11)
          RETURNING
            issue_id, matter_id, rfi_id, document_id, issue_code, title, severity,
            status, citation_refs, report_inclusion, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.rfiId ?? null,
          input.documentId ?? null,
          input.issueCode,
          input.title,
          input.severity,
          input.status,
          input.citationRefs,
          input.reportInclusion,
          ctx.userId,
        ],
      );
      const issue = parseIssueRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_ISSUE_CHANGED',
          targetType: 'dd_issue',
          targetId: issue.issueId,
          matterId: issue.matterId,
          metadata: {
            matter_id: issue.matterId,
            rfi_id: issue.rfiId,
            document_id: issue.documentId,
            issue_id: issue.issueId,
            status_after: issue.status,
            severity: issue.severity,
          },
        },
        client,
      );
      await this.graphSyncOutbox.enqueue(
        {
          tenantId: ctx.tenantId,
          matterId: issue.matterId,
          reasonCode: 'dd_issue_changed',
          requestedBy: ctx.userId,
        },
        client,
      );
      return issue;
    });
  }

  async updateIssue(
    ctx: PermissionContext,
    issueId: string,
    input: UpdateDdIssueRequestDto,
  ): Promise<DdIssueDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const current = await this.findIssueForUpdate(client, ctx.tenantId, issueId);
      if (!current) throw validationFailed();
      await this.assertCanEditMatter(ctx, current.matter_id);

      const nextStatus = input.status ?? current.status;
      const nextCitationRefs = input.citationRefs ?? current.citation_refs;
      if (nextStatus !== 'open' && nextCitationRefs.length === 0) {
        throw validationFailed(ddIssueCitationRequiredReason);
      }

      const diffKeys = issueDiffKeys(current, input);
      if (diffKeys.length === 0) return parseIssueRow(current);

      const result = await client.query<DdIssueRow>(
        `
          UPDATE dd_issues
          SET status = $3,
              citation_refs = $4::text[],
              updated_by = $5,
              updated_at = now()
          WHERE tenant_id = $1
            AND issue_id = $2
          RETURNING
            issue_id, matter_id, rfi_id, document_id, issue_code, title, severity,
            status, citation_refs, report_inclusion, created_at, updated_at
        `,
        [ctx.tenantId, issueId, nextStatus, nextCitationRefs, ctx.userId],
      );
      const issue = parseIssueRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_ISSUE_CHANGED',
          targetType: 'dd_issue',
          targetId: issue.issueId,
          matterId: issue.matterId,
          metadata: {
            matter_id: issue.matterId,
            rfi_id: issue.rfiId,
            document_id: issue.documentId,
            issue_id: issue.issueId,
            diff_keys: diffKeys,
            status_before: current.status,
            status_after: issue.status,
            citation_ref_count: issue.citationRefs.length,
            severity: issue.severity,
          },
        },
        client,
      );
      await this.graphSyncOutbox.enqueue(
        {
          tenantId: ctx.tenantId,
          matterId: issue.matterId,
          reasonCode: 'dd_issue_changed',
          requestedBy: ctx.userId,
        },
        client,
      );
      return issue;
    });
  }

  async listIssues(
    ctx: PermissionContext,
    input: DdIssueQueryDto,
  ): Promise<DdIssueListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const issues = await this.queryIssues(client, scope.scope, input);
      return ddIssueListResponseSchema.parse({ matterId: input.matterId, issues });
    });
  }

  async createRisk(
    ctx: PermissionContext,
    input: CreateDdRiskRequestDto,
  ): Promise<DdRiskDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.issueId) {
        await this.assertIssueBelongsToMatter(client, ctx.tenantId, input.issueId, input.matterId);
      }
      const result = await client.query<DdRiskRow>(
        `
          INSERT INTO dd_risks (
            tenant_id, matter_id, issue_id, risk_code, category, severity,
            likelihood, status, mitigation_summary, citation_refs, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $11)
          RETURNING
            risk_id, matter_id, issue_id, risk_code, category, severity,
            likelihood, status, citation_refs, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.issueId ?? null,
          input.riskCode,
          input.category,
          input.severity,
          input.likelihood,
          input.status,
          input.mitigationSummary ?? null,
          input.citationRefs,
          ctx.userId,
        ],
      );
      const risk = parseRiskRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_RISK_CHANGED',
          targetType: 'dd_risk',
          targetId: risk.riskId,
          matterId: risk.matterId,
          metadata: {
            matter_id: risk.matterId,
            issue_id: risk.issueId,
            risk_id: risk.riskId,
            status_after: risk.status,
            severity: risk.severity,
          },
        },
        client,
      );
      await this.graphSyncOutbox.enqueue(
        {
          tenantId: ctx.tenantId,
          matterId: risk.matterId,
          reasonCode: 'dd_risk_changed',
          requestedBy: ctx.userId,
        },
        client,
      );
      return risk;
    });
  }

  async listRisks(
    ctx: PermissionContext,
    input: DdRiskQueryDto,
  ): Promise<DdRiskListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const risks = await this.queryRisks(client, scope.scope, input);
      return ddRiskListResponseSchema.parse({ matterId: input.matterId, risks });
    });
  }

  async traceability(
    ctx: PermissionContext,
    input: DdTraceabilityQueryDto,
  ): Promise<DdTraceabilityResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rfis = await this.queryRfis(client, ctx.tenantId, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const mappings = await this.queryMappings(client, scope.scope, {
        matterId: input.matterId,
        status: 'mapped',
        limit: input.limit,
      });
      const issues = await this.queryIssues(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const risks = await this.queryRisks(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const traces = buildTraceItems(rfis, mappings, issues, risks).slice(0, input.limit);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DD_TRACE_VIEWED',
          targetType: 'dd_traceability',
          targetId: input.matterId,
          matterId: input.matterId,
          metadata: {
            matter_id: input.matterId,
            query_hash: sha256Hex(`dd-trace:${input.matterId}:${input.limit}`),
            rfi_count: rfis.length,
            mapping_count: mappings.length,
            issue_count: issues.length,
            risk_count: risks.length,
            trace_count: traces.length,
            filter_refs: compactRules(scope.appliedRules ?? []),
          },
        },
        client,
      );
      return ddTraceabilityResponseSchema.parse({
        matterId: input.matterId,
        rfiCount: rfis.length,
        mappingCount: mappings.length,
        issueCount: issues.length,
        riskCount: risks.length,
        traces,
      });
    });
  }

  async assertCanExportMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    await this.assertCanEditMatter(ctx, matterId);
  }

  async exportReport(
    ctx: PermissionContext,
    input: CreateDdReportExportRequestDto,
  ): Promise<DdReportExportResponseDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    const snapshot = await this.auditService.transaction(ctx.tenantId, async (client) => {
      const matterLabel = await this.findMatterLabel(client, ctx.tenantId, input.matterId);
      const issues = await this.queryIssues(client, scope.scope, {
        matterId: input.matterId,
        limit: 100,
      });
      const risks = await this.queryRisks(client, scope.scope, {
        matterId: input.matterId,
        limit: 100,
      });
      const includedIssues = issues.filter((issue) => issue.reportInclusion);
      const issueIds = new Set(includedIssues.map((issue) => issue.issueId));
      const includedRisks = risks.filter(
        (risk) => risk.issueId === null || issueIds.has(risk.issueId),
      );
      const itemCount = includedIssues.length + includedRisks.length;
      if (itemCount === 0) throw validationFailed('DD_REPORT_EXPORT_EMPTY');
      return { matterLabel, issues: includedIssues, risks: includedRisks, itemCount };
    });

    const generatedAt = new Date();
    const title = `${snapshot.matterLabel} DD 보고서 초안`;
    const body = buildDdReportDocx({
      matterLabel: snapshot.matterLabel,
      generatedAt,
      issues: snapshot.issues,
      risks: snapshot.risks,
    });
    const hash = createHash('sha256').update(body).digest('hex');
    const uploaded = await this.documentUpload.uploadBuffer({
      actorUserId: ctx.userId,
      matterId: input.matterId,
      originalFilename: `dd-report-${input.matterId}-${generatedAt.getTime()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body,
      afterUploadAudit: async (client, document) => {
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'DD_REPORT_EXPORTED',
            targetType: 'document',
            targetId: document.documentId,
            matterId: input.matterId,
            metadata: {
              matter_id: input.matterId,
              document_id: document.documentId,
              file_object_id: document.fileObjectId,
              hash,
              export_format: input.exportFormat,
              issue_count: snapshot.issues.length,
              risk_count: snapshot.risks.length,
              item_count: snapshot.itemCount,
            },
          },
          client,
        );
      },
      fields: {
        title,
        documentType: 'memo',
        subtype: 'dd_report_export',
        confidentialityLevel: 'high',
        privilegeStatus: 'work_product',
        source: 'internal_work_product',
        aiAllowed: false,
        versionLabel: 'DD report draft',
        versionSignificance: 'internal_draft',
        renditionType: 'clean',
      },
    });

    return ddReportExportResponseSchema.parse({
      matterId: input.matterId,
      documentId: uploaded.documentId,
      fileObjectId: uploaded.fileObjectId,
      title: uploaded.title,
      exportFormat: input.exportFormat,
      issueCount: snapshot.issues.length,
      riskCount: snapshot.risks.length,
      itemCount: snapshot.itemCount,
    });
  }

  async exportNegotiationIssues(
    ctx: PermissionContext,
    input: CreateDdNegotiationIssueExportRequestDto,
  ): Promise<DdNegotiationIssueExportResponseDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    const [matterLabel, issueList] = await Promise.all([
      this.auditService.transaction(ctx.tenantId, (client) =>
        this.findMatterLabel(client, ctx.tenantId, input.matterId),
      ),
      this.contractIntel.listNegotiationIssues(ctx, {
        matterId: input.matterId,
        limit: 100,
        ...(input.documentId ? { documentId: input.documentId } : {}),
        ...(input.status ? { status: input.status } : {}),
      }),
    ]);
    if (issueList.issues.length === 0) throw validationFailed('NEGOTIATION_ISSUE_EXPORT_EMPTY');

    const generatedAt = new Date();
    const title = `${matterLabel} 협상쟁점표`;
    const body = buildNegotiationIssuesDocx({
      matterLabel,
      generatedAt,
      issues: issueList.issues,
    });
    const hash = createHash('sha256').update(body).digest('hex');
    const uploaded = await this.documentUpload.uploadBuffer({
      actorUserId: ctx.userId,
      matterId: input.matterId,
      originalFilename: `negotiation-issues-${input.matterId}-${generatedAt.getTime()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body,
      afterUploadAudit: async (client, document) => {
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'CONTRACT_NEGOTIATION_ISSUES_EXPORTED',
            targetType: 'document',
            targetId: document.documentId,
            matterId: input.matterId,
            metadata: {
              matter_id: input.matterId,
              document_id: document.documentId,
              file_object_id: document.fileObjectId,
              hash,
              export_format: input.exportFormat,
              issue_count: issueList.issues.length,
              item_count: issueList.issues.length,
              scope_type: 'negotiation_issue_export',
              scope_id: input.documentId ?? input.matterId,
            },
          },
          client,
        );
      },
      fields: {
        title,
        documentType: 'memo',
        subtype: 'negotiation_issue_export',
        confidentialityLevel: 'high',
        privilegeStatus: 'work_product',
        source: 'internal_work_product',
        aiAllowed: false,
        versionLabel: 'Negotiation issues export',
        versionSignificance: 'internal_draft',
        renditionType: 'clean',
      },
    });

    return ddNegotiationIssueExportResponseSchema.parse({
      matterId: input.matterId,
      sourceDocumentId: issueList.documentId,
      documentId: uploaded.documentId,
      fileObjectId: uploaded.fileObjectId,
      title: uploaded.title,
      exportFormat: input.exportFormat,
      negotiationIssueCount: issueList.issues.length,
      itemCount: issueList.issues.length,
    });
  }

  private async queryRfis(
    client: PoolClient,
    tenantId: string,
    input: DdRfiQueryDto,
  ): Promise<DdRfiDto[]> {
    const params: SearchSqlValue[] = [tenantId, input.matterId];
    const statusFilter = input.status ? `AND status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<DdRfiRow>(
      `
        SELECT
          rfi_id, matter_id, rfi_code, category, title, status, priority,
          owner_user_id, due_date,
          (due_date IS NOT NULL AND due_date < current_date
            AND status NOT IN ('complete', 'reported')) AS overdue,
          created_at, updated_at
        FROM dd_rfis
        WHERE tenant_id = $1
          AND matter_id = $2
          ${statusFilter}
        ORDER BY due_date NULLS LAST, rfi_code, created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseRfiRow);
  }

  private async queryRfiGaps(
    client: PoolClient,
    tenantId: string,
    input: DdRfiGapQueryDto,
  ): Promise<DdRfiDto[]> {
    const result = await client.query<DdRfiRow>(
      `
        SELECT
          r.rfi_id, r.matter_id, r.rfi_code, r.category, r.title, r.status, r.priority,
          r.owner_user_id, r.due_date,
          (r.due_date IS NOT NULL AND r.due_date < current_date
            AND r.status NOT IN ('complete', 'reported')) AS overdue,
          r.created_at, r.updated_at
        FROM dd_rfis r
        WHERE r.tenant_id = $1
          AND r.matter_id = $2
          AND r.status NOT IN ('complete', 'reported')
          AND NOT EXISTS (
            SELECT 1
            FROM dd_data_room_mappings drm
            WHERE drm.tenant_id = r.tenant_id
              AND drm.rfi_id = r.rfi_id
              AND drm.mapping_status IN ('mapped', 'suggested')
          )
        ORDER BY
          CASE r.priority
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END,
          r.due_date NULLS LAST,
          r.rfi_code,
          r.created_at DESC
        LIMIT $3
      `,
      [tenantId, input.matterId, input.limit],
    );
    return result.rows.map(parseRfiRow);
  }

  private async findRfiTemplate(
    client: PoolClient,
    tenantId: string,
    templateId: string,
  ): Promise<DdRfiTemplateRow | null> {
    const result = await client.query<DdRfiTemplateRow>(
      `
        SELECT template_id, items_json
        FROM dd_rfi_templates
        WHERE tenant_id = $1
          AND template_id = $2
        LIMIT 1
      `,
      [tenantId, templateId],
    );
    return result.rows[0] ?? null;
  }

  private async queryMappings(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: DdDataRoomMappingQueryDto,
  ): Promise<DdDataRoomMappingDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const tenantSql = `$${params.push(input.matterId)}`;
    const rfiFilter = input.rfiId ? `AND drm.rfi_id = $${params.push(input.rfiId)}::uuid` : '';
    const statusFilter = input.status
      ? `AND drm.mapping_status = $${params.push(input.status)}`
      : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<DdMappingRow>(
      `
        WITH idx AS (
          SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
            d.document_type, d.status AS document_status, dv.version_status, d.updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
            AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
        ),
        visible_docs AS (
          SELECT idx.document_id
          FROM idx
          ${filters.whereSql}
        )
        SELECT
          drm.mapping_id, drm.matter_id, drm.rfi_id, drm.document_id, drm.version_id,
          drm.internal_label, drm.section_path, drm.mapping_status,
          drm.supplement_requested_at, drm.created_at, drm.updated_at
        FROM dd_data_room_mappings drm
        LEFT JOIN visible_docs vd
          ON vd.document_id = drm.document_id
        WHERE drm.matter_id = ${tenantSql}::uuid
          AND (drm.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${rfiFilter}
          ${statusFilter}
        ORDER BY drm.created_at DESC, drm.mapping_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseMappingRow);
  }

  private async queryIssues(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: DdIssueQueryDto,
  ): Promise<DdIssueDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status ? `AND ddi.status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<DdIssueRow>(
      `
        WITH idx AS (
          SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
            d.document_type, d.status AS document_status, dv.version_status, d.updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
            AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
        ),
        visible_docs AS (
          SELECT idx.document_id
          FROM idx
          ${filters.whereSql}
        )
        SELECT
          ddi.issue_id, ddi.matter_id, ddi.rfi_id, ddi.document_id, ddi.issue_code,
          ddi.title, ddi.severity, ddi.status, ddi.citation_refs,
          ddi.report_inclusion, ddi.created_at, ddi.updated_at
        FROM dd_issues ddi
        LEFT JOIN visible_docs vd
          ON vd.document_id = ddi.document_id
        WHERE ddi.matter_id = ${matterSql}::uuid
          AND (ddi.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY ddi.created_at DESC, ddi.issue_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseIssueRow);
  }

  private async queryRisks(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: DdRiskQueryDto,
  ): Promise<DdRiskDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status ? `AND ddr.status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<DdRiskRow>(
      `
        WITH idx AS (
          SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
            d.document_type, d.status AS document_status, dv.version_status, d.updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
            AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
        ),
        visible_docs AS (
          SELECT idx.document_id
          FROM idx
          ${filters.whereSql}
        )
        SELECT
          ddr.risk_id, ddr.matter_id, ddr.issue_id, ddr.risk_code,
          ddr.category, ddr.severity, ddr.likelihood, ddr.status,
          ddr.citation_refs, ddr.created_at, ddr.updated_at
        FROM dd_risks ddr
        LEFT JOIN dd_issues ddi
          ON ddi.tenant_id = ddr.tenant_id
          AND ddi.issue_id = ddr.issue_id
        LEFT JOIN visible_docs vd
          ON vd.document_id = ddi.document_id
        WHERE ddr.matter_id = ${matterSql}::uuid
          AND (ddi.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY ddr.created_at DESC, ddr.risk_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseRiskRow);
  }

  private async findMatterLabel(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<string> {
    const result = await client.query<MatterLabelRow>(
      `
        SELECT matter_code, matter_name
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw validationFailed();
    return `${row.matter_code} ${row.matter_name}`.trim().slice(0, 180);
  }

  private async findRfi(
    client: PoolClient,
    tenantId: string,
    rfiId: string,
  ): Promise<{ matter_id: string; status: string } | null> {
    const result = await client.query<{ matter_id: string; status: string }>(
      `
        SELECT matter_id, status
        FROM dd_rfis
        WHERE tenant_id = $1
          AND rfi_id = $2
        LIMIT 1
      `,
      [tenantId, rfiId],
    );
    return result.rows[0] ?? null;
  }

  private async findDocumentVersion(
    client: PoolClient,
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<DocumentVersionRow | null> {
    const result = await client.query<DocumentVersionRow>(
      `
        SELECT d.matter_id, d.document_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
          AND (($3::uuid IS NULL AND dv.version_status = 'current') OR dv.version_id = $3::uuid)
        ORDER BY dv.created_at DESC
        LIMIT 1
      `,
      [tenantId, documentId, versionId ?? null],
    );
    return result.rows[0] ?? null;
  }

  private async assertRfiBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    rfiId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<MatterRefRow>(
      `
        SELECT matter_id
        FROM dd_rfis
        WHERE tenant_id = $1
          AND rfi_id = $2
        LIMIT 1
      `,
      [tenantId, rfiId],
    );
    if (result.rows[0]?.matter_id !== matterId) throw validationFailed();
  }

  private async assertIssueBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    issueId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<MatterRefRow>(
      `
        SELECT matter_id
        FROM dd_issues
        WHERE tenant_id = $1
          AND issue_id = $2
        LIMIT 1
      `,
      [tenantId, issueId],
    );
    if (result.rows[0]?.matter_id !== matterId) throw validationFailed();
  }

  private async findIssueForUpdate(
    client: PoolClient,
    tenantId: string,
    issueId: string,
  ): Promise<DdIssueRow | null> {
    const result = await client.query<DdIssueRow>(
      `
        SELECT
          issue_id, matter_id, rfi_id, document_id, issue_code, title, severity,
          status, citation_refs, report_inclusion, created_at, updated_at
        FROM dd_issues
        WHERE tenant_id = $1
          AND issue_id = $2
        FOR UPDATE
      `,
      [tenantId, issueId],
    );
    return result.rows[0] ?? null;
  }

  private async assertCanReadMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    const decision = await this.permissionService.canReadMatter(ctx, matterId);
    if (decision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async assertCanEditMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    const decision = await this.permissionService.canEditMatter(ctx, matterId);
    if (decision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async assertCanReadDocument(ctx: PermissionContext, documentId: string): Promise<void> {
    const decision = await this.documentPermission.canReadDocument(ctx, documentId);
    if (decision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async assertAiPrepDocumentProfileArtifact(
    client: QueryClient,
    tenantId: string,
    artifactId: string,
    matterId: string,
    documentId: string,
    versionId: string,
    sourceHash: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT ai_prep_artifact_id
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND ai_prep_artifact_id = $2
          AND matter_id = $3
          AND document_id = $4
          AND document_version_id = $5
          AND artifact_kind = 'document_profile'
          AND status = 'completed'
          AND is_stale = false
          AND response_hash = $6
        LIMIT 1
      `,
      [tenantId, artifactId, matterId, documentId, versionId, sourceHash],
    );
    if (!result.rows[0]) throw validationFailed();
  }

  private async authorizedScope(ctx: PermissionContext): Promise<{
    scope: SearchSqlFragment;
    appliedRules?: string[] | undefined;
  }> {
    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    if (scopeDecision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    return scopeDecision;
  }
}

function parseRfiRow(row: DdRfiRow | undefined): DdRfiDto {
  if (!row) throw new Error('DD RFI query returned no row');
  return ddRfiSchema.parse({
    rfiId: row.rfi_id,
    matterId: row.matter_id,
    rfiCode: row.rfi_code,
    category: row.category,
    title: row.title,
    status: row.status,
    priority: row.priority,
    ownerUserId: row.owner_user_id,
    dueDate: dateOnly(row.due_date),
    overdue: row.overdue,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseMappingRow(row: DdMappingRow | undefined): DdDataRoomMappingDto {
  if (!row) throw new Error('DD mapping query returned no row');
  return ddDataRoomMappingSchema.parse({
    mappingId: row.mapping_id,
    matterId: row.matter_id,
    rfiId: row.rfi_id,
    documentId: row.document_id,
    versionId: row.version_id,
    internalLabel: row.internal_label,
    sectionPath: row.section_path,
    mappingStatus: row.mapping_status,
    supplementRequestedAt: row.supplement_requested_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseIssueRow(row: DdIssueRow | undefined): DdIssueDto {
  if (!row) throw new Error('DD issue query returned no row');
  return ddIssueSchema.parse({
    issueId: row.issue_id,
    matterId: row.matter_id,
    rfiId: row.rfi_id,
    documentId: row.document_id,
    issueCode: row.issue_code,
    title: row.title,
    severity: row.severity,
    status: row.status,
    citationRefs: row.citation_refs,
    reportInclusion: row.report_inclusion,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseRiskRow(row: DdRiskRow | undefined): DdRiskDto {
  if (!row) throw new Error('DD risk query returned no row');
  return ddRiskSchema.parse({
    riskId: row.risk_id,
    matterId: row.matter_id,
    issueId: row.issue_id,
    riskCode: row.risk_code,
    category: row.category,
    severity: row.severity,
    likelihood: row.likelihood,
    status: row.status,
    citationRefs: row.citation_refs,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function statusAudit(before: string, after: string): StatusAudit {
  return before === after ? {} : { status_before: before, status_after: after };
}

function issueDiffKeys(current: DdIssueRow, input: UpdateDdIssueRequestDto): string[] {
  const keys: string[] = [];
  if (input.status !== undefined && input.status !== current.status) keys.push('status');
  if (
    input.citationRefs !== undefined &&
    !sameStringArray(input.citationRefs, current.citation_refs)
  ) {
    keys.push('citation_refs');
  }
  return keys;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseTemplateItems(value: unknown): DdRfiTemplateItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw validationFailed();
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) throw validationFailed();
    const row = item as Record<string, unknown>;
    const rfiCode = stringField(row.rfi_code);
    const category = stringField(row.category);
    const title = stringField(row.title);
    const description = nullableStringField(row.description);
    const priority = stringField(row.priority);
    return {
      rfi_code: rfiCode,
      category,
      title,
      description,
      priority,
    };
  });
}

function stringField(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw validationFailed();
  return value.trim();
}

function nullableStringField(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return stringField(value);
}

function buildRfiUpdate(input: UpdateDdRfiRequestDto, userId: string): {
  setSql: string;
  params: PgParam[];
  diffKeys: string[];
} {
  const params: PgParam[] = [];
  const sets: string[] = [];
  const diffKeys: string[] = [];
  const add = (column: string, value: PgParam, diffKey: string) => {
    params.push(value);
    sets.push(`${column} = $${params.length + 2}`);
    diffKeys.push(diffKey);
  };
  if (input.category !== undefined) add('category', input.category, 'category');
  if (input.title !== undefined) add('title', input.title, 'title');
  if (input.description !== undefined) add('description', input.description ?? null, 'description');
  if (input.status !== undefined) add('status', input.status, 'status');
  if (input.priority !== undefined) add('priority', input.priority, 'priority');
  if (input.ownerUserId !== undefined) add('owner_user_id', input.ownerUserId ?? null, 'owner_user_id');
  if (input.dueDate !== undefined) add('due_date', input.dueDate ?? null, 'due_date');
  params.push(userId);
  sets.push(`updated_by = $${params.length + 2}`);
  sets.push('updated_at = now()');
  return { setSql: sets.join(', '), params, diffKeys };
}

function buildTraceItems(
  rfis: readonly DdRfiDto[],
  mappings: readonly DdDataRoomMappingDto[],
  issues: readonly DdIssueDto[],
  risks: readonly DdRiskDto[],
): DdTraceabilityItemDto[] {
  const mappingByRfi = new Map<string, DdDataRoomMappingDto>();
  const mappingByDocument = new Map<string, DdDataRoomMappingDto>();
  for (const mapping of mappings) {
    if (mapping.rfiId && !mappingByRfi.has(mapping.rfiId)) mappingByRfi.set(mapping.rfiId, mapping);
    if (mapping.documentId && !mappingByDocument.has(mapping.documentId)) {
      mappingByDocument.set(mapping.documentId, mapping);
    }
  }
  const issueById = new Map(issues.map((issue) => [issue.issueId, issue]));
  const traces: DdTraceabilityItemDto[] = [];
  for (const rfi of rfis) {
    const mapping = mappingByRfi.get(rfi.rfiId);
    traces.push({
      rfiId: rfi.rfiId,
      mappingId: mapping?.mappingId ?? null,
      documentId: mapping?.documentId ?? null,
      issueId: null,
      riskId: null,
      statusRefs: [`rfi:${rfi.status}`, ...(mapping ? [`mapping:${mapping.mappingStatus}`] : [])],
      citationRefs: mapping?.documentId ? [`document:${mapping.documentId}`] : [],
    });
  }
  for (const issue of issues) {
    const mapping =
      (issue.rfiId ? mappingByRfi.get(issue.rfiId) : undefined) ??
      (issue.documentId ? mappingByDocument.get(issue.documentId) : undefined);
    traces.push({
      rfiId: issue.rfiId,
      mappingId: mapping?.mappingId ?? null,
      documentId: issue.documentId,
      issueId: issue.issueId,
      riskId: null,
      statusRefs: [`issue:${issue.status}`, `severity:${issue.severity}`],
      citationRefs: issue.citationRefs,
    });
  }
  for (const risk of risks) {
    const issue = risk.issueId ? issueById.get(risk.issueId) : undefined;
    const mapping =
      (issue?.rfiId ? mappingByRfi.get(issue.rfiId) : undefined) ??
      (issue?.documentId ? mappingByDocument.get(issue.documentId) : undefined);
    traces.push({
      rfiId: issue?.rfiId ?? null,
      mappingId: mapping?.mappingId ?? null,
      documentId: issue?.documentId ?? null,
      issueId: risk.issueId,
      riskId: risk.riskId,
      statusRefs: [`risk:${risk.status}`, `severity:${risk.severity}`],
      citationRefs: risk.citationRefs,
    });
  }
  return traces;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function compactRules(rules: readonly string[]): string[] {
  return rules
    .map((rule) => rule.replace(/[^a-zA-Z0-9._:-]/gu, '_').slice(0, 64))
    .filter((rule) => rule.length > 0)
    .slice(0, 12);
}
