import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import {
  litigationCaseMapResponseSchema,
  litigationEvidenceListResponseSchema,
  litigationEvidenceNextCodeResponseSchema,
  litigationEvidenceSchema,
  litigationFactCitationRequiredReason,
  litigationFactListResponseSchema,
  litigationFactSchema,
  litigationHearingListResponseSchema,
  litigationHearingSchema,
  litigationIssueListResponseSchema,
  litigationIssueSchema,
  litigationPleadingListResponseSchema,
  litigationPleadingSchema,
  type CreateLitigationHearingRequestDto,
  type CreateLitigationEvidenceRequestDto,
  type CreateLitigationFactRequestDto,
  type CreateLitigationIssueRequestDto,
  type CreateLitigationPleadingRequestDto,
  type LitigationCaseMapItemDto,
  type LitigationCaseMapQueryDto,
  type LitigationCaseMapResponseDto,
  type LitigationEvidenceDto,
  type LitigationEvidenceDirection,
  type LitigationEvidenceListResponseDto,
  type LitigationEvidenceNextCodeQueryDto,
  type LitigationEvidenceNextCodeResponseDto,
  type LitigationEvidenceQueryDto,
  type LitigationFactDto,
  type LitigationFactListResponseDto,
  type LitigationFactQueryDto,
  type LitigationHearingDto,
  type LitigationHearingListResponseDto,
  type LitigationHearingQueryDto,
  type LitigationIssueDto,
  type LitigationIssueListResponseDto,
  type LitigationIssueQueryDto,
  type LitigationPleadingDto,
  type LitigationPleadingListResponseDto,
  type LitigationPleadingQueryDto,
  type PermissionContext,
  type UpdateLitigationHearingRequestDto,
  type UpdateLitigationFactRequestDto,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
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

interface LitigationEvidenceRow {
  evidence_id: string;
  matter_id: string;
  document_id: string | null;
  version_id: string | null;
  evidence_code: string;
  evidence_direction: LitigationEvidenceDirection;
  evidence_sequence: number;
  evidence_type: string;
  exhibit_label: string | null;
  custody_status: string;
  admitted_status: string;
  source_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LitigationFactRow {
  fact_id: string;
  matter_id: string;
  evidence_id: string | null;
  fact_code: string;
  fact_summary: string;
  fact_date: Date | string | null;
  status: string;
  materiality: string;
  citation_refs: string[];
  created_at: Date;
  updated_at: Date;
}

interface LitigationIssueRow {
  issue_id: string;
  matter_id: string;
  parent_issue_id: string | null;
  issue_code: string;
  label: string;
  issue_type: string;
  status: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface LitigationPleadingRow {
  pleading_id: string;
  matter_id: string;
  document_id: string | null;
  version_id: string | null;
  pleading_code: string;
  pleading_type: string;
  filing_status: string;
  internal_deadline: Date | string | null;
  citation_refs: string[];
  created_at: Date;
  updated_at: Date;
}

interface LitigationHearingRow {
  hearing_id: string;
  matter_id: string;
  pleading_id: string | null;
  title: string;
  hearing_type: string;
  scheduled_at: Date;
  court_name: string | null;
  location: string | null;
  internal_deadline: Date | string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface LitigationHearingWorkCandidateRow {
  hearing_id: string;
  matter_id: string;
  scheduled_at: Date;
  assigned_to_user_id: string;
  actor_user_id: string;
  audit_event_id: string;
}

interface DocumentVersionRow {
  matter_id: string;
  document_id: string;
  version_id: string;
}

type PgParam = SearchSqlValue | null;

@Injectable()
export class LitigationService {
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
  ) {}

  async createEvidence(
    ctx: PermissionContext,
    input: CreateLitigationEvidenceRequestDto,
  ): Promise<LitigationEvidenceDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    if (input.documentId) await this.assertCanReadDocument(ctx, input.documentId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const version = input.documentId
        ? await this.findDocumentVersion(client, ctx.tenantId, input.documentId, input.versionId)
        : null;
      if (input.documentId && (!version || version.matter_id !== input.matterId)) {
        throw validationFailed();
      }
      const direction = input.evidenceDirection;
      const sequence =
        input.evidenceSequence ??
        (await this.nextEvidenceSequence(client, ctx.tenantId, input.matterId, direction));
      const exhibitLabel = input.exhibitLabel ?? exhibitLabelFor(direction, sequence);
      let result: { rows: LitigationEvidenceRow[] };
      try {
        result = await client.query<LitigationEvidenceRow>(
          `
            INSERT INTO litigation_evidence_items (
              tenant_id, matter_id, document_id, version_id, evidence_code,
              evidence_direction, evidence_sequence, evidence_type, exhibit_label,
              custody_status, admitted_status, source_hash, created_by, updated_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
            RETURNING
              evidence_id, matter_id, document_id, version_id, evidence_code,
              evidence_direction, evidence_sequence, evidence_type, exhibit_label,
              custody_status, admitted_status, source_hash, created_at, updated_at
          `,
          [
            ctx.tenantId,
            input.matterId,
            version?.document_id ?? null,
            version?.version_id ?? null,
            input.evidenceCode,
            direction,
            sequence,
            input.evidenceType,
            exhibitLabel,
            input.custodyStatus,
            input.admittedStatus,
            input.sourceHash ?? null,
            ctx.userId,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw validationFailed('LITIGATION_EVIDENCE_CODE_CONFLICT');
        throw error;
      }
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const evidence = parseEvidenceRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_EVIDENCE_CHANGED',
          targetType: 'litigation_evidence',
          targetId: evidence.evidenceId,
          matterId: evidence.matterId,
          metadata: {
            matter_id: evidence.matterId,
            evidence_id: evidence.evidenceId,
            document_id: evidence.documentId,
            version_id: evidence.versionId,
            evidence_direction: evidence.evidenceDirection,
            evidence_sequence: evidence.evidenceSequence,
            evidence_type: evidence.evidenceType,
            custody_status: evidence.custodyStatus,
            admitted_status: evidence.admittedStatus,
            hash: evidence.sourceHash,
          },
        },
        client,
      );
      return evidence;
    });
  }

  async listEvidence(
    ctx: PermissionContext,
    input: LitigationEvidenceQueryDto,
  ): Promise<LitigationEvidenceListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const evidence = await this.queryEvidence(client, scope.scope, input);
      return litigationEvidenceListResponseSchema.parse({ matterId: input.matterId, evidence });
    });
  }

  async nextEvidenceCode(
    ctx: PermissionContext,
    input: LitigationEvidenceNextCodeQueryDto,
  ): Promise<LitigationEvidenceNextCodeResponseDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const nextSequence = await this.nextEvidenceSequence(
        client,
        ctx.tenantId,
        input.matterId,
        input.direction,
      );
      return litigationEvidenceNextCodeResponseSchema.parse({
        matterId: input.matterId,
        direction: input.direction,
        evidenceCode: evidenceCodeFor(input.direction, nextSequence),
        exhibitLabel: exhibitLabelFor(input.direction, nextSequence),
        nextSequence,
      });
    });
  }

  async createFact(
    ctx: PermissionContext,
    input: CreateLitigationFactRequestDto,
  ): Promise<LitigationFactDto> {
    if (input.status === 'verified' && input.citationRefs.length === 0) {
      throw validationFailed(litigationFactCitationRequiredReason);
    }
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.evidenceId) {
        await this.assertEvidenceBelongsToMatter(
          client,
          ctx.tenantId,
          input.evidenceId,
          input.matterId,
        );
      }
      const result = await client.query<LitigationFactRow>(
        `
          INSERT INTO litigation_facts (
            tenant_id, matter_id, evidence_id, fact_code, fact_summary,
            fact_date, status, materiality, citation_refs, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::text[], $10, $10)
          RETURNING
            fact_id, matter_id, evidence_id, fact_code, fact_summary, fact_date,
            status, materiality, citation_refs, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.evidenceId ?? null,
          input.factCode,
          input.factSummary,
          input.factDate ?? null,
          input.status,
          input.materiality,
          input.citationRefs,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const fact = parseFactRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_FACT_CHANGED',
          targetType: 'litigation_fact',
          targetId: fact.factId,
          matterId: fact.matterId,
          metadata: {
            matter_id: fact.matterId,
            fact_id: fact.factId,
            evidence_id: fact.evidenceId,
            status_after: fact.status,
            severity: fact.materiality,
          },
        },
        client,
      );
      await this.graphSyncOutbox.enqueue(
        {
          tenantId: ctx.tenantId,
          matterId: fact.matterId,
          reasonCode: 'litigation_fact_changed',
          requestedBy: ctx.userId,
        },
        client,
      );
      return fact;
    });
  }

  async updateFact(
    ctx: PermissionContext,
    factId: string,
    input: UpdateLitigationFactRequestDto,
  ): Promise<LitigationFactDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const current = await this.findFactForUpdate(client, ctx.tenantId, factId);
      if (!current) throw validationFailed();
      await this.assertCanEditMatter(ctx, current.matter_id);

      const nextStatus = input.status ?? current.status;
      const nextCitationRefs = input.citationRefs ?? current.citation_refs;
      if (nextStatus === 'verified' && nextCitationRefs.length === 0) {
        throw validationFailed(litigationFactCitationRequiredReason);
      }

      const diffKeys = factDiffKeys(current, input);
      if (diffKeys.length === 0) return parseFactRow(current);

      const result = await client.query<LitigationFactRow>(
        `
          UPDATE litigation_facts
          SET status = $3,
              citation_refs = $4::text[],
              updated_by = $5,
              updated_at = now()
          WHERE tenant_id = $1
            AND fact_id = $2
          RETURNING
            fact_id, matter_id, evidence_id, fact_code, fact_summary, fact_date,
            status, materiality, citation_refs, created_at, updated_at
        `,
        [ctx.tenantId, factId, nextStatus, nextCitationRefs, ctx.userId],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const fact = parseFactRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_FACT_CHANGED',
          targetType: 'litigation_fact',
          targetId: fact.factId,
          matterId: fact.matterId,
          metadata: {
            matter_id: fact.matterId,
            fact_id: fact.factId,
            evidence_id: fact.evidenceId,
            diff_keys: diffKeys,
            status_before: current.status,
            status_after: fact.status,
            citation_ref_count: fact.citationRefs.length,
            severity: fact.materiality,
          },
        },
        client,
      );
      await this.graphSyncOutbox.enqueue(
        {
          tenantId: ctx.tenantId,
          matterId: fact.matterId,
          reasonCode: 'litigation_fact_changed',
          requestedBy: ctx.userId,
        },
        client,
      );
      return fact;
    });
  }

  async listFacts(
    ctx: PermissionContext,
    input: LitigationFactQueryDto,
  ): Promise<LitigationFactListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const facts = await this.queryFacts(client, scope.scope, input);
      return litigationFactListResponseSchema.parse({ matterId: input.matterId, facts });
    });
  }

  async createIssue(
    ctx: PermissionContext,
    input: CreateLitigationIssueRequestDto,
  ): Promise<LitigationIssueDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.parentIssueId) {
        await this.assertIssueBelongsToMatter(
          client,
          ctx.tenantId,
          input.parentIssueId,
          input.matterId,
        );
      }
      const result = await client.query<LitigationIssueRow>(
        `
          INSERT INTO litigation_issue_nodes (
            tenant_id, matter_id, parent_issue_id, issue_code, label,
            issue_type, status, position, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
          RETURNING
            issue_id, matter_id, parent_issue_id, issue_code, label,
            issue_type, status, position, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.parentIssueId ?? null,
          input.issueCode,
          input.label,
          input.issueType,
          input.status,
          input.position,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const issue = parseIssueRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_ISSUE_TREE_CHANGED',
          targetType: 'litigation_issue',
          targetId: issue.issueId,
          matterId: issue.matterId,
          metadata: {
            matter_id: issue.matterId,
            issue_node_id: issue.issueId,
            status_after: issue.status,
            priority: String(issue.position),
          },
        },
        client,
      );
      await this.graphSyncOutbox.enqueue(
        {
          tenantId: ctx.tenantId,
          matterId: issue.matterId,
          reasonCode: 'litigation_issue_changed',
          requestedBy: ctx.userId,
        },
        client,
      );
      return issue;
    });
  }

  async listIssues(
    ctx: PermissionContext,
    input: LitigationIssueQueryDto,
  ): Promise<LitigationIssueListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const issues = await this.queryIssues(client, ctx.tenantId, input);
      return litigationIssueListResponseSchema.parse({ matterId: input.matterId, issues });
    });
  }

  async createPleading(
    ctx: PermissionContext,
    input: CreateLitigationPleadingRequestDto,
  ): Promise<LitigationPleadingDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    if (input.documentId) await this.assertCanReadDocument(ctx, input.documentId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const version = input.documentId
        ? await this.findDocumentVersion(client, ctx.tenantId, input.documentId, input.versionId)
        : null;
      if (input.documentId && (!version || version.matter_id !== input.matterId)) {
        throw validationFailed();
      }
      const result = await client.query<LitigationPleadingRow>(
        `
          INSERT INTO litigation_pleadings (
            tenant_id, matter_id, document_id, version_id, pleading_code,
            pleading_type, filing_status, internal_deadline, citation_refs,
            created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::text[], $10, $10)
          RETURNING
            pleading_id, matter_id, document_id, version_id, pleading_code,
            pleading_type, filing_status, internal_deadline, citation_refs,
            created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          version?.document_id ?? null,
          version?.version_id ?? null,
          input.pleadingCode,
          input.pleadingType,
          input.filingStatus,
          input.internalDeadline ?? null,
          input.citationRefs,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const pleading = parsePleadingRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_PLEADING_CHANGED',
          targetType: 'litigation_pleading',
          targetId: pleading.pleadingId,
          matterId: pleading.matterId,
          metadata: {
            matter_id: pleading.matterId,
            pleading_id: pleading.pleadingId,
            document_id: pleading.documentId,
            version_id: pleading.versionId,
            pleading_type: pleading.pleadingType,
            filing_status: pleading.filingStatus,
          },
        },
        client,
      );
      return pleading;
    });
  }

  async listPleadings(
    ctx: PermissionContext,
    input: LitigationPleadingQueryDto,
  ): Promise<LitigationPleadingListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const pleadings = await this.queryPleadings(client, scope.scope, input);
      return litigationPleadingListResponseSchema.parse({
        matterId: input.matterId,
        pleadings,
      });
    });
  }

  async createHearing(
    ctx: PermissionContext,
    input: CreateLitigationHearingRequestDto,
  ): Promise<LitigationHearingDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.pleadingId) {
        await this.assertPleadingBelongsToMatter(
          client,
          ctx.tenantId,
          input.pleadingId,
          input.matterId,
        );
      }
      const internalDeadline = input.internalDeadline ?? internalDeadlineFromScheduledAt(input.scheduledAt);
      assertDeadlineBeforeHearing(internalDeadline, input.scheduledAt);
      const result = await client.query<LitigationHearingRow>(
        `
          INSERT INTO litigation_hearings (
            tenant_id, matter_id, pleading_id, title, hearing_type, scheduled_at,
            court_name, location, internal_deadline, status, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9::date, 'scheduled', $10, $10)
          RETURNING
            hearing_id, matter_id, pleading_id, title, hearing_type, scheduled_at,
            court_name, location, internal_deadline, status, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.pleadingId ?? null,
          input.title,
          input.hearingType,
          input.scheduledAt,
          input.courtName ?? null,
          input.location ?? null,
          internalDeadline,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const hearing = parseHearingRow(row);
      if (hearing.pleadingId && hearing.internalDeadline) {
        await this.syncPleadingDeadline(
          client,
          ctx.tenantId,
          hearing.pleadingId,
          hearing.internalDeadline,
          ctx.userId,
        );
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_HEARING_CHANGED',
          targetType: 'litigation_hearing',
          targetId: hearing.hearingId,
          matterId: hearing.matterId,
          metadata: {
            matter_id: hearing.matterId,
            hearing_id: hearing.hearingId,
            pleading_id: hearing.pleadingId,
            hearing_type: hearing.hearingType,
            status_after: hearing.status,
            scheduled_date: hearing.scheduledAt.slice(0, 10),
          },
        },
        client,
      );
      return hearing;
    });
  }

  async updateHearing(
    ctx: PermissionContext,
    hearingId: string,
    input: UpdateLitigationHearingRequestDto,
  ): Promise<LitigationHearingDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const current = await this.findHearingForUpdate(client, ctx.tenantId, hearingId);
      if (!current) throw validationFailed();
      await this.assertCanEditMatter(ctx, current.matter_id);

      const nextPleadingId = hasOwn(input, 'pleadingId')
        ? (input.pleadingId ?? null)
        : current.pleading_id;
      if (nextPleadingId) {
        await this.assertPleadingBelongsToMatter(
          client,
          ctx.tenantId,
          nextPleadingId,
          current.matter_id,
        );
      }
      const nextScheduledAt = input.scheduledAt ?? current.scheduled_at.toISOString();
      const nextInternalDeadline = hasOwn(input, 'internalDeadline')
        ? (input.internalDeadline ?? null)
        : input.scheduledAt
          ? internalDeadlineFromScheduledAt(nextScheduledAt)
          : current.internal_deadline
            ? dateOnly(current.internal_deadline)
            : null;
      if (nextInternalDeadline) assertDeadlineBeforeHearing(nextInternalDeadline, nextScheduledAt);

      const result = await client.query<LitigationHearingRow>(
        `
          UPDATE litigation_hearings
          SET pleading_id = $3,
              title = $4,
              hearing_type = $5,
              scheduled_at = $6::timestamptz,
              court_name = $7,
              location = $8,
              internal_deadline = $9::date,
              status = $10,
              updated_by = $11,
              updated_at = now()
          WHERE tenant_id = $1
            AND hearing_id = $2
          RETURNING
            hearing_id, matter_id, pleading_id, title, hearing_type, scheduled_at,
            court_name, location, internal_deadline, status, created_at, updated_at
        `,
        [
          ctx.tenantId,
          hearingId,
          nextPleadingId,
          input.title ?? current.title,
          input.hearingType ?? current.hearing_type,
          nextScheduledAt,
          hasOwn(input, 'courtName') ? (input.courtName ?? null) : current.court_name,
          hasOwn(input, 'location') ? (input.location ?? null) : current.location,
          nextInternalDeadline,
          input.status ?? current.status,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const hearing = parseHearingRow(row);
      if (hearing.pleadingId && hearing.internalDeadline) {
        await this.syncPleadingDeadline(
          client,
          ctx.tenantId,
          hearing.pleadingId,
          hearing.internalDeadline,
          ctx.userId,
        );
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_HEARING_CHANGED',
          targetType: 'litigation_hearing',
          targetId: hearing.hearingId,
          matterId: hearing.matterId,
          metadata: {
            matter_id: hearing.matterId,
            hearing_id: hearing.hearingId,
            pleading_id: hearing.pleadingId,
            diff_keys: Object.keys(input),
            status_before: current.status,
            status_after: hearing.status,
            scheduled_date: hearing.scheduledAt.slice(0, 10),
          },
        },
        client,
      );
      return hearing;
    });
  }

  async cancelHearing(ctx: PermissionContext, hearingId: string): Promise<LitigationHearingDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const current = await this.findHearingForUpdate(client, ctx.tenantId, hearingId);
      if (!current) throw validationFailed();
      await this.assertCanEditMatter(ctx, current.matter_id);
      if (current.status === 'cancelled') return parseHearingRow(current);
      const result = await client.query<LitigationHearingRow>(
        `
          UPDATE litigation_hearings
          SET status = 'cancelled',
              updated_by = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND hearing_id = $2
          RETURNING
            hearing_id, matter_id, pleading_id, title, hearing_type, scheduled_at,
            court_name, location, internal_deadline, status, created_at, updated_at
        `,
        [ctx.tenantId, hearingId, ctx.userId],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const hearing = parseHearingRow(row);
      const audit = await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_HEARING_CHANGED',
          targetType: 'litigation_hearing',
          targetId: hearing.hearingId,
          matterId: hearing.matterId,
          metadata: {
            matter_id: hearing.matterId,
            hearing_id: hearing.hearingId,
            status_before: current.status,
            status_after: hearing.status,
          },
        },
        client,
      );
      await this.workService.cancelWorkflowWork(client, {
        tenantId: ctx.tenantId,
        kind: 'litigation_deadline',
        targetId: hearing.hearingId,
        actorUserId: ctx.userId,
        auditEventId: audit.eventId,
      });
      await client.query(
        `
          UPDATE notifications
          SET status = 'cancelled',
              read_by = NULL,
              read_at = NULL,
              dismissed_by = NULL,
              dismissed_at = NULL,
              last_audit_event_id = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND kind = 'litigation_deadline'
            AND target_type = 'litigation_hearing'
            AND target_id = $2
            AND status IN ('unread', 'read')
        `,
        [ctx.tenantId, hearing.hearingId, audit.eventId],
      );
      return hearing;
    });
  }

  async listHearings(
    ctx: PermissionContext,
    input: LitigationHearingQueryDto,
  ): Promise<LitigationHearingListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const hearings = await this.queryHearings(client, ctx.tenantId, input);
      return litigationHearingListResponseSchema.parse({ matterId: input.matterId, hearings });
    });
  }

  async refreshLitigationDeadlineWorkForTenant(
    tenantId: string,
  ): Promise<{ refreshedCount: number }> {
    return this.auditService.transaction(tenantId, async (client) => {
      const result = await client.query<LitigationHearingWorkCandidateRow>(
        `
          SELECT
            lh.hearing_id,
            lh.matter_id,
            lh.scheduled_at,
            lh.created_by AS assigned_to_user_id,
            lh.created_by AS actor_user_id,
            ae.event_id AS audit_event_id
          FROM litigation_hearings lh
          JOIN matters m
            ON m.tenant_id = lh.tenant_id
           AND m.matter_id = lh.matter_id
          JOIN users assignee
            ON assignee.tenant_id = lh.tenant_id
           AND assignee.user_id = lh.created_by
           AND assignee.status = 'active'
          JOIN LATERAL (
            SELECT ae.event_id
            FROM audit_events ae
            WHERE ae.tenant_id = lh.tenant_id
              AND ae.action = 'LIT_HEARING_CHANGED'
              AND ae.target_type = 'litigation_hearing'
              AND ae.target_id = lh.hearing_id
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) ae ON TRUE
          WHERE lh.tenant_id = $1
            AND lh.status = 'scheduled'
            AND lh.scheduled_at::date >= current_date
            AND lh.scheduled_at::date <= current_date + 7
          ORDER BY lh.scheduled_at ASC, lh.hearing_id
        `,
        [tenantId],
      );
      for (const row of result.rows) {
        await this.workService.openWorkflowWork(client, {
          tenantId,
          kind: 'litigation_deadline',
          targetId: row.hearing_id,
          matterId: row.matter_id,
          documentId: null,
          assignedToUserId: row.assigned_to_user_id,
          dueAt: row.scheduled_at,
          actorUserId: row.actor_user_id,
          auditEventId: row.audit_event_id,
        });
      }
      return { refreshedCount: result.rows.length };
    });
  }

  async caseMap(
    ctx: PermissionContext,
    input: LitigationCaseMapQueryDto,
  ): Promise<LitigationCaseMapResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const evidence = await this.queryEvidence(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const facts = await this.queryFacts(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const issues = await this.queryIssues(client, ctx.tenantId, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const pleadings = await this.queryPleadings(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const caseMap = buildCaseMap(evidence, facts, issues, pleadings).slice(0, input.limit);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_CASE_MAP_VIEWED',
          targetType: 'litigation_case_map',
          targetId: input.matterId,
          matterId: input.matterId,
          metadata: {
            matter_id: input.matterId,
            query_hash: sha256Hex(`lit-case-map:${input.matterId}:${input.limit}`),
            evidence_count: evidence.length,
            fact_count: facts.length,
            issue_node_count: issues.length,
            pleading_count: pleadings.length,
            case_map_count: caseMap.length,
            filter_refs: compactRules(scope.appliedRules ?? []),
          },
        },
        client,
      );
      return litigationCaseMapResponseSchema.parse({
        matterId: input.matterId,
        evidenceCount: evidence.length,
        factCount: facts.length,
        issueCount: issues.length,
        pleadingCount: pleadings.length,
        caseMap,
      });
    });
  }

  private async queryEvidence(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: LitigationEvidenceQueryDto,
  ): Promise<LitigationEvidenceDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status
      ? `AND lei.custody_status = $${params.push(input.status)}`
      : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationEvidenceRow>(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          lei.evidence_id, lei.matter_id, lei.document_id, lei.version_id,
          lei.evidence_code, lei.evidence_direction, lei.evidence_sequence,
          lei.evidence_type, lei.exhibit_label,
          lei.custody_status, lei.admitted_status, lei.source_hash,
          lei.created_at, lei.updated_at
        FROM litigation_evidence_items lei
        LEFT JOIN visible_docs vd
          ON vd.document_id = lei.document_id
        WHERE lei.matter_id = ${matterSql}::uuid
          AND (lei.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY lei.evidence_direction, lei.evidence_sequence, lei.evidence_code
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseEvidenceRow);
  }

  private async queryFacts(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: LitigationFactQueryDto,
  ): Promise<LitigationFactDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status ? `AND lf.status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationFactRow>(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          lf.fact_id, lf.matter_id, lf.evidence_id, lf.fact_code, lf.fact_summary,
          lf.fact_date, lf.status, lf.materiality, lf.citation_refs,
          lf.created_at, lf.updated_at
        FROM litigation_facts lf
        LEFT JOIN litigation_evidence_items lei
          ON lei.tenant_id = lf.tenant_id
          AND lei.evidence_id = lf.evidence_id
        LEFT JOIN visible_docs vd
          ON vd.document_id = lei.document_id
        WHERE lf.matter_id = ${matterSql}::uuid
          AND (lf.evidence_id IS NULL OR lei.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY lf.fact_date NULLS LAST, lf.fact_code, lf.created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseFactRow);
  }

  private async queryIssues(
    client: PoolClient,
    tenantId: string,
    input: LitigationIssueQueryDto,
  ): Promise<LitigationIssueDto[]> {
    const params: SearchSqlValue[] = [tenantId, input.matterId];
    const statusFilter = input.status ? `AND status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationIssueRow>(
      `
        SELECT
          issue_id, matter_id, parent_issue_id, issue_code, label, issue_type,
          status, position, created_at, updated_at
        FROM litigation_issue_nodes
        WHERE tenant_id = $1
          AND matter_id = $2
          ${statusFilter}
        ORDER BY position, issue_code, created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseIssueRow);
  }

  private async queryPleadings(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: LitigationPleadingQueryDto,
  ): Promise<LitigationPleadingDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status ? `AND lp.filing_status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationPleadingRow>(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          lp.pleading_id, lp.matter_id, lp.document_id, lp.version_id,
          lp.pleading_code, lp.pleading_type, lp.filing_status,
          lp.internal_deadline, lp.citation_refs, lp.created_at, lp.updated_at
        FROM litigation_pleadings lp
        LEFT JOIN visible_docs vd
          ON vd.document_id = lp.document_id
        WHERE lp.matter_id = ${matterSql}::uuid
          AND (lp.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY lp.internal_deadline NULLS LAST, lp.pleading_code, lp.created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parsePleadingRow);
  }

  private async queryHearings(
    client: PoolClient,
    tenantId: string,
    input: LitigationHearingQueryDto,
  ): Promise<LitigationHearingDto[]> {
    const params: SearchSqlValue[] = [tenantId, input.matterId];
    const statusFilter = input.status ? `AND status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationHearingRow>(
      `
        SELECT
          hearing_id, matter_id, pleading_id, title, hearing_type, scheduled_at,
          court_name, location, internal_deadline, status, created_at, updated_at
        FROM litigation_hearings
        WHERE tenant_id = $1
          AND matter_id = $2
          ${statusFilter}
        ORDER BY scheduled_at ASC, hearing_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseHearingRow);
  }

  private async findDocumentVersion(
    client: PoolClient,
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<DocumentVersionRow | null> {
    const params: PgParam[] = [tenantId, documentId];
    const versionFilter = versionId
      ? `AND dv.version_id = $${params.push(versionId)}::uuid`
      : `AND dv.version_status = 'current'`;
    const result = await client.query<DocumentVersionRow>(
      `
        SELECT d.matter_id, d.document_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          ${versionFilter}
        ORDER BY dv.created_at DESC
        LIMIT 1
      `,
      params,
    );
    return result.rows[0] ?? null;
  }

  private async nextEvidenceSequence(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    direction: LitigationEvidenceDirection,
  ): Promise<number> {
    const result = await client.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(evidence_sequence), 0) + 1 AS next_sequence
        FROM litigation_evidence_items
        WHERE tenant_id = $1
          AND matter_id = $2
          AND evidence_direction = $3
      `,
      [tenantId, matterId, direction],
    );
    return result.rows[0]?.next_sequence ?? 1;
  }

  private async assertCanReadMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    let allowed = false;
    try {
      const decision = await this.permissionService.canReadMatter(ctx, matterId);
      allowed = decision.effect === 'ALLOW';
    } catch {
      allowed = false;
    }
    if (!allowed) throw permissionDenied();
  }

  private async assertCanEditMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    let allowed = false;
    try {
      const decision = await this.permissionService.canEditMatter(ctx, matterId);
      allowed = decision.effect === 'ALLOW';
    } catch {
      allowed = false;
    }
    if (!allowed) throw permissionDenied();
  }

  private async assertCanReadDocument(ctx: PermissionContext, documentId: string): Promise<void> {
    let allowed = false;
    try {
      const decision = await this.documentPermission.canReadDocument(ctx, documentId);
      allowed = decision.effect === 'ALLOW';
    } catch {
      allowed = false;
    }
    if (!allowed) throw permissionDenied();
  }

  private async authorizedScope(ctx: PermissionContext): Promise<{
    scope: SearchSqlFragment;
    appliedRules?: string[];
  }> {
    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      throw permissionDenied();
    }
    if (scopeDecision.effect !== 'ALLOW') throw permissionDenied();
    return scopeDecision;
  }

  private async assertEvidenceBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    evidenceId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<{ evidence_id: string }>(
      `
        SELECT evidence_id
        FROM litigation_evidence_items
        WHERE tenant_id = $1
          AND evidence_id = $2
          AND matter_id = $3
        LIMIT 1
      `,
      [tenantId, evidenceId, matterId],
    );
    if (!result.rows[0]) throw validationFailed();
  }

  private async assertPleadingBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    pleadingId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<{ pleading_id: string }>(
      `
        SELECT pleading_id
        FROM litigation_pleadings
        WHERE tenant_id = $1
          AND pleading_id = $2
          AND matter_id = $3
        LIMIT 1
      `,
      [tenantId, pleadingId, matterId],
    );
    if (!result.rows[0]) throw validationFailed();
  }

  private async syncPleadingDeadline(
    client: PoolClient,
    tenantId: string,
    pleadingId: string,
    internalDeadline: string,
    actorUserId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE litigation_pleadings
        SET internal_deadline = $3::date,
            updated_by = $4,
            updated_at = now()
        WHERE tenant_id = $1
          AND pleading_id = $2
      `,
      [tenantId, pleadingId, internalDeadline, actorUserId],
    );
  }

  private async findHearingForUpdate(
    client: PoolClient,
    tenantId: string,
    hearingId: string,
  ): Promise<LitigationHearingRow | null> {
    const result = await client.query<LitigationHearingRow>(
      `
        SELECT
          hearing_id, matter_id, pleading_id, title, hearing_type, scheduled_at,
          court_name, location, internal_deadline, status, created_at, updated_at
        FROM litigation_hearings
        WHERE tenant_id = $1
          AND hearing_id = $2
        FOR UPDATE
      `,
      [tenantId, hearingId],
    );
    return result.rows[0] ?? null;
  }

  private async assertIssueBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    issueId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<{ issue_id: string }>(
      `
        SELECT issue_id
        FROM litigation_issue_nodes
        WHERE tenant_id = $1
          AND issue_id = $2
          AND matter_id = $3
        LIMIT 1
      `,
      [tenantId, issueId, matterId],
    );
    if (!result.rows[0]) throw validationFailed();
  }

  private async findFactForUpdate(
    client: PoolClient,
    tenantId: string,
    factId: string,
  ): Promise<LitigationFactRow | null> {
    const result = await client.query<LitigationFactRow>(
      `
        SELECT
          fact_id, matter_id, evidence_id, fact_code, fact_summary, fact_date,
          status, materiality, citation_refs, created_at, updated_at
        FROM litigation_facts
        WHERE tenant_id = $1
          AND fact_id = $2
        FOR UPDATE
      `,
      [tenantId, factId],
    );
    return result.rows[0] ?? null;
  }
}

