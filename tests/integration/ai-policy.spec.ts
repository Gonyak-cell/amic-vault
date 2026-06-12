import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AiPolicyService } from '../../apps/api/src/modules/ai-policy/ai-policy.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

interface AiPolicyFixture {
  policyId: string;
  matterId: string;
  allowedDocumentId: string;
  blockedDocumentId: string;
}

async function createAiPolicyFixture(): Promise<AiPolicyFixture> {
  const policyId = randomUUID();
  const accessPolicyId = randomUUID();
  const clientId = randomUUID();
  const matterId = randomUUID();
  const allowedDocumentId = randomUUID();
  const blockedDocumentId = randomUUID();

  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `
          INSERT INTO ai_policies (
            policy_id, tenant_id, name, allowed_model_tiers
          )
          VALUES ($1, $2, 'R6 local policy', ARRAY['local']::text[])
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
        [clientId, tenantAlphaId, `AI Policy Client ${clientId}`, alphaOwnerUserId],
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
          `AI-${randomUUID()}`,
          `AI Policy Matter ${matterId}`,
          alphaOwnerUserId,
          policyId,
        ],
      );
      await client.query(
        `
          INSERT INTO documents (
            document_id, tenant_id, matter_id, document_family_id, title,
            document_type, confidentiality_level, created_by, ai_allowed
          )
          VALUES
            ($1, $2, $3, $4, 'AI Allowed Document', 'contract', 'standard', $6, true),
            ($5, $2, $3, $7, 'AI Blocked Document', 'contract', 'standard', $6, false)
        `,
        [
          allowedDocumentId,
          tenantAlphaId,
          matterId,
          randomUUID(),
          blockedDocumentId,
          alphaOwnerUserId,
          randomUUID(),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  return { policyId, matterId, allowedDocumentId, blockedDocumentId };
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

describe('AI policy integration', () => {
  let app: INestApplication;
  let aiPolicyService: AiPolicyService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    aiPolicyService = app.get(AiPolicyService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows local route only when matter policy, model policy, and aiAllowed documents align', async () => {
    const fixture = await createAiPolicyFixture();

    const result = await aiPolicyService.evaluate({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId: fixture.matterId,
      modelRoute: 'local_gemma',
      documentIds: [fixture.allowedDocumentId],
      purpose: 'retrieval',
    });

    expect(result.effect).toBe('ALLOW');
    expect(result.policyId).toBe(fixture.policyId);
    expect(result.decisionRef).toMatch(/^ai_policy_decision:/);

    const audit = await latestAiPolicyAudit(fixture.matterId);
    expect(audit?.result).toBe('success');
    expect(audit?.metadata_json).toMatchObject({
      matter_id: fixture.matterId,
      policy_id: fixture.policyId,
      model_route: 'local_gemma',
      document_count: 1,
    });
    expect(Object.keys(audit?.metadata_json ?? {})).not.toEqual(
      expect.arrayContaining(['body', 'content', 'text', 'snippet', 'raw']),
    );
  });

  it('blocks retrieval when a requested document has aiAllowed false without revealing the document id', async () => {
    const fixture = await createAiPolicyFixture();

    const result = await aiPolicyService.evaluate({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId: fixture.matterId,
      modelRoute: 'local_gemma',
      documentIds: [fixture.blockedDocumentId],
      purpose: 'retrieval',
    });

    expect(result.effect).toBe('DENY');
    expect(result.reasonCode).toBe('document_ai_not_allowed');
    try {
      await aiPolicyService.assertAllowed({
        tenantId: tenantAlphaId,
        userId: alphaOwnerUserId,
        matterId: fixture.matterId,
        modelRoute: 'local_gemma',
        documentIds: [fixture.blockedDocumentId],
        purpose: 'retrieval',
      });
      throw new Error('expected AI policy to block');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = error instanceof ForbiddenException ? error.getResponse() : null;
      expect(response).toMatchObject({
        code: 'AI_POLICY_BLOCKED',
        reasonCode: 'document_ai_not_allowed',
      });
      expect(JSON.stringify(response)).not.toContain(fixture.blockedDocumentId);
    }

    const audit = await latestAiPolicyAudit(fixture.matterId);
    expect(audit?.result).toBe('denied');
    expect(audit?.metadata_json).toMatchObject({
      reason_code: 'document_ai_not_allowed',
      blocked_reason: 'document_ai_not_allowed',
      document_count: 1,
    });
    expect(result.decisionRef).toMatch(/^ai_policy_decision:/);
  });

  it('audits policy parse failures as fail-closed failures', async () => {
    const fixture = await createAiPolicyFixture();

    const result = await aiPolicyService.evaluate({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId: fixture.matterId,
      modelRoute: 'local/gemma',
      documentIds: [fixture.allowedDocumentId],
      purpose: 'retrieval',
    });

    expect(result.effect).toBe('DENY');
    expect(result.reasonCode).toBe('policy_parse_failure');

    const audit = await latestAiPolicyAudit(fixture.matterId);
    expect(audit?.result).toBe('failure');
    expect(audit?.metadata_json).toMatchObject({
      reason_code: 'policy_parse_failure',
      blocked_reason: 'policy_parse_failure',
    });
  });

  it('keeps model access policies tenant scoped with RLS', async () => {
    const fixture = await createAiPolicyFixture();

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const alpha = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM ai_model_access_policies
          WHERE route_key = 'local_gemma'
        `,
      );
      expect(Number(alpha.rows[0]?.count ?? '0')).toBeGreaterThanOrEqual(1);

      await setTenant(client, tenantBetaId);
      const beta = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM ai_model_access_policies
          WHERE tenant_id = $1
            AND route_key = 'local_gemma'
        `,
        [tenantAlphaId],
      );
      expect(beta.rows[0]?.count).toBe('0');
    });

    expect(fixture.matterId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
