import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, SendOptions } from 'pg-boss';
import type {
  CreateDocumentComparisonRequestDto,
  DocumentComparisonChangeType,
  DocumentComparisonDiffHunkDto,
  DocumentComparisonDto,
  DocumentComparisonStatus,
  DocumentComparisonSummaryDto,
  PermissionDecision,
  TenantId,
} from '@amic-vault/shared';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../../common/process-role';
import { parseContractText, type ParsedClause } from '../../contract-intel/contract-parser';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { PermissionService } from '../../permission/permission.service';
import { TenantContextService } from '../../tenant/tenant-context';
import { pgBossDbFromPoolClient } from '../extraction/pool-client-db-adapter';

const parserVersion = 'b11-clause-diff-v1';
const storedClauseTextLimit = 32_000;
const diffTokenProductLimit = 250_000;
const diffHunkTextLimit = 4_000;
export const documentComparisonQueueName = 'document.comparison';
export const documentComparisonDeadLetterQueueName = 'document.comparison.dead';

export interface DocumentComparisonJobPayload {
  tenantId: TenantId;
  comparisonId: string;
  documentId: string;
  actorUserId: string;
  baseVersionId: string;
  targetVersionId: string;
}

export function isDocumentComparisonQueueWorkerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return queueWorkerEnabled('DOCUMENT_COMPARISON_QUEUE_WORKER_ENABLED', env);
}

