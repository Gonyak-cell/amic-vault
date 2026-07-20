import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  dmsWorkQueueResponseSchema,
  isUserRole,
  type DmsOperationalTone,
  type DmsWorkItemKind,
  type DmsWorkItemSource,
  type DmsWorkItemStatus,
  type DmsWorkflowWorkItemKind,
  type DmsWorkQueueAssigneeFilter,
  type DmsWorkQueueItemDto,
  type DmsWorkQueueQueryDto,
  type DmsWorkQueueResponseDto,
  type ReassignWorkItemDto,
  type UserRole,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  PermissionQueryBuilder,
  type PermissionQueryContext,
} from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';

const recordsAdminRoles = new Set<UserRole>(['firm_admin', 'security_admin']);

type RecordsDisposalKind = 'records_disposal_approval' | 'records_disposal_execution';
type DocumentOperationalKind =
  | 'document_extraction_failed'
  | 'document_ocr_pending'
  | 'document_metadata_required'
  | 'duplicate_decision_pending'
  | 'upload_exception';
type AiPrepOperationalKind = 'ai_candidate_review' | 'graph_fact_review';
type WorkflowTargetType =
  | 'contract_review'
  | 'dd_rfi'
  | 'dd_mapping'
  | 'external_qa'
  | 'litigation_key_date'
  | 'knowledge_candidate'
  | 'matter_wiki_page';
type WorkItemKind = DmsWorkItemKind | AiPrepOperationalKind;

const workflowKindTargetTypes: Record<DmsWorkflowWorkItemKind, WorkflowTargetType> = {
  contract_review_stage: 'contract_review',
  dd_rfi_due: 'dd_rfi',
  dd_mapping_review: 'dd_mapping',
  external_qa_approval: 'external_qa',
  litigation_deadline: 'litigation_key_date',
  knowledge_candidate_review: 'knowledge_candidate',
  wiki_page_review: 'matter_wiki_page',
};

const defaultWorkQueueQuery = {
  assignee: 'all',
  limit: 20,
  offset: 0,
} as const satisfies DmsWorkQueueQueryDto;

export interface OpenRecordsDisposalWorkInput {
  tenantId: string;
  disposalRequestId: string;
  matterId: string;
  documentId: string;
  actorUserId: string;
  auditEventId: string;
  kind: RecordsDisposalKind;
}

export interface CompleteRecordsDisposalWorkInput {
  tenantId: string;
  disposalRequestId: string;
  actorUserId: string;
  auditEventId: string;
  kind: RecordsDisposalKind;
}

export interface OpenWorkflowWorkInput {
  tenantId: string;
  kind: DmsWorkflowWorkItemKind;
  targetId: string;
  matterId: string;
  documentId?: string | null;
  assignedToUserId: string;
  dueAt: Date;
  actorUserId: string;
  auditEventId: string;
}

export interface OpenAiCandidateReviewWorkInput {
  tenantId: string;
  artifactId: string;
  matterId: string;
  documentId: string;
  actorUserId: string;
  auditEventId: string;
  dueAt?: Date | undefined;
}

export interface CompleteWorkflowWorkInput {
  tenantId: string;
  kind: DmsWorkflowWorkItemKind;
  targetId: string;
  actorUserId: string;
  auditEventId: string;
}

export interface CancelWorkflowWorkInput {
  tenantId: string;
  kind: DmsWorkflowWorkItemKind;
  targetId: string;
  actorUserId: string;
  auditEventId: string;
}

export interface WorkItemRef {
  workItemId: string;
  dueAt: Date;
}

interface ActorRow {
  role: string;
  status: string;
}

interface WorkItemRow {
  work_item_id: string;
  target_id: string;
  source: DmsWorkItemSource;
  kind: WorkItemKind;
  status: DmsWorkItemStatus;
  due_at: Date;
  updated_at: Date;
  assigned_to_user_id: string | null;
  assignee_name: string | null;
  matter_label: string | null;
  disposal_status: string | null;
  reason_code: string | null;
  document_title: string | null;
  document_status: string | null;
  document_type: string | null;
  extraction_status: string | null;
  ai_prep_artifact_kind: string | null;
  graph_claim_text: string | null;
  total_count?: string | number;
}

