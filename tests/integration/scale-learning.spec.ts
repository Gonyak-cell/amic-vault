import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  ScaleAiGateReviewDto,
  ScaleCostSnapshotDto,
  ScaleEvalRunDto,
  ScaleLearningEventDto,
  ScaleMigrationDrillDto,
  ScalePerformanceRunDto,
  ScaleReadinessSummaryDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('Scale and Learning integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const evidenceRef = `r14/gate-${marker}`;
  const hash = hashText(`scale-${marker}`);
  let app: INestApplication;
  let baseUrl: string;
  let adminCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('records performance, cost, eval, migration, learning, and AI-gate evidence', async () => {
    const performance = await postJson<ScalePerformanceRunDto>('/v1/scale/performance-runs', {
      scenario: 'search_query',
      sampleCount: 201,
      p50Ms: 70,
      p95Ms: 160,
      p99Ms: 240,
      targetP95Ms: 250,
      measurementHash: hash,
      evidenceRef,
    });
    expect(performance.status).toBe('pass');

    const cost = await postJson<ScaleCostSnapshotDto>('/v1/scale/cost-snapshots', {
      scope: 'total',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-12',
      unitCount: 174,
      estimatedCostCents: 0,
      currency: 'USD',
      costModelHash: hash,
      evidenceRef,
    });
    expect(cost.costModelHash).toBe(hash);

    const evalRun = await postJson<ScaleEvalRunDto>('/v1/scale/eval-runs', {
      suite: 'full_regression',
      caseCount: 201,
      passCount: 201,
      failCount: 0,
      metricHash: hash,
      evidenceRef,
    });
    expect(evalRun.status).toBe('pass');

    const drill = await postJson<ScaleMigrationDrillDto>('/v1/scale/migration-drills', {
      scope: 'full_roundtrip',
      durationMs: 18000,
      schemaHashBefore: hash,
      schemaHashAfter: hash,
      status: 'pass',
      evidenceRef,
    });
    expect(drill.status).toBe('pass');

    const learning = await postJson<ScaleLearningEventDto>('/v1/scale/learning-events', {
      category: 'gate',
      severity: 'low',
      patternCode: `R14.${marker}`,
      evidenceRef,
      resolutionRef: 'docs/ledger/gates/R14_gate.md',
    });
    expect(learning.patternCode).toBe(`R14.${marker}`);

    const aiGate = await postJson<ScaleAiGateReviewDto>('/v1/scale/ai-gate-reviews', {
      candidateRoute: 'external_model',
      decision: 'external_blocked',
      externalModelAllowed: false,
      controlHash: hash,
      evidenceRef,
    });
    expect(aiGate.externalModelAllowed).toBe(false);

    const readiness = await getJson<ScaleReadinessSummaryDto>('/v1/scale/readiness');
    expect(readiness.technicalPass).toBe(true);
    expect(readiness.externalModelAllowedCount).toBe(0);

    const audits = await scaleAudits();
    const auditText = JSON.stringify(audits.map((row) => row.metadata_json));
    expect(auditText).toContain(performance.performanceRunId);
    expect(auditText).toContain(cost.costSnapshotId);
    expect(auditText).toContain(evalRun.evalRunId);
    expect(auditText).toContain(drill.migrationDrillId);
    expect(auditText).toContain(learning.learningEventId);
    expect(auditText).toContain(aiGate.aiGateReviewId);
    expect(auditText).not.toContain('prompt');
    expect(auditText).not.toContain('response');
    expect(auditText).not.toContain('secret');
  });

  it('blocks non-admin scale evidence writes', async () => {
    const response = await fetch(`${baseUrl}/v1/scale/performance-runs`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        scenario: 'search_query',
        sampleCount: 1,
        p50Ms: 1,
        p95Ms: 1,
        p99Ms: 1,
        targetP95Ms: 10,
        measurementHash: hash,
        evidenceRef: `blocked-${marker}`,
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(`blocked-${marker}`);
  });

  it('keeps R14 tables RLS-protected, non-destructive, and external-AI closed', async () => {
    const evidence = await withClient(createOwnerClient(), async (client) => {
      const rls = await client.query<{ table_name: string; rls: boolean; force_rls: boolean }>(
        `
          SELECT relname AS table_name, relrowsecurity AS rls, relforcerowsecurity AS force_rls
          FROM pg_class
          WHERE relname IN (
            'scale_performance_runs',
            'scale_cost_snapshots',
            'scale_eval_runs',
            'scale_migration_drills',
            'scale_learning_events',
            'scale_ai_gate_reviews'
          )
          ORDER BY relname
        `,
      );
      const grants = await client.query<{ table_name: string; privilege_type: string }>(
        `
          SELECT table_name, privilege_type
          FROM information_schema.table_privileges
          WHERE grantee = 'vault_app'
            AND privilege_type IN ('DELETE', 'TRUNCATE')
            AND table_schema = 'public'
            AND table_name LIKE 'scale_%'
          ORDER BY table_name, privilege_type
        `,
      );
      const columns = await client.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name LIKE 'scale_%'
            AND column_name ~* '(secret|token|password|private_key|key_material|endpoint_url|metadata_xml|assertion_xml|prompt|response|body|raw)'
          ORDER BY table_name, column_name
        `,
      );
      const externalOpen = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM scale_ai_gate_reviews
          WHERE tenant_id = $1
            AND external_model_allowed IS TRUE
        `,
        [tenantAlphaId],
      );
      return {
        rls: rls.rows,
        grants: grants.rows,
        columns: columns.rows,
        externalOpen: Number(externalOpen.rows[0]?.count ?? '0'),
      };
    });

    expect(evidence.rls).toEqual([
      { table_name: 'scale_ai_gate_reviews', rls: true, force_rls: true },
      { table_name: 'scale_cost_snapshots', rls: true, force_rls: true },
      { table_name: 'scale_eval_runs', rls: true, force_rls: true },
      { table_name: 'scale_learning_events', rls: true, force_rls: true },
      { table_name: 'scale_migration_drills', rls: true, force_rls: true },
      { table_name: 'scale_performance_runs', rls: true, force_rls: true },
    ]);
    expect(evidence.grants).toEqual([]);
    expect(evidence.columns).toEqual([]);
    expect(evidence.externalOpen).toBe(0);
  });

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.ok, text).toBe(true);
    return JSON.parse(text) as T;
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: adminCookie },
    });
    const text = await response.text();
    expect(response.ok, text).toBe(true);
    return JSON.parse(text) as T;
  }
});

async function scaleAudits(): Promise<Array<{ action: string; metadata_json: unknown }>> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; metadata_json: unknown }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action IN (
            'SCALE_PERFORMANCE_RECORDED',
            'SCALE_COST_SNAPSHOT_RECORDED',
            'SCALE_EVAL_RUN_RECORDED',
            'SCALE_MIGRATION_DRILL_RECORDED',
            'SCALE_LEARNING_EVENT_RECORDED',
            'ADVANCED_AI_GATE_REVIEWED',
            'SCALE_READINESS_VIEWED'
          )
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [tenantAlphaId],
    );
    return result.rows;
  });
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
