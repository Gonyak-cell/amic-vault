import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type {
  DdDataRoomMappingDto,
  DdExportJobResponseDto,
  DdMappingSuggestionReviewResponseDto,
  DdIssueDto,
  DdReportExportResponseDto,
  DdRfiDto,
  DdRfiTemplateInstantiationResponseDto,
  DdRiskDto,
  DdTraceabilityResponseDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { bootstrapWorker } from '../../apps/api/src/worker-main';
import { ddExportQueueName } from '../../apps/api/src/modules/dd/dd-export-queue.types';
import { DdService } from '../../apps/api/src/modules/dd/dd.service';
import { NotificationsService } from '../../apps/api/src/modules/notifications/notifications.service';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  grantDocumentPermission,
  markPromotedFixture,
} from './document-access/document-api-helpers';
import {
  addExplicitPermission,
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('DD Vault integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  const previousMatterAppEnv = {
    MATTER_APP_SOURCE_MODE: process.env.MATTER_APP_SOURCE_MODE,
    MATTER_APP_SOURCE_CONFIGURED: process.env.MATTER_APP_SOURCE_CONFIGURED,
    MATTER_APP_RUNTIME_READY: process.env.MATTER_APP_RUNTIME_READY,
    MATTER_APP_SOURCE_UPDATED_AT: process.env.MATTER_APP_SOURCE_UPDATED_AT,
    MATTER_APP_API_BASE_URL: process.env.MATTER_APP_API_BASE_URL,
    MATTER_APP_API_TOKEN: process.env.MATTER_APP_API_TOKEN,
    DD_EXPORT_QUEUE_WORKER_ENABLED: process.env.DD_EXPORT_QUEUE_WORKER_ENABLED,
  };
  let app: INestApplication;
  let workerApp: INestApplicationContext;
  let baseUrl: string;
  let ownerCookie: string;
  let previousProcessRole: string | undefined;

  beforeAll(async () => {
    process.env.MATTER_APP_SOURCE_MODE = 'matter_app_api';
    process.env.MATTER_APP_SOURCE_CONFIGURED = 'true';
    process.env.MATTER_APP_RUNTIME_READY = 'true';
    process.env.MATTER_APP_SOURCE_UPDATED_AT = new Date().toISOString();
    process.env.MATTER_APP_API_BASE_URL = 'https://matter-app.test.local';
    process.env.MATTER_APP_API_TOKEN = 'test-matter-app-token';
    process.env.DD_EXPORT_QUEUE_WORKER_ENABLED = '1';
    previousProcessRole = process.env.PROCESS_ROLE;
    process.env.PROCESS_ROLE = 'api';
    await insertDocument({
      documentId,
      versionId,
      title: `DD ${marker} primary evidence`,
      text: 'Board approval package and capitalization table.',
      index: 1301,
    });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      title: `DD ${marker} denied evidence`,
      text: 'Denied diligence material.',
      index: 1302,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: deniedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    process.env.PROCESS_ROLE = 'worker';
    workerApp = await bootstrapWorker();
    process.env.PROCESS_ROLE = 'api';
  });

  afterAll(async () => {
    await workerApp.close();
    await app.close();
    restoreEnv('MATTER_APP_SOURCE_MODE', previousMatterAppEnv.MATTER_APP_SOURCE_MODE);
    restoreEnv('MATTER_APP_SOURCE_CONFIGURED', previousMatterAppEnv.MATTER_APP_SOURCE_CONFIGURED);
    restoreEnv('MATTER_APP_RUNTIME_READY', previousMatterAppEnv.MATTER_APP_RUNTIME_READY);
    restoreEnv('MATTER_APP_SOURCE_UPDATED_AT', previousMatterAppEnv.MATTER_APP_SOURCE_UPDATED_AT);
    restoreEnv('MATTER_APP_API_BASE_URL', previousMatterAppEnv.MATTER_APP_API_BASE_URL);
    restoreEnv('MATTER_APP_API_TOKEN', previousMatterAppEnv.MATTER_APP_API_TOKEN);
    restoreEnv(
      'DD_EXPORT_QUEUE_WORKER_ENABLED',
      previousMatterAppEnv.DD_EXPORT_QUEUE_WORKER_ENABLED,
    );
    restoreEnv('PROCESS_ROLE', previousProcessRole);
  });

  it('creates internal RFI, mapping, issue, risk, and permission-scoped traceability', async () => {
    const rfi = await postJson<DdRfiDto>('/v1/dd/rfis', {
      matterId,
      rfiCode: `RFI-${marker}`,
      category: 'corporate',
      title: `Corporate charter ${marker}`,
      status: 'requested',
      priority: 'high',
    });
    expect(rfi.rfiCode).toBe(`RFI-${marker}`);

    const mapping = await postJson<DdDataRoomMappingDto>('/v1/dd/data-room-mappings', {
      matterId,
      rfiId: rfi.rfiId,
      documentId,
      internalLabel: `Corporate ${marker}`,
      sectionPath: '01.Corporate',
      mappingStatus: 'mapped',
    });
    expect(mapping.documentId).toBe(documentId);

    const issue = await postJson<DdIssueDto>('/v1/dd/issues', {
      matterId,
      rfiId: rfi.rfiId,
      documentId,
      issueCode: `ISS-${marker}`,
      title: `Missing approval ${marker}`,
      severity: 'high',
      status: 'open',
      citationRefs: [`document:${documentId}`],
      reportInclusion: true,
    });
    expect(issue.citationRefs).toEqual([`document:${documentId}`]);

    const risk = await postJson<DdRiskDto>('/v1/dd/risks', {
      matterId,
      issueId: issue.issueId,
      riskCode: `RSK-${marker}`,
      category: 'legal',
      severity: 'high',
      likelihood: 'medium',
      status: 'open',
      citationRefs: [`issue:${issue.issueId}`],
    });
    expect(risk.issueId).toBe(issue.issueId);

    const trace = await getJson<DdTraceabilityResponseDto>(
      `/v1/dd/traceability?matterId=${matterId}&limit=100`,
    );
    expect(trace.rfiCount).toBeGreaterThanOrEqual(1);
    expect(trace.mappingCount).toBeGreaterThanOrEqual(1);
    expect(trace.issueCount).toBeGreaterThanOrEqual(1);
    expect(trace.riskCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(trace)).toContain(documentId);
    expect(JSON.stringify(trace)).not.toContain('Board approval package');
    expect(JSON.stringify(trace)).not.toContain(deniedDocumentId);

    const traceAudit = await latestDdAudit('DD_TRACE_VIEWED', matterId);
    expect(traceAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      rfi_count: expect.any(Number),
      mapping_count: expect.any(Number),
      issue_count: expect.any(Number),
      risk_count: expect.any(Number),
      trace_count: expect.any(Number),
    });
    expect(JSON.stringify(traceAudit?.metadata_json)).not.toContain(`Corporate charter ${marker}`);
    expect(JSON.stringify(traceAudit?.metadata_json)).not.toContain('Board approval package');

    const exported = await postJson<DdReportExportResponseDto>('/v1/dd/report-export', {
      matterId,
    });
    expect(exported).toMatchObject({
      matterId,
      documentId: expect.any(String),
      fileObjectId: expect.any(String),
      exportFormat: 'docx',
      issueCount: expect.any(Number),
      riskCount: expect.any(Number),
      itemCount: expect.any(Number),
    });
    expect(exported.issueCount).toBeGreaterThanOrEqual(1);
    expect(exported.riskCount).toBeGreaterThanOrEqual(1);
    expect(exported.itemCount).toBe(exported.issueCount + exported.riskCount);

    const generated = await generatedDdReportDocument(exported.documentId);
    expect(generated).toMatchObject({
      document_id: exported.documentId,
      file_object_id: exported.fileObjectId,
      matter_id: matterId,
      document_type: 'memo',
      subtype: 'dd_report_export',
      confidentiality_level: 'high',
      privilege_status: 'work_product',
      source: 'internal_work_product',
      ai_allowed: false,
      version_significance: 'internal_draft',
      rendition_type: 'clean',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(generated?.normalized_filename).toMatch(/^dd-report-.*\.docx$/u);
    expect(generated?.sha256).toMatch(/^[a-f0-9]{64}$/u);

    await markPromotedFixture({ documentId: exported.documentId });
    await grantDocumentPermission({
      tenantId: tenantAlphaId,
      documentId: exported.documentId,
      subjectUserId: alphaOwnerUserId,
      action: 'read',
      createdBy: alphaOwnerUserId,
    });
    await grantDocumentPermission({
      tenantId: tenantAlphaId,
      documentId: exported.documentId,
      subjectUserId: alphaOwnerUserId,
      action: 'download',
      createdBy: alphaOwnerUserId,
    });
    const generatedDownload = await fetch(
      `${baseUrl}/v1/documents/${exported.documentId}/download?reasonCode=casework`,
      { headers: { cookie: ownerCookie } },
    );
    const generatedDownloadBody = await generatedDownload.text();
    expect(generatedDownload.status, generatedDownloadBody).toBe(400);
    expect(JSON.parse(generatedDownloadBody)).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DLP_REVIEW_REQUIRED',
    });

    const exportAudit = await latestDdAudit('DD_REPORT_EXPORTED', exported.documentId);
    expect(exportAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: exported.documentId,
      file_object_id: exported.fileObjectId,
      export_format: 'docx',
      issue_count: exported.issueCount,
      risk_count: exported.riskCount,
      item_count: exported.itemCount,
    });
    expect(exportAudit?.metadata_json.hash).toBe(generated?.sha256);
    expect(JSON.stringify(exportAudit?.metadata_json)).not.toContain(`Missing approval ${marker}`);
    expect(JSON.stringify(exportAudit?.metadata_json)).not.toContain('Board approval package');

    const uploadAudit = await latestDdAudit('DOCUMENT_UPLOADED', exported.documentId);
    expect(uploadAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: exported.documentId,
      hash: generated?.sha256,
    });

    const queuedExportCountBefore = await ddReportExportDocumentCount();
    const queued = await postJson<DdExportJobResponseDto>('/v1/dd/export-jobs', {
      exportType: 'dd_report',
      matterId,
    });
    expect(queued).toMatchObject({
      queueName: ddExportQueueName,
      exportType: 'dd_report',
      matterId,
      jobId: expect.any(String),
    });
    const queuedGenerated = await waitForGeneratedDdReportAfter(queuedExportCountBefore);
    expect(queuedGenerated).toMatchObject({
      matter_id: matterId,
      subtype: 'dd_report_export',
      source: 'internal_work_product',
      ai_allowed: false,
    });
    const queuedAudit = await latestDdAudit('DD_REPORT_EXPORTED', queuedGenerated.document_id);
    expect(queuedAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: queuedGenerated.document_id,
      file_object_id: queuedGenerated.file_object_id,
      export_format: 'docx',
      issue_count: expect.any(Number),
      risk_count: expect.any(Number),
      item_count: expect.any(Number),
    });
    expect(queuedAudit?.metadata_json.hash).toBe(queuedGenerated.sha256);
  }, 20_000);

  it('instantiates DD RFI templates and materializes duplicate-safe RFI notifications', async () => {
    const templateId = await ddRfiTemplateId('ma_basic');
    const dueDate = pastDate();
    const instantiated = await postJson<DdRfiTemplateInstantiationResponseDto>(
      `/v1/dd/rfi-templates/${templateId}/instantiate`,
      {
        matterId,
        ownerUserId: alphaOwnerUserId,
        dueDate,
      },
    );

    expect(instantiated.templateId).toBe(templateId);
    expect(instantiated.createdCount).toBeGreaterThanOrEqual(4);
    expect(instantiated.rfis.map((rfi) => rfi.rfiCode)).toEqual(
      expect.arrayContaining(['MA.CORP.01', 'MA.FIN.01']),
    );
    expect(instantiated.rfis.map((rfi) => rfi.category)).toEqual(
      expect.arrayContaining(['corporate', 'finance', 'litigation']),
    );
    expect(instantiated.rfis.every((rfi) => rfi.dueDate !== null && rfi.overdue)).toBe(true);

    const notifications = app.get(NotificationsService);
    const firstSweep = await notifications.refreshDdRfiNotificationsForTenant(tenantAlphaId);
    expect(firstSweep.refreshedCount).toBeGreaterThanOrEqual(instantiated.createdCount);
    const beforeCount = await ddRfiNotificationCount(instantiated.rfis[0]!.rfiId);

    const secondSweep = await notifications.refreshDdRfiNotificationsForTenant(tenantAlphaId);
    expect(secondSweep.refreshedCount).toBeGreaterThanOrEqual(instantiated.createdCount);
    await expect(ddRfiNotificationCount(instantiated.rfis[0]!.rfiId)).resolves.toBe(beforeCount);

    await expect(ddRfiNotificationKinds(instantiated.rfis[0]!.rfiId)).resolves.toEqual([
      'dd_rfi_overdue',
      'dd_rfi_unmapped',
    ]);
  });

  it('creates and reviews deterministic DD mapping suggestions from extraction completion', async () => {
    const rfi = await postJson<DdRfiDto>('/v1/dd/rfis', {
      matterId,
      rfiCode: `RFI-SUG-${marker}`,
      category: 'corporate',
      title: `Suggested corporate RFI ${marker}`,
      status: 'requested',
      priority: 'critical',
      ownerUserId: alphaOwnerUserId,
      dueDate: '2020-01-01',
    });
    const initialGaps = await getJson<{ rfis: DdRfiDto[] }>(
      `/v1/dd/rfi-gaps?matterId=${matterId}&limit=100`,
    );
    expect(initialGaps.rfis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rfiId: rfi.rfiId,
          status: 'requested',
          overdue: true,
        }),
      ]),
    );
    const dd = app.get(DdService);
    const sourceHash = '4'.repeat(64);
    const sourceArtifactId = await insertCompletedDocumentProfileArtifact(sourceHash);
    const suggestion = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      return dd.suggestMappingsFromAiPrepArtifact(client, {
        tenantId: tenantAlphaId,
        matterId,
        documentId,
        versionId,
        sourceArtifactId,
        sourceHash,
        bodyText: 'Share purchase agreement with board approval and capitalization table schedules.',
      });
    });
    expect(suggestion.suggestedCount).toBe(1);

    const suggestedList = await getJson<{ mappings: DdDataRoomMappingDto[] }>(
      `/v1/dd/data-room-mappings?matterId=${matterId}&rfiId=${rfi.rfiId}&status=suggested`,
    );
    const suggested = suggestedList.mappings[0];
    expect(suggested).toMatchObject({
      rfiId: rfi.rfiId,
      documentId,
      versionId,
      mappingStatus: 'suggested',
    });
    const suggestedAudit = await latestDdAudit('DD_DATA_ROOM_MAPPED', suggested!.mappingId);
    expect(suggestedAudit?.metadata_json).toMatchObject({
      mapping_id: suggested!.mappingId,
      document_id: documentId,
      version_id: versionId,
      ai_prep_artifact_id: sourceArtifactId,
      hash: sourceHash,
      mapping_status: 'suggested',
    });
    expect(JSON.stringify(suggestedAudit?.metadata_json)).not.toContain(
      'Share purchase agreement',
    );
    const gapsAfterSuggestion = await getJson<{ rfis: DdRfiDto[] }>(
      `/v1/dd/rfi-gaps?matterId=${matterId}&limit=100`,
    );
    expect(gapsAfterSuggestion.rfis.map((gap) => gap.rfiId)).not.toContain(rfi.rfiId);
    expect(await ddMappingReviewWorkStatus(suggested!.mappingId)).toMatchObject({
      status: 'open',
      assigned_to_user_id: alphaOwnerUserId,
    });

    const approved = await patchJson<DdMappingSuggestionReviewResponseDto>(
      `/v1/dd/data-room-mappings/${suggested!.mappingId}/review`,
      { decision: 'approve' },
    );
    expect(approved.mapping).toMatchObject({
      mappingId: suggested!.mappingId,
      mappingStatus: 'mapped',
      documentId,
    });
    expect(await ddMappingReviewWorkStatus(suggested!.mappingId)).toMatchObject({
      status: 'completed',
    });
    const approvedAudit = await latestDdAudit('DD_DATA_ROOM_MAPPED', suggested!.mappingId);
    expect(approvedAudit?.metadata_json).toMatchObject({
      mapping_id: suggested!.mappingId,
      status_before: 'suggested',
      status_after: 'mapped',
      review_decision: 'approved',
    });

    const trace = await getJson<DdTraceabilityResponseDto>(
      `/v1/dd/traceability?matterId=${matterId}&limit=100`,
    );
    expect(trace.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rfiId: rfi.rfiId,
          mappingId: suggested!.mappingId,
          documentId,
        }),
      ]),
    );

    const financeRfi = await postJson<DdRfiDto>('/v1/dd/rfis', {
      matterId,
      rfiCode: `RFI-REJ-${marker}`,
      category: 'finance',
      title: `Suggested finance RFI ${marker}`,
      status: 'requested',
      priority: 'critical',
      ownerUserId: alphaOwnerUserId,
      dueDate: '2020-01-01',
    });
    const rejectedSuggestion = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      return dd.suggestMappingsFromExtraction(client, {
        tenantId: tenantAlphaId,
        matterId,
        documentId,
        versionId,
        bodyText: 'Loan agreement with borrower lender principal amount and interest rate.',
      });
    });
    expect(rejectedSuggestion.suggestedCount).toBe(1);
    const rejectedMappingId = rejectedSuggestion.mappingIds[0]!;
    const rejected = await patchJson<DdMappingSuggestionReviewResponseDto>(
      `/v1/dd/data-room-mappings/${rejectedMappingId}/review`,
      { decision: 'reject' },
    );
    expect(rejected).toEqual({ mappingId: rejectedMappingId, decision: 'reject', mapping: null });
    await expect(ddMappingExists(rejectedMappingId)).resolves.toBe(false);
    await expect(ddMappingReviewWorkStatus(rejectedMappingId)).resolves.toMatchObject({
      status: 'completed',
    });
    const rejectedAudit = await latestDdAudit('DD_DATA_ROOM_MAPPED', rejectedMappingId);
    expect(rejectedAudit?.metadata_json).toMatchObject({
      rfi_id: financeRfi.rfiId,
      mapping_id: rejectedMappingId,
      status_before: 'suggested',
      status_after: 'deleted',
      review_decision: 'rejected',
    });

    const deniedRfi = await postJson<DdRfiDto>('/v1/dd/rfis', {
      matterId,
      rfiCode: `RFI-DENY-${marker}`,
      category: 'litigation',
      title: `Denied suggested RFI ${marker}`,
      status: 'requested',
      priority: 'critical',
      ownerUserId: alphaOwnerUserId,
      dueDate: '2020-01-01',
    });
    const deniedMappingId = await insertSuggestedMapping({
      rfiId: deniedRfi.rfiId,
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
    });
    const deniedReview = await fetch(
      `${baseUrl}/v1/dd/data-room-mappings/${deniedMappingId}/review`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      },
    );
    const deniedText = await deniedReview.text();
    expect(deniedReview.status, deniedText).toBe(403);
    expect(deniedText).not.toContain(deniedDocumentId);
    await expect(ddMappingStatus(deniedMappingId)).resolves.toBe('suggested');
    await expect(reviewDecisionAuditCount(deniedMappingId, 'approved')).resolves.toBe(0);
  });

  it('blocks denied documents before internal data room mapping', async () => {
    const response = await fetch(`${baseUrl}/v1/dd/data-room-mappings`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        documentId: deniedDocumentId,
        internalLabel: `Denied ${marker}`,
        sectionPath: '99.Denied',
        mappingStatus: 'mapped',
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);

    const audit = await latestDdAudit('DD_DATA_ROOM_MAPPED', deniedDocumentId);
    expect(audit).toBeUndefined();
  });

  it('requires citations before DD issues leave open status', async () => {
    const blocked = await fetch(`${baseUrl}/v1/dd/issues`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        issueCode: `ISS-NOCITE-${marker}`,
        title: `Uncited issue ${marker}`,
        severity: 'medium',
        status: 'triaged',
      }),
    });
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(400);
    expect(blockedBody).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DD_ISSUE_CITATION_REQUIRED',
    });

    const triaged = await postJson<DdIssueDto>('/v1/dd/issues', {
      matterId,
      documentId,
      issueCode: `ISS-CITED-${marker}`,
      title: `Cited issue ${marker}`,
      severity: 'medium',
      status: 'triaged',
      citationRefs: [`document:${documentId}`],
    });
    expect(triaged.status).toBe('triaged');

    const transitionOpen = await postJson<DdIssueDto>('/v1/dd/issues', {
      matterId,
      issueCode: `ISS-TRANS-${marker}`,
      title: `Open issue ${marker} needs evidence before triage`,
      severity: 'medium',
      status: 'open',
    });

    const blockedTransition = await fetch(`${baseUrl}/v1/dd/issues/${transitionOpen.issueId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'triaged' }),
    });
    const blockedTransitionBody = await blockedTransition.json();
    expect(blockedTransition.status).toBe(400);
    expect(blockedTransitionBody).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DD_ISSUE_CITATION_REQUIRED',
    });

    const transitionedResponse = await fetch(`${baseUrl}/v1/dd/issues/${transitionOpen.issueId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'triaged',
        citationRefs: [`document:${documentId}`],
      }),
    });
    const transitioned = (await transitionedResponse.json()) as DdIssueDto;
    expect(transitionedResponse.status).toBe(200);
    expect(transitioned.status).toBe('triaged');
    expect(transitioned.citationRefs).toEqual([`document:${documentId}`]);

    const clearCitations = await fetch(`${baseUrl}/v1/dd/issues/${transitioned.issueId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ citationRefs: [] }),
    });
    const clearCitationsBody = await clearCitations.json();
    expect(clearCitations.status).toBe(400);
    expect(clearCitationsBody).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DD_ISSUE_CITATION_REQUIRED',
    });

    const open = await postJson<DdIssueDto>('/v1/dd/issues', {
      matterId,
      issueCode: `ISS-RAW-${marker}`,
      title: `Open issue ${marker}`,
      severity: 'medium',
      status: 'open',
    });

    await expect(
      withClient(createOwnerClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query(
          `
            UPDATE dd_issues
            SET status = 'triaged'
            WHERE tenant_id = $1
              AND issue_id = $2
          `,
          [tenantAlphaId, open.issueId],
        );
      }),
    ).rejects.toThrow(/dd_issues_non_open_citation_refs_required_check/);
  });

  it('keeps DD scope free of VDR delivery tables after R11 portal Q&A opens', async () => {
    const unexpectedExternalTables = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND (
              (
                table_name LIKE 'external_%'
                AND table_name NOT IN (
                  'external_workspaces',
                  'external_users',
                  'external_workspace_members',
                  'external_secure_links',
                  'external_nda_acceptances',
                  'external_qa_messages',
                  'external_authorities'
                )
              )
              OR table_name LIKE '%vdr%'
            )
          ORDER BY table_name
        `,
      );
      return result.rows.map((row) => row.table_name);
    });
    expect(unexpectedExternalTables).toEqual([]);
  });

  async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function ddMappingReviewWorkStatus(mappingId: string): Promise<{
    status: string;
    assigned_to_user_id: string | null;
  } | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        status: string;
        assigned_to_user_id: string | null;
      }>(
        `
          SELECT status, assigned_to_user_id
          FROM work_items
          WHERE tenant_id = $1
            AND source = 'operational_data'
            AND kind = 'dd_mapping_review'
            AND target_type = 'dd_mapping'
            AND target_id = $2
          LIMIT 1
        `,
        [tenantAlphaId, mappingId],
      );
      return result.rows[0] ?? null;
    });
  }

  async function ddMappingExists(mappingId: string): Promise<boolean> {
    return (await ddMappingStatus(mappingId)) !== null;
  }

  async function ddMappingStatus(mappingId: string): Promise<string | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ mapping_status: string }>(
        `
          SELECT mapping_status
          FROM dd_data_room_mappings
          WHERE tenant_id = $1
            AND mapping_id = $2
          LIMIT 1
        `,
        [tenantAlphaId, mappingId],
      );
      return result.rows[0]?.mapping_status ?? null;
    });
  }

  async function insertSuggestedMapping(input: {
    rfiId: string;
    documentId: string;
    versionId: string;
  }): Promise<string> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ mapping_id: string }>(
        `
          INSERT INTO dd_data_room_mappings (
            tenant_id, matter_id, rfi_id, document_id, version_id, internal_label,
            section_path, mapping_status, mapped_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, '99.Denied', 'suggested', $7)
          RETURNING mapping_id
        `,
        [
          tenantAlphaId,
          matterId,
          input.rfiId,
          input.documentId,
          input.versionId,
          `Denied suggestion ${marker}`,
          alphaOwnerUserId,
        ],
      );
      return result.rows[0]!.mapping_id;
    });
  }

  async function insertCompletedDocumentProfileArtifact(responseHash: string): Promise<string> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const sourceRef = `chunk:${documentId}`;
      const payload = {
        answer: 'profile',
        sections: [
          {
            section_id: 'profile',
            heading: 'Profile',
            text: 'profile',
            source_refs: [sourceRef],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'summary',
            text: 'profile',
            source_refs: [sourceRef],
            is_legal_conclusion: false,
          },
        ],
        source_refs: [sourceRef],
      };
      const result = await client.query<{ ai_prep_artifact_id: string }>(
        `
          INSERT INTO ai_prep_artifacts (
            tenant_id, matter_id, document_id, document_version_id, artifact_kind,
            status, model_route, model_name, source_chunk_ids, source_hashes,
            prompt_hash, response_hash, payload_json, latency_ms, is_stale,
            stale_reason, failure_reason_code, updated_at, generated_at, stale_at
          )
          VALUES (
            $1, $2, $3, $4, 'document_profile', 'completed', 'local_gemma',
            'gemma4:12b', ARRAY[]::uuid[], $5::jsonb, $6, $7, $8::jsonb,
            5, false, null, null, now(), now(), null
          )
          ON CONFLICT (tenant_id, document_version_id, artifact_kind)
          DO UPDATE SET
            status = 'completed',
            model_name = EXCLUDED.model_name,
            source_chunk_ids = EXCLUDED.source_chunk_ids,
            source_hashes = EXCLUDED.source_hashes,
            prompt_hash = EXCLUDED.prompt_hash,
            response_hash = EXCLUDED.response_hash,
            payload_json = EXCLUDED.payload_json,
            latency_ms = EXCLUDED.latency_ms,
            is_stale = false,
            stale_reason = null,
            failure_reason_code = null,
            updated_at = now(),
            generated_at = now(),
            stale_at = null
          RETURNING ai_prep_artifact_id
        `,
        [
          tenantAlphaId,
          matterId,
          documentId,
          versionId,
          JSON.stringify([responseHash]),
          '5'.repeat(64),
          responseHash,
          JSON.stringify(payload),
        ],
      );
      return result.rows[0]!.ai_prep_artifact_id;
    });
  }

  async function reviewDecisionAuditCount(
    mappingId: string,
    decision: 'approved' | 'rejected',
  ): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'DD_DATA_ROOM_MAPPED'
            AND target_id = $2
            AND metadata_json @> $3::jsonb
        `,
        [tenantAlphaId, mappingId, JSON.stringify({ review_decision: decision })],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async function insertDocument(input: {
    documentId: string;
    versionId: string;
    title: string;
    text: string;
    index: number;
  }): Promise<void> {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId: input.documentId,
        versionId: input.versionId,
        title: input.title,
        contentText: input.text,
        documentType: 'evidence',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
      input.index,
    );
  }

  async function generatedDdReportDocument(documentId: string): Promise<{
    document_id: string;
    matter_id: string;
    file_object_id: string;
    document_type: string;
    subtype: string | null;
    confidentiality_level: string;
    privilege_status: string;
    source: string;
    ai_allowed: boolean;
    version_significance: string;
    rendition_type: string;
    normalized_filename: string;
    mime_type: string;
    sha256: string;
  } | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        document_id: string;
        matter_id: string;
        file_object_id: string;
        document_type: string;
        subtype: string | null;
        confidentiality_level: string;
        privilege_status: string;
        source: string;
        ai_allowed: boolean;
        version_significance: string;
        rendition_type: string;
        normalized_filename: string;
        mime_type: string;
        sha256: string;
      }>(
        `
          SELECT
            d.document_id,
            d.matter_id,
            dv.file_object_id,
            d.document_type,
            d.subtype,
            d.confidentiality_level,
            d.privilege_status,
            d.source,
            d.ai_allowed,
            dv.version_significance,
            dv.rendition_type,
            fo.normalized_filename,
            fo.mime_type,
            fo.sha256
          FROM documents d
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
          JOIN file_objects fo
            ON fo.tenant_id = d.tenant_id
            AND fo.file_object_id = dv.file_object_id
          WHERE d.tenant_id = $1
            AND d.document_id = $2
          LIMIT 1
        `,
        [tenantAlphaId, documentId],
      );
      return result.rows[0] ?? null;
    });
  }

  async function ddReportExportDocumentCount(): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text
          FROM documents
          WHERE tenant_id = $1
            AND matter_id = $2
            AND subtype = 'dd_report_export'
        `,
        [tenantAlphaId, matterId],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async function waitForGeneratedDdReportAfter(previousCount: number): Promise<{
    document_id: string;
    matter_id: string;
    file_object_id: string;
    document_type: string;
    subtype: string | null;
    confidentiality_level: string;
    privilege_status: string;
    source: string;
    ai_allowed: boolean;
    version_significance: string;
    rendition_type: string;
    normalized_filename: string;
    mime_type: string;
    sha256: string;
  }> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if ((await ddReportExportDocumentCount()) > previousCount) {
        const latest = await latestGeneratedDdReportDocument();
        if (latest) return latest;
      }
      await sleep(100);
    }
    throw new Error('timed out waiting for queued DD report export document');
  }

  async function latestGeneratedDdReportDocument(): Promise<{
    document_id: string;
    matter_id: string;
    file_object_id: string;
    document_type: string;
    subtype: string | null;
    confidentiality_level: string;
    privilege_status: string;
    source: string;
    ai_allowed: boolean;
    version_significance: string;
    rendition_type: string;
    normalized_filename: string;
    mime_type: string;
    sha256: string;
  } | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        document_id: string;
        matter_id: string;
        file_object_id: string;
        document_type: string;
        subtype: string | null;
        confidentiality_level: string;
        privilege_status: string;
        source: string;
        ai_allowed: boolean;
        version_significance: string;
        rendition_type: string;
        normalized_filename: string;
        mime_type: string;
        sha256: string;
      }>(
        `
          SELECT
            d.document_id,
            d.matter_id,
            dv.file_object_id,
            d.document_type,
            d.subtype,
            d.confidentiality_level,
            d.privilege_status,
            d.source,
            d.ai_allowed,
            dv.version_significance,
            dv.rendition_type,
            fo.normalized_filename,
            fo.mime_type,
            fo.sha256
          FROM documents d
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
          JOIN file_objects fo
            ON fo.tenant_id = d.tenant_id
            AND fo.file_object_id = dv.file_object_id
          WHERE d.tenant_id = $1
            AND d.matter_id = $2
            AND d.subtype = 'dd_report_export'
          ORDER BY d.created_at DESC, d.document_id DESC
          LIMIT 1
        `,
        [tenantAlphaId, matterId],
      );
      return result.rows[0] ?? null;
    });
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pastDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function ddRfiTemplateId(templateCode: string): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ template_id: string }>(
      `
        SELECT template_id
        FROM dd_rfi_templates
        WHERE tenant_id = $1
          AND template_code = $2
        LIMIT 1
      `,
      [tenantAlphaId, templateCode],
    );
    const templateId = result.rows[0]?.template_id;
    expect(templateId).toBeDefined();
    return templateId!;
  });
}

async function ddRfiNotificationCount(rfiId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM notifications
        WHERE tenant_id = $1
          AND target_type = 'dd_rfi'
          AND target_id = $2
          AND kind IN ('dd_rfi_overdue', 'dd_rfi_unmapped')
      `,
      [tenantAlphaId, rfiId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function ddRfiNotificationKinds(rfiId: string): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ kind: string }>(
      `
        SELECT kind
        FROM notifications
        WHERE tenant_id = $1
          AND target_type = 'dd_rfi'
          AND target_id = $2
        ORDER BY kind ASC
      `,
      [tenantAlphaId, rfiId],
    );
    return result.rows.map((row) => row.kind);
  });
}

async function latestDdAudit(action: string, targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND (target_id = $3 OR metadata_json @> $4::jsonb)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        tenantAlphaId,
        action,
        targetId,
        JSON.stringify({ document_id: targetId }),
      ],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
