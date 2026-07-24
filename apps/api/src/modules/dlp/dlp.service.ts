import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  dlpRestrictedFindingTypes,
  dlpReviewResponseSchema,
  sf20DlpMaxReviewDays,
  sf20DlpMaxScanCharacters,
  sf20DlpPolicyVersion,
  sf20DlpTotalFindingReviewThreshold,
  type CreateDlpReviewRequestDto,
  type DlpAssessmentSummary,
  type DlpDetection,
  type DlpEgressPurpose,
  type DlpReviewDecision,
  type DlpReviewReasonCode,
  type DlpReviewResponseDto,
  type DlpScanOptions,
  type DlpUnscannableReasonCode,
  type PermissionContext,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

export type DlpSourceType =
  | 'document'
  | 'email'
  | 'attachment'
  | 'text'
  | 'email_egress'
  | 'model_egress';

export interface DlpScanSource {
  tenantId: string;
  sourceType: DlpSourceType;
  sourceId: string;
  matterId?: string | null;
  documentId?: string | null;
  versionId?: string | null;
  text: string;
}

export interface RecordedDlpFinding extends DlpDetection {
  findingId: string;
}

export interface DlpScanRecordResult {
  findings: RecordedDlpFinding[];
}

export interface DlpAssessmentSource {
  tenantId: string;
  sourceType: DlpSourceType;
  sourceId: string;
  matterId?: string | null;
  documentId?: string | null;
  versionId?: string | null;
  text?: string | null;
  unscannableReasonCode?: DlpUnscannableReasonCode;
  options?: DlpScanOptions;
}

export interface DlpAssessmentEvaluation extends DlpAssessmentSummary {
  detections: DlpDetection[];
}

export interface RecordedDlpAssessment extends DlpAssessmentSummary {
  assessmentId: string;
  findings: RecordedDlpFinding[];
  createdAt: Date;
}

export interface DlpModelEgressSource {
  tenantId: string;
  egressId: string;
  matterId?: string | null;
  documentId?: string | null;
  versionId?: string | null;
  text: string;
}

export interface DlpModelEgressResult {
  allowed: boolean;
  findingCount: number;
  resultHash: string;
}

export type DlpDocumentEgressAuthorization =
  | {
      kind: 'internal';
      userId: string;
      sessionId?: string | null;
    }
  | {
      kind: 'external_link';
      externalLinkId: string;
    };

export interface DlpDocumentEgressSource {
  tenantId: string;
  matterId: string;
  documentId: string;
  versionId: string | null;
  purpose: Exclude<DlpEgressPurpose, 'raw_email_download'>;
  authorization: DlpDocumentEgressAuthorization;
}

export interface DlpEmailEgressSource {
  tenantId: string;
  matterId: string;
  emailId: string;
  purpose: Extract<DlpEgressPurpose, 'raw_email_download'>;
  authorization: {
    kind: 'internal';
    userId: string;
    sessionId?: string | null;
  };
}

export interface DlpEgressDecision {
  allowed: boolean;
  assessmentId: string;
  reviewId: string | null;
  scanState: DlpAssessmentSummary['scanState'];
  reasonCode: DlpAssessmentSummary['reasonCode'];
  findingCount: number;
  restrictedFindingCount: number;
  requiresReview: boolean;
  policyVersion: string;
  resultHash: string;
}

interface DlpFindingRow {
  finding_id: string;
}

interface DlpAssessmentRow {
  assessment_id: string;
  created_at: Date | string;
}

interface PersistedDlpAssessmentRow extends DlpAssessmentRow {
  tenant_id: string;
  source_type: DlpSourceType;
  source_id: string;
  matter_id: string | null;
  document_id: string | null;
  version_id: string | null;
  scan_state: DlpAssessmentSummary['scanState'];
  reason_code: DlpUnscannableReasonCode | null;
  finding_count: number;
  restricted_finding_count: number;
  requires_review: boolean;
  policy_version: string;
  result_hash: string;
}

interface DlpReviewRow {
  review_id: string;
  decision: DlpReviewDecision;
  reason_code: DlpReviewReasonCode;
  reviewed_at: Date | string;
  expires_at: Date | string;
  is_unexpired?: boolean;
}

interface CanonicalDocumentRow {
  version_id: string;
  extraction_status: string | null;
  extraction_method: string | null;
  failure_reason_code: string | null;
  body_length: number | string | null;
  scan_text: string | null;
}

