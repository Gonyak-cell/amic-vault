import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  DmsNotificationCenterResponseDto,
  LitigationAiSuggestionDto,
  LitigationAiSuggestionListResponseDto,
  LitigationCaseMapResponseDto,
  LitigationEvidenceDto,
  LitigationEvidenceNextCodeResponseDto,
  LitigationFactDto,
  LitigationHearingDto,
  LitigationIssueDto,
  LitigationPleadingDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { LitigationDeadlineNotificationSchedulerService } from '../../apps/api/src/modules/notifications/litigation-deadline-notification-scheduler.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('Litigation Vault integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;

  beforeAll(async () => {
    await insertDocument({
      documentId,
      versionId,
      title: `Litigation ${marker} primary exhibit`,
      text: 'Witness timeline and exhibit packet.',
      index: 1401,
    });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      title: `Litigation ${marker} denied exhibit`,
      text: 'Denied litigation material.',
      index: 1402,
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates evidence, fact, issue, pleading, and permission-scoped case map', async () => {
    const evidence = await postJson<LitigationEvidenceDto>('/v1/litigation/evidence', {
      matterId,
      documentId,
      evidenceCode: `EV-${marker}`,
      evidenceType: 'document',
      exhibitLabel: `Exhibit ${marker}`,
      custodyStatus: 'reviewed',
      admittedStatus: 'unknown',
    });
    expect(evidence.documentId).toBe(documentId);

    const fact = await postJson<LitigationFactDto>('/v1/litigation/facts', {
      matterId,
      evidenceId: evidence.evidenceId,
      factCode: `FACT-${marker}`,
      factSummary: `Witness timeline aligns with exhibit ${marker}.`,
      status: 'verified',
      materiality: 'high',
      citationRefs: [`evidence:${evidence.evidenceId}`],
    });
    expect(fact.evidenceId).toBe(evidence.evidenceId);

    const issue = await postJson<LitigationIssueDto>('/v1/litigation/issues', {
      matterId,
      issueCode: `ISSUE-${marker}`,
      label: `Liability element ${marker}`,
      issueType: 'claim',
      status: 'developing',
      position: 1,
    });
    expect(issue.issueCode).toBe(`ISSUE-${marker}`);

    const pleading = await postJson<LitigationPleadingDto>('/v1/litigation/pleadings', {
      matterId,
      documentId,
      pleadingCode: `PLD-${marker}`,
      pleadingType: 'brief',
      filingStatus: 'internal_draft',
      citationRefs: [`document:${documentId}`],
    });
    expect(pleading.documentId).toBe(documentId);

    const caseMap = await getJson<LitigationCaseMapResponseDto>(
      `/v1/litigation/case-map?matterId=${matterId}&limit=100`,
    );
    expect(caseMap.evidenceCount).toBeGreaterThanOrEqual(1);
    expect(caseMap.factCount).toBeGreaterThanOrEqual(1);
    expect(caseMap.issueCount).toBeGreaterThanOrEqual(1);
    expect(caseMap.pleadingCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(caseMap)).toContain(documentId);
    expect(JSON.stringify(caseMap)).not.toContain('Witness timeline and exhibit packet');
    expect(JSON.stringify(caseMap)).not.toContain(`Litigation ${marker} primary exhibit`);
    expect(JSON.stringify(caseMap)).not.toContain(deniedDocumentId);

    const audit = await latestLitigationAudit('LIT_CASE_MAP_VIEWED', matterId);
    expect(audit?.metadata_json).toMatchObject({
      matter_id: matterId,
      evidence_count: expect.any(Number),
      fact_count: expect.any(Number),
      issue_node_count: expect.any(Number),
      pleading_count: expect.any(Number),
      case_map_count: expect.any(Number),
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(`Witness timeline ${marker}`);
  });

  it('blocks denied documents before litigation evidence registration', async () => {
    const response = await fetch(`${baseUrl}/v1/litigation/evidence`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        documentId: deniedDocumentId,
        evidenceCode: `EV-DENY-${marker}`,
        evidenceType: 'document',
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);

    const audit = await latestLitigationAudit('LIT_EVIDENCE_CHANGED', deniedDocumentId);
    expect(audit).toBeUndefined();
  });

  it('creates pending litigation AI suggestions without mutating confirmed facts or issues', async () => {
    const beforeFacts = await getJson<{ facts: LitigationFactDto[] }>(
      `/v1/litigation/facts?matterId=${matterId}&limit=100`,
    );
    const beforeIssues = await getJson<{ issues: LitigationIssueDto[] }>(
      `/v1/litigation/issues?matterId=${matterId}&limit=100`,
    );

    const suggestion = await postJson<LitigationAiSuggestionDto>('/v1/litigation/ai-suggestions', {
      matterId,
      documentId,
      versionId,
      suggestionKind: 'issue_evidence_mapping',
      suggestedEvidenceDirection: 'gap',
      suggestedEvidenceType: 'document',
      suggestedIssueTitle: `손해액 입증 ${marker}`,
      confidence: 0.84,
      sourceHash: 'd'.repeat(64),
    });
    expect(suggestion).toMatchObject({
      matterId,
      documentId,
      versionId,
      suggestionKind: 'issue_evidence_mapping',
      suggestedEvidenceDirection: 'gap',
      suggestedEvidenceType: 'document',
      suggestedIssueTitle: `손해액 입증 ${marker}`,
      confidence: 0.84,
      status: 'pending',
    });

    const list = await getJson<LitigationAiSuggestionListResponseDto>(
      `/v1/litigation/ai-suggestions?matterId=${matterId}&status=pending&limit=20`,
    );
    expect(list.suggestions.some((item) => item.suggestionId === suggestion.suggestionId)).toBe(
      true,
    );
    expect(JSON.stringify(list)).not.toContain('Witness timeline and exhibit packet');
    expect(JSON.stringify(list)).not.toContain(`Litigation ${marker} primary exhibit`);

    const afterFacts = await getJson<{ facts: LitigationFactDto[] }>(
      `/v1/litigation/facts?matterId=${matterId}&limit=100`,
    );
    const afterIssues = await getJson<{ issues: LitigationIssueDto[] }>(
      `/v1/litigation/issues?matterId=${matterId}&limit=100`,
    );
    expect(afterFacts.facts).toHaveLength(beforeFacts.facts.length);
    expect(afterIssues.issues).toHaveLength(beforeIssues.issues.length);

    const audit = await latestLitigationAudit('LIT_EVIDENCE_CHANGED', suggestion.suggestionId);
    expect(audit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      version_id: versionId,
      hash: 'd'.repeat(64),
      confidence: 0.84,
      evidence_type: 'document',
      status_after: 'pending',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Witness timeline');

    const denied = await fetch(`${baseUrl}/v1/litigation/ai-suggestions`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        documentId: deniedDocumentId,
        versionId: deniedVersionId,
        suggestionKind: 'evidence_classification',
        suggestedEvidenceDirection: 'eul',
        suggestedEvidenceType: 'document',
        confidence: 0.77,
        sourceHash: 'e'.repeat(64),
      }),
    });
    const deniedText = await denied.text();
    expect(denied.status, deniedText).toBe(403);
    expect(deniedText).not.toContain(deniedDocumentId);
  });

  it('suggests direction-scoped exhibit labels and safely reports sequence conflicts', async () => {
    const firstNext = await getJson<LitigationEvidenceNextCodeResponseDto>(
      `/v1/litigation/evidence/next-code?matterId=${matterId}&direction=gap`,
    );

    const created = await postJson<LitigationEvidenceDto>('/v1/litigation/evidence', {
      matterId,
      evidenceCode: `G7-GAP-${marker}-${firstNext.nextSequence}`,
      evidenceDirection: 'gap',
      evidenceSequence: firstNext.nextSequence,
      evidenceType: 'document',
    });
    expect(created.evidenceDirection).toBe('gap');
    expect(created.evidenceSequence).toBe(firstNext.nextSequence);
    expect(created.exhibitLabel).toBe(`갑 제${firstNext.nextSequence}호증`);

    const nextGap = await getJson<LitigationEvidenceNextCodeResponseDto>(
      `/v1/litigation/evidence/next-code?matterId=${matterId}&direction=gap`,
    );
    expect(nextGap.nextSequence).toBe(firstNext.nextSequence + 1);
    expect(nextGap.exhibitLabel).toBe(`갑 제${nextGap.nextSequence}호증`);

    const nextEul = await getJson<LitigationEvidenceNextCodeResponseDto>(
      `/v1/litigation/evidence/next-code?matterId=${matterId}&direction=eul`,
    );
    expect(nextEul.nextSequence).toBe(1);
    expect(nextEul.exhibitLabel).toBe('을 제1호증');

    const collisionBodies = ['A', 'B'].map((suffix) => ({
      matterId,
      evidenceCode: `G7-CON-${marker}-${suffix}`,
      evidenceDirection: 'gap',
      evidenceSequence: nextGap.nextSequence,
      evidenceType: 'document',
    }));
    const responses = await Promise.all(
      collisionBodies.map((body) =>
        fetch(`${baseUrl}/v1/litigation/evidence`, {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const failed = responses.find((response) => response.status === 400);
    expect(await failed?.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'LITIGATION_EVIDENCE_CODE_CONFLICT',
    });
  });

  it('requires citations before facts become verified', async () => {
    const blocked = await fetch(`${baseUrl}/v1/litigation/facts`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        factCode: `FACT-NOCITE-${marker}`,
        factSummary: `Verified fact ${marker} has no cited source.`,
        status: 'verified',
      }),
    });
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(400);
    expect(blockedBody).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'FACT_CITATION_REQUIRED',
    });

    const verified = await postJson<LitigationFactDto>('/v1/litigation/facts', {
      matterId,
      factCode: `FACT-CITED-${marker}`,
      factSummary: `Verified fact ${marker} has a cited source.`,
      status: 'verified',
      citationRefs: [`document:${documentId}`],
    });
    expect(verified.status).toBe('verified');

    const transitionDraft = await postJson<LitigationFactDto>('/v1/litigation/facts', {
      matterId,
      factCode: `FACT-TRANS-${marker}`,
      factSummary: `Draft fact ${marker} needs evidence before verification.`,
      status: 'draft',
    });

    const blockedTransition = await fetch(
      `${baseUrl}/v1/litigation/facts/${transitionDraft.factId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'verified' }),
      },
    );
    const blockedTransitionBody = await blockedTransition.json();
    expect(blockedTransition.status).toBe(400);
    expect(blockedTransitionBody).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'FACT_CITATION_REQUIRED',
    });

    const transitionedResponse = await fetch(
      `${baseUrl}/v1/litigation/facts/${transitionDraft.factId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'verified',
          citationRefs: [`document:${documentId}`],
        }),
      },
    );
    const transitioned = (await transitionedResponse.json()) as LitigationFactDto;
    expect(transitionedResponse.status).toBe(200);
    expect(transitioned.status).toBe('verified');
    expect(transitioned.citationRefs).toEqual([`document:${documentId}`]);

    const clearCitations = await fetch(`${baseUrl}/v1/litigation/facts/${transitioned.factId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ citationRefs: [] }),
    });
    const clearCitationsBody = await clearCitations.json();
    expect(clearCitations.status).toBe(400);
    expect(clearCitationsBody).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'FACT_CITATION_REQUIRED',
    });

    const draft = await postJson<LitigationFactDto>('/v1/litigation/facts', {
      matterId,
      factCode: `FACT-RAW-${marker}`,
      factSummary: `Draft fact ${marker} starts without citations.`,
      status: 'draft',
    });

    await expect(
      withClient(createOwnerClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query(
          `
            UPDATE litigation_facts
            SET status = 'verified'
            WHERE tenant_id = $1
              AND fact_id = $2
          `,
          [tenantAlphaId, draft.factId],
        );
      }),
    ).rejects.toThrow(/litigation_facts_verified_citation_refs_required_check/);
  });

  it('manages hearings and materializes litigation deadline work and notifications idempotently', async () => {
    const scheduledAt = daysFromNowIso(6);
    const hearing = await postJson<LitigationHearingDto>('/v1/litigation/hearings', {
      matterId,
      title: `G8 hearing ${marker}`,
      hearingType: 'deadline',
      scheduledAt,
      courtName: '서울중앙지방법원',
    });
    expect(hearing.status).toBe('scheduled');
    expect(hearing.internalDeadline).toBe(daysBeforeIsoDate(scheduledAt, 7));

    const hearingList = await getJson<{ hearings: LitigationHearingDto[] }>(
      `/v1/litigation/hearings?matterId=${matterId}&limit=50`,
    );
    expect(hearingList.hearings.some((item) => item.hearingId === hearing.hearingId)).toBe(true);

    const betaVisibleCount = await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM litigation_hearings
          WHERE hearing_id = $1
        `,
        [hearing.hearingId],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
    expect(betaVisibleCount).toBe(0);

    const scheduler = app.get(LitigationDeadlineNotificationSchedulerService);
    await scheduler.sweepLitigationDeadlineNotifications({ tenantId: tenantAlphaId });
    await scheduler.sweepLitigationDeadlineNotifications({ tenantId: tenantAlphaId });

    const materialized = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        notification_count: string;
        work_count: string;
      }>(
        `
          SELECT
            (
              SELECT count(*)::text
              FROM work_items
              WHERE tenant_id = $1
                AND kind = 'litigation_deadline'
                AND target_type = 'litigation_key_date'
                AND target_id = $2
                AND status IN ('open', 'in_progress')
            ) AS work_count,
            (
              SELECT count(*)::text
              FROM notifications
              WHERE tenant_id = $1
                AND kind = 'litigation_deadline'
                AND target_type = 'litigation_hearing'
                AND target_id = $2
                AND status IN ('unread', 'read')
            ) AS notification_count
        `,
        [tenantAlphaId, hearing.hearingId],
      );
      return {
        notificationCount: Number(result.rows[0]?.notification_count ?? 0),
        workCount: Number(result.rows[0]?.work_count ?? 0),
      };
    });
    expect(materialized).toEqual({ notificationCount: 1, workCount: 1 });

    const notifications = await getJson<DmsNotificationCenterResponseDto>('/v1/notifications');
    expect(notifications.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: `/matters/${matterId}/litigation?hearingId=${hearing.hearingId}`,
          title: '송무 기일',
        }),
      ]),
    );

    const cancelled = await deleteJson<LitigationHearingDto>(
      `/v1/litigation/hearings/${hearing.hearingId}`,
    );
    expect(cancelled.status).toBe('cancelled');
    const cleanup = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        notification_status: string | null;
        work_status: string | null;
      }>(
        `
          SELECT
            (
              SELECT status
              FROM work_items
              WHERE tenant_id = $1
                AND kind = 'litigation_deadline'
                AND target_type = 'litigation_key_date'
                AND target_id = $2
              LIMIT 1
            ) AS work_status,
            (
              SELECT status
              FROM notifications
              WHERE tenant_id = $1
                AND kind = 'litigation_deadline'
                AND target_type = 'litigation_hearing'
                AND target_id = $2
              LIMIT 1
            ) AS notification_status
        `,
        [tenantAlphaId, hearing.hearingId],
      );
      return result.rows[0];
    });
    expect(cleanup).toMatchObject({ notification_status: 'cancelled', work_status: 'cancelled' });
  });

  it('does not introduce e-filing or external transmission tables after R11 portal Q&A opens', async () => {
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
              OR table_name LIKE '%efile%'
              OR table_name LIKE '%court_upload%'
              OR table_name LIKE '%external_transmission%'
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

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function deleteJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
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
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
      input.index,
    );
  }
});

function daysFromNowIso(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(9, 0, 0, 0);
  return value.toISOString();
}

function daysBeforeIsoDate(isoDateTime: string, days: number): string {
  const value = new Date(isoDateTime);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function latestLitigationAudit(action: string, targetId: string) {
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
      [tenantAlphaId, action, targetId, JSON.stringify({ document_id: targetId })],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}
