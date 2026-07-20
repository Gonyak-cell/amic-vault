import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AiPrepMatterReadinessDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { LocalGemmaGenerationService } from '../../apps/api/src/modules/ai/generation/local-gemma-generation.service';
import { AiPrepProcessor } from '../../apps/api/src/modules/ai/prep/ai-prep.processor';
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

describe('AI matter timeline integration', () => {
  const marker = `ai-matter-timeline-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const firstDocumentId = randomUUID();
  const firstVersionId = randomUUID();
  const secondDocumentId = randomUUID();
  const secondVersionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let securityAdminCookie: string;

  beforeAll(async () => {
    await insertTimelineDocument({
      documentId: firstDocumentId,
      versionId: firstVersionId,
      title: `${marker} LOI`,
      contentText: `${marker} 2026-01-05 LOI 체결 사실이 포함된 문서입니다.`,
      index: 990,
    });
    await insertTimelineDocument({
      documentId: secondDocumentId,
      versionId: secondVersionId,
      title: `${marker} Contract`,
      contentText: `${marker} 2026-03-10 계약서 초안 수령 사실이 포함된 문서입니다.`,
      index: 991,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await enableAiPolicyForMatter(matterId);

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    securityAdminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates matter timeline artifacts and exposes cited timeline through the admin API', async () => {
    const firstChunkId = await firstChildChunkId(firstVersionId);
    const secondChunkId = await firstChildChunkId(secondVersionId);
    const gemmaSpy = vi
      .spyOn(LocalGemmaGenerationService.prototype, 'generateGrounded')
      .mockResolvedValueOnce(dateFactOutput('2026-01-05 LOI 체결', firstChunkId))
      .mockResolvedValueOnce(dateFactOutput('2026-03-10 계약서 초안 수령', secondChunkId));

    try {
      const processor = app.get(AiPrepProcessor);
      await processor.handle({
        tenantId: tenantAlphaId,
        documentId: firstDocumentId,
        versionId: firstVersionId,
        matterId,
        artifactKind: 'date_facts',
      });
      await processor.handle({
        tenantId: tenantAlphaId,
        documentId: secondDocumentId,
        versionId: secondVersionId,
        matterId,
        artifactKind: 'date_facts',
      });
    } finally {
      gemmaSpy.mockRestore();
    }

    await expect(matterTimelineArtifactCount()).resolves.toBeGreaterThan(0);

    const denied = await fetch(`${baseUrl}/v1/matters/${matterId}/ai-prep`, {
      headers: { cookie: ownerCookie },
    });
    expect(denied.status).toBe(403);

    const response = await fetch(`${baseUrl}/v1/matters/${matterId}/ai-prep`, {
      headers: { cookie: securityAdminCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    const readiness = JSON.parse(text) as AiPrepMatterReadinessDto;
    expect(readiness.timeline.map((item) => item.date)).toEqual(['2026-01-05', '2026-03-10']);
    expect(readiness.timeline[0]?.citationRefs).toEqual([`chunk:${firstChunkId}`]);
    expect(readiness.timeline[1]).toMatchObject({
      documentId: secondDocumentId,
      citationRefs: [`chunk:${secondChunkId}`],
    });
  });

  async function insertTimelineDocument(input: {
    documentId: string;
    versionId: string;
    title: string;
    contentText: string;
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
        contentText: input.contentText,
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
      input.index,
    );
    await seedSemanticChunksForVersion({
      tenantId: tenantAlphaId,
      documentId: input.documentId,
      versionId: input.versionId,
      contentText: input.contentText,
    });
    await setDocumentAiAllowed({
      tenantId: tenantAlphaId,
      documentId: input.documentId,
      aiAllowed: true,
    });
  }

  async function enableAiPolicyForMatter(targetMatterId: string): Promise<void> {
    const policyId = randomUUID();
    const accessPolicyId = randomUUID();
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO ai_policies (
            policy_id, tenant_id, name, allowed_model_tiers
          )
          VALUES ($1, $2, 'Matter timeline local policy', ARRAY['local']::text[])
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
        [tenantAlphaId, targetMatterId, policyId],
      );
    });
  }

  async function firstChildChunkId(targetVersionId: string): Promise<string> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ chunk_id: string }>(
        `
          SELECT chunk_id
          FROM document_chunks
          WHERE tenant_id = $1
            AND version_id = $2
            AND chunk_kind = 'child'
            AND stale = false
          ORDER BY chunk_ordinal ASC
          LIMIT 1
        `,
        [tenantAlphaId, targetVersionId],
      );
      const chunkId = result.rows[0]?.chunk_id;
      if (!chunkId) throw new Error('expected seeded child chunk');
      return chunkId;
    });
  }

  async function matterTimelineArtifactCount(): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND matter_id = $2
            AND artifact_kind = 'matter_timeline'
            AND status = 'completed'
            AND is_stale = false
        `,
        [tenantAlphaId, matterId],
      );
      return Number.parseInt(result.rows[0]?.count ?? '0', 10);
    });
  }
});

function dateFactOutput(text: string, chunkId: string) {
  return {
    status: 'completed' as const,
    model: 'gemma4:12b',
    latencyMs: 9,
    output: {
      answer: text,
      sections: [
        {
          section_id: 'date',
          heading: '날짜',
          text,
          source_refs: [`chunk:${chunkId}`],
        },
      ],
      claims: [
        {
          claim_id: `claim-${chunkId.slice(0, 8)}`,
          kind: 'timeline',
          text,
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
      ],
      warnings: [],
    },
  };
}