function visibleDocsCte(whereSql: string): string {
  return `
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
      ${whereSql}
    )
  `;
}

function parseEvidenceRow(row: LitigationEvidenceRow): LitigationEvidenceDto {
  return litigationEvidenceSchema.parse({
    evidenceId: row.evidence_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    evidenceCode: row.evidence_code,
    evidenceDirection: row.evidence_direction,
    evidenceSequence: row.evidence_sequence,
    evidenceType: row.evidence_type,
    exhibitLabel: row.exhibit_label,
    custodyStatus: row.custody_status,
    admittedStatus: row.admitted_status,
    sourceHash: row.source_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseFactRow(row: LitigationFactRow): LitigationFactDto {
  return litigationFactSchema.parse({
    factId: row.fact_id,
    matterId: row.matter_id,
    evidenceId: row.evidence_id,
    factCode: row.fact_code,
    factSummary: row.fact_summary,
    factDate: row.fact_date ? dateOnly(row.fact_date) : null,
    status: row.status,
    materiality: row.materiality,
    citationRefs: row.citation_refs,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseIssueRow(row: LitigationIssueRow): LitigationIssueDto {
  return litigationIssueSchema.parse({
    issueId: row.issue_id,
    matterId: row.matter_id,
    parentIssueId: row.parent_issue_id,
    issueCode: row.issue_code,
    label: row.label,
    issueType: row.issue_type,
    status: row.status,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parsePleadingRow(row: LitigationPleadingRow): LitigationPleadingDto {
  return litigationPleadingSchema.parse({
    pleadingId: row.pleading_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    pleadingCode: row.pleading_code,
    pleadingType: row.pleading_type,
    filingStatus: row.filing_status,
    internalDeadline: row.internal_deadline ? dateOnly(row.internal_deadline) : null,
    citationRefs: row.citation_refs,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseHearingRow(row: LitigationHearingRow): LitigationHearingDto {
  return litigationHearingSchema.parse({
    hearingId: row.hearing_id,
    matterId: row.matter_id,
    pleadingId: row.pleading_id,
    title: row.title,
    hearingType: row.hearing_type,
    scheduledAt: row.scheduled_at.toISOString(),
    courtName: row.court_name,
    location: row.location,
    internalDeadline: row.internal_deadline ? dateOnly(row.internal_deadline) : null,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function buildCaseMap(
  evidence: LitigationEvidenceDto[],
  facts: LitigationFactDto[],
  issues: LitigationIssueDto[],
  pleadings: LitigationPleadingDto[],
): LitigationCaseMapItemDto[] {
  const byEvidence = new Map(evidence.map((item) => [item.evidenceId, item]));
  const rootIssue = issues[0] ?? null;
  const byDocumentPleading = new Map(
    pleadings
      .filter((pleading) => pleading.documentId)
      .map((pleading) => [pleading.documentId as string, pleading]),
  );
  const items: LitigationCaseMapItemDto[] = [];
  for (const item of evidence) {
    const linkedFacts = facts.filter((fact) => fact.evidenceId === item.evidenceId);
    const pleading = item.documentId ? (byDocumentPleading.get(item.documentId) ?? null) : null;
    if (linkedFacts.length === 0) {
      items.push(caseMapItem(item, null, rootIssue, pleading));
      continue;
    }
    for (const fact of linkedFacts) {
      items.push(caseMapItem(item, fact, rootIssue, pleading));
    }
  }
  for (const fact of facts) {
    if (fact.evidenceId && byEvidence.has(fact.evidenceId)) continue;
    items.push(caseMapItem(null, fact, rootIssue, null));
  }
  for (const pleading of pleadings) {
    if (pleading.documentId && evidence.some((item) => item.documentId === pleading.documentId)) {
      continue;
    }
    items.push(caseMapItem(null, null, rootIssue, pleading));
  }
  return items;
}

function caseMapItem(
  evidence: LitigationEvidenceDto | null,
  fact: LitigationFactDto | null,
  issue: LitigationIssueDto | null,
  pleading: LitigationPleadingDto | null,
): LitigationCaseMapItemDto {
  return {
    evidenceId: evidence?.evidenceId ?? null,
    factId: fact?.factId ?? null,
    issueId: issue?.issueId ?? null,
    pleadingId: pleading?.pleadingId ?? null,
    documentId: evidence?.documentId ?? pleading?.documentId ?? null,
    statusRefs: [
      evidence ? `evidence:${evidence.custodyStatus}` : null,
      fact ? `fact:${fact.status}` : null,
      issue ? `issue:${issue.status}` : null,
      pleading ? `pleading:${pleading.filingStatus}` : null,
    ].filter((value): value is string => value !== null),
    citationRefs: [...(fact?.citationRefs ?? []), ...(pleading?.citationRefs ?? [])].slice(0, 20),
  };
}

function dateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function internalDeadlineFromScheduledAt(scheduledAt: string): string {
  const value = new Date(scheduledAt);
  if (!Number.isFinite(value.getTime())) throw validationFailed();
  value.setUTCDate(value.getUTCDate() - 7);
  return value.toISOString().slice(0, 10);
}

function assertDeadlineBeforeHearing(internalDeadline: string, scheduledAt: string): void {
  if (internalDeadline > scheduledAt.slice(0, 10)) throw validationFailed();
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function exhibitLabelFor(direction: LitigationEvidenceDirection, sequence: number): string {
  return `${direction === 'gap' ? '갑' : '을'} 제${sequence}호증`;
}

function evidenceCodeFor(direction: LitigationEvidenceDirection, sequence: number): string {
  return `${direction.toUpperCase()}-${String(sequence).padStart(3, '0')}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
  );
}

function factDiffKeys(current: LitigationFactRow, input: UpdateLitigationFactRequestDto): string[] {
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

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compactRules(rules: readonly string[]): string[] {
  return rules.map((rule) => sha256Hex(rule).slice(0, 16)).slice(0, 20);
}
