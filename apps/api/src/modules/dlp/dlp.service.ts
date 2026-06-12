import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DlpDetection } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

export type DlpSourceType = 'document' | 'email' | 'attachment' | 'text';

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

interface DlpFindingRow {
  finding_id: string;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function scanResultHash(detections: readonly DlpDetection[]): string {
  return sha256Hex(detections.map((item) => `${item.ruleId}:${item.valueHash}`).join('|'));
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

  async scanAndRecord(
    client: QueryClient,
    source: DlpScanSource,
  ): Promise<DlpScanRecordResult> {
    const detections = this.scanText(source.text);
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
      if (!row) {
        throw new Error('dlp finding insert returned no row');
      }
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
}
