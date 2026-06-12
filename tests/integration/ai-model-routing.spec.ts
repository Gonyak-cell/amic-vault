import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AiModelRoutingService } from '../../apps/api/src/modules/ai/routing/model-routing.service';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

interface RoutingFixture {
  policyId: string;
  matterId: string;
}

describe('AI model routing integration', () => {
  let app: INestApplication;
  let routing: AiModelRoutingService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    routing = app.get(AiModelRoutingService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows only the local_gemma route when policy and model access allow it', async () => {
    const fixture = await createRoutingFixture();
    const decision = await routing.decide(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      { matterId: fixture.matterId, modelRoute: 'local_gemma', taskKind: 'retrieval' },
    );

    expect(decision).toMatchObject({
      effect: 'ALLOW',
      modelRoute: 'local_gemma',
      modelTier: 'local',
      risk: 'low',
      escalationRequired: false,
    });
    expect(decision).not.toHaveProperty('answer');
  });

  it('denies non-local routes in R6 and audits the attempt', async () => {
    const fixture = await createRoutingFixture();
    const decision = await routing.decide(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      { matterId: fixture.matterId, modelRoute: 'openai_gpt4', taskKind: 'retrieval' },
    );

    expect(decision).toMatchObject({
      effect: 'DENY',
      modelRoute: null,
      reasonCode: 'model_route_unknown',
      escalationRequired: true,
    });

    const audit = await latestAiPolicyAudit(fixture.matterId);
    expect(audit?.result).toBe('denied');
    expect(audit?.metadata_json).toMatchObject({
      matter_id: fixture.matterId,
      model_route: 'openai_gpt4',
      reason_code: 'model_route_unknown',
      blocked_reason: 'model_route_unknown',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toMatch(/api[_-]?key|secret|prompt|body|snippet/i);
  });

  it('escalates high-risk tasks without fabricating an answer', async () => {
    const fixture = await createRoutingFixture();
    const decision = await routing.decide(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      {
        matterId: fixture.matterId,
        modelRoute: 'local_gemma',
        taskKind: 'legal_conclusion',
        prompt: '최종 법률 의견 형태로 답변',
      },
    );

    expect(decision).toMatchObject({
      effect: 'ESCALATE',
      modelRoute: 'local_gemma',
      risk: 'high',
      escalationRequired: true,
      reasonCode: 'high_risk_requires_review',
    });
    expect(decision).not.toHaveProperty('answer');
  });
});

async function createRoutingFixture(): Promise<RoutingFixture> {
  const policyId = randomUUID();
  const accessPolicyId = randomUUID();
  const clientId = randomUUID();
  const matterId = randomUUID();

  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `
          INSERT INTO ai_policies (
            policy_id, tenant_id, name, allowed_model_tiers
          )
          VALUES ($1, $2, 'R6 routing local policy', ARRAY['local']::text[])
        `,
        [policyId, tenantAlphaId],
      );
      await client.query(
        `
          INSERT INTO ai_model_access_policies (
            access_policy_id, tenant_id, route_key, model_tier, status
          )
          VALUES ($1, $2, 'local_gemma', 'local', 'enabled')
          ON CONFLICT (tenant_id, route_key)
          DO UPDATE SET status = 'enabled', updated_at = now()
        `,
        [accessPolicyId, tenantAlphaId],
      );
      await client.query(
        `
          INSERT INTO clients (client_id, tenant_id, name, created_by)
          VALUES ($1, $2, $3, $4)
        `,
        [clientId, tenantAlphaId, `AI Routing Client ${clientId}`, alphaOwnerUserId],
      );
      await client.query(
        `
          INSERT INTO matters (
            matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, lead_lawyer_id, created_by, ai_policy_id
          )
          VALUES ($1, $2, $3, $4, $5, 'contract', 'active', $6, $6, $7)
        `,
        [
          matterId,
          tenantAlphaId,
          clientId,
          `AIR-${randomUUID()}`,
          `AI Routing Matter ${matterId}`,
          alphaOwnerUserId,
          policyId,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  return { policyId, matterId };
}

async function latestAiPolicyAudit(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      result: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'AI_POLICY_EVALUATED'
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows[0];
  });
}