interface WorkItemUpdateRow {
  work_item_id: string;
  kind: WorkItemKind;
  matter_id: string;
  assigned_to_user_id: string;
  assignee_name: string | null;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function iso(value: Date): string {
  return value.toISOString();
}

function stableKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function safeMatterLabel(value: string | null): string {
  return value?.trim() || '사건 정보 없음';
}

function safeDocumentLabel(value: string | null): string {
  return value?.trim() || '문서 정보 없음';
}

function safeClaimLabel(value: string | null): string {
  const trimmed = value?.trim() || 'AI Fact 후보';
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function statusLabel(status: DmsWorkItemStatus): string {
  const labels: Record<DmsWorkItemStatus, string> = {
    open: '대기',
    in_progress: '진행 중',
    completed: '완료',
    cancelled: '취소',
  };
  return labels[status];
}

function titleForKind(kind: RecordsDisposalKind): string {
  return kind === 'records_disposal_execution' ? '삭제 실행 대기' : '삭제 승인 요청';
}

function descriptionForRow(row: WorkItemRow): string {
  return `${safeMatterLabel(row.matter_label)} · ${statusLabel(row.status)} · ${
    row.reason_code ?? '기록 보존'
  }`;
}

function toneForRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  if (row.due_at.getTime() - now.getTime() <= 48 * 60 * 60 * 1000) return 'warning';
  return row.kind === 'records_disposal_execution' ? 'warning' : 'neutral';
}

function isRecordsDisposalKind(kind: WorkItemKind): kind is RecordsDisposalKind {
  return kind === 'records_disposal_approval' || kind === 'records_disposal_execution';
}

function isWorkflowKind(kind: WorkItemKind): kind is DmsWorkflowWorkItemKind {
  return kind in workflowKindTargetTypes;
}

function isAiPrepOperationalKind(kind: WorkItemKind): kind is AiPrepOperationalKind {
  return kind === 'ai_candidate_review' || kind === 'graph_fact_review';
}

function titleForDocumentKind(kind: DocumentOperationalKind): string {
  const labels: Record<DocumentOperationalKind, string> = {
    document_extraction_failed: '추출 실패 확인',
    document_ocr_pending: 'OCR 처리 대기',
    document_metadata_required: '메타데이터 보완 필요',
    duplicate_decision_pending: '중복 결정 대기',
    upload_exception: '업로드 예외 확인',
  };
  return labels[kind];
}

function descriptionForDocumentRow(row: WorkItemRow): string {
  const detail =
    row.kind === 'document_extraction_failed'
      ? '추출 실패'
      : row.kind === 'document_ocr_pending'
        ? 'OCR 필요'
        : row.kind === 'document_metadata_required'
          ? '문서 유형 또는 세부 분류 보완'
          : '문서 작업 확인';
  return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(row.document_title)} · ${detail}`;
}

function hrefForDocumentKind(kind: DocumentOperationalKind): string {
  if (kind === 'document_extraction_failed') return '/files?extractionStatus=failed';
  if (kind === 'document_ocr_pending') return '/files?extractionStatus=ocr_pending';
  if (kind === 'document_metadata_required') return '/files?status=draft';
  return '/files?sortBy=updated_desc';
}

function toneForDocumentRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.kind === 'document_extraction_failed') return 'blocked';
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  return 'warning';
}

function titleForAiPrepRow(row: WorkItemRow): string {
  if (row.kind === 'ai_candidate_review' && row.ai_prep_artifact_kind === 'minutes_qc') {
    return '회의록 정합성 QC';
  }
  return titleForAiPrepKind(row.kind as AiPrepOperationalKind);
}

function titleForAiPrepKind(kind: AiPrepOperationalKind): string {
  return kind === 'graph_fact_review' ? 'AI Fact 후보 확인' : 'AI 후보 검토';
}

function descriptionForAiPrepRow(row: WorkItemRow): string {
  if (row.kind === 'ai_candidate_review' && row.ai_prep_artifact_kind === 'minutes_qc') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(row.document_title)} · 회의록 불일치 검토`;
  }
  if (row.kind === 'graph_fact_review') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(
      row.document_title,
    )} · ${safeClaimLabel(row.graph_claim_text)}`;
  }
  return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(row.document_title)} · 청크 인용 후보`;
}

