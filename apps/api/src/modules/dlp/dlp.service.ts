import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  dlpRestrictedFindingTypes,
  sf20DlpPolicyVersion,
  sf20DlpTotalFindingReviewThreshold,
  type DlpAssessmentSummary,
  type DlpDetection,
  type DlpScanOptions,
  type DlpUnscannableReasonCode,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

export type DlpSourceType = 'document' | 'email' | 'attachment' | 'text' | 'email_egress';

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

interface DlpFindingRow {
  finding_id: string;
}

interface DlpAssessmentRow {
  assessment_id: string;
  created_at: Date | string;
}

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

@Injectable()
export class DlpService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SensitiveDataDetector) private readonly detector: SensitiveDataDetector,
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
