import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type {
  ClauseBankEntryDto,
  ClauseBankEntryListResponseDto,
  ClauseBankEntryQueryDto,
  ClauseSearchResponseDto,
  ContractAiReviewFindingDto,
  ContractAiReviewFindingListResponseDto,
  ContractClauseBankResponseDto,
  ContractProcessResponseDto,
  ContractRuleFindingsResponseDto,
  CounterpartyPatternsResponseDto,
  CreatePlaybookRuleRequestDto,
  DdExportJobResponseDto,
  NegotiationIssueDto,
  NegotiationIssueListResponseDto,
  NegotiationPositionDto,
  PlaybookRuleResponseDto,
  UpdateClauseBankEntryRequestDto,
  UpdateNegotiationIssueStatusRequestDto,
  WordClauseInsertionResponseDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { bootstrapWorker } from '../../apps/api/src/worker-main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaFirmAdminUserId,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  semanticTestEmbeddingVector,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';
import { ContractIntelService } from '../../apps/api/src/modules/contract-intel/contract-intel.service';
import {
  contractAiReviewDeadLetterQueueName,
  contractAiReviewQueueName,
  type ContractAiReviewJobPayload,
} from '../../apps/api/src/modules/contract-intel/contract-ai-review-queue.types';
import { ddExportQueueName } from '../../apps/api/src/modules/dd/dd-export-queue.types';

type MinimalRuleFinding = {
  ruleKey: string;
  status: 'pass' | 'fail' | 'unsupported';
};

interface ContractAiReviewJobRow {
  data: ContractAiReviewJobPayload;
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  dead_letter: string;
  singleton_key: string;
}

describe('contract intelligence integration', () => {
  const marker = `contract-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const revisionDocumentId = randomUUID();
  const revisionVersionId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  const similarDocumentId = randomUUID();
  const similarVersionId = randomUUID();
  const wordDocumentId = randomUUID();
  const wordVersionId = randomUUID();
  const unrelatedDocumentId = randomUUID();
  const unrelatedVersionId = randomUUID();
  const wallMatterId = randomUUID();
  const wallDocumentId = randomUUID();
  const wallVersionId = randomUUID();
  const sameClientMatterId = randomUUID();
  const sameClientDocumentId = randomUUID();
  const sameClientVersionId = randomUUID();
  const otherClientId = randomUUID();
  const otherClientMatterId = randomUUID();
  const otherClientDocumentId = randomUUID();
  const otherClientVersionId = randomUUID();
  const previousMatterAppEnv = {
    MATTER_APP_SOURCE_MODE: process.env.MATTER_APP_SOURCE_MODE,
    MATTER_APP_SOURCE_CONFIGURED: process.env.MATTER_APP_SOURCE_CONFIGURED,
    MATTER_APP_RUNTIME_READY: process.env.MATTER_APP_RUNTIME_READY,
    MATTER_APP_SOURCE_UPDATED_AT: process.env.MATTER_APP_SOURCE_UPDATED_AT,
    MATTER_APP_API_BASE_URL: process.env.MATTER_APP_API_BASE_URL,
    MATTER_APP_API_TOKEN: process.env.MATTER_APP_API_TOKEN,
  };
  let app: INestApplication;
  let workerApp: INestApplicationContext;
  let baseUrl: string;
  let ownerCookie: string;
  let adminCookie: string;
  let embeddingServer: Server | undefined;
  let previousEmbeddingEndpoint: string | undefined;
  let previousEmbeddingEnabled: string | undefined;
  let previousEmbeddingModel: string | undefined;
  let previousDdExportQueueWorkerEnabled: string | undefined;
  let previousProcessRole: string | undefined;
  const playbookRuleKey = `nda.confidentiality.${marker}`;

  beforeAll(async () => {
    previousEmbeddingEndpoint = process.env.LOCAL_EMBEDDING_ENDPOINT;
    previousEmbeddingEnabled = process.env.LOCAL_EMBEDDING_ENABLED;
    previousEmbeddingModel = process.env.LOCAL_EMBEDDING_MODEL;
    previousDdExportQueueWorkerEnabled = process.env.DD_EXPORT_QUEUE_WORKER_ENABLED;
    previousProcessRole = process.env.PROCESS_ROLE;
    const embeddingEndpoint = await startEmbeddingEndpoint();
    embeddingServer = embeddingEndpoint.server;
    process.env.LOCAL_EMBEDDING_ENDPOINT = embeddingEndpoint.url;
    process.env.LOCAL_EMBEDDING_ENABLED = '1';
    process.env.LOCAL_EMBEDDING_MODEL = 'bge-m3';
    process.env.DD_EXPORT_QUEUE_WORKER_ENABLED = '1';
    process.env.PROCESS_ROLE = 'api';
    process.env.MATTER_APP_SOURCE_MODE = 'matter_app_api';
    process.env.MATTER_APP_SOURCE_CONFIGURED = 'true';
    process.env.MATTER_APP_RUNTIME_READY = 'true';
    process.env.MATTER_APP_SOURCE_UPDATED_AT = new Date().toISOString();
    process.env.MATTER_APP_API_BASE_URL = 'https://matter-app.test.local';
    process.env.MATTER_APP_API_TOKEN = 'test-matter-app-token';

    const text = `Article 1 Definitions
"Confidential Information" means all non-public information
"Confidential Information" means marked information

Section 2 Confidentiality
This Non-Disclosure Agreement protects confidential information. [[ADD:Use reasonable safeguards]] <del>old rule</del>`;
    await insertDocument({ documentId, versionId, text, title: `${marker} NDA`, aiAllowed: true });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      text,
      title: `${marker} Denied NDA`,
    });
    await insertDocument({
      documentId: similarDocumentId,
      versionId: similarVersionId,
      text: `제 7 조 손해배상 책임 상한
손해배상 책임 상한은 총 계약대금으로 제한한다.

제 8 조 면책
고의 또는 중과실은 책임 제한에서 제외한다.`,
      title: `${marker} Liability Cap`,
    });
    await insertDocument({
      documentId: unrelatedDocumentId,
      versionId: unrelatedVersionId,
      text: `제 9 조 손해배상 책임 상한
손해배상 책임 상한은 별도 부속서에서 정한 기준에 따른다.

제 10 조 준거법
본 계약은 대한민국 법률을 따른다.`,
      title: `${marker} Notice`,
    });
    await insertDocument({
      documentId: wordDocumentId,
      versionId: wordVersionId,
      text: `제 11 조 해지
당사자는 중대한 계약 위반이 30일 내 시정되지 않으면 본 계약을 해지할 수 있다.

제 12 조 손해배상
손해배상 책임은 직접손해와 통상손해로 제한한다.`,
      title: `${marker} Word Clause Source`,
    });
    await insertDocument({
      documentId: wallDocumentId,
      versionId: wallVersionId,
      matterId: wallMatterId,
      text: `제 11 조 손해배상 책임 상한
윤리장벽 사건의 손해배상 책임 상한 조항은 검색 결과에 노출되지 않아야 한다.

제 12 조 비밀유지
윤리장벽 사건의 비밀유지 조항은 같은 검색 응답에서 참조만 허용되어야 한다.`,
      title: `${marker} Wall Hidden Cap`,
      index: 1204,
    });
    await insertDocument({
      documentId: sameClientDocumentId,
      versionId: sameClientVersionId,
      matterId: sameClientMatterId,
      text: `Section 1 Indemnity
The counterparty indemnifies the client for third party claims.`,
      title: `${marker} Same Client Indemnity`,
      index: 1205,
    });
    await insertDocument({
      documentId: otherClientDocumentId,
      versionId: otherClientVersionId,
      clientId: otherClientId,
      matterId: otherClientMatterId,
      text: `Section 1 Indemnity
The counterparty indemnifies another client for third party claims.`,
      title: `${marker} Other Client Indemnity`,
      index: 1206,
    });
    await insertDocument({
      documentId: revisionDocumentId,
      versionId: revisionVersionId,
      text: `Article 1 Definitions
"Confidential Information" means all non-public information

Section 2 Confidentiality
This Non-Disclosure Agreement protects confidential information. Use reasonable safeguards`,
      title: `${marker} Revision NDA`,
    });
    await insertDocumentRevisions({
      documentId: revisionDocumentId,
      versionId: revisionVersionId,
      revisions: [
        {
          changeType: 'insert',
          beforeText: '',
          afterText: 'Use reasonable safeguards',
        },
        {
          changeType: 'delete',
          beforeText: 'old rule',
          afterText: '',
        },
      ],
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaFirmAdminUserId,
      matterRole: 'member',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: wallMatterId,
      userId: alphaFirmAdminUserId,
      matterRole: 'member',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: wallMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'member',
      accessLevel: 'read',
    });
    for (const seededMatterId of [sameClientMatterId, otherClientMatterId]) {
      await addMatterMember({
        tenantId: tenantAlphaId,
        matterId: seededMatterId,
        userId: alphaOwnerUserId,
        matterRole: 'owner',
        accessLevel: 'edit',
      });
      await addMatterMember({
        tenantId: tenantAlphaId,
        matterId: seededMatterId,
        userId: alphaFirmAdminUserId,
        matterRole: 'member',
        accessLevel: 'edit',
      });
    }
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: wallMatterId,
      createdBy: alphaFirmAdminUserId,
      name: `${marker} clause search wall`,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
      createdBy: alphaFirmAdminUserId,
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
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    process.env.PROCESS_ROLE = 'worker';
    workerApp = await bootstrapWorker();
    process.env.PROCESS_ROLE = 'api';
  });

  afterAll(async () => {
    await workerApp.close();
    await app.close();
    await closeServer(embeddingServer);
    restoreEnv('LOCAL_EMBEDDING_ENDPOINT', previousEmbeddingEndpoint);
    restoreEnv('LOCAL_EMBEDDING_ENABLED', previousEmbeddingEnabled);
    restoreEnv('LOCAL_EMBEDDING_MODEL', previousEmbeddingModel);
    restoreEnv('DD_EXPORT_QUEUE_WORKER_ENABLED', previousDdExportQueueWorkerEnabled);
    restoreEnv('PROCESS_ROLE', previousProcessRole);
    restoreEnv('MATTER_APP_SOURCE_MODE', previousMatterAppEnv.MATTER_APP_SOURCE_MODE);
    restoreEnv('MATTER_APP_SOURCE_CONFIGURED', previousMatterAppEnv.MATTER_APP_SOURCE_CONFIGURED);
    restoreEnv('MATTER_APP_RUNTIME_READY', previousMatterAppEnv.MATTER_APP_RUNTIME_READY);
    restoreEnv('MATTER_APP_SOURCE_UPDATED_AT', previousMatterAppEnv.MATTER_APP_SOURCE_UPDATED_AT);
    restoreEnv('MATTER_APP_API_BASE_URL', previousMatterAppEnv.MATTER_APP_API_BASE_URL);
    restoreEnv('MATTER_APP_API_TOKEN', previousMatterAppEnv.MATTER_APP_API_TOKEN);
  });

  it('classifies and extracts contract facts with reference-only audit', async () => {
    const output = await processDocument(documentId);

    expect(output.classification.contractType).toBe('nda');
    expect(output.clauseCount).toBe(2);
    expect(output.definedTermCount).toBe(2);
    expect(output.redlineChangeCount).toBe(2);
    expect(JSON.stringify(output)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(output)).not.toContain('non-public information');

    const counts = await contractCounts(versionId);
    expect(counts).toEqual({
      clauses: 2,
      chunks: 2,
      terms: 2,
      conflicts: 2,
      redlines: 2,
    });
    const audit = await latestContractAudit(documentId, 'CONTRACT_CLAUSES_EXTRACTED');
    expect(audit?.metadata_json).toMatchObject({
      document_id: documentId,
      version_id: versionId,
      clause_count: 2,
      parser_status: 'success',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(marker);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Confidential Information');

    const reviewJobs = await contractAiReviewJobs(versionId);
    expect(reviewJobs.map((job) => job.data.task).sort()).toEqual([
      'clause_analysis',
      'risk_extraction',
    ]);
    expect(reviewJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          retry_limit: 5,
          retry_delay: 2,
          retry_backoff: true,
          dead_letter: contractAiReviewDeadLetterQueueName,
        }),
      ]),
    );
    expect(reviewJobs.map((job) => job.singleton_key).sort()).toEqual([
      `${versionId}:clause_analysis`,
      `${versionId}:risk_extraction`,
    ]);
    expect(reviewJobs.every((job) => job.data.documentId === documentId)).toBe(true);
    expect(JSON.stringify(reviewJobs)).not.toContain('Confidential Information');

    const reviewAudit = await latestContractAudit(documentId, 'CONTRACT_AI_REVIEW_REQUESTED');
    expect(reviewAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      version_id: versionId,
      scope_type: 'contract_ai_review',
      queue_name: contractAiReviewQueueName,
      enqueued_job_count: 2,
    });
    expect(JSON.stringify(reviewAudit?.metadata_json)).not.toContain('Confidential Information');
  });

  it('denies explicitly blocked documents before parsing', async () => {
    const response = await fetch(`${baseUrl}/v1/contract-intel/process`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: deniedDocumentId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);
    expect(await contractCounts(deniedVersionId)).toEqual({
      clauses: 0,
      chunks: 0,
      terms: 0,
      conflicts: 0,
      redlines: 0,
    });
  });

  it('projects persisted document revisions into contract redline consumers', async () => {
    const output = await processDocument(revisionDocumentId);

    expect(output.redlineChangeCount).toBe(2);
    expect(JSON.stringify(output)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(output)).not.toContain('old rule');
    expect(await contractCounts(revisionVersionId)).toMatchObject({ redlines: 2 });

    const redlineRule = await createRule({
      ruleKey: `nda.redline.threshold.${marker}`,
      ruleType: 'threshold',
      severity: 'warning',
      expression: { metric: 'redline_change_count', operator: 'gte', value: 2 },
      matterId,
    });
    const findings = await getRuleFindings(revisionDocumentId);
    const redlineFinding = findings.findings.find(
      (finding: MinimalRuleFinding) => finding.ruleKey === redlineRule.ruleKey,
    );
    expect(redlineFinding).toMatchObject({
      status: 'pass',
      findingCode: 'threshold.redline_change_count.gte.pass',
    });
    expect(JSON.stringify(findings)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(findings)).not.toContain('old rule');

    const issues = await getNegotiationIssues(revisionDocumentId);
    const issue = issues.issues.find(
      (item: NegotiationIssueDto) => item.ruleKey === redlineRule.ruleKey,
    );
    expect(issue).toMatchObject({
      matterId,
      documentId: revisionDocumentId,
      versionId: revisionVersionId,
      ruleId: redlineRule.ruleId,
      findingStatus: 'pass',
      status: 'open',
    });
    expect(JSON.stringify(issues)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(issues)).not.toContain('old rule');
    if (!issue) throw new Error('expected negotiation issue');

    const agreed = await updateNegotiationIssue(issue.issueId, { status: 'agreed' });
    expect(agreed).toMatchObject({
      issueId: issue.issueId,
      status: 'agreed',
      redlineChangeId: issue.redlineChangeId,
      findingHash: issue.findingHash,
    });
    const issueAudit = await latestContractAudit(
      revisionDocumentId,
      'CONTRACT_NEGOTIATION_ISSUE_CHANGED',
    );
    expect(issueAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: revisionDocumentId,
      version_id: revisionVersionId,
      redline_change_id: issue.redlineChangeId,
      rule_id: redlineRule.ruleId,
      finding_hash: issue.findingHash,
      status_before: 'open',
      status_after: 'agreed',
    });
    expect(JSON.stringify(issueAudit?.metadata_json)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(issueAudit?.metadata_json)).not.toContain('old rule');

    const exportCountBefore = await negotiationIssueExportDocumentCount();
    const exportJob = await enqueueDdExportJob({
      exportType: 'negotiation_issues',
      matterId,
      documentId: revisionDocumentId,
    });
    expect(exportJob).toMatchObject({
      queueName: ddExportQueueName,
      exportType: 'negotiation_issues',
      matterId,
      jobId: expect.any(String),
    });
    const exported = await waitForNegotiationIssueExportDocumentAfter(exportCountBefore);
    expect(exported).toMatchObject({
      matter_id: matterId,
      subtype: 'negotiation_issue_export',
      source: 'internal_work_product',
      ai_allowed: false,
    });
    const exportAudit = await latestContractAudit(
      exported.document_id,
      'CONTRACT_NEGOTIATION_ISSUES_EXPORTED',
    );
    expect(exportAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: exported.document_id,
      file_object_id: exported.file_object_id,
      export_format: 'docx',
      issue_count: expect.any(Number),
      item_count: expect.any(Number),
      scope_type: 'negotiation_issue_export',
      scope_id: revisionDocumentId,
    });
    expect(exportAudit?.metadata_json.hash).toBe(exported.sha256);
    expect(JSON.stringify(exportAudit?.metadata_json)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(exportAudit?.metadata_json)).not.toContain('old rule');

    const audit = await latestContractAudit(revisionDocumentId, 'CONTRACT_REDLINE_PARSED');
    expect(audit?.metadata_json).toMatchObject({
      document_id: revisionDocumentId,
      version_id: revisionVersionId,
      redline_change_count: 2,
      parser_status: 'success',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('old rule');
  }, 20_000);

  it('lists citation-backed contract AI review findings and audits lawyer acceptance', async () => {
    await processDocument(documentId);
    const findingText = 'AI review flags that the clause needs lawyer confirmation.';
    const findingId = await seedContractAiReviewFinding({
      documentId,
      versionId,
      text: findingText,
      task: 'clause_analysis',
    });

    const findings = await getAiReviewFindings(documentId);
    const finding = findings.findings.find(
      (item: ContractAiReviewFindingDto) => item.findingId === findingId,
    );
    expect(finding).toMatchObject({
      findingId,
      documentId,
      versionId,
      aiSource: 'local_gemma',
      task: 'clause_analysis',
      status: 'pending',
      findingText,
    });
    expect(finding?.citationRefs[0]).toMatch(/^chunk:/u);
    expect(JSON.stringify(findings)).not.toContain('Confidential Information');

    const denied = await fetch(
      `${baseUrl}/v1/contract-intel/ai-review-findings?matterId=${matterId}&documentId=${deniedDocumentId}`,
      { headers: { cookie: ownerCookie } },
    );
    const deniedText = await denied.text();
    expect(denied.status, deniedText).toBe(403);
    expect(deniedText).not.toContain(deniedDocumentId);

    const accepted = await acceptAiReviewFinding(findingId);
    expect(accepted).toMatchObject({
      findingId,
      status: 'accepted',
      acceptedBy: alphaOwnerUserId,
      findingHash: sha256Hex(findingText),
    });
    const audit = await latestAiReviewAudit(findingId);
    expect(audit?.metadata_json).toMatchObject({
      work_item_ref: findingId,
      matter_id: matterId,
      document_id: documentId,
      version_id: versionId,
      finding_hash: sha256Hex(findingText),
      status_before: 'pending',
      status_after: 'accepted',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(findingText);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Confidential Information');
  });

  it('materializes cited local Gemma review claims as idempotent findings', async () => {
    await processDocument(documentId);
    const claimText = 'AI review extracted a material contract risk requiring human review.';
    const seeded = await seedContractAiReviewClaim({
      documentId,
      versionId,
      text: claimText,
      task: 'risk_extraction',
    });
    const contracts = app.get(ContractIntelService);
    const permissionContext = {
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      sessionId: 'contract-ai-review-materialize-test',
    };
    const input = {
      matterId,
      documentId,
      aiSessionId: seeded.aiSessionId,
      task: 'risk_extraction' as const,
      claims: [
        {
          sessionClaimId: seeded.sessionClaimId,
          claimHash: seeded.claimHash,
          kind: 'risk',
          citationRefs: [seeded.sourceRef],
          isLegalConclusion: true,
        },
      ],
      citations: [
        {
          citationRef: seeded.sourceRef,
          documentId,
          versionId,
        },
      ],
    };

    await contracts.materializeContractAiReviewFindings(permissionContext, input);
    await contracts.materializeContractAiReviewFindings(permissionContext, input);

    const findings = await getAiReviewFindings(documentId);
    const materialized = findings.findings.filter(
      (finding: ContractAiReviewFindingDto) => finding.aiSessionId === seeded.aiSessionId,
    );
    expect(materialized).toHaveLength(1);
    expect(materialized[0]).toMatchObject({
      aiSource: 'local_gemma',
      task: 'risk_extraction',
      severity: 'critical',
      findingCode: 'contract.ai.risk_extraction.risk',
      findingHash: seeded.claimHash,
      status: 'pending',
      citationRefs: [seeded.sourceRef],
    });
    expect(JSON.stringify(materialized[0])).not.toContain('Confidential Information');
  });

  it('creates audited playbook rule versions without storing raw text', async () => {
    const body = await createRule({
      ruleKey: playbookRuleKey,
      ruleType: 'required_clause',
      severity: 'critical',
      expression: { requiredClauseKind: 'section', minCount: 1 },
      matterId,
    });
    expect(body.versionNumber).toBe(1);
    expect(body.expressionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain('requiredClauseKind');

    const audit = await latestRuleAudit(body.ruleId);
    expect(audit?.metadata_json).toMatchObject({
      playbook_rule_id: body.ruleId,
      rule_key: playbookRuleKey,
      rule_version: 1,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('requiredClauseKind');
  });

  it('applies client-scoped playbook rules across that client and excludes other clients', async () => {
    await processDocument(documentId);
    await processDocument(sameClientDocumentId);
    await processDocument(otherClientDocumentId);

    const clientRuleKey = `client.scope.indemnity.${marker}`;
    await createRule({
      ruleKey: clientRuleKey,
      ruleType: 'required_clause',
      severity: 'critical',
      expression: { requiredClauseKind: 'section', minCount: 1 },
      clientId,
    });

    const mainFindings = await getRuleFindings(documentId, ownerCookie, matterId);
    const sameClientFindings = await getRuleFindings(
      sameClientDocumentId,
      ownerCookie,
      sameClientMatterId,
    );
    const otherClientFindings = await getRuleFindings(
      otherClientDocumentId,
      ownerCookie,
      otherClientMatterId,
    );

    expect(
      mainFindings.findings.find((finding: MinimalRuleFinding) => finding.ruleKey === clientRuleKey),
    ).toMatchObject({ status: 'pass' });
    expect(
      sameClientFindings.findings.find(
        (finding: MinimalRuleFinding) => finding.ruleKey === clientRuleKey,
      ),
    ).toMatchObject({ status: 'pass' });
    expect(
      otherClientFindings.findings.find(
        (finding: MinimalRuleFinding) => finding.ruleKey === clientRuleKey,
      ),
    ).toBeUndefined();
  });

  it('lists clause bank and deterministic rule findings with permission-scoped audit', async () => {
    await processDocument(documentId);
    await createRule({
      ruleKey: `nda.section.required.${marker}`,
      ruleType: 'required_clause',
      severity: 'critical',
      expression: { requiredClauseKind: 'section', minCount: 1 },
      matterId,
    });
    await createRule({
      ruleKey: `nda.threshold.unsupported.${marker}`,
      ruleType: 'threshold',
      severity: 'warning',
      expression: { metric: 'raw_body', operator: 'gte', value: 1 },
      matterId,
    });

    const clauseBank = await getClauseBank(documentId);
    expect(clauseBank.clauses).toHaveLength(2);
    expect(clauseBank.clauses[0]?.citationRef).toMatch(/^clause:/u);
    expect(JSON.stringify(clauseBank)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(clauseBank)).not.toContain('Confidential Information');

    const first = await getRuleFindings(documentId);
    const second = await getRuleFindings(documentId);
    expect(first.findings).toEqual(second.findings);
    const findingStatuses = first.findings.map(
      (finding: MinimalRuleFinding) => finding.status,
    );
    expect(
      findingStatuses.filter((status: MinimalRuleFinding['status']) => status === 'pass').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      findingStatuses.filter(
        (status: MinimalRuleFinding['status']) => status === 'unsupported',
      ),
    ).toHaveLength(1);
    expect(first.unsupportedRuleCount).toBe(1);
    expect(JSON.stringify(first)).not.toContain('requiredClauseKind');
    expect(JSON.stringify(first)).not.toContain('raw_body');
    expect(JSON.stringify(first)).not.toContain('Use reasonable safeguards');

    const clauseAudit = await latestContractAudit(documentId, 'CONTRACT_CLAUSE_BANK_VIEWED');
    expect(clauseAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      result_count: 2,
    });
    const ruleAudit = await latestContractAudit(documentId, 'CONTRACT_RULE_EVALUATED');
    expect(ruleAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      rule_finding_count: first.findings.length,
      unsupported_rule_count: 1,
    });
  });

  it('denies clause bank access to explicitly blocked documents', async () => {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/clause-bank?matterId=${matterId}&documentId=${deniedDocumentId}`,
      {
        headers: { cookie: ownerCookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);
  });

  it('promotes clauses into the firm clause bank with approval and source-access boundaries', async () => {
    await processDocument(documentId);
    const clauseBank = await getClauseBank(documentId);
    const sourceClauseId = clauseBank.clauses[0]?.clauseId;
    expect(sourceClauseId).toBeTruthy();

    const draft = await createClauseBankEntry(sourceClauseId!, ownerCookie, ['nda', 'approved_form']);
    expect(draft).toMatchObject({
      status: 'draft',
      sourceClauseId,
      sourceAccessible: true,
      documentId,
    });
    expect(JSON.stringify(draft)).not.toContain('Confidential Information');

    const deniedApproval = await fetch(`${baseUrl}/v1/contract-intel/clause-bank/entries/${draft.entryId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    const deniedApprovalText = await deniedApproval.text();
    expect(deniedApproval.status, deniedApprovalText).toBe(403);
    expect(deniedApprovalText).not.toContain(draft.entryId);

    const approved = await updateClauseBankEntry(draft.entryId, { status: 'approved' }, adminCookie);
    expect(approved).toMatchObject({
      status: 'approved',
      sourceClauseId,
      sourceAccessible: true,
      documentId,
      approvedBy: alphaFirmAdminUserId,
    });
    const audit = await latestClauseBankAudit(draft.entryId);
    expect(audit?.metadata_json).toMatchObject({
      work_item_ref: draft.entryId,
      document_id: documentId,
      status_after: 'approved',
      hash: approved.textHash,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Confidential Information');

    await processDocument(deniedDocumentId, adminCookie);
    const deniedClauseBank = await getClauseBank(deniedDocumentId, adminCookie);
    const deniedClauseId = deniedClauseBank.clauses[0]?.clauseId;
    expect(deniedClauseId).toBeTruthy();
    const deniedDraft = await createClauseBankEntry(deniedClauseId!, adminCookie, ['restricted_source']);
    const deniedApproved = await updateClauseBankEntry(
      deniedDraft.entryId,
      { status: 'approved' },
      adminCookie,
    );
    expect(deniedApproved.sourceAccessible).toBe(true);

    const ownerVisible = await listClauseBankEntries({ status: 'approved', limit: 50 }, ownerCookie);
    const hiddenSource = ownerVisible.entries.find(
      (entry: ClauseBankEntryDto) => entry.entryId === deniedDraft.entryId,
    );
    expect(hiddenSource).toMatchObject({
      status: 'approved',
      clauseKind: deniedApproved.clauseKind,
      tags: ['restricted_source'],
      sourceAccessible: false,
      matterId: null,
      documentId: null,
      versionId: null,
    });
    const hiddenJson = JSON.stringify(hiddenSource);
    expect(hiddenJson).not.toContain(deniedDocumentId);
    expect(hiddenJson).not.toContain(`${marker} Denied NDA`);
    expect(hiddenJson).not.toContain('Confidential Information');
  });

  it('searches similar clauses with approved boost, wall exclusion, and bounded latency', async () => {
    await processDocument(similarDocumentId);
    await processDocument(unrelatedDocumentId);
    await processDocument(wallDocumentId, adminCookie);

    const similarBank = await getClauseBank(similarDocumentId);
    const similarClauseId = similarBank.clauses[0]?.clauseId;
    expect(similarClauseId).toBeTruthy();
    const draft = await createClauseBankEntry(similarClauseId!, ownerCookie, ['liability_cap']);
    await updateClauseBankEntry(draft.entryId, { status: 'approved' }, adminCookie);

    const unrelatedBank = await getClauseBank(unrelatedDocumentId);
    const unrelatedClauseId = unrelatedBank.clauses[0]?.clauseId;
    expect(unrelatedClauseId).toBeTruthy();
    const wallBank = await getClauseBank(wallDocumentId, adminCookie, wallMatterId);
    const wallClauseId = wallBank.clauses[0]?.clauseId;
    expect(wallClauseId).toBeTruthy();

    const result = await searchSimilarClauses({ query: '손해배상 책임 상한', limit: 50 }, ownerCookie);
    expect(result.modelRoute).toBe('bge_m3');
    expect(result.results[0]).toMatchObject({
      clauseId: similarClauseId,
      clauseBankEntryId: draft.entryId,
      approved: true,
      tags: ['liability_cap'],
    });
    const similarRank = result.results.findIndex(
      (entry: ClauseSearchResponseDto['results'][number]) => entry.clauseId === similarClauseId,
    );
    const unrelatedRank = result.results.findIndex(
      (entry: ClauseSearchResponseDto['results'][number]) => entry.clauseId === unrelatedClauseId,
    );
    expect(similarRank).toBeGreaterThanOrEqual(0);
    expect(unrelatedRank).toBeGreaterThanOrEqual(0);
    expect(similarRank).toBeLessThan(unrelatedRank);
    expect(
      result.results.find(
        (entry: ClauseSearchResponseDto['results'][number]) => entry.clauseId === unrelatedClauseId,
      ),
    ).toBeTruthy();
    expect(
      result.results.find(
        (entry: ClauseSearchResponseDto['results'][number]) => entry.clauseId === wallClauseId,
      ),
    ).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('윤리장벽 사건');
    expect(JSON.stringify(result)).not.toContain('손해배상 책임 상한은 총 계약대금');

    await seedSyntheticClauseEmbeddings({
      tenantId: tenantAlphaId,
      matterId,
      documentId: similarDocumentId,
      versionId: similarVersionId,
      count: 5_000,
    });
    const durations: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      const response = await searchSimilarClauses(
        { query: `performance liability cap ${index}`, limit: 20 },
        ownerCookie,
      );
      expect(response.results.length).toBeGreaterThan(0);
      durations.push(performance.now() - startedAt);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(800);
  }, 30_000);

  it('prepares Word add-in clause insertion with permission and audit boundaries', async () => {
    await processDocument(wordDocumentId);
    await processDocument(wallDocumentId, adminCookie);
    const clauseBank = await getClauseBank(wordDocumentId);
    const sourceClauseId = clauseBank.clauses[0]?.clauseId;
    expect(sourceClauseId).toBeTruthy();
    const draft = await createClauseBankEntry(sourceClauseId!, ownerCookie, ['word_addin']);
    await updateClauseBankEntry(draft.entryId, { status: 'approved' }, adminCookie);

    const prepared = await prepareWordClauseInsertion(
      {
        clauseId: sourceClauseId!,
        clauseBankEntryId: draft.entryId,
        insertionFormat: 'ooxml',
      },
      ownerCookie,
    );
    expect(prepared).toMatchObject({
      status: 'ready',
      clauseId: sourceClauseId,
      clauseBankEntryId: draft.entryId,
      insertionFormat: 'ooxml',
    });
    expect(prepared.insertText).toContain('계약 위반');
    expect(prepared.insertText).toContain('해지');
    const insertionAudit = await latestWordClauseInsertionAudit(draft.entryId);
    expect(insertionAudit?.metadata_json).toMatchObject({
      graph_scope: 'word_clause_insertion',
      matter_id: matterId,
      document_id: wordDocumentId,
      version_id: wordVersionId,
      work_item_ref: draft.entryId,
      client_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      hash: prepared.textHash,
      item_count: 1,
    });
    expect(JSON.stringify(insertionAudit?.metadata_json)).not.toContain('계약 위반');
    expect(JSON.stringify(insertionAudit?.metadata_json)).not.toContain('해지');

    const wallBank = await getClauseBank(wallDocumentId, adminCookie, wallMatterId);
    const wallClauseId = wallBank.clauses[0]?.clauseId;
    expect(wallClauseId).toBeTruthy();
    const deniedInsertion = await fetch(`${baseUrl}/v1/contract-intel/word-addin/clause-insertions`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        clauseId: wallClauseId,
        insertionFormat: 'ooxml',
      }),
    });
    const deniedInsertionBody = await deniedInsertion.text();
    expect(deniedInsertion.status, deniedInsertionBody).toBe(403);
    expect(deniedInsertionBody).not.toContain(wallClauseId!);
    expect(deniedInsertionBody).not.toContain('윤리장벽 사건');
  });

  it('records negotiation positions, aggregates counterparty patterns, and denies non-editors', async () => {
    await processDocument(similarDocumentId);
    await processDocument(sameClientDocumentId);
    await processDocument(wallDocumentId, adminCookie);
    const counterpartyName = `${marker} Counterparty`;
    const partyId = await seedParty(matterId, counterpartyName);
    const sameClientPartyId = await seedParty(sameClientMatterId, counterpartyName);
    const wallPartyId = await seedParty(wallMatterId, `${marker} Wall Counterparty`, alphaFirmAdminUserId);
    const clauseBank = await getClauseBank(similarDocumentId);
    const clauseId = clauseBank.clauses[0]?.clauseId;
    expect(clauseId).toBeTruthy();

    const first = await createNegotiationPosition(
      {
        matterId,
        partyId,
        issueLabel: '손해배상',
        clauseKind: 'indemnity',
        positionSummary: '상대방은 간접손해 제외와 직접손해 한도를 요구했다.',
        sourceDocumentId: similarDocumentId,
        sourceVersionId: similarVersionId,
        sourceClauseId: clauseId!,
        roundNo: 1,
      },
      ownerCookie,
    );
    const second = await createNegotiationPosition(
      {
        matterId,
        partyId,
        issueLabel: '손해배상',
        clauseKind: 'indemnity',
        positionSummary: '상대방은 배상책임 상한을 계약대금으로 제한하자고 재요구했다.',
        sourceDocumentId: similarDocumentId,
        sourceVersionId: similarVersionId,
        sourceClauseId: clauseId!,
        roundNo: 2,
      },
      ownerCookie,
    );
    expect(first.roundNo).toBe(1);
    expect(second.roundNo).toBe(2);

    await createNegotiationPosition(
      {
        matterId: sameClientMatterId,
        partyId: sameClientPartyId,
        issueLabel: '손해배상',
        clauseKind: 'indemnity',
        positionSummary: '같은 상대방은 다른 사건에서도 배상책임 제한을 요구했다.',
        sourceDocumentId: sameClientDocumentId,
        sourceVersionId: sameClientVersionId,
        roundNo: 1,
      },
      ownerCookie,
    );

    const patterns = await getCounterpartyPatterns(partyId);
    expect(patterns.patterns[0]).toMatchObject({
      partyId,
      clauseKind: 'indemnity',
      requestCount: 3,
      matterCount: 2,
      latestRoundNo: 2,
      latestPositionId: second.positionId,
    });

    const audit = await latestNegotiationAudit(second.positionId);
    expect(audit?.metadata_json).toMatchObject({
      negotiation_position_id: second.positionId,
      matter_id: matterId,
      party_id: partyId,
      hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      item_count: 2,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('계약대금');

    const wallBank = await getClauseBank(wallDocumentId, adminCookie, wallMatterId);
    const denied = await fetch(`${baseUrl}/v1/contract-intel/negotiation-positions`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        partyId: wallPartyId,
        issueLabel: '비밀유지',
        clauseKind: 'confidentiality',
        positionSummary: '이 문구는 권한 없는 사용자에게 저장되면 안 된다.',
        sourceDocumentId: wallDocumentId,
        sourceVersionId: wallVersionId,
        sourceClauseId: wallBank.clauses[0]?.clauseId,
        roundNo: 1,
      }),
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).not.toContain(wallPartyId);
    expect(deniedBody).not.toContain('권한 없는 사용자');
  });

  async function processDocument(
    targetDocumentId: string,
    cookie = ownerCookie,
  ): Promise<ContractProcessResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/process`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: targetDocumentId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as ContractProcessResponseDto;
  }

  async function createRule(input: CreatePlaybookRuleRequestDto): Promise<PlaybookRuleResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/playbook-rules`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as PlaybookRuleResponseDto;
  }

  async function getClauseBank(
    targetDocumentId: string,
    cookie = ownerCookie,
    targetMatterId = matterId,
  ): Promise<ContractClauseBankResponseDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/clause-bank?matterId=${targetMatterId}&documentId=${targetDocumentId}`,
      {
        headers: { cookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ContractClauseBankResponseDto;
  }

  async function createClauseBankEntry(
    clauseId: string,
    cookie: string,
    tags: string[],
  ): Promise<ClauseBankEntryDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/clause-bank/entries`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ clauseId, tags }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as ClauseBankEntryDto;
  }

  async function updateClauseBankEntry(
    entryId: string,
    input: UpdateClauseBankEntryRequestDto,
    cookie: string,
  ): Promise<ClauseBankEntryDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/clause-bank/entries/${entryId}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ClauseBankEntryDto;
  }

  async function listClauseBankEntries(
    query: ClauseBankEntryQueryDto,
    cookie: string,
  ): Promise<ClauseBankEntryListResponseDto> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/clause-bank/entries?${params.toString()}`,
      {
        headers: { cookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ClauseBankEntryListResponseDto;
  }

  async function searchSimilarClauses(
    input: { query: string; limit: number },
    cookie: string,
  ): Promise<ClauseSearchResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/clause-search`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as ClauseSearchResponseDto;
  }

  async function prepareWordClauseInsertion(
    input: { clauseId: string; clauseBankEntryId?: string | null; insertionFormat: 'ooxml' | 'text' },
    cookie: string,
  ): Promise<WordClauseInsertionResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/word-addin/clause-insertions`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as WordClauseInsertionResponseDto;
  }

  async function getRuleFindings(
    targetDocumentId: string,
    cookie = ownerCookie,
    targetMatterId = matterId,
  ): Promise<ContractRuleFindingsResponseDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/rule-findings?matterId=${targetMatterId}&documentId=${targetDocumentId}`,
      {
        headers: { cookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ContractRuleFindingsResponseDto;
  }

  async function getNegotiationIssues(
    targetDocumentId: string,
    cookie = ownerCookie,
    targetMatterId = matterId,
  ): Promise<NegotiationIssueListResponseDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/negotiation-issues?matterId=${targetMatterId}&documentId=${targetDocumentId}`,
      {
        headers: { cookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as NegotiationIssueListResponseDto;
  }

  async function getAiReviewFindings(
    targetDocumentId: string,
    cookie = ownerCookie,
    targetMatterId = matterId,
  ): Promise<ContractAiReviewFindingListResponseDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/ai-review-findings?matterId=${targetMatterId}&documentId=${targetDocumentId}`,
      {
        headers: { cookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ContractAiReviewFindingListResponseDto;
  }

  async function acceptAiReviewFinding(findingId: string): Promise<ContractAiReviewFindingDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/ai-review-findings/${findingId}/accept`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ContractAiReviewFindingDto;
  }

  async function updateNegotiationIssue(
    issueId: string,
    input: UpdateNegotiationIssueStatusRequestDto,
    cookie = ownerCookie,
  ): Promise<NegotiationIssueDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/negotiation-issues/${issueId}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as NegotiationIssueDto;
  }

  async function enqueueDdExportJob(input: {
    exportType: 'negotiation_issues';
    matterId: string;
    documentId: string;
    status?: 'open' | 'agreed' | 'dropped';
  }): Promise<DdExportJobResponseDto> {
    const response = await fetch(`${baseUrl}/v1/dd/export-jobs`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as DdExportJobResponseDto;
  }

  async function negotiationIssueExportDocumentCount(): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text
          FROM documents
          WHERE tenant_id = $1
            AND matter_id = $2
            AND subtype = 'negotiation_issue_export'
        `,
        [tenantAlphaId, matterId],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async function waitForNegotiationIssueExportDocumentAfter(previousCount: number): Promise<{
    document_id: string;
    matter_id: string;
    file_object_id: string;
    subtype: string | null;
    source: string;
    ai_allowed: boolean;
    sha256: string;
  }> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if ((await negotiationIssueExportDocumentCount()) > previousCount) {
        const latest = await latestNegotiationIssueExportDocument();
        if (latest) return latest;
      }
      await sleep(100);
    }
    throw new Error('timed out waiting for queued negotiation issue export document');
  }

  async function latestNegotiationIssueExportDocument(): Promise<{
    document_id: string;
    matter_id: string;
    file_object_id: string;
    subtype: string | null;
    source: string;
    ai_allowed: boolean;
    sha256: string;
  } | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        document_id: string;
        matter_id: string;
        file_object_id: string;
        subtype: string | null;
        source: string;
        ai_allowed: boolean;
        sha256: string;
      }>(
        `
          SELECT
            d.document_id,
            d.matter_id,
            dv.file_object_id,
            d.subtype,
            d.source,
            d.ai_allowed,
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
            AND d.subtype = 'negotiation_issue_export'
          ORDER BY d.created_at DESC, d.document_id DESC
          LIMIT 1
        `,
        [tenantAlphaId, matterId],
      );
      return result.rows[0] ?? null;
    });
  }

  async function createNegotiationPosition(
    input: {
      matterId: string;
      partyId: string;
      issueLabel: string;
      clauseKind: 'indemnity' | 'confidentiality';
      positionSummary: string;
      sourceDocumentId: string;
      sourceVersionId: string;
      sourceClauseId?: string;
      roundNo: number;
    },
    cookie: string,
  ): Promise<NegotiationPositionDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/negotiation-positions`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as NegotiationPositionDto;
  }

  async function getCounterpartyPatterns(
    partyId: string,
    cookie = ownerCookie,
  ): Promise<CounterpartyPatternsResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/counterparty-patterns?partyId=${partyId}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as CounterpartyPatternsResponseDto;
  }

  async function insertDocument(input: {
    documentId: string;
    versionId: string;
    clientId?: string;
    matterId?: string;
    text: string;
    title: string;
    index?: number;
    aiAllowed?: boolean;
  }): Promise<void> {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: input.clientId ?? clientId,
        matterId: input.matterId ?? matterId,
        documentId: input.documentId,
        versionId: input.versionId,
        title: input.title,
        contentText: input.text,
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        aiAllowed: input.aiAllowed ?? false,
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
      input.index ?? 1201,
    );
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO canonical_documents (
            tenant_id, version_id, body_text, extraction_status, extraction_method,
            confidence, extracted_at
          )
          VALUES ($1, $2, $3, 'ready', 'docx', 0.980, now())
        `,
        [tenantAlphaId, input.versionId, input.text],
      );
    });
  }

  async function seedContractAiReviewFinding(input: {
    documentId: string;
    versionId: string;
    text: string;
    task: 'clause_analysis' | 'risk_extraction';
  }): Promise<string> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const chunkResult = await client.query<{
        chunk_id: string;
      }>(
        `
          SELECT chunk_id
          FROM document_chunks
          WHERE tenant_id = $1
            AND document_id = $2
            AND version_id = $3
            AND stale = false
          ORDER BY chunk_ordinal
          LIMIT 1
        `,
        [tenantAlphaId, input.documentId, input.versionId],
      );
      const chunk = chunkResult.rows[0];
      if (!chunk) throw new Error('expected seeded document chunk');
      const aiSessionId = randomUUID();
      const claimId = randomUUID();
      const findingId = randomUUID();
      const claimHash = sha256Hex(input.text);
      await client.query('BEGIN');
      try {
        await client.query(
          `
            INSERT INTO ai_sessions (
              ai_session_id, tenant_id, matter_id, actor_id, model_route, status,
              prompt_hash, prompt_length, response_hash, response_length,
              response_token_count, latency_ms
            )
            VALUES ($1, $2, $3, $4, 'local_gemma', 'responded', $5, 48, $6, $7, 12, 100)
          `,
          [
            aiSessionId,
            tenantAlphaId,
            matterId,
            alphaOwnerUserId,
            sha256Hex(`contract-ai-review:${findingId}`),
            claimHash,
            input.text.length,
          ],
        );
        await client.query(
          `
            INSERT INTO ai_claims (
              claim_id, tenant_id, ai_session_id, session_claim_id, claim_hash,
              claim_text, kind, verification_status
            )
            VALUES ($1, $2, $3, 'contract-ai-review-1', $4, $5, $6, 'cited')
          `,
          [
            claimId,
            tenantAlphaId,
            aiSessionId,
            claimHash,
            input.text,
            input.task === 'clause_analysis' ? 'clause' : 'risk',
          ],
        );
        await client.query(
          `
            INSERT INTO ai_claim_citations (
              tenant_id, claim_id, source_ref, document_id, version_id, chunk_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            tenantAlphaId,
            claimId,
            `chunk:${chunk.chunk_id}`,
            input.documentId,
            input.versionId,
            chunk.chunk_id,
          ],
        );
        await client.query(
          `
            INSERT INTO contract_ai_review_findings (
              finding_id, tenant_id, matter_id, document_id, version_id,
              ai_session_id, ai_claim_id, review_task, severity, finding_code, finding_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'warning', $9, $10)
          `,
          [
            findingId,
            tenantAlphaId,
            matterId,
            input.documentId,
            input.versionId,
            aiSessionId,
            claimId,
            input.task,
            `contract.ai.${input.task}.warning`,
            claimHash,
          ],
        );
        await client.query('COMMIT');
        return findingId;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async function seedContractAiReviewClaim(input: {
    documentId: string;
    versionId: string;
    text: string;
    task: 'clause_analysis' | 'risk_extraction';
  }): Promise<{
    aiSessionId: string;
    sessionClaimId: string;
    claimHash: string;
    sourceRef: string;
  }> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const chunkResult = await client.query<{ chunk_id: string }>(
        `
          SELECT chunk_id
          FROM document_chunks
          WHERE tenant_id = $1
            AND document_id = $2
            AND version_id = $3
            AND stale = false
          ORDER BY chunk_ordinal
          LIMIT 1
        `,
        [tenantAlphaId, input.documentId, input.versionId],
      );
      const chunk = chunkResult.rows[0];
      if (!chunk) throw new Error('expected seeded document chunk');
      const aiSessionId = randomUUID();
      const claimId = randomUUID();
      const sessionClaimId = 'contract-ai-review-materialized-1';
      const claimHash = sha256Hex(input.text);
      const sourceRef = `chunk:${chunk.chunk_id}`;
      await client.query('BEGIN');
      try {
        await client.query(
          `
            INSERT INTO ai_sessions (
              ai_session_id, tenant_id, matter_id, actor_id, model_route, status,
              prompt_hash, prompt_length, response_hash, response_length,
              response_token_count, latency_ms
            )
            VALUES ($1, $2, $3, $4, 'local_gemma', 'responded', $5, 48, $6, $7, 12, 100)
          `,
          [
            aiSessionId,
            tenantAlphaId,
            matterId,
            alphaOwnerUserId,
            sha256Hex(`contract-ai-review-materialize:${aiSessionId}`),
            claimHash,
            input.text.length,
          ],
        );
        await client.query(
          `
            INSERT INTO ai_claims (
              claim_id, tenant_id, ai_session_id, session_claim_id, claim_hash,
              claim_text, kind, is_legal_conclusion, verification_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'review_required')
          `,
          [
            claimId,
            tenantAlphaId,
            aiSessionId,
            sessionClaimId,
            claimHash,
            input.text,
            input.task === 'clause_analysis' ? 'clause' : 'risk',
            input.task === 'risk_extraction',
          ],
        );
        await client.query(
          `
            INSERT INTO ai_claim_citations (
              tenant_id, claim_id, source_ref, document_id, version_id, chunk_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [tenantAlphaId, claimId, sourceRef, input.documentId, input.versionId, chunk.chunk_id],
        );
        await client.query('COMMIT');
        return { aiSessionId, sessionClaimId, claimHash, sourceRef };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async function insertDocumentRevisions(input: {
    documentId: string;
    versionId: string;
    revisions: Array<{
      changeType: 'insert' | 'delete';
      beforeText: string;
      afterText: string;
    }>;
  }): Promise<void> {
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      for (const [sequenceNo, revision] of input.revisions.entries()) {
        await client.query(
          `
            INSERT INTO document_revisions (
              tenant_id, matter_id, document_id, version_id, sequence_no, change_type,
              before_text, after_text, before_text_hash, after_text_hash, parser_version
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'b10-worker-v1')
          `,
          [
            tenantAlphaId,
            matterId,
            input.documentId,
            input.versionId,
            sequenceNo,
            revision.changeType,
            revision.beforeText,
            revision.afterText,
            sha256Hex(revision.beforeText),
            sha256Hex(revision.afterText),
          ],
        );
      }
    });
  }

  async function seedParty(
    targetMatterId: string,
    name: string,
    createdBy = alphaOwnerUserId,
  ): Promise<string> {
    const partyId = randomUUID();
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO parties (
            party_id, tenant_id, matter_id, name, party_type, party_role, created_by
          )
          VALUES ($1, $2, $3, $4, 'corporation', 'counterparty', $5)
        `,
        [partyId, tenantAlphaId, targetMatterId, name, createdBy],
      );
    });
    return partyId;
  }
});

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function contractCounts(versionId: string): Promise<{
  clauses: number;
  chunks: number;
  terms: number;
  conflicts: number;
  redlines: number;
}> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      clauses: string;
      chunks: string;
      terms: string;
      conflicts: string;
      redlines: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM contract_clauses WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS clauses,
          (SELECT count(*) FROM contract_clause_chunks WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS chunks,
          (SELECT count(*) FROM contract_defined_terms WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS terms,
          (SELECT count(*) FROM contract_defined_terms WHERE tenant_id = $1 AND version_id = $2 AND conflict_status = 'conflict' AND stale = false)::text AS conflicts,
          (SELECT count(*) FROM contract_redline_changes WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS redlines
      `,
      [tenantAlphaId, versionId],
    );
    const row = result.rows[0];
    return {
      clauses: Number(row?.clauses ?? 0),
      chunks: Number(row?.chunks ?? 0),
      terms: Number(row?.terms ?? 0),
      conflicts: Number(row?.conflicts ?? 0),
      redlines: Number(row?.redlines ?? 0),
    };
  });
}

async function contractAiReviewJobs(versionId: string): Promise<ContractAiReviewJobRow[]> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<ContractAiReviewJobRow>(
      `
        SELECT data, retry_limit, retry_delay, retry_backoff, dead_letter, singleton_key
        FROM pgboss.job
        WHERE name = $1
          AND data->>'versionId' = $2
        ORDER BY data->>'task'
      `,
      [contractAiReviewQueueName, versionId],
    );
    return result.rows;
  });
}

async function latestContractAudit(documentId: string, action: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, documentId, action],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function latestRuleAudit(ruleId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'PLAYBOOK_RULE_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, ruleId],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function latestClauseBankAudit(entryId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'CLAUSE_BANK_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, entryId],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function latestWordClauseInsertionAudit(targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND target_type = 'word_clause_insertion'
          AND action = 'CONTRACT_CLAUSE_BANK_VIEWED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, targetId],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function latestAiReviewAudit(findingId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'CONTRACT_AI_REVIEW_ACCEPTED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, findingId],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function latestNegotiationAudit(positionId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'NEGOTIATION_POSITION_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, positionId],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function startEmbeddingEndpoint(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/embed') {
      response.writeHead(404).end();
      return;
    }
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      const texts = embeddingInputTexts(raw);
      if (!texts) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid input' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          embeddings: texts.map(semanticTestEmbeddingVector),
          model: 'bge-m3',
          total_duration: 1_000_000,
        }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('embedding endpoint missing port');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function embeddingInputTexts(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw) as { input?: unknown };
    if (!Array.isArray(parsed.input)) return null;
    const texts = parsed.input.filter((value): value is string => typeof value === 'string');
    return texts.length === parsed.input.length ? texts : null;
  } catch {
    return null;
  }
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function seedSyntheticClauseEmbeddings(input: {
  tenantId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  count: number;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        WITH inserted AS (
          INSERT INTO contract_clauses (
            tenant_id, matter_id, document_id, version_id, clause_kind, clause_number,
            start_offset, end_offset, heading_hash, text_hash, parser_version, stale,
            updated_at
          )
          SELECT $1, $2, $3, $4, 'section', 'perf-' || item_no::text,
            100000 + item_no * 10, 100005 + item_no * 10, repeat('a', 64),
            lpad(to_hex(item_no), 64, '0'), 'r8-local-v1', false, now()
          FROM generate_series(1, $5::int) AS item_no
          ON CONFLICT (tenant_id, version_id, clause_number, start_offset)
          DO UPDATE SET
            stale = false,
            updated_at = EXCLUDED.updated_at
          RETURNING clause_id, clause_number, text_hash
        )
        INSERT INTO contract_clause_embeddings (
          tenant_id, clause_id, matter_id, document_id, version_id, model_route, model_tier,
          embedding, embedding_hash, source_text_hash, stale, updated_at
        )
        SELECT $1, clause_id, $2, $3, $4, 'bge_m3', 'local',
          (ARRAY[1::real] || array_fill(0::real, ARRAY[1023]))::vector(1024),
          repeat('e', 64), text_hash, false, now()
        FROM inserted
        ON CONFLICT (tenant_id, clause_id, model_route)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          document_id = EXCLUDED.document_id,
          version_id = EXCLUDED.version_id,
          embedding = EXCLUDED.embedding,
          embedding_hash = EXCLUDED.embedding_hash,
          source_text_hash = EXCLUDED.source_text_hash,
          stale = false,
          updated_at = EXCLUDED.updated_at
      `,
      [input.tenantId, input.matterId, input.documentId, input.versionId, input.count],
    );
  });
}
