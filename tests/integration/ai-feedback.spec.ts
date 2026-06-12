import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AiFeedbackMetricsDto, AiFeedbackResponseDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AiSessionLogService } from '../../apps/api/src/modules/ai/session/ai-session-log.service';
import {
  collectAiGateMetrics,
  computeAiGateMetrics,
} from '../../tools/evalset/ai-gate-metrics';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('AI feedback and gate metrics integration', () => {
  const marker = `ai-feedback-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let adminCookie: string;
  let sessionId: string;
  let feedback: AiFeedbackResponseDto;

  beforeAll(async () => {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId,
        versionId,
        title: `${marker} Feedback Memo`,
        contentText: `${marker} feedback fixture text`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
      991,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
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
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });

    const sessions = app.get(AiSessionLogService);
    const created = await sessions.createSession(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      {
        matterId,
        modelRoute: 'local_gemma',
        promptHash: sha256Hex('feedback prompt hash only'),
        promptLength: 25,
      },
    );
    sessionId = created.sessionId;
    await sessions.recordResponse({ tenantId: tenantAlphaId, userId: alphaOwnerUserId }, sessionId, {
      responseHash: sha256Hex('feedback response hash only'),
      responseLength: 54,
      responseTokenCount: 10,
      latencyMs: 33,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates tenant-scoped feedback schema without prompt response or free-form text columns', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const columns = await client.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'feedback_items'
          ORDER BY ordinal_position
        `,
      );
      const names = columns.rows.map((row) => row.column_name).join('\n');
      expect(names).toContain('tenant_id');
      expect(names).toContain('rating');
      expect(names).not.toMatch(/prompt|response|body|content|snippet|raw|comment|text/i);

      const rls = await client.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `
          SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
          WHERE relname = 'feedback_items'
        `,
      );
      expect(rls.rows).toEqual([
        { relname: 'feedback_items', relrowsecurity: true, relforcerowsecurity: true },
      ]);
    });
  });

  it('records owner feedback with reference-only audit metadata', async () => {
    feedback = await postFeedback(ownerCookie, 201, {
      sessionId,
      rating: 4,
      helpful: true,
      correctionType: 'none',
      errorTypes: ['incorrect_citation'],
      editDistance: 0,
    });

    expect(feedback).toMatchObject({
      sessionId,
      matterId,
      recordedByUserId: alphaOwnerUserId,
      rating: 4,
      helpful: true,
      correctionType: 'none',
      errorTypes: ['incorrect_citation'],
    });

    const audits = await feedbackAuditEvents(feedback.feedbackId);
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'AI_FEEDBACK_RECORDED',
        target_type: 'ai_feedback',
        target_id: feedback.feedbackId,
        metadata_json: expect.objectContaining({
          ai_session_id: sessionId,
          feedback_id: feedback.feedbackId,
          matter_id: matterId,
          rating: 4,
          helpful: true,
          correction_type: 'none',
          error_types: ['incorrect_citation'],
          edit_distance: 0,
        }),
      }),
    ]);
    const rawAudit = audits.map((audit) => audit.raw_metadata).join('\n');
    expect(rawAudit).not.toContain('feedback prompt hash only');
    expect(rawAudit).not.toContain('feedback response hash only');
    expect(rawAudit).not.toContain(`${marker} feedback fixture text`);
    expect(rawAudit).not.toMatch(/prompt_text|response_text|body|content|snippet|raw|comment/i);
  });

  it('allows admin-scoped feedback and metrics while denying non-owner non-admin access', async () => {
    const denied = await fetch(`${baseUrl}/v1/ai/feedback`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, rating: 3 }),
    });
    expect(denied.status).toBe(404);
    expect(await denied.text()).toContain('PERMISSION_DENIED');

    await expect(
      postFeedback(adminCookie, 201, {
        sessionId,
        rating: 5,
        helpful: false,
        correctionType: 'none',
        errorTypes: [],
        editDistance: 0,
      }),
    ).resolves.toMatchObject({ rating: 5 });

    const ownerMetrics = await fetch(`${baseUrl}/v1/ai/feedback/metrics?matterId=${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownerMetrics.status).toBe(404);

    const metrics = await getMetrics(adminCookie, matterId);
    expect(metrics).toMatchObject({
      tenantId: tenantAlphaId,
      matterId,
      feedbackCount: 2,
      permissionConcernCount: 0,
    });
    expect(metrics.averageRating).toBeCloseTo(4.5);
    expect(metrics.stopCriteria.every((criterion) => criterion.pass)).toBe(true);
  });

  it('keeps feedback rows tenant isolated under RLS', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text
          FROM feedback_items
          WHERE feedback_item_id = $1
        `,
        [feedback.feedbackId],
      );
      expect(Number(result.rows[0]?.count ?? '0')).toBe(0);
    });
  });

  it('computes AI gate metrics and detects permission leakage candidates', async () => {
    const report = await collectAiGateMetrics({ tenantId: tenantAlphaId, matterId });
    expect(report.approvedSubsetOnly).toBe(true);
    expect(report.feedbackCount).toBe(2);
    expect(report.permissionAccuracy).toBe(1);
    expect(report.hallucinationRate).toBe(0);
    expect(report.auditCoverage).toBe(1);
    expect(report.externalModelCallAttempts).toBe(0);

    const leakage = computeAiGateMetrics({
      evaluationCaseCount: 1,
      deidentifiedEvaluationCaseCount: 1,
      totalCitations: 2,
      matchedCitations: 1,
      permissionLeakageViolations: 1,
      retrievalIncludedCount: 1,
      retrievalExcludedCount: 1,
      feedbackCount: 1,
      hallucinationFeedbackCount: 0,
      totalSessions: 1,
      sessionsWithQueryAudit: 1,
      sessionsWithResponseAudit: 1,
      externalModelCallAttempts: 0,
    });
    expect(leakage.permissionAccuracy).toBe(0.5);
    expect(leakage.technicalPass).toBe(false);
  });

  async function postFeedback(
    cookie: string,
    expectedStatus: number,
    body: Record<string, unknown>,
  ): Promise<AiFeedbackResponseDto> {
    const response = await fetch(`${baseUrl}/v1/ai/feedback`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(expectedStatus);
    return JSON.parse(text) as AiFeedbackResponseDto;
  }

  async function getMetrics(cookie: string, id: string): Promise<AiFeedbackMetricsDto> {
    const response = await fetch(`${baseUrl}/v1/ai/feedback/metrics?matterId=${id}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as AiFeedbackMetricsDto;
  }
});

async function feedbackAuditEvents(feedbackId: string): Promise<
  {
    action: string;
    target_type: string;
    target_id: string | null;
    metadata_json: Record<string, unknown>;
    raw_metadata: string;
  }[]
> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      action: string;
      target_type: string;
      target_id: string | null;
      metadata_json: Record<string, unknown>;
      raw_metadata: string;
    }>(
      `
        SELECT action, target_type, target_id::text, metadata_json,
          metadata_json::text AS raw_metadata
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AI_FEEDBACK_RECORDED'
          AND target_id = $2
        ORDER BY seq ASC
      `,
      [tenantAlphaId, feedbackId],
    );
    return result.rows;
  });
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
