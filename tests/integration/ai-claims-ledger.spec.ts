import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AiSessionClaimsResponseDto, AiSummaryResponseDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentAiAllowed,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('AI claims ledger integration', () => {
  const marker = `ai-claims-${randomUUID().replaceAll('-', 'q')}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let adminCookie: string;
  let documentId: string;
  let versionId: string;

  beforeAll(async () => {
    documentId = randomUUID();
    versionId = randomUUID();
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId,
        versionId,
        title: `${marker} Claim Ledger Memo`,
        contentText: `${marker} authorized claim ledger source text`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-29T00:00:00.000Z',
      },
      991,
    );
    await seedSemanticChunksForVersion({
      tenantId: tenantAlphaId,
      documentId,
      versionId,
      contentText: `${marker} authorized claim ledger source text`,
    });
    await setDocumentAiAllowed({ tenantId: tenantAlphaId, documentId, aiAllowed: true });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await enableAiPolicyForMatter();

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists generated summary claims with chunk citations and exposes them to owner and admins', async () => {
    const summary = await postSummary({
      matterId,
      task: 'matter_summary',
      query: `${marker} claim ledger`,
      filters: { clientId },
      maxChunks: 3,
    });
    expect(summary.claims.length).toBeGreaterThan(0);

    const ledgerCounts = await claimLedgerCounts(summary.sessionId);
    expect(ledgerCounts.claimCount).toBe(summary.claims.length);
    expect(ledgerCounts.claimsWithoutCitation).toBe(0);
    expect(ledgerCounts.citationsWithoutChunk).toBe(0);

    const ownerClaims = await getClaims(ownerCookie, summary.sessionId, 200);
    expect(ownerClaims.claims).toHaveLength(summary.claims.length);
    expect(ownerClaims.claims[0]?.claimText).toContain(marker);
    expect(ownerClaims.claims[0]?.citations[0]?.sourceRef).toBe(
      `chunk:${ownerClaims.claims[0]?.citations[0]?.chunkId}`,
    );

    const adminClaims = await getClaims(adminCookie, summary.sessionId, 200);
    expect(adminClaims.claims).toHaveLength(summary.claims.length);

    const denied = await fetch(`${baseUrl}/v1/ai/sessions/${summary.sessionId}/claims`, {
      headers: { cookie: memberCookie },
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');
    expect(deniedBody).not.toContain(summary.sessionId);
    expect(deniedBody).not.toContain(documentId);
  });

  it('rejects raw claim rows without citations at the database boundary', async () => {
    const summary = await postSummary({
      matterId,
      task: 'document_summary',
      query: `${marker} raw claim guard`,
      targetDocumentId: documentId,
      filters: { clientId },
      maxChunks: 1,
    });

    await expect(insertUncitedClaim(summary.sessionId)).rejects.toThrow(
      /AI_CLAIM_CITATION_REQUIRED/,
    );
  });

  async function postSummary(body: Record<string, unknown>): Promise<AiSummaryResponseDto> {
    const response = await fetch(`${baseUrl}/v1/ai/summaries`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as AiSummaryResponseDto;
  }

  async function getClaims(
    cookie: string,
    sessionId: string,
    expectedStatus: number,
  ): Promise<AiSessionClaimsResponseDto> {
    const response = await fetch(`${baseUrl}/v1/ai/sessions/${sessionId}/claims`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(expectedStatus);
    return JSON.parse(text) as AiSessionClaimsResponseDto;
  }

  async function enableAiPolicyForMatter(): Promise<void> {
    const policyId = randomUUID();
    const accessPolicyId = randomUUID();
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO ai_policies (
            policy_id, tenant_id, name, allowed_model_tiers
          )
          VALUES ($1, $2, 'Claim ledger local policy', ARRAY['local']::text[])
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
          UPDATE matters
          SET ai_policy_id = $3,
            updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
        `,
        [tenantAlphaId, matterId, policyId],
      );
    });
  }
});

async function claimLedgerCounts(sessionId: string): Promise<{
  claimCount: number;
  claimsWithoutCitation: number;
  citationsWithoutChunk: number;
}> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      claim_count: string;
      claims_without_citation: string;
      citations_without_chunk: string;
    }>(
      `
        WITH claims AS (
          SELECT claim_id
          FROM ai_claims
          WHERE tenant_id = $1
            AND ai_session_id = $2
        )
        SELECT
          (SELECT count(*) FROM claims) AS claim_count,
          (
            SELECT count(*)
            FROM claims c
            WHERE NOT EXISTS (
              SELECT 1
              FROM ai_claim_citations cc
              WHERE cc.tenant_id = $1
                AND cc.claim_id = c.claim_id
            )
          ) AS claims_without_citation,
          (
            SELECT count(*)
            FROM ai_claim_citations cc
            JOIN claims c ON c.claim_id = cc.claim_id
            LEFT JOIN document_chunks dc
              ON dc.tenant_id = cc.tenant_id
             AND dc.chunk_id = cc.chunk_id
            WHERE dc.chunk_id IS NULL
          ) AS citations_without_chunk
      `,
      [tenantAlphaId, sessionId],
    );
    const row = result.rows[0];
    return {
      claimCount: Number(row?.claim_count ?? 0),
      claimsWithoutCitation: Number(row?.claims_without_citation ?? 0),
      citationsWithoutChunk: Number(row?.citations_without_chunk ?? 0),
    };
  });
}

async function insertUncitedClaim(sessionId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO ai_claims (
            tenant_id, ai_session_id, session_claim_id, claim_hash, claim_text, kind
          )
          VALUES ($1, $2, $3, $4, $5, 'summary')
        `,
        [
          tenantAlphaId,
          sessionId,
          `raw-${randomUUID()}`,
          createHash('sha256').update(randomUUID()).digest('hex'),
          'Uncited raw claim should fail.',
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}
