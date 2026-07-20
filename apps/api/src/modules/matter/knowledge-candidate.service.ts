import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  KnowledgeCandidateDto,
  KnowledgeCandidateType,
  ReviewKnowledgeCandidateDto,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { WorkService } from '../work/work.service';

interface KnowledgeCandidateSourceRow {
  closing_binder_id: string;
  item_type: string;
  document_id: string;
  version_id: string;
  document_type: string;
  subtype: string | null;
  document_status: string;
  version_significance: string;
}

interface KnowledgeCandidateRow {
  candidate_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  candidate_type: KnowledgeCandidateType;
  status: 'proposed' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_reason: string | null;
  work_item_id: string | null;
  created_at: Date;
  updated_at: Date;
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

function candidateTypeFor(row: KnowledgeCandidateSourceRow): KnowledgeCandidateType {
  if (
    row.item_type === 'execution_copy' ||
    row.document_status === 'executed' ||
    row.version_significance === 'execution_copy'
  ) {
    return 'executed';
  }
  const subtype = row.subtype?.toLocaleLowerCase('ko-KR') ?? '';
  if (row.document_type === 'opinion' || subtype.includes('opinion') || subtype.includes('의견')) {
    return 'opinion';
  }
  return 'clause_source';
}

function toDto(row: KnowledgeCandidateRow): KnowledgeCandidateDto {
  return {
    candidateId: row.candidate_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    candidateType: row.candidate_type,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    reviewReason: row.review_reason,
    workItemId: row.work_item_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class KnowledgeCandidateService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(WorkService) private readonly workService: WorkService,
  ) {}

  async createForClosedMatter(
    client: QueryClient,
    input: {
      actorUserId: string;
      closingBinderId: string;
      matterId: string;
      tenantId: TenantId;
    },
  ): Promise<number> {
    const rows = await this.listCandidateSources(client, input);
    let createdCount = 0;
    for (const source of rows) {
      const inserted = await this.insertCandidate(client, input, source, candidateTypeFor(source));
      if (!inserted) continue;
      createdCount += 1;
      const proposedAudit = await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorId: input.actorUserId,
          action: 'KNOWLEDGE_CANDIDATE_PROPOSED',
          targetType: 'knowledge_candidate',
          targetId: inserted.candidate_id,
          matterId: inserted.matter_id,
          metadata: {
            knowledge_candidate_id: inserted.candidate_id,
            matter_id: inserted.matter_id,
            document_id: inserted.document_id,
            version_id: inserted.version_id,
            candidate_type: inserted.candidate_type,
            closing_binder_id: input.closingBinderId,
            status_after: 'proposed',
          },
        },
        client,
      );
      const work = await this.workService.openWorkflowWork(client, {
        tenantId: input.tenantId,
        kind: 'knowledge_candidate_review',
        targetId: inserted.candidate_id,
        matterId: inserted.matter_id,
        documentId: inserted.document_id,
        assignedToUserId: input.actorUserId,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        actorUserId: input.actorUserId,
        auditEventId: proposedAudit.eventId,
      });
      await client.query(
        `
          UPDATE knowledge_candidates
          SET work_item_id = $3,
            created_audit_event_id = $4,
            last_audit_event_id = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND candidate_id = $2
        `,
        [input.tenantId, inserted.candidate_id, work.workItemId, proposedAudit.eventId],
      );
    }
    return createdCount;
  }

  async reviewCandidate(
    actorUserId: string,
    candidateId: string,
    input: ReviewKnowledgeCandidateDto,
  ): Promise<KnowledgeCandidateDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const candidate = await this.findCandidateForUpdate(client, context.tenantId, candidateId);
      if (!candidate) throw notFoundDenied();
      if (candidate.status !== 'proposed') throw validationFailed('KNOWLEDGE_CANDIDATE_REVIEWED');
      await this.assertCanEditMatter(context.tenantId, actorUserId, candidate.matter_id);

      if (input.action === 'approve') {
        await this.addKnowledgeTags(client, {
          actorUserId,
          candidateType: candidate.candidate_type,
          documentId: candidate.document_id,
          matterId: candidate.matter_id,
          tenantId: context.tenantId,
        });
      }

      const status = input.action === 'approve' ? 'approved' : 'rejected';
      const audit = await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'KNOWLEDGE_CANDIDATE_REVIEWED',
          targetType: 'knowledge_candidate',
          targetId: candidate.candidate_id,
          matterId: candidate.matter_id,
          metadata: {
            knowledge_candidate_id: candidate.candidate_id,
            matter_id: candidate.matter_id,
            document_id: candidate.document_id,
            version_id: candidate.version_id,
            candidate_type: candidate.candidate_type,
            status_before: candidate.status,
            status_after: status,
            reason_code: `knowledge_candidate_${input.action}`,
            work_item_ref: candidate.work_item_id ?? candidate.candidate_id,
          },
        },
        client,
      );

      const updated = await this.updateReviewedCandidate(client, {
        actorUserId,
        auditEventId: audit.eventId,
        candidateId: candidate.candidate_id,
        reviewReason: input.reviewReason,
        status,
        tenantId: context.tenantId,
      });
      if (input.action === 'approve') {
        await this.workService.completeWorkflowWork(client, {
          tenantId: context.tenantId,
          kind: 'knowledge_candidate_review',
          targetId: candidate.candidate_id,
          actorUserId,
          auditEventId: audit.eventId,
        });
      } else {
        await this.workService.cancelWorkflowWork(client, {
          tenantId: context.tenantId,
          kind: 'knowledge_candidate_review',
          targetId: candidate.candidate_id,
          actorUserId,
          auditEventId: audit.eventId,
        });
      }
      return toDto(updated);
    });
  }

  private async listCandidateSources(
    client: QueryClient,
    input: {
      closingBinderId: string;
      matterId: string;
      tenantId: TenantId;
    },
  ): Promise<KnowledgeCandidateSourceRow[]> {
    const result = await client.query(
      `
        SELECT
          cb.closing_binder_id,
          item.value->>'itemType' AS item_type,
          (item.value->>'documentId')::uuid AS document_id,
          (item.value->>'versionId')::uuid AS version_id,
          d.document_type,
          d.subtype,
          d.status AS document_status,
          dv.version_significance
        FROM closing_binders cb
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(cb.manifest_json->'items') = 'array' THEN cb.manifest_json->'items'
            ELSE '[]'::jsonb
          END
        ) AS item(value)
        JOIN documents d
          ON d.tenant_id = cb.tenant_id
         AND d.matter_id = cb.matter_id
         AND d.document_id = (item.value->>'documentId')::uuid
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_id = (item.value->>'versionId')::uuid
        WHERE cb.tenant_id = $1
          AND cb.matter_id = $2
          AND cb.closing_binder_id = $3
          AND cb.status = 'finalized'
          AND item.value->>'documentId' IS NOT NULL
          AND item.value->>'versionId' IS NOT NULL
          AND item.value->>'itemType' IN ('execution_copy', 'final_version')
        ORDER BY item.value->>'itemType', d.document_id, dv.version_id
      `,
      [input.tenantId, input.matterId, input.closingBinderId],
    );
    return result.rows as KnowledgeCandidateSourceRow[];
  }

  private async insertCandidate(
    client: QueryClient,
    input: {
      actorUserId: string;
      closingBinderId: string;
      matterId: string;
      tenantId: TenantId;
    },
    source: KnowledgeCandidateSourceRow,
    candidateType: KnowledgeCandidateType,
  ): Promise<KnowledgeCandidateRow | null> {
    const result = await client.query(
      `
        INSERT INTO knowledge_candidates (
          tenant_id, matter_id, document_id, version_id, candidate_type,
          status, proposed_by, closing_binder_id
        )
        VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7)
        ON CONFLICT (tenant_id, matter_id, document_id, version_id, candidate_type) DO NOTHING
        RETURNING
          candidate_id, matter_id, document_id, version_id, candidate_type, status,
          reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
      `,
      [
        input.tenantId,
        input.matterId,
        source.document_id,
        source.version_id,
        candidateType,
        input.actorUserId,
        input.closingBinderId,
      ],
    );
    return (result.rows[0] as KnowledgeCandidateRow | undefined) ?? null;
  }

  private async findCandidateForUpdate(
    client: QueryClient,
    tenantId: TenantId,
    candidateId: string,
  ): Promise<KnowledgeCandidateRow | null> {
    const result = await client.query(
      `
        SELECT
          candidate_id, matter_id, document_id, version_id, candidate_type, status,
          reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
        FROM knowledge_candidates
        WHERE tenant_id = $1
          AND candidate_id = $2
        FOR UPDATE
      `,
      [tenantId, candidateId],
    );
    return (result.rows[0] as KnowledgeCandidateRow | undefined) ?? null;
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canEditMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect === 'ALLOW') return;
    if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private async addKnowledgeTags(
    client: QueryClient,
    input: {
      actorUserId: string;
      candidateType: KnowledgeCandidateType;
      documentId: string;
      matterId: string;
      tenantId: TenantId;
    },
  ): Promise<void> {
    const beforeResult = await client.query(
      `
        SELECT tag
        FROM document_tags
        WHERE tenant_id = $1
          AND document_id = $2
        ORDER BY tag ASC
      `,
      [input.tenantId, input.documentId],
    );
    const beforeTags = (beforeResult.rows as Array<{ tag: string }>).map((row) => row.tag);
    const nextTags = Array.from(
      new Set([...beforeTags, 'knowledge_bank', `knowledge_bank_${input.candidateType}`]),
    ).sort((left, right) => left.localeCompare(right));
    if (beforeTags.length === nextTags.length && beforeTags.every((tag, index) => tag === nextTags[index])) {
      return;
    }
    for (const tag of nextTags) {
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
      {
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        action: 'DOCUMENT_TAGS_CHANGED',
        targetType: 'document',
        targetId: input.documentId,
        matterId: input.matterId,
        metadata: {
          document_id: input.documentId,
          matter_id: input.matterId,
          before_ref: `document_tags_count:${beforeTags.length}`,
          after_ref: `document_tags_count:${nextTags.length}`,
          result_count: nextTags.length,
        },
      },
      client,
    );
  }

  private async updateReviewedCandidate(
    client: QueryClient,
    input: {
      actorUserId: string;
      auditEventId: string;
      candidateId: string;
      reviewReason: string;
      status: 'approved' | 'rejected';
      tenantId: TenantId;
    },
  ): Promise<KnowledgeCandidateRow> {
    const result = await client.query(
      `
        UPDATE knowledge_candidates
        SET status = $3,
          reviewed_by = $4,
          reviewed_at = now(),
          review_reason = $5,
          last_audit_event_id = $6,
          updated_at = now()
        WHERE tenant_id = $1
          AND candidate_id = $2
        RETURNING
          candidate_id, matter_id, document_id, version_id, candidate_type, status,
          reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
      `,
      [
        input.tenantId,
        input.candidateId,
        input.status,
        input.actorUserId,
        input.reviewReason,
        input.auditEventId,
      ],
    );
    const row = result.rows[0] as KnowledgeCandidateRow | undefined;
    if (!row) throw notFoundDenied();
    return row;
  }
}
