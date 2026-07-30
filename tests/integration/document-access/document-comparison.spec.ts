import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { bootstrapWorker } from '../../../apps/api/src/worker-main';
import {
  createClient,
  createMatter,
  createStorageService,
  ensureFreshMatterAppSyncState,
  loginBetaMember,
  loginBetaOwner,
  storageUrisForDocument,
  uploadDocx,
  uploadDocxVersion,
} from './document-api-helpers';
import { createOwnerClient, tenantBetaId, withClient } from '../helpers/db';

const unrelatedWorkerEnvironmentKeys = [
  'AI_PREP_QUEUE_WORKER_ENABLED',
  'AUDIT_ANCHOR_QUEUE_WORKER_ENABLED',
  'BULK_UPLOAD_QUEUE_WORKER_ENABLED',
  'CONTRACT_AI_REVIEW_QUEUE_WORKER_ENABLED',
  'DD_EXPORT_QUEUE_WORKER_ENABLED',
  'DD_RFI_NOTIFICATION_SWEEPER_ENABLED',
  'DLP_BULK_DOWNLOAD_MONITOR_WORKER_ENABLED',
  'DOCUMENT_BULK_ACTION_QUEUE_WORKER_ENABLED',
  'EDIT_SESSION_SWEEPER_ENABLED',
  'EMAIL_REPARSE_QUEUE_WORKER_ENABLED',
  'EXTRACTION_QUEUE_WORKER_ENABLED',
  'FILE_SECURITY_RECONCILIATION_WORKER_ENABLED',
  'FILE_SECURITY_SCAN_WORKER_ENABLED',
  'GRAPH_SYNC_OUTBOX_WORKER_ENABLED',
  'LAW_AMENDMENT_REFRESH_WORKER_ENABLED',
  'LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_ENABLED',
  'OCR_QUEUE_WORKER_ENABLED',
  'PREVIEW_CONVERT_QUEUE_WORKER_ENABLED',
  'RECORDS_DISPOSAL_WORKER_ENABLED',
  'RETENTION_REVIEW_QUEUE_WORKER_ENABLED',
  'SEARCH_INDEX_QUEUE_WORKER_ENABLED',
] as const;

interface VersionListResponse {
  items: Array<{
    versionId: string;
    versionNo: number;
    versionStatus: 'current' | 'superseded';
  }>;
}

interface ComparisonResponse {
  comparisonId: string;
  documentId: string;
  baseVersionId: string;
  targetVersionId: string;
  status: 'pending' | 'completed' | 'failed';
  failureReasonCode: string | null;
  summary: {
    addedCount: number;
    deletedCount: number;
    modifiedCount: number;
    unchangedCount: number;
    totalCount: number;
    durationMs: number;
  };
  changes: Array<{
    changeType: 'added' | 'deleted' | 'modified' | 'unchanged';
    clauseNumber: string;
    headingText: string;
    baseText: string;
    targetText: string;
  }>;
}

async function expectJson<T>(response: Response, expectedStatus: number): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(expectedStatus);
  return JSON.parse(body) as T;
}

async function listVersions(
  baseUrl: string,
  cookie: string,
  documentId: string,
): Promise<VersionListResponse> {
  return expectJson<VersionListResponse>(
    await fetch(`${baseUrl}/v1/documents/${documentId}/versions`, {
      headers: { cookie },
    }),
    200,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompletedComparison(
  baseUrl: string,
  cookie: string,
  documentId: string,
  comparisonId: string,
): Promise<ComparisonResponse> {
  const deadline = Date.now() + 30_000;
  let lastStatus: ComparisonResponse['status'] | undefined;
  while (Date.now() < deadline) {
    const comparison = await expectJson<ComparisonResponse>(
      await fetch(`${baseUrl}/v1/documents/${documentId}/comparisons/${comparisonId}`, {
        headers: { cookie },
      }),
      200,
    );
    lastStatus = comparison.status;
    if (comparison.status === 'completed') return comparison;
    if (comparison.status === 'failed') {
      throw new Error(`comparison failed: ${comparison.failureReasonCode ?? 'unknown'}`);
    }
    await sleep(50);
  }
  throw new Error(`comparison did not complete within 30000ms; last status=${lastStatus ?? 'none'}`);
}

function syntheticContractText(input: {
  removeClause?: number;
  modifiedClause?: number;
  addedClause?: number;
}): string {
  const clauses: string[] = [];
  for (let index = 1; index <= 100; index += 1) {
    if (index === input.removeClause) continue;
    const body =
      index === input.modifiedClause
        ? '수령자는 업계 표준 보호조치를 취한다.'
        : `수령자는 합리적인 보호조치를 취한다. 페이지 ${index}`;
    clauses.push(`제${index}조 조항 ${index}\n${body}`);
  }
  if (input.addedClause) {
    clauses.push(`제${input.addedClause}조 준거법\n대한민국 법을 준거법으로 한다.`);
  }
  return clauses.join('\n\n');
}

async function upsertCanonicalText(input: {
  tenantId: string;
  versionId: string;
  bodyText: string;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO canonical_documents (
          tenant_id, version_id, body_text, extraction_status, extraction_method,
          confidence, failure_reason_code, extracted_at, updated_at
        )
        VALUES ($1, $2, $3, 'ready', 'docx', 1, NULL, now(), now())
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          body_text = EXCLUDED.body_text,
          extraction_status = 'ready',
          extraction_method = 'docx',
          confidence = 1,
          failure_reason_code = NULL,
          extracted_at = now(),
          updated_at = now()
      `,
      [input.tenantId, input.versionId, input.bodyText],
    );
  });
}

async function removeQueuedExtractionJobs(versionIds: readonly string[]): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        DELETE FROM pgboss.job
        WHERE data->>'versionId' = ANY($1::text[])
      `,
      [versionIds],
    );
  });
}