function hrefForAiPrepKind(kind: AiPrepOperationalKind): string {
  return `/work?kind=${encodeURIComponent(kind)}`;
}

function toneForAiPrepRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  return 'warning';
}

function titleForWorkflowKind(kind: DmsWorkflowWorkItemKind): string {
  if (kind === 'contract_review_stage') return '계약 검토 단계 확인';
  if (kind === 'dd_rfi_due') return 'DD RFI 기한 확인';
  if (kind === 'dd_mapping_review') return 'DD 매핑 검토';
  if (kind === 'external_qa_approval') return '외부 Q&A 승인';
  if (kind === 'knowledge_candidate_review') return '지식은행 후보 검토';
  if (kind === 'wiki_page_review') return '위키 페이지 검토';
  return '송무 기한 확인';
}

function descriptionForWorkflowRow(row: WorkItemRow): string {
  if (row.kind === 'knowledge_candidate_review' || row.kind === 'wiki_page_review') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(row.document_title)} · ${statusLabel(
      row.status,
    )}`;
  }
  return `${safeMatterLabel(row.matter_label)} · ${row.assignee_name ?? '담당자 미지정'} · ${statusLabel(
    row.status,
  )}`;
}

function hrefForWorkflowKind(kind: DmsWorkflowWorkItemKind): string {
  return `/work?kind=${encodeURIComponent(kind)}`;
}

function toneForWorkflowRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  if (row.due_at.getTime() - now.getTime() <= 24 * 60 * 60 * 1000) return 'warning';
  return 'neutral';
}

function digestFromItemKey(itemKey: string): string {
  const match =
    /^(?:records-disposal|document-work|workflow-work|ai-prep-work)-([0-9a-f]{12})$/u.exec(itemKey);
  const digest = match?.[1];
  if (!digest) throw validationFailed();
  return digest;
}

@Injectable()
export class WorkService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(PermissionQueryBuilder) private readonly permissionQuery: PermissionQueryBuilder,
  ) {}

  async listWorkItems(
    actorUserId: string,
    queryOrNow: DmsWorkQueueQueryDto | Date = defaultWorkQueueQuery,
    nowArg = new Date(),
  ): Promise<DmsWorkQueueResponseDto> {
    const query = queryOrNow instanceof Date ? defaultWorkQueueQuery : queryOrNow;
    const now = queryOrNow instanceof Date ? queryOrNow : nowArg;
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      await this.refreshDocumentOperationalWorkItems(client, actor);
      const { rows, total } = await this.listWorkItemRows(client, actor, query);
      return dmsWorkQueueResponseSchema.parse({
        generatedAt: now.toISOString(),
        source: 'persisted_work_items',
        items: rows.map((row) => this.mapRecordsDisposalItem(row, now)),
        page: {
          limit: query.limit,
          offset: query.offset,
          total,
          hasNext: query.offset + query.limit < total,
        },
      });
    });
  }

  async openRecordsDisposalWork(
    client: QueryClient,
    input: OpenRecordsDisposalWorkInput,
  ): Promise<WorkItemRef> {
    const result = await client.query(
      `
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, due_at, created_by, created_audit_event_id,
          last_audit_event_id
        )
        VALUES (
          $1, 'records', $2, 'disposal_request', $3, $4, $5,
          'open', 'records_admin', now() + interval '7 days', $6, $7, $7
        )
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
        RETURNING work_item_id, due_at
      `,
      [
        input.tenantId,
        input.kind,
        input.disposalRequestId,
        input.matterId,
        input.documentId,
        input.actorUserId,
        input.auditEventId,
      ],
    );
    const row = result.rows[0] as { work_item_id: string; due_at: Date } | undefined;
    if (!row) throw new Error('work item insert returned no row');
    return { workItemId: row.work_item_id, dueAt: row.due_at };
  }

  async completeRecordsDisposalWork(
    client: QueryClient,
    input: CompleteRecordsDisposalWorkInput,
  ): Promise<void> {
    await client.query(
      `
        UPDATE work_items
        SET status = 'completed',
          completed_by = $4,
          completed_at = now(),
          last_audit_event_id = $5,
          updated_at = now()
        WHERE tenant_id = $1
          AND source = 'records'
          AND kind = $2
          AND target_type = 'disposal_request'
          AND target_id = $3
          AND status IN ('open', 'in_progress')
      `,
      [input.tenantId, input.kind, input.disposalRequestId, input.actorUserId, input.auditEventId],
    );
  }

  async openWorkflowWork(client: QueryClient, input: OpenWorkflowWorkInput): Promise<WorkItemRef> {
    const targetType = workflowKindTargetTypes[input.kind];
    const result = await client.query(
      `
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, assigned_to_user_id, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, 'operational_data', $2, $3, $4, $5, $6,
          'open', 'user', $7, $8, $9, $10, $10
        )
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          assignment_scope = 'user',
          assigned_to_user_id = EXCLUDED.assigned_to_user_id,
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
        RETURNING work_item_id, due_at
      `,
      [
        input.tenantId,
        input.kind,
        targetType,
        input.targetId,
        input.matterId,
        input.documentId ?? null,
        input.assignedToUserId,
        input.dueAt,
        input.actorUserId,
        input.auditEventId,
      ],
    );
    const row = result.rows[0] as { work_item_id: string; due_at: Date } | undefined;
    if (!row) throw new Error('workflow work item insert returned no row');
    return { workItemId: row.work_item_id, dueAt: row.due_at };
  }

  async openAiCandidateReviewWork(
    client: QueryClient,
    input: OpenAiCandidateReviewWorkInput,
  ): Promise<WorkItemRef> {
    const dueAt = input.dueAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const result = await client.query(
      `
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, assigned_to_user_id, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, 'ai_prep', 'ai_candidate_review', 'ai_prep_artifact', $2, $3, $4,
          'open', 'user', $5, $6, $5, $7, $7
        )
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          assignment_scope = 'user',
          assigned_to_user_id = EXCLUDED.assigned_to_user_id,
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
        RETURNING work_item_id, due_at
      `,
      [
        input.tenantId,
        input.artifactId,
        input.matterId,
        input.documentId,
        input.actorUserId,
        dueAt,
        input.auditEventId,
      ],
    );
    const row = result.rows[0] as { work_item_id: string; due_at: Date } | undefined;
    if (!row) throw new Error('ai candidate review work item insert returned no row');
    return { workItemId: row.work_item_id, dueAt: row.due_at };
  }

  async completeWorkflowWork(client: QueryClient, input: CompleteWorkflowWorkInput): Promise<void> {
    const targetType = workflowKindTargetTypes[input.kind];
    await client.query(
      `
        UPDATE work_items
        SET status = 'completed',
          completed_by = $5,
          completed_at = now(),
          last_audit_event_id = $6,
          updated_at = now()
        WHERE tenant_id = $1
          AND source = 'operational_data'
          AND kind = $2
          AND target_type = $3
          AND target_id = $4
          AND status IN ('open', 'in_progress')
      `,
      [
        input.tenantId,
        input.kind,
        targetType,
        input.targetId,
        input.actorUserId,
        input.auditEventId,
      ],
    );
  }

  async cancelWorkflowWork(client: QueryClient, input: CancelWorkflowWorkInput): Promise<void> {
    const targetType = workflowKindTargetTypes[input.kind];
    await client.query(
      `
        UPDATE work_items
        SET status = 'cancelled',
          completed_by = $5,
          completed_at = now(),
          last_audit_event_id = $6,
          updated_at = now()
        WHERE tenant_id = $1
          AND source = 'operational_data'
          AND kind = $2
          AND target_type = $3
          AND target_id = $4
          AND status IN ('open', 'in_progress')
      `,
      [
        input.tenantId,
        input.kind,
        targetType,
        input.targetId,
        input.actorUserId,
        input.auditEventId,
      ],
    );
  }

  async reassignWorkItem(
    actorUserId: string,
    itemKey: string,
    input: ReassignWorkItemDto,
  ): Promise<{ itemKey: string; assignedToUserId: string; assignedToLabel: string | null }> {
    const digest = digestFromItemKey(itemKey);
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      const target = await this.findReassignTarget(client, actor, digest, input.assignedToUserId);
      if (!target) throw permissionDenied();
      const audit = await this.auditService.log(
        {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: 'WORK_ITEM_REASSIGNED',
          targetType: 'work_item',
          targetId: target.work_item_id,
          matterId: target.matter_id,
          metadata: {
            work_item_ref: itemKey,
            work_kind: target.kind,
            target_user_id: target.assigned_to_user_id,
            assignee_scope: 'user',
            matter_id: target.matter_id,
          },
        },
        client,
      );
      await client.query(
        `
          UPDATE work_items
          SET assignment_scope = 'user',
            assigned_to_user_id = $3,
            last_audit_event_id = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND work_item_id = $2
            AND status IN ('open', 'in_progress')
        `,
        [actor.tenantId, target.work_item_id, target.assigned_to_user_id, audit.eventId],
      );
      return {
        itemKey,
        assignedToUserId: target.assigned_to_user_id,
        assignedToLabel: target.assignee_name,
      };
    });
  }

  private async findActor(
    client: QueryClient,
    tenantId: string,
    userId: string,
  ): Promise<PermissionQueryContext | null> {
    const result = await client.query(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [tenantId, userId],
    );
    const row = result.rows[0] as ActorRow | undefined;
    if (!row || row.status !== 'active' || !isUserRole(row.role)) return null;
    return { tenantId, userId, role: row.role };
  }

  private async refreshDocumentOperationalWorkItems(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canRefreshAllVisible = recordsAdminRoles.has(actor.role);
    await client.query(
      `
        WITH document_candidates AS (
          SELECT
            d.tenant_id,
            d.matter_id,
            d.document_id,
            d.created_by,
            latest_audit.event_id,
            CASE
              WHEN cd.extraction_status = 'failed' THEN 'document_extraction_failed'
              WHEN cd.extraction_status = 'ocr_pending' THEN 'document_ocr_pending'
              WHEN d.status = 'draft' AND (d.document_type = 'other' OR d.subtype IS NULL)
                THEN 'document_metadata_required'
              ELSE NULL
            END AS kind,
            CASE
              WHEN cd.extraction_status = 'failed' THEN coalesce(cd.updated_at, d.updated_at) + interval '1 day'
              WHEN cd.extraction_status = 'ocr_pending' THEN coalesce(cd.updated_at, d.updated_at) + interval '3 days'
              WHEN d.status = 'draft' AND (d.document_type = 'other' OR d.subtype IS NULL)
                THEN d.updated_at + interval '2 days'
              ELSE d.updated_at + interval '2 days'
            END AS due_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          LEFT JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          LEFT JOIN canonical_documents cd
            ON cd.tenant_id = dv.tenant_id
           AND cd.version_id = dv.version_id
          JOIN LATERAL (
            SELECT ae.event_id
            FROM audit_events ae
            WHERE ae.tenant_id = d.tenant_id
              AND ae.target_type = 'document'
              AND ae.target_id = d.document_id
              AND ae.action IN (
                'DOCUMENT_UPLOADED',
                'DOCUMENT_VERSION_ADDED',
                'DOCUMENT_METADATA_CHANGED',
                'DOCUMENT_TEXT_EXTRACTED'
              )
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) latest_audit ON TRUE
          WHERE d.tenant_id = $1
            AND d.status <> 'deleted'
            AND ($3::boolean OR d.created_by = $2::uuid)
            AND (${matterFilter.sql})
        ),
        actionable AS (
          SELECT *
          FROM document_candidates
          WHERE kind IS NOT NULL
        )
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, assigned_to_user_id, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id, 'operational_data', kind, 'document', document_id, matter_id, document_id,
          'open', 'user', created_by, due_at, created_by, event_id, event_id
        FROM actionable
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          assigned_to_user_id = EXCLUDED.assigned_to_user_id,
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
      `,
      [actor.tenantId, actor.userId, canRefreshAllVisible, ...matterFilter.params],
    );

    await client.query(
      `
        UPDATE work_items wi
        SET status = 'cancelled',
          completed_by = wi.created_by,
          completed_at = now(),
          updated_at = now()
        WHERE wi.tenant_id = $1
          AND wi.source = 'operational_data'
          AND wi.target_type = 'document'
          AND wi.kind IN (
            'document_extraction_failed',
            'document_ocr_pending',
            'document_metadata_required'
          )
          AND wi.status IN ('open', 'in_progress')
          AND NOT EXISTS (
            SELECT 1
            FROM documents d
            LEFT JOIN document_versions dv
              ON dv.tenant_id = d.tenant_id
             AND dv.document_id = d.document_id
             AND dv.version_status = 'current'
            LEFT JOIN canonical_documents cd
              ON cd.tenant_id = dv.tenant_id
             AND cd.version_id = dv.version_id
            WHERE d.tenant_id = wi.tenant_id
              AND d.document_id = wi.target_id
              AND d.status <> 'deleted'
              AND (
                (wi.kind = 'document_extraction_failed' AND cd.extraction_status = 'failed')
                OR (wi.kind = 'document_ocr_pending' AND cd.extraction_status = 'ocr_pending')
                OR (
                  wi.kind = 'document_metadata_required'
                  AND d.status = 'draft'
                  AND (d.document_type = 'other' OR d.subtype IS NULL)
                )
              )
          )
      `,
      [actor.tenantId],
    );
  }

  private async listWorkItemRows(
    client: QueryClient,
    actor: PermissionQueryContext,
    query: DmsWorkQueueQueryDto,
  ): Promise<{ rows: WorkItemRow[]; total: number }> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canViewRecordsAdmin = recordsAdminRoles.has(actor.role);
    const kindParam = 4 + matterFilter.params.length;
    const assigneeParam = kindParam + 1;
    const limitParam = kindParam + 2;
    const offsetParam = kindParam + 3;
    const assigneeFilter: DmsWorkQueueAssigneeFilter = query.assignee;
    const result = await client.query(
      `
        SELECT
          wi.work_item_id,
          wi.target_id,
          wi.source,
          wi.kind,
          wi.status,
          wi.due_at,
          wi.updated_at,
          wi.assigned_to_user_id,
          assignee.name AS assignee_name,
          nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
          dr.status AS disposal_status,
          dr.reason_code,
          d.title AS document_title,
          d.status AS document_status,
          d.document_type,
          cd.extraction_status,
          apa.artifact_kind AS ai_prep_artifact_kind,
          ac.claim_text AS graph_claim_text,
          count(*) OVER() AS total_count
        FROM work_items wi
        JOIN matters m
          ON m.tenant_id = wi.tenant_id
         AND m.matter_id = wi.matter_id
        LEFT JOIN users assignee
          ON assignee.tenant_id = wi.tenant_id
         AND assignee.user_id = wi.assigned_to_user_id
        LEFT JOIN disposal_requests dr
          ON wi.target_type = 'disposal_request'
         AND dr.tenant_id = wi.tenant_id
         AND dr.disposal_request_id = wi.target_id
        LEFT JOIN documents d
          ON d.tenant_id = wi.tenant_id
         AND (
           (wi.target_type = 'document' AND d.document_id = wi.target_id)
           OR (wi.target_type <> 'document' AND d.document_id = wi.document_id)
         )
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
         AND cd.version_id = dv.version_id
        LEFT JOIN ai_prep_artifacts apa
          ON wi.target_type = 'ai_prep_artifact'
         AND apa.tenant_id = wi.tenant_id
         AND apa.ai_prep_artifact_id = wi.target_id
        LEFT JOIN graph_nodes gn
          ON wi.target_type = 'graph_node'
         AND gn.tenant_id = wi.tenant_id
         AND gn.node_id = wi.target_id
        LEFT JOIN ai_claims ac
          ON gn.source_table = 'ai_claims'
         AND ac.tenant_id = gn.tenant_id
         AND ac.claim_id = gn.source_id
        WHERE wi.tenant_id = $1
          AND wi.source IN ('records', 'operational_data', 'ai_prep')
          AND wi.status IN ('open', 'in_progress')
          AND (
            (wi.assignment_scope = 'records_admin' AND $3::boolean)
            OR (
              wi.assignment_scope = 'user'
              AND (wi.assigned_to_user_id = $2::uuid OR $3::boolean)
            )
          )
          AND (
            (wi.target_type = 'disposal_request' AND dr.disposal_request_id IS NOT NULL)
            OR (wi.target_type = 'document' AND d.document_id IS NOT NULL)
            OR wi.target_type IN (
              'document_version',
              'upload_preflight',
              'contract_review',
              'dd_rfi',
              'dd_mapping',
              'external_qa',
              'litigation_key_date',
              'knowledge_candidate',
              'matter_wiki_page'
            )
            OR (wi.target_type = 'ai_prep_artifact' AND apa.ai_prep_artifact_id IS NOT NULL)
            OR (wi.target_type = 'graph_node' AND gn.node_id IS NOT NULL)
          )
          AND ($${kindParam}::text IS NULL OR wi.kind = $${kindParam}::text)
          AND (
            $${assigneeParam}::text = 'all'
            OR ($${assigneeParam}::text = 'mine' AND wi.assigned_to_user_id = $2::uuid)
            OR ($${assigneeParam}::text = 'unassigned' AND wi.assigned_to_user_id IS NULL)
          )
          AND (${matterFilter.sql})
        ORDER BY
          CASE WHEN wi.source = 'records' THEN 0 ELSE 1 END,
          wi.due_at ASC,
          wi.updated_at DESC,
          wi.work_item_id
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      `,
      [
        actor.tenantId,
        actor.userId,
        canViewRecordsAdmin,
        ...matterFilter.params,
        query.kind ?? null,
        assigneeFilter,
        query.limit,
        query.offset,
      ],
    );
    const rows = result.rows as WorkItemRow[];
    const total = Number(rows[0]?.total_count ?? 0);
    return { rows, total: Number.isFinite(total) ? total : 0 };
  }

  private async findReassignTarget(
    client: QueryClient,
    actor: PermissionQueryContext,
    digest: string,
    assignedToUserId: string,
  ): Promise<WorkItemUpdateRow | null> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canViewRecordsAdmin = recordsAdminRoles.has(actor.role);
    const digestParam = 4 + matterFilter.params.length;
    const assignedParam = digestParam + 1;
    const result = await client.query(
      `
        WITH visible AS (
          SELECT wi.work_item_id, wi.kind, wi.matter_id
          FROM work_items wi
          JOIN matters m
            ON m.tenant_id = wi.tenant_id
           AND m.matter_id = wi.matter_id
          LEFT JOIN disposal_requests dr
            ON wi.target_type = 'disposal_request'
           AND dr.tenant_id = wi.tenant_id
           AND dr.disposal_request_id = wi.target_id
          LEFT JOIN documents d
            ON d.tenant_id = wi.tenant_id
           AND (
             (wi.target_type = 'document' AND d.document_id = wi.target_id)
             OR (wi.target_type <> 'document' AND d.document_id = wi.document_id)
           )
          LEFT JOIN ai_prep_artifacts apa
            ON wi.target_type = 'ai_prep_artifact'
           AND apa.tenant_id = wi.tenant_id
           AND apa.ai_prep_artifact_id = wi.target_id
          LEFT JOIN graph_nodes gn
            ON wi.target_type = 'graph_node'
           AND gn.tenant_id = wi.tenant_id
           AND gn.node_id = wi.target_id
          WHERE wi.tenant_id = $1
            AND wi.source IN ('records', 'operational_data', 'ai_prep')
            AND wi.status IN ('open', 'in_progress')
            AND substring(encode(digest(wi.work_item_id::text, 'sha256'), 'hex') from 1 for 12) = $${digestParam}
            AND (
              (wi.assignment_scope = 'records_admin' AND $3::boolean)
              OR (
                wi.assignment_scope = 'user'
                AND (wi.assigned_to_user_id = $2::uuid OR $3::boolean)
              )
            )
            AND (
              (wi.target_type = 'disposal_request' AND dr.disposal_request_id IS NOT NULL)
              OR (wi.target_type = 'document' AND d.document_id IS NOT NULL)
              OR wi.target_type IN (
                'document_version',
                'upload_preflight',
                'contract_review',
                'dd_rfi',
                'dd_mapping',
                'external_qa',
                'litigation_key_date',
                'knowledge_candidate',
                'matter_wiki_page'
              )
              OR (wi.target_type = 'ai_prep_artifact' AND apa.ai_prep_artifact_id IS NOT NULL)
              OR (wi.target_type = 'graph_node' AND gn.node_id IS NOT NULL)
            )
            AND (${matterFilter.sql})
          LIMIT 1
        ),
        assignee AS (
          SELECT u.user_id, u.name
          FROM visible v
          JOIN users u
            ON u.tenant_id = $1
           AND u.user_id = $${assignedParam}::uuid
           AND u.status = 'active'
          JOIN matter_members mm
            ON mm.tenant_id = u.tenant_id
           AND mm.matter_id = v.matter_id
           AND mm.user_id = u.user_id
          LIMIT 1
        )
        SELECT
          visible.work_item_id,
          visible.kind,
          visible.matter_id,
          assignee.user_id AS assigned_to_user_id,
          assignee.name AS assignee_name
        FROM visible
        JOIN assignee ON TRUE
      `,
      [
        actor.tenantId,
        actor.userId,
        canViewRecordsAdmin,
        ...matterFilter.params,
        digest,
        assignedToUserId,
      ],
    );
    return (result.rows[0] as WorkItemUpdateRow | undefined) ?? null;
  }

  private mapRecordsDisposalItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
    if (isWorkflowKind(row.kind)) return this.mapWorkflowItem(row, now);
    if (isAiPrepOperationalKind(row.kind)) return this.mapAiPrepItem(row, now);
    if (!isRecordsDisposalKind(row.kind)) return this.mapDocumentOperationalItem(row, now);
    return {
      itemKey: `records-disposal-${stableKey(row.work_item_id)}`,
      source: 'records',
      kind: row.kind,
      sourceLabel: '기록 보존',
      title: titleForKind(row.kind),
      description: descriptionForRow(row),
      href: '/records?tab=disposal',
      tone: toneForRow(row, now),
      status: row.status,
      statusLabel: statusLabel(row.status),
      dueAt: iso(row.due_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapDocumentOperationalItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
    const kind = row.kind as DocumentOperationalKind;
    return {
      itemKey: `document-work-${stableKey(row.work_item_id)}`,
      source: 'operational_data',
      kind,
      sourceLabel: '문서 운영',
      title: titleForDocumentKind(kind),
      description: descriptionForDocumentRow(row),
      href: hrefForDocumentKind(kind),
      tone: toneForDocumentRow(row, now),
      status: row.status,
      statusLabel: statusLabel(row.status),
      ...(row.assignee_name ? { assignedToLabel: row.assignee_name } : {}),
      dueAt: iso(row.due_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapAiPrepItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
    if (!isAiPrepOperationalKind(row.kind)) {
      throw new Error('non-ai-prep kind passed to AI prep mapper');
    }
    const kind = row.kind;
    return {
      itemKey:
        kind === 'graph_fact_review'
          ? `graph-fact-review-${stableKey(row.work_item_id)}`
          : `ai-prep-work-${stableKey(row.work_item_id)}`,
      ...(kind === 'graph_fact_review' ? { targetId: row.target_id } : {}),
      source: 'ai_prep',
      kind,
      sourceLabel: 'AI 준비',
      title: titleForAiPrepRow(row),
      description: descriptionForAiPrepRow(row),
      href: hrefForAiPrepKind(kind),
      tone: toneForAiPrepRow(row, now),
      status: row.status,
      statusLabel: statusLabel(row.status),
      ...(row.assignee_name ? { assignedToLabel: row.assignee_name } : {}),
      dueAt: iso(row.due_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapWorkflowItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
    if (!isWorkflowKind(row.kind)) throw new Error('non-workflow kind passed to workflow mapper');
    const kind = row.kind;
    return {
      itemKey: `workflow-work-${stableKey(row.work_item_id)}`,
      ...(kind === 'knowledge_candidate_review' || kind === 'wiki_page_review'
        ? { targetId: row.target_id }
        : {}),
      source: 'operational_data',
      kind,
      sourceLabel: '워크플로',
      title: titleForWorkflowKind(kind),
      description: descriptionForWorkflowRow(row),
      href: hrefForWorkflowKind(kind),
      tone: toneForWorkflowRow(row, now),
      status: row.status,
      statusLabel: statusLabel(row.status),
      ...(row.assignee_name ? { assignedToLabel: row.assignee_name } : {}),
      dueAt: iso(row.due_at),
      updatedAt: iso(row.updated_at),
    };
  }
}