interface ReviewerRoleRow {
  role: string;
  status: string;
}

const reviewRoles = new Set(['firm_admin', 'security_admin']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const restrictedFindingTypes = new Set<string>(dlpRestrictedFindingTypes);

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function scanResultHash(detections: readonly DlpDetection[]): string {
  return sha256Hex(detections.map((item) => `${item.ruleId}:${item.valueHash}`).join('|'));
}

function assessmentResultHash(input: {
  scanState: DlpAssessmentSummary['scanState'];
  reasonCode: DlpAssessmentSummary['reasonCode'];
  detections: readonly DlpDetection[];
}): string {
  return sha256Hex(
    [
      sf20DlpPolicyVersion,
      input.scanState,
      input.reasonCode ?? 'none',
      scanResultHash(input.detections),
    ].join('|'),
  );
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(reason: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason });
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function failureReasonToUnscannable(
  failureReasonCode: string | null,
): DlpUnscannableReasonCode {
  if (failureReasonCode && /(PASSWORD|ENCRYPT)/u.test(failureReasonCode)) {
    return 'password_protected';
  }
  if (failureReasonCode && /(SIZE|LIMIT|OVERSIZE)/u.test(failureReasonCode)) {
    return 'input_oversize';
  }
  return 'parser_failed';
}

@Injectable()
export class DlpService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SensitiveDataDetector) private readonly detector: SensitiveDataDetector,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
  ) {}

  scanText(text: string): DlpDetection[] {
    return this.detector.scan(text);
  }

  evaluateText(
    text: string | null | undefined,
    input: {
      unscannableReasonCode?: DlpUnscannableReasonCode;
      options?: DlpScanOptions;
    } = {},
  ): DlpAssessmentEvaluation {
    const explicitReason = input.unscannableReasonCode;
    if (explicitReason || !text || text.trim().length === 0) {
      const reasonCode = explicitReason ?? 'no_text';
      return {
        scanState: 'unscannable',
        reasonCode,
        findingCount: 0,
        restrictedFindingCount: 0,
        requiresReview: true,
        completed: false,
        limitReached: reasonCode === 'scan_limit_reached',
        policyVersion: sf20DlpPolicyVersion,
        resultHash: assessmentResultHash({
          scanState: 'unscannable',
          reasonCode,
          detections: [],
        }),
        detections: [],
      };
    }

    const scan = this.detector.scanWithStatus(text, input.options);
    const restrictedFindingCount = scan.detections.filter((item) =>
      restrictedFindingTypes.has(item.findingType),
    ).length;
    if (scan.limitReached) {
      return {
        scanState: 'unscannable',
        reasonCode: 'scan_limit_reached',
        findingCount: scan.detections.length,
        restrictedFindingCount,
        requiresReview: true,
        completed: false,
        limitReached: true,
        policyVersion: sf20DlpPolicyVersion,
        resultHash: assessmentResultHash({
          scanState: 'unscannable',
          reasonCode: 'scan_limit_reached',
          detections: scan.detections,
        }),
        detections: scan.detections,
      };
    }

    const scanState = scan.detections.length === 0 ? 'clean' : 'findings';
    return {
      scanState,
      reasonCode: null,
      findingCount: scan.detections.length,
      restrictedFindingCount,
      requiresReview:
        restrictedFindingCount > 0 ||
        scan.detections.length >= sf20DlpTotalFindingReviewThreshold,
      completed: true,
      limitReached: false,
      policyVersion: sf20DlpPolicyVersion,
      resultHash: assessmentResultHash({
        scanState,
        reasonCode: null,
        detections: scan.detections,
      }),
      detections: scan.detections,
    };
  }

  async assessAndRecord(
    client: QueryClient,
    source: DlpAssessmentSource,
  ): Promise<RecordedDlpAssessment> {
    const evaluation = this.evaluateText(source.text, {
      ...(source.unscannableReasonCode
        ? { unscannableReasonCode: source.unscannableReasonCode }
        : {}),
      ...(source.options ? { options: source.options } : {}),
    });
    const findings = await this.recordDetections(client, source, evaluation.detections);
    const inserted = await client.query(
      `
        INSERT INTO dlp_scan_assessments (
          tenant_id, source_type, source_id, matter_id, document_id, version_id,
          scan_state, reason_code, finding_count, restricted_finding_count,
          requires_review, policy_version, result_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (
          tenant_id, source_type, source_id, policy_version, result_hash
        )
        DO NOTHING
        RETURNING assessment_id, created_at
      `,
      [
        source.tenantId,
        source.sourceType,
        source.sourceId,
        source.matterId ?? null,
        source.documentId ?? null,
        source.versionId ?? null,
        evaluation.scanState,
        evaluation.reasonCode,
        evaluation.findingCount,
        evaluation.restrictedFindingCount,
        evaluation.requiresReview,
        evaluation.policyVersion,
        evaluation.resultHash,
      ],
    );
    let row = inserted.rows[0] as DlpAssessmentRow | undefined;
    if (!row) {
      const existing = await client.query(
        `
          SELECT assessment_id, created_at
          FROM dlp_scan_assessments
          WHERE tenant_id = $1
            AND source_type = $2
            AND source_id = $3
            AND policy_version = $4
            AND result_hash = $5
          LIMIT 1
        `,
        [
          source.tenantId,
          source.sourceType,
          source.sourceId,
          evaluation.policyVersion,
          evaluation.resultHash,
        ],
      );
      row = existing.rows[0] as DlpAssessmentRow | undefined;
    }
    if (!row) throw new Error('dlp assessment insert returned no row');

    await this.auditService.log(
      {
        tenantId: source.tenantId,
        action: 'DLP_SCAN_COMPLETED',
        targetType: 'dlp_assessment',
        targetId: row.assessment_id,
        matterId: source.matterId ?? null,
        metadata: this.assessmentAuditMetadata(source, evaluation, row.assessment_id),
      },
      client,
    );

    return {
      assessmentId: row.assessment_id,
      scanState: evaluation.scanState,
      reasonCode: evaluation.reasonCode,
      findingCount: evaluation.findingCount,
      restrictedFindingCount: evaluation.restrictedFindingCount,
      requiresReview: evaluation.requiresReview,
      completed: evaluation.completed,
      limitReached: evaluation.limitReached,
      policyVersion: evaluation.policyVersion,
      resultHash: evaluation.resultHash,
      findings,
      createdAt: new Date(row.created_at),
    };
  }

  async createReview(
    ctx: PermissionContext,
    assessmentId: string,
    input: CreateDlpReviewRequestDto,
  ): Promise<DlpReviewResponseDto> {
    if (!uuidPattern.test(assessmentId)) throw validationFailed('DLP_ASSESSMENT_ID_INVALID');
    if (
      (input.decision === 'allow' && input.reasonCode === 'sensitive_content_denied') ||
      (input.decision === 'deny' && input.reasonCode !== 'sensitive_content_denied')
    ) {
      throw validationFailed('DLP_REVIEW_REASON_INVALID');
    }
    const expiresAt = new Date(input.expiresAt);
    const now = Date.now();
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= now ||
      expiresAt.getTime() > now + sf20DlpMaxReviewDays * 24 * 60 * 60 * 1_000
    ) {
      throw validationFailed('DLP_REVIEW_EXPIRY_INVALID');
    }

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const assessment = await this.findAssessmentById(client, ctx.tenantId, assessmentId);
      if (!assessment) throw permissionDenied();
      if (!assessment.requires_review) {
        throw validationFailed('DLP_REVIEW_NOT_REQUIRED');
      }

      await this.assertActiveReviewer(client, ctx);
      await this.assertAssessmentAccess(client, ctx, assessment);

      const inserted = await client.query(
        `
          INSERT INTO dlp_review_decisions (
            tenant_id, assessment_id, reviewer_user_id, decision, reason_code, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING review_id, decision, reason_code, reviewed_at, expires_at
        `,
        [
          ctx.tenantId,
          assessment.assessment_id,
          ctx.userId,
          input.decision,
          input.reasonCode,
          expiresAt,
        ],
      );
      const review = inserted.rows[0] as DlpReviewRow | undefined;
      if (!review) throw new Error('dlp review insert returned no row');

      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'DLP_REVIEW_RECORDED',
          targetType: 'dlp_assessment',
          targetId: assessment.assessment_id,
          matterId: assessment.matter_id,
          metadata: this.egressAuditMetadata(assessment, {
            purpose: 'manual_review',
            review,
            reasonCode: review.reason_code,
          }),
        },
        client,
      );

      return dlpReviewResponseSchema.parse({
        assessmentId: assessment.assessment_id,
        reviewId: review.review_id,
        decision: review.decision,
        reasonCode: review.reason_code,
        expiresAt: iso(review.expires_at),
        reviewedAt: iso(review.reviewed_at),
      });
    });
  }

  async evaluateDocumentEgress(
    client: QueryClient,
    source: DlpDocumentEgressSource,
  ): Promise<DlpEgressDecision> {
    await this.assertDocumentEgressAuthorization(client, source);
    const assessment = await this.ensureDocumentAssessment(client, source);
    return this.applyReviewGate(client, assessment, {
      purpose: source.purpose,
      matterId: source.matterId,
      actor:
        source.authorization.kind === 'internal'
          ? {
              actorId: source.authorization.userId,
              sessionId: source.authorization.sessionId ?? null,
            }
          : { actorId: null, sessionId: null },
    });
  }

  async evaluateEmailEgress(
    client: QueryClient,
    source: DlpEmailEgressSource,
  ): Promise<DlpEgressDecision> {
    const decision = await this.permissionService.canReadMatter(
      {
        tenantId: source.tenantId,
        userId: source.authorization.userId,
        ...(source.authorization.sessionId
          ? { sessionId: source.authorization.sessionId }
          : {}),
      },
      source.matterId,
    );
    if (decision.effect !== 'ALLOW') throw permissionDenied();

    const assessment = await this.ensureEmailAssessment(client, source);
    return this.applyReviewGate(client, assessment, {
      purpose: source.purpose,
      matterId: source.matterId,
      actor: {
        actorId: source.authorization.userId,
        sessionId: source.authorization.sessionId ?? null,
      },
    });
  }

  async checkModelEgress(
    client: QueryClient,
    source: DlpModelEgressSource,
  ): Promise<DlpModelEgressResult> {
    const evaluation = this.evaluateText(source.text);
    const metadata = {
      scope_type: 'model_egress',
      scope_id: source.egressId,
      result_count: evaluation.findingCount,
      hash: evaluation.resultHash,
      dlp_scan_state: evaluation.scanState,
      dlp_policy_version: evaluation.policyVersion,
      dlp_restricted_finding_count: evaluation.restrictedFindingCount,
      dlp_requires_review: evaluation.requiresReview,
      ...(evaluation.reasonCode ? { reason_code: evaluation.reasonCode } : {}),
      ...(source.documentId ? { document_id: source.documentId } : {}),
      ...(source.versionId ? { version_id: source.versionId } : {}),
      ...(source.matterId ? { matter_id: source.matterId } : {}),
    };

    await this.auditService.log(
      {
        tenantId: source.tenantId,
        action: 'DLP_SCAN_COMPLETED',
        targetType: 'model_egress',
        targetId: source.egressId,
        matterId: source.matterId ?? null,
        metadata,
      },
      client,
    );

    if (evaluation.scanState === 'clean') {
      return { allowed: true, findingCount: 0, resultHash: evaluation.resultHash };
    }

    await this.auditService.log(
      {
        tenantId: source.tenantId,
        action: 'DLP_EGRESS_BLOCKED',
        targetType: 'model_egress',
        targetId: source.egressId,
        matterId: source.matterId ?? null,
        result: 'denied',
        metadata,
      },
      client,
    );

    return {
      allowed: false,
      findingCount: evaluation.findingCount,
      resultHash: evaluation.resultHash,
    };
  }

  async scanAndRecord(
    client: QueryClient,
    source: DlpScanSource,
  ): Promise<DlpScanRecordResult> {
    const detections = this.scanText(source.text);
    const findings = await this.recordDetections(client, source, detections);

    await this.auditService.log(
      {
        tenantId: source.tenantId,
        action: 'DLP_SCAN_COMPLETED',
        targetType: source.sourceType,
        targetId: source.sourceId,
        matterId: source.matterId ?? null,
        metadata: {
          scope_type: source.sourceType,
          scope_id: source.sourceId,
          result_count: findings.length,
          hash: scanResultHash(detections),
        },
      },
      client,
    );

    return { findings };
  }

  private async assertActiveReviewer(
    client: QueryClient,
    ctx: PermissionContext,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const reviewer = result.rows[0] as ReviewerRoleRow | undefined;
    if (
      !reviewer ||
      reviewer.status !== 'active' ||
      !reviewRoles.has(reviewer.role)
    ) {
      throw permissionDenied();
    }
  }

  private async assertAssessmentAccess(
    client: QueryClient,
    ctx: PermissionContext,
    assessment: PersistedDlpAssessmentRow,
  ): Promise<void> {
    if (assessment.document_id) {
      const decision = await this.permissionService.canReadDocument(ctx, assessment.document_id);
      if (decision.effect === 'ALLOW') return;
      throw permissionDenied();
    }
    if (assessment.matter_id) {
      const decision = await this.permissionService.canReadMatter(ctx, assessment.matter_id);
      if (decision.effect === 'ALLOW') return;
      throw permissionDenied();
    }
    if (assessment.source_type !== 'email') throw permissionDenied();

    const result = await client.query(
      `
        SELECT DISTINCT matter_id
        FROM (
          SELECT f.matter_id
          FROM email_matter_filings f
          WHERE f.tenant_id = $1
            AND f.email_id = $2
          UNION
          SELECT d.matter_id
          FROM email_document_links l
          JOIN documents d
            ON d.tenant_id = l.tenant_id
           AND d.document_id = l.document_id
          WHERE l.tenant_id = $1
            AND l.email_id = $2
        ) linked_matters
        ORDER BY matter_id
        LIMIT 100
      `,
      [ctx.tenantId, assessment.source_id],
    );
    for (const row of result.rows as { matter_id: string }[]) {
      const decision = await this.permissionService.canReadMatter(ctx, row.matter_id);
      if (decision.effect === 'ALLOW') return;
    }
    throw permissionDenied();
  }

  private async assertDocumentEgressAuthorization(
    client: QueryClient,
    source: DlpDocumentEgressSource,
  ): Promise<void> {
    if (source.authorization.kind === 'internal') {
      const decision = await this.permissionService.canReadDocument(
        {
          tenantId: source.tenantId,
          userId: source.authorization.userId,
          ...(source.authorization.sessionId
            ? { sessionId: source.authorization.sessionId }
            : {}),
        },
        source.documentId,
      );
      if (decision.effect !== 'ALLOW') throw permissionDenied();
      return;
    }

    if (source.purpose !== 'external_ticket') throw permissionDenied();
    const result = await client.query(
      `
        SELECT l.link_id
        FROM external_secure_links l
        JOIN external_workspaces w
          ON w.tenant_id = l.tenant_id
         AND w.workspace_id = l.workspace_id
        JOIN external_workspace_members m
          ON m.tenant_id = l.tenant_id
         AND m.workspace_id = l.workspace_id
         AND m.external_user_id = l.external_user_id
        JOIN external_users u
          ON u.tenant_id = l.tenant_id
         AND u.external_user_id = l.external_user_id
        WHERE l.tenant_id = $1
          AND l.link_id = $2
          AND l.document_id = $3
          AND l.version_id IS NOT DISTINCT FROM $4::uuid
          AND w.matter_id = $5
          AND l.status = 'active'
          AND l.expires_at > now()
          AND w.status = 'active'
          AND w.expires_at > now()
          AND m.status = 'active'
          AND u.status = 'active'
          AND (
            l.nda_required = false
            OR EXISTS (
              SELECT 1
              FROM external_nda_acceptances a
              WHERE a.tenant_id = l.tenant_id
                AND a.link_id = l.link_id
                AND a.external_user_id = l.external_user_id
            )
          )
        LIMIT 1
      `,
      [
        source.tenantId,
        source.authorization.externalLinkId,
        source.documentId,
        source.versionId,
        source.matterId,
      ],
    );
    if (!result.rows[0]) throw permissionDenied();
  }

  private async ensureDocumentAssessment(
    client: QueryClient,
    source: DlpDocumentEgressSource,
  ): Promise<PersistedDlpAssessmentRow> {
    const sourceId = source.versionId ?? source.documentId;
    const canonical = await client.query(
      `
        SELECT v.version_id, cd.extraction_status, cd.extraction_method,
          cd.failure_reason_code, char_length(cd.body_text) AS body_length,
          CASE
            WHEN char_length(cd.body_text) <= $4 THEN cd.body_text
            ELSE NULL
          END AS scan_text
        FROM document_versions v
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = v.tenant_id
         AND cd.version_id = v.version_id
        WHERE v.tenant_id = $1
          AND v.document_id = $2
          AND v.version_id = $3
        LIMIT 1
      `,
      [source.tenantId, source.documentId, source.versionId, sf20DlpMaxScanCharacters],
    );
    const row = canonical.rows[0] as CanonicalDocumentRow | undefined;

    let text: string | null = null;
    let unscannableReasonCode: DlpUnscannableReasonCode | undefined;
    if (!row) {
      unscannableReasonCode = 'assessment_missing';
    } else if (!row.extraction_status) {
      unscannableReasonCode = 'assessment_missing';
    } else if (row.extraction_status === 'pending') {
      unscannableReasonCode =
        row.extraction_method === 'ocr_required' ? 'ocr_pending' : 'text_pending';
    } else if (row.extraction_status === 'ocr_pending') {
      unscannableReasonCode = 'ocr_pending';
    } else if (row.extraction_status === 'failed') {
      unscannableReasonCode = failureReasonToUnscannable(row.failure_reason_code);
    } else if (row.extraction_status !== 'ready') {
      unscannableReasonCode = 'parser_failed';
    } else if (Number(row.body_length ?? 0) > sf20DlpMaxScanCharacters) {
      unscannableReasonCode = 'input_oversize';
    } else if (!row.scan_text || row.scan_text.trim().length === 0) {
      unscannableReasonCode = 'no_text';
    } else {
      text = row.scan_text;
    }

    return this.findOrRecordAssessment(client, {
      tenantId: source.tenantId,
      sourceType: 'document',
      sourceId,
      matterId: source.matterId,
      documentId: source.documentId,
      versionId: source.versionId,
      text,
      ...(unscannableReasonCode ? { unscannableReasonCode } : {}),
    });
  }

  private async ensureEmailAssessment(
    client: QueryClient,
    source: DlpEmailEgressSource,
  ): Promise<PersistedDlpAssessmentRow> {
    const result = await client.query(
      `
        SELECT assessment_id, tenant_id, source_type, source_id, matter_id, document_id, version_id,
          scan_state, reason_code, finding_count, restricted_finding_count,
          requires_review, policy_version, result_hash, created_at
        FROM dlp_scan_assessments
        WHERE tenant_id = $1
          AND source_type = 'email'
          AND source_id = $2
          AND policy_version = $3
        ORDER BY created_at DESC, assessment_id DESC
        LIMIT 1
      `,
      [source.tenantId, source.emailId, sf20DlpPolicyVersion],
    );
    const existing = result.rows[0] as PersistedDlpAssessmentRow | undefined;
    if (existing) return existing;
    return this.findOrRecordAssessment(client, {
      tenantId: source.tenantId,
      sourceType: 'email',
      sourceId: source.emailId,
      matterId: source.matterId,
      text: null,
      unscannableReasonCode: 'assessment_missing',
    });
  }

  private async findOrRecordAssessment(
    client: QueryClient,
    source: DlpAssessmentSource,
  ): Promise<PersistedDlpAssessmentRow> {
    const evaluation = this.evaluateText(source.text, {
      ...(source.unscannableReasonCode
        ? { unscannableReasonCode: source.unscannableReasonCode }
        : {}),
      ...(source.options ? { options: source.options } : {}),
    });
    const result = await client.query(
      `
        SELECT assessment_id, tenant_id, source_type, source_id, matter_id, document_id, version_id,
          scan_state, reason_code, finding_count, restricted_finding_count,
          requires_review, policy_version, result_hash, created_at
        FROM dlp_scan_assessments
        WHERE tenant_id = $1
          AND source_type = $2
          AND source_id = $3
          AND policy_version = $4
          AND result_hash = $5
          AND document_id IS NOT DISTINCT FROM $6::uuid
          AND version_id IS NOT DISTINCT FROM $7::uuid
        LIMIT 1
      `,
      [
        source.tenantId,
        source.sourceType,
        source.sourceId,
        evaluation.policyVersion,
        evaluation.resultHash,
        source.documentId ?? null,
        source.versionId ?? null,
      ],
    );
    const existing = result.rows[0] as PersistedDlpAssessmentRow | undefined;
    if (existing) return existing;

    const recorded = await this.assessAndRecord(client, source);
    return {
      assessment_id: recorded.assessmentId,
      tenant_id: source.tenantId,
      source_type: source.sourceType,
      source_id: source.sourceId,
      matter_id: source.matterId ?? null,
      document_id: source.documentId ?? null,
      version_id: source.versionId ?? null,
      scan_state: recorded.scanState,
      reason_code: recorded.reasonCode,
      finding_count: recorded.findingCount,
      restricted_finding_count: recorded.restrictedFindingCount,
      requires_review: recorded.requiresReview,
      policy_version: recorded.policyVersion,
      result_hash: recorded.resultHash,
      created_at: recorded.createdAt,
    };
  }

  private async findAssessmentById(
    client: QueryClient,
    tenantId: string,
    assessmentId: string,
  ): Promise<PersistedDlpAssessmentRow | null> {
    const result = await client.query(
      `
        SELECT assessment_id, tenant_id, source_type, source_id, matter_id, document_id, version_id,
          scan_state, reason_code, finding_count, restricted_finding_count,
          requires_review, policy_version, result_hash, created_at
        FROM dlp_scan_assessments
        WHERE tenant_id = $1
          AND assessment_id = $2
        LIMIT 1
      `,
      [tenantId, assessmentId],
    );
    return (result.rows[0] as PersistedDlpAssessmentRow | undefined) ?? null;
  }

  private async applyReviewGate(
    client: QueryClient,
    assessment: PersistedDlpAssessmentRow,
    input: {
      purpose: DlpEgressPurpose;
      matterId: string;
      actor: { actorId: string | null; sessionId: string | null };
    },
  ): Promise<DlpEgressDecision> {
    if (!assessment.requires_review) {
      return this.mapEgressDecision(assessment, true, null);
    }

    const result = await client.query(
      `
        SELECT review_id, decision, reason_code, reviewed_at, expires_at,
          (expires_at > now()) AS is_unexpired
        FROM dlp_review_decisions
        WHERE tenant_id = $1
          AND assessment_id = $2
        ORDER BY reviewed_at DESC, (decision = 'deny') DESC, review_id DESC
        LIMIT 1
      `,
      [assessment.tenant_id, assessment.assessment_id],
    );
    const review = result.rows[0] as DlpReviewRow | undefined;
    const metadata = this.egressAuditMetadata(assessment, {
      purpose: input.purpose,
      matterId: input.matterId,
      ...(review ? { review } : {}),
      reasonCode:
        review && review.is_unexpired === false
          ? 'DLP_REVIEW_EXPIRED'
          : review?.decision === 'deny'
            ? 'DLP_REVIEW_DENIED'
            : 'DLP_REVIEW_REQUIRED',
    });

    if (review?.decision !== 'allow' || review.is_unexpired !== true) {
      await this.auditService.log(
        {
          tenantId: assessment.tenant_id,
          actorId: input.actor.actorId,
          sessionId: input.actor.sessionId,
          action: 'DLP_EGRESS_BLOCKED',
          targetType: assessment.source_type,
          targetId: assessment.source_id,
          matterId: input.matterId,
          result: 'denied',
          metadata,
        },
        client,
      );
      return this.mapEgressDecision(assessment, false, review?.review_id ?? null);
    }

    await this.auditService.log(
      {
        tenantId: assessment.tenant_id,
        actorId: input.actor.actorId,
        sessionId: input.actor.sessionId,
        action: 'DLP_REVIEW_APPLIED',
        targetType: assessment.source_type,
        targetId: assessment.source_id,
        matterId: input.matterId,
        metadata: this.egressAuditMetadata(assessment, {
          purpose: input.purpose,
          matterId: input.matterId,
          review,
          reasonCode: review.reason_code,
        }),
      },
      client,
    );
    return this.mapEgressDecision(assessment, true, review.review_id);
  }

  private mapEgressDecision(
    assessment: PersistedDlpAssessmentRow,
    allowed: boolean,
    reviewId: string | null,
  ): DlpEgressDecision {
    return {
      allowed,
      assessmentId: assessment.assessment_id,
      reviewId,
      scanState: assessment.scan_state,
      reasonCode: assessment.reason_code,
      findingCount: assessment.finding_count,
      restrictedFindingCount: assessment.restricted_finding_count,
      requiresReview: assessment.requires_review,
      policyVersion: assessment.policy_version,
      resultHash: assessment.result_hash,
    };
  }

  private egressAuditMetadata(
    assessment: PersistedDlpAssessmentRow,
    input: {
      purpose: DlpEgressPurpose | 'manual_review';
      matterId?: string | null;
      review?: DlpReviewRow;
      reasonCode: string;
    },
  ) {
    return {
      scope_type: assessment.source_type,
      scope_id: assessment.source_id,
      result_count: assessment.finding_count,
      hash: assessment.result_hash,
      channel: input.purpose,
      reason_code: input.reasonCode,
      dlp_assessment_id: assessment.assessment_id,
      dlp_scan_state: assessment.scan_state,
      dlp_policy_version: assessment.policy_version,
      dlp_restricted_finding_count: assessment.restricted_finding_count,
      dlp_requires_review: assessment.requires_review,
      ...(input.review
        ? {
            dlp_review_id: input.review.review_id,
            expires_at: iso(input.review.expires_at),
          }
        : {}),
      ...(assessment.document_id ? { document_id: assessment.document_id } : {}),
      ...(assessment.version_id ? { version_id: assessment.version_id } : {}),
      ...((input.matterId ?? assessment.matter_id)
        ? { matter_id: input.matterId ?? assessment.matter_id }
        : {}),
    };
  }

  private assessmentAuditMetadata(
    source: DlpAssessmentSource,
    evaluation: DlpAssessmentEvaluation,
    assessmentId: string,
  ) {
    return {
      scope_type: source.sourceType,
      scope_id: source.sourceId,
      result_count: evaluation.findingCount,
      hash: evaluation.resultHash,
      dlp_assessment_id: assessmentId,
      dlp_scan_state: evaluation.scanState,
      dlp_policy_version: evaluation.policyVersion,
      dlp_restricted_finding_count: evaluation.restrictedFindingCount,
      dlp_requires_review: evaluation.requiresReview,
      ...(evaluation.reasonCode ? { reason_code: evaluation.reasonCode } : {}),
      ...(source.documentId ? { document_id: source.documentId } : {}),
      ...(source.versionId ? { version_id: source.versionId } : {}),
      ...(source.matterId ? { matter_id: source.matterId } : {}),
    };
  }

  private async recordDetections(
    client: QueryClient,
    source: {
      tenantId: string;
      sourceType: DlpSourceType;
      sourceId: string;
      matterId?: string | null;
      documentId?: string | null;
      versionId?: string | null;
    },
    detections: readonly DlpDetection[],
  ): Promise<RecordedDlpFinding[]> {
    const findings: RecordedDlpFinding[] = [];
    for (const detection of detections) {
      const result = await client.query(
        `
          INSERT INTO dlp_findings (
            tenant_id, source_type, source_id, matter_id, document_id, version_id,
            rule_id, finding_type, value_hash, evidence_hash, start_offset,
            end_offset, confidence
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (tenant_id, source_type, source_id, rule_id, value_hash, start_offset)
          DO NOTHING
          RETURNING finding_id
        `,
        [
          source.tenantId,
          source.sourceType,
          source.sourceId,
          source.matterId ?? null,
          source.documentId ?? null,
          source.versionId ?? null,
          detection.ruleId,
          detection.findingType,
          detection.valueHash,
          detection.evidenceHash,
          detection.startOffset,
          detection.endOffset,
          detection.confidence,
        ],
      );
      let row = result.rows[0] as DlpFindingRow | undefined;
      if (!row) {
        const existing = await client.query(
          `
            SELECT finding_id
            FROM dlp_findings
            WHERE tenant_id = $1
              AND source_type = $2
              AND source_id = $3
              AND rule_id = $4
              AND value_hash = $5
              AND start_offset = $6
            LIMIT 1
          `,
          [
            source.tenantId,
            source.sourceType,
            source.sourceId,
            detection.ruleId,
            detection.valueHash,
            detection.startOffset,
          ],
        );
        row = existing.rows[0] as DlpFindingRow | undefined;
      }
      if (!row) throw new Error('dlp finding insert returned no row');

      findings.push({ ...detection, findingId: row.finding_id });
      await this.auditService.log(
        {
          tenantId: source.tenantId,
          action: 'DLP_FINDING_RECORDED',
          targetType: 'dlp_finding',
          targetId: row.finding_id,
          matterId: source.matterId ?? null,
          metadata: {
            scope_type: source.sourceType,
            scope_id: source.sourceId,
            hash: detection.valueHash,
          },
        },
        client,
      );
    }
    return findings;
  }
}