export function documentComparisonQueueSendOptions(
  payload: DocumentComparisonJobPayload,
  client: PoolClient,
): SendOptions {
  return {
    singletonKey: payload.comparisonId,
    retryLimit: 3,
    retryDelay: 1,
    retryBackoff: true,
    deadLetter: documentComparisonDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

interface DocumentComparisonTargetRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
}

interface VersionTextRow {
  version_id: string;
  version_no: number;
  body_text: string;
  extraction_status: string;
}

interface DocumentVersionComparisonRow {
  comparison_id: string;
  document_id: string;
  matter_id: string;
  base_version_id: string;
  target_version_id: string;
  status: DocumentComparisonStatus;
  summary_json: unknown;
  failure_reason_code: string | null;
  created_at: Date;
  completed_at: Date | null;
}

interface ComparisonClauseChangeRow {
  change_id: string;
  sequence_no: number;
  change_type: DocumentComparisonChangeType;
  clause_number: string;
  heading_text: string;
  base_text: string;
  target_text: string;
  diff_hunks: unknown;
}

interface ClauseRef {
  key: string;
  clauseNumber: string;
  headingText: string;
  startOffset: number;
  endOffset: number;
  text: string;
  textHash: string;
}

interface ComputedClauseChange {
  sequenceNo: number;
  changeType: DocumentComparisonChangeType;
  key: string;
  clauseNumber: string;
  headingText: string;
  baseStartOffset: number | null;
  baseEndOffset: number | null;
  targetStartOffset: number | null;
  targetEndOffset: number | null;
  baseText: string;
  targetText: string;
  baseTextHash: string | null;
  targetTextHash: string | null;
  diffHunks: DocumentComparisonDiffHunkDto[];
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function clipText(value: string, limit = storedClauseTextLimit): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 12))}[truncated]`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeClauseKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^0-9a-z가-힣_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSummary(value: unknown): DocumentComparisonSummaryDto {
  if (!isRecord(value)) return emptySummary(0);
  return {
    addedCount: numberValue(value.addedCount),
    deletedCount: numberValue(value.deletedCount),
    modifiedCount: numberValue(value.modifiedCount),
    unchangedCount: numberValue(value.unchangedCount),
    totalCount: numberValue(value.totalCount),
    durationMs: numberValue(value.durationMs),
  };
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptySummary(durationMs: number): DocumentComparisonSummaryDto {
  return {
    addedCount: 0,
    deletedCount: 0,
    modifiedCount: 0,
    unchangedCount: 0,
    totalCount: 0,
    durationMs,
  };
}

function summarizeChanges(
  changes: readonly ComputedClauseChange[],
  durationMs: number,
): DocumentComparisonSummaryDto {
  const summary = emptySummary(durationMs);
  for (const change of changes) {
    if (change.changeType === 'added') summary.addedCount += 1;
    if (change.changeType === 'deleted') summary.deletedCount += 1;
    if (change.changeType === 'modified') summary.modifiedCount += 1;
    if (change.changeType === 'unchanged') summary.unchangedCount += 1;
  }
  summary.totalCount = changes.length;
  return summary;
}

function parseDiffHunks(value: unknown): DocumentComparisonDiffHunkDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const op = item.op;
    const text = item.text;
    if (op !== 'equal' && op !== 'insert' && op !== 'delete') return [];
    if (typeof text !== 'string') return [];
    return [{ op, text }];
  });
}

function mapComparison(
  row: DocumentVersionComparisonRow,
  changes: readonly ComparisonClauseChangeRow[],
): DocumentComparisonDto {
  return {
    comparisonId: row.comparison_id,
    documentId: row.document_id,
    matterId: row.matter_id,
    baseVersionId: row.base_version_id,
    targetVersionId: row.target_version_id,
    status: row.status,
    summary: parseSummary(row.summary_json),
    changes: changes.map((change) => ({
      changeId: change.change_id,
      sequenceNo: change.sequence_no,
      changeType: change.change_type,
      clauseNumber: change.clause_number,
      headingText: change.heading_text,
      baseText: change.base_text,
      targetText: change.target_text,
      diffHunks: parseDiffHunks(change.diff_hunks),
    })),
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    failureReasonCode: row.failure_reason_code,
  };
}

function tokeniseForDiff(value: string): string[] {
  return value.match(/\s+|\S+/g) ?? [];
}

function collapseDiffHunks(hunks: DocumentComparisonDiffHunkDto[]): DocumentComparisonDiffHunkDto[] {
  const collapsed: DocumentComparisonDiffHunkDto[] = [];
  for (const hunk of hunks) {
    const clipped = clipText(hunk.text, diffHunkTextLimit);
    if (!clipped) continue;
    const previous = collapsed[collapsed.length - 1];
    if (previous?.op === hunk.op) {
      previous.text = clipText(`${previous.text}${clipped}`, diffHunkTextLimit);
    } else {
      collapsed.push({ op: hunk.op, text: clipped });
    }
  }
  return collapsed;
}

function prefixSuffixDiff(
  baseText: string,
  targetText: string,
): DocumentComparisonDiffHunkDto[] {
  let prefix = 0;
  while (
    prefix < baseText.length &&
    prefix < targetText.length &&
    baseText[prefix] === targetText[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix + prefix < baseText.length &&
    suffix + prefix < targetText.length &&
    baseText[baseText.length - 1 - suffix] === targetText[targetText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const hunks: DocumentComparisonDiffHunkDto[] = [];
  if (prefix > 0) hunks.push({ op: 'equal', text: baseText.slice(0, prefix) });
  const baseMiddle = baseText.slice(prefix, suffix > 0 ? baseText.length - suffix : baseText.length);
  const targetMiddle = targetText.slice(
    prefix,
    suffix > 0 ? targetText.length - suffix : targetText.length,
  );
  if (baseMiddle) hunks.push({ op: 'delete', text: baseMiddle });
  if (targetMiddle) hunks.push({ op: 'insert', text: targetMiddle });
  if (suffix > 0) hunks.push({ op: 'equal', text: baseText.slice(baseText.length - suffix) });
  return collapseDiffHunks(hunks);
}

function lcsDiff(baseText: string, targetText: string): DocumentComparisonDiffHunkDto[] {
  if (baseText === targetText) return [{ op: 'equal', text: clipText(baseText, diffHunkTextLimit) }];
  const baseTokens = tokeniseForDiff(baseText);
  const targetTokens = tokeniseForDiff(targetText);
  if (baseTokens.length * targetTokens.length > diffTokenProductLimit) {
    return prefixSuffixDiff(baseText, targetText);
  }

  const columns = targetTokens.length + 1;
  const table = new Uint16Array((baseTokens.length + 1) * columns);
  const tableAt = (row: number, column: number): number => table[row * columns + column] ?? 0;
  for (let i = baseTokens.length - 1; i >= 0; i -= 1) {
    for (let j = targetTokens.length - 1; j >= 0; j -= 1) {
      const index = i * columns + j;
      table[index] =
        baseTokens[i] === targetTokens[j]
          ? tableAt(i + 1, j + 1) + 1
          : Math.max(tableAt(i + 1, j), tableAt(i, j + 1));
    }
  }

  const hunks: DocumentComparisonDiffHunkDto[] = [];
  let i = 0;
  let j = 0;
  while (i < baseTokens.length && j < targetTokens.length) {
    const baseToken = baseTokens[i] ?? '';
    const targetToken = targetTokens[j] ?? '';
    if (baseToken === targetToken) {
      hunks.push({ op: 'equal', text: baseToken });
      i += 1;
      j += 1;
    } else if (tableAt(i + 1, j) >= tableAt(i, j + 1)) {
      hunks.push({ op: 'delete', text: baseToken });
      i += 1;
    } else {
      hunks.push({ op: 'insert', text: targetToken });
      j += 1;
    }
  }
  while (i < baseTokens.length) {
    hunks.push({ op: 'delete', text: baseTokens[i] ?? '' });
    i += 1;
  }
  while (j < targetTokens.length) {
    hunks.push({ op: 'insert', text: targetTokens[j] ?? '' });
    j += 1;
  }
  return collapseDiffHunks(hunks);
}

function clauseRefFromParsed(text: string, clause: ParsedClause, fallbackIndex: number): ClauseRef {
  const rawText = text.slice(clause.startOffset, clause.endOffset).trim();
  const headingText = clause.headingText || firstLine(rawText) || clause.clauseNumber;
  const clauseNumber = clause.clauseNumber || String(fallbackIndex + 1);
  const keyBase = normalizeClauseKey(`${clause.clauseKind}:${clauseNumber}`);
  return {
    key: keyBase || sha256Hex(headingText).slice(0, 24),
    clauseNumber: clauseNumber.slice(0, 80),
    headingText: headingText.slice(0, 240),
    startOffset: clause.startOffset,
    endOffset: clause.endOffset,
    text: rawText,
    textHash: clause.textHash,
  };
}

function parseClauseRefs(text: string): ClauseRef[] {
  return parseContractText(text).clauses.map((clause, index) =>
    clauseRefFromParsed(text, clause, index),
  );
}

function computeChanges(baseText: string, targetText: string): ComputedClauseChange[] {
  const baseClauses = parseClauseRefs(baseText);
  const targetClauses = parseClauseRefs(targetText);
  const baseByKey = new Map(baseClauses.map((clause) => [clause.key, clause]));
  const targetByKey = new Map(targetClauses.map((clause) => [clause.key, clause]));
  const orderedKeys = [
    ...baseClauses.map((clause) => clause.key),
    ...targetClauses.flatMap((clause) => (baseByKey.has(clause.key) ? [] : [clause.key])),
  ];

  return orderedKeys.map((key, index) => {
    const base = baseByKey.get(key) ?? null;
    const target = targetByKey.get(key) ?? null;
    const changeType: DocumentComparisonChangeType =
      base && target
        ? normalizeText(base.text) === normalizeText(target.text)
          ? 'unchanged'
          : 'modified'
        : base
          ? 'deleted'
          : 'added';
    const baseClauseText = base?.text ?? '';
    const targetClauseText = target?.text ?? '';
    return {
      sequenceNo: index,
      changeType,
      key,
      clauseNumber: (target?.clauseNumber ?? base?.clauseNumber ?? String(index + 1)).slice(0, 80),
      headingText: (target?.headingText ?? base?.headingText ?? '').slice(0, 240),
      baseStartOffset: base?.startOffset ?? null,
      baseEndOffset: base?.endOffset ?? null,
      targetStartOffset: target?.startOffset ?? null,
      targetEndOffset: target?.endOffset ?? null,
      baseText: clipText(baseClauseText),
      targetText: clipText(targetClauseText),
      baseTextHash: base ? sha256Hex(baseClauseText) : null,
      targetTextHash: target ? sha256Hex(targetClauseText) : null,
      diffHunks:
        changeType === 'added'
          ? [{ op: 'insert', text: clipText(targetClauseText, diffHunkTextLimit) }]
          : changeType === 'deleted'
            ? [{ op: 'delete', text: clipText(baseClauseText, diffHunkTextLimit) }]
            : changeType === 'modified'
              ? lcsDiff(baseClauseText, targetClauseText)
              : [],
    };
  });
}

@Injectable()
export class DocumentComparisonService implements OnModuleInit {
  private readonly logger = new Logger(DocumentComparisonService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isDocumentComparisonQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async createComparison(
    actorUserId: string,
    documentId: string,
    input: CreateDocumentComparisonRequestDto,
  ): Promise<DocumentComparisonDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findDocumentTarget(context.tenantId, documentId, tx);
      if (!target) throw notFoundDenied();
      await this.assertCanReadDocument(context.tenantId, actorUserId, documentId);
      await this.loadVersionTexts(context.tenantId, documentId, input, tx);
      const comparison = await this.insertPendingComparison(tx, context.tenantId, target, actorUserId, input);
      const payload: DocumentComparisonJobPayload = {
        tenantId: context.tenantId,
        comparisonId: comparison.comparison_id,
        documentId,
        actorUserId,
        baseVersionId: input.baseVersionId,
        targetVersionId: input.targetVersionId,
      };
      const jobId = await this.enqueueComparisonJob(payload, tx);
      const queued = await this.attachJobId(
        tx,
        context.tenantId,
        comparison.comparison_id,
        jobId,
      );
      return mapComparison(queued, []);
    });
  }

  async getComparison(
    actorUserId: string,
    documentId: string,
    comparisonId: string,
  ): Promise<DocumentComparisonDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const comparison = await this.findComparison(context.tenantId, documentId, comparisonId, tx);
      if (!comparison) throw notFoundDenied();
      await this.assertCanReadDocument(context.tenantId, actorUserId, documentId);
      const changes = await this.listChanges(tx, context.tenantId, comparisonId);
      return mapComparison(comparison, changes);
    });
  }

  async handleQueuedJob(job: Job<DocumentComparisonJobPayload>): Promise<void> {
    try {
      await this.completeQueuedComparison(job.data);
    } catch (error) {
      await this.markComparisonFailed(job.data, 'COMPARISON_JOB_FAILED').catch(() => undefined);
      throw error;
    }
  }

  private async completeQueuedComparison(payload: DocumentComparisonJobPayload): Promise<void> {
    const startedAt = Date.now();
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      const comparison = await this.findComparison(
        payload.tenantId,
        payload.documentId,
        payload.comparisonId,
        tx,
      );
      if (!comparison) throw new Error('document comparison job target missing');
      if (comparison.status === 'completed') return;
      const target = await this.findDocumentTarget(payload.tenantId, payload.documentId, tx);
      if (!target) throw new Error('document comparison document target missing');
      await this.assertCanReadDocument(payload.tenantId, payload.actorUserId, payload.documentId);
      const versions = await this.loadVersionTexts(
        payload.tenantId,
        payload.documentId,
        {
          baseVersionId: payload.baseVersionId,
          targetVersionId: payload.targetVersionId,
        },
        tx,
      );
      const changes = computeChanges(versions.base.body_text, versions.target.body_text);
      const durationMs = Date.now() - startedAt;
      const summary = summarizeChanges(changes, durationMs);
      await this.insertClauseChanges(tx, payload.tenantId, comparison.comparison_id, target, changes);
      const audit = await this.auditService.log(
        {
          tenantId: payload.tenantId,
          actorId: payload.actorUserId,
          action: 'DOCUMENT_COMPARISON_CREATED',
          targetType: 'document',
          targetId: payload.documentId,
          matterId: target.matter_id,
          metadata: {
            document_id: payload.documentId,
            matter_id: target.matter_id,
            base_version_id: payload.baseVersionId,
            version_id: payload.targetVersionId,
            result_count: summary.totalCount,
            clause_count: summary.totalCount,
            duration_ms: summary.durationMs,
            parser_status: 'success',
          },
        },
        tx,
      );
      const completed = await this.updateCompletedComparison(
        tx,
        payload.tenantId,
        comparison.comparison_id,
        summary,
      );
      await this.attachAuditEvent(tx, payload.tenantId, completed.comparison_id, audit.eventId);
    });
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
    await boss.work<DocumentComparisonJobPayload>(
      documentComparisonQueueName,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await this.handleQueuedJob(job);
      },
    );
    await boss.work<DocumentComparisonJobPayload>(
      documentComparisonDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.markComparisonFailed(job.data, 'COMPARISON_JOB_DEAD_LETTER');
      },
    );
    this.workerRegistered = true;
  }

  private async enqueueComparisonJob(
    payload: DocumentComparisonJobPayload,
    client: PoolClient,
  ): Promise<string> {
    const boss = await this.ensureStarted();
    const jobId = await boss.send(
      documentComparisonQueueName,
      payload,
      documentComparisonQueueSendOptions(payload, client),
    );
    if (!jobId) throw new Error('document comparison job enqueue returned no id');
    return jobId;
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: documentComparisonDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: documentComparisonQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 1,
        retryBackoff: true,
        deadLetter: documentComparisonDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.producer(documentComparisonQueueName);
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(documentComparisonQueueName);
  }

  private async markComparisonFailed(
    payload: DocumentComparisonJobPayload,
    reasonCode: string,
  ): Promise<void> {
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      await tx.query(
        `
          UPDATE document_version_comparisons
          SET status = 'failed',
              failure_reason_code = $3,
              completed_at = now(),
              updated_at = now()
          WHERE tenant_id = $1
            AND comparison_id = $2
            AND status = 'pending'
        `,
        [payload.tenantId, payload.comparisonId, reasonCode],
      );
    });
  }

  private async assertCanReadDocument(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadDocument({ tenantId, userId: actorUserId }, documentId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
    }
    if (decision?.effect === 'ALLOW') return;
    throw permissionDenied();
  }

  private async findDocumentTarget(
    tenantId: TenantId,
    documentId: string,
    client: QueryClient,
  ): Promise<DocumentComparisonTargetRow | null> {
    const result = await client.query(
      `
        SELECT document_id, tenant_id, matter_id
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DocumentComparisonTargetRow | undefined) ?? null;
  }

  private async loadVersionTexts(
    tenantId: TenantId,
    documentId: string,
    input: CreateDocumentComparisonRequestDto,
    client: QueryClient,
  ): Promise<{ base: VersionTextRow; target: VersionTextRow }> {
    const result = await client.query(
      `
        SELECT dv.version_id, dv.version_no, cd.body_text, cd.extraction_status
        FROM document_versions dv
        JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
          AND cd.version_id = dv.version_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = ANY($3::uuid[])
      `,
      [tenantId, documentId, [input.baseVersionId, input.targetVersionId]],
    );
    const rows = result.rows as VersionTextRow[];
    const base = rows.find((row) => row.version_id === input.baseVersionId);
    const target = rows.find((row) => row.version_id === input.targetVersionId);
    if (!base || !target) throw validationFailed('COMPARISON_VERSION_NOT_READY');
    if (base.extraction_status !== 'ready' || target.extraction_status !== 'ready') {
      throw validationFailed('COMPARISON_VERSION_NOT_READY');
    }
    return { base, target };
  }

  private async insertPendingComparison(
    client: PoolClient,
    tenantId: TenantId,
    target: DocumentComparisonTargetRow,
    actorUserId: string,
    input: CreateDocumentComparisonRequestDto,
  ): Promise<DocumentVersionComparisonRow> {
    const result = await client.query(
      `
        INSERT INTO document_version_comparisons (
          tenant_id, matter_id, document_id, base_version_id, target_version_id,
          status, requested_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, now())
        RETURNING comparison_id, document_id, matter_id, base_version_id, target_version_id,
          status, summary_json, failure_reason_code, created_at, completed_at
      `,
      [
        tenantId,
        target.matter_id,
        target.document_id,
        input.baseVersionId,
        input.targetVersionId,
        actorUserId,
      ],
    );
    const row = result.rows[0] as DocumentVersionComparisonRow | undefined;
    if (!row) throw new Error('document comparison insert returned no row');
    return row;
  }

  private async updateCompletedComparison(
    client: PoolClient,
    tenantId: TenantId,
    comparisonId: string,
    summary: DocumentComparisonSummaryDto,
  ): Promise<DocumentVersionComparisonRow> {
    const result = await client.query(
      `
        UPDATE document_version_comparisons
        SET status = 'completed',
            summary_json = $3::jsonb,
            failure_reason_code = NULL,
            completed_at = now(),
            updated_at = now()
        WHERE tenant_id = $1
          AND comparison_id = $2
          AND status = 'pending'
        RETURNING comparison_id, document_id, matter_id, base_version_id, target_version_id,
          status, summary_json, failure_reason_code, created_at, completed_at
      `,
      [tenantId, comparisonId, JSON.stringify(summary)],
    );
    const row = result.rows[0] as DocumentVersionComparisonRow | undefined;
    if (!row) throw new Error('document comparison completion update returned no row');
    return row;
  }

  private async insertClauseChanges(
    client: PoolClient,
    tenantId: TenantId,
    comparisonId: string,
    target: DocumentComparisonTargetRow,
    changes: readonly ComputedClauseChange[],
  ): Promise<void> {
    for (const change of changes) {
      await client.query(
        `
          INSERT INTO comparison_clause_changes (
            tenant_id, comparison_id, matter_id, document_id, sequence_no, change_type,
            clause_key, clause_number, heading_text, base_start_offset, base_end_offset,
            target_start_offset, target_end_offset, base_text, target_text, base_text_hash,
            target_text_hash, diff_hunks, parser_version
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18::jsonb, $19
          )
        `,
        [
          tenantId,
          comparisonId,
          target.matter_id,
          target.document_id,
          change.sequenceNo,
          change.changeType,
          change.key,
          change.clauseNumber,
          change.headingText,
          change.baseStartOffset,
          change.baseEndOffset,
          change.targetStartOffset,
          change.targetEndOffset,
          change.baseText,
          change.targetText,
          change.baseTextHash,
          change.targetTextHash,
          JSON.stringify(change.diffHunks),
          parserVersion,
        ],
      );
    }
  }

  private async attachJobId(
    client: PoolClient,
    tenantId: TenantId,
    comparisonId: string,
    jobId: string,
  ): Promise<DocumentVersionComparisonRow> {
    const result = await client.query(
      `
        UPDATE document_version_comparisons
        SET job_id = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND comparison_id = $2
        RETURNING comparison_id, document_id, matter_id, base_version_id, target_version_id,
          status, summary_json, failure_reason_code, created_at, completed_at
      `,
      [tenantId, comparisonId, jobId],
    );
    const row = result.rows[0] as DocumentVersionComparisonRow | undefined;
    if (!row) throw new Error('document comparison job update returned no row');
    return row;
  }

  private async attachAuditEvent(
    client: PoolClient,
    tenantId: TenantId,
    comparisonId: string,
    auditEventId: string,
  ): Promise<DocumentVersionComparisonRow> {
    const result = await client.query(
      `
        UPDATE document_version_comparisons
        SET created_audit_event_id = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND comparison_id = $2
        RETURNING comparison_id, document_id, matter_id, base_version_id, target_version_id,
          status, summary_json, failure_reason_code, created_at, completed_at
      `,
      [tenantId, comparisonId, auditEventId],
    );
    const row = result.rows[0] as DocumentVersionComparisonRow | undefined;
    if (!row) throw new Error('document comparison audit update returned no row');
    return row;
  }

  private async findComparison(
    tenantId: TenantId,
    documentId: string,
    comparisonId: string,
    client: QueryClient,
  ): Promise<DocumentVersionComparisonRow | null> {
    const result = await client.query(
      `
        SELECT comparison_id, document_id, matter_id, base_version_id, target_version_id,
          status, summary_json, failure_reason_code, created_at, completed_at
        FROM document_version_comparisons
        WHERE tenant_id = $1
          AND document_id = $2
          AND comparison_id = $3
        LIMIT 1
      `,
      [tenantId, documentId, comparisonId],
    );
    return (result.rows[0] as DocumentVersionComparisonRow | undefined) ?? null;
  }

  private async listChanges(
    client: QueryClient,
    tenantId: TenantId,
    comparisonId: string,
  ): Promise<ComparisonClauseChangeRow[]> {
    const result = await client.query(
      `
        SELECT change_id, sequence_no, change_type, clause_number, heading_text,
          base_text, target_text, diff_hunks
        FROM comparison_clause_changes
        WHERE tenant_id = $1
          AND comparison_id = $2
        ORDER BY sequence_no ASC
      `,
      [tenantId, comparisonId],
    );
    return result.rows as ComparisonClauseChangeRow[];
  }
}