async function comparisonAuditMetadata(documentId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'DOCUMENT_COMPARISON_CREATED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, documentId],
    );
    return result.rows[0]?.metadata_json;
  });
}

describe('document comparison integration', () => {
  let app: INestApplication;
  let workerApp: INestApplicationContext;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  const previousEnv = { ...process.env };
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    // bootstrapWorker starts the complete worker application. Keep this test's
    // comparison consumer isolated from jobs left by other integration suites.
    for (const key of unrelatedWorkerEnvironmentKeys) process.env[key] = 'false';
    process.env.DOCUMENT_COMPARISON_QUEUE_WORKER_ENABLED = 'true';
    process.env.PROCESS_ROLE = 'api';
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginBetaOwner(baseUrl);
    memberCookie = await loginBetaMember(baseUrl);
    process.env.PROCESS_ROLE = 'worker';
    workerApp = await bootstrapWorker();
    process.env.PROCESS_ROLE = 'api';
    await ensureFreshMatterAppSyncState(tenantBetaId, 'b11_document_comparison');
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of createdDocumentIds) {
      for (const storageUri of await storageUrisForDocument(documentId)) {
        await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
      }
    }
    await workerApp.close();
    await app.close();
    process.env = previousEnv;
  });

  it('creates a clause-level comparison for uploaded v1/v2 DOCX versions and blocks unauthorized users', async () => {
    const marker = `b11-comparison-${randomUUID()}`;
    const baseText = syntheticContractText({});
    const targetText = syntheticContractText({
      removeClause: 10,
      modifiedClause: 2,
      addedClause: 101,
    });
    const clientId = await createClient(baseUrl, ownerCookie, marker);
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, marker);
    const uploaded = await uploadDocx(baseUrl, ownerCookie, matterId, `${marker}-v1`, baseText);
    createdDocumentIds.push(uploaded.documentId);

    const firstVersions = await listVersions(baseUrl, ownerCookie, uploaded.documentId);
    const baseVersion = firstVersions.items[0];
    expect(baseVersion).toMatchObject({ versionNo: 1, versionStatus: 'current' });
    if (!baseVersion) throw new Error('missing base version');

    const targetVersion = await uploadDocxVersion(
      baseUrl,
      ownerCookie,
      uploaded.documentId,
      `${marker}-v2`,
      targetText,
    );
    expect(targetVersion.versionNo).toBe(2);

    await removeQueuedExtractionJobs([baseVersion.versionId, targetVersion.versionId]);
    await upsertCanonicalText({
      tenantId: tenantBetaId,
      versionId: baseVersion.versionId,
      bodyText: baseText,
    });
    await upsertCanonicalText({
      tenantId: tenantBetaId,
      versionId: targetVersion.versionId,
      bodyText: targetText,
    });

    const startedAt = Date.now();
    const createdComparison = await expectJson<ComparisonResponse>(
      await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/comparisons`, {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          baseVersionId: baseVersion.versionId,
          targetVersionId: targetVersion.versionId,
        }),
      }),
      201,
    );
    expect(createdComparison).toMatchObject({
      documentId: uploaded.documentId,
      baseVersionId: baseVersion.versionId,
      targetVersionId: targetVersion.versionId,
      status: 'pending',
      changes: [],
    });
    const comparison = await waitForCompletedComparison(
      baseUrl,
      ownerCookie,
      uploaded.documentId,
      createdComparison.comparisonId,
    );
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(30_000);
    expect(comparison).toMatchObject({
      documentId: uploaded.documentId,
      baseVersionId: baseVersion.versionId,
      targetVersionId: targetVersion.versionId,
      status: 'completed',
      summary: {
        addedCount: 1,
        deletedCount: 1,
        modifiedCount: 1,
      },
    });
    expect(comparison.changes.find((change) => change.changeType === 'modified')).toMatchObject({
      clauseNumber: '2',
      baseText: expect.stringContaining('합리적인 보호조치'),
      targetText: expect.stringContaining('업계 표준 보호조치'),
    });
    expect(comparison.changes.find((change) => change.changeType === 'added')).toMatchObject({
      clauseNumber: '101',
      targetText: expect.stringContaining('대한민국 법'),
    });
    expect(comparison.changes.find((change) => change.changeType === 'deleted')).toMatchObject({
      clauseNumber: '10',
      baseText: expect.stringContaining('페이지 10'),
    });

    const fetched = await expectJson<ComparisonResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/comparisons/${comparison.comparisonId}`,
        { headers: { cookie: ownerCookie } },
      ),
      200,
    );
    expect(fetched.summary).toMatchObject(comparison.summary);

    const denied = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/comparisons`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        baseVersionId: baseVersion.versionId,
        targetVersionId: targetVersion.versionId,
      }),
    });
    expect(denied.status, await denied.text()).toBe(403);

    const metadata = await comparisonAuditMetadata(uploaded.documentId);
    expect(metadata).toMatchObject({
      document_id: uploaded.documentId,
      matter_id: matterId,
      base_version_id: baseVersion.versionId,
      version_id: targetVersion.versionId,
      result_count: comparison.summary.totalCount,
      parser_status: 'success',
    });
    const metadataText = JSON.stringify(metadata);
    expect(metadataText).not.toContain('합리적인 보호조치');
    expect(metadataText).not.toContain('업계 표준 보호조치');
    expect(metadataText).not.toContain('대한민국 법');
  });
});
