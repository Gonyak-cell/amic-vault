import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
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

describe('AI prep candidate artifacts integration', () => {
  const marker = `ai-prep-candidates-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  let app: INestApplicationContext | undefined;

  afterAll(async () => {
    await app?.close();
  });

  it('stores cited fact candidate artifacts, opens review work, and leaves graph confirmed data unchanged', async () => {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId,
        versionId,
        title: `${marker} Contract`,
        contentText: `${marker} 계약 체결 사실과 검토 후보가 포함된 문서입니다.`,
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
      997,
    );
    await seedSemanticChunksForVersion({
      tenantId: tenantAlphaId,
      documentId,
      versionId,
      contentText: `${marker} 계약 체결 사실과 검토 후보가 포함된 문서입니다.`,
    });
    await setDocumentAiAllowed({ tenantId: tenantAlphaId, documentId, aiAllowed: true });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await enableAiPolicyForMatter(matterId);
    const sourceChunkId = await firstChildChunkId(versionId);
    const graphNodeCountBefore = await graphNodeCount();
    const gemmaSpy = vi
      .spyOn(LocalGemmaGenerationService.prototype, 'generateGrounded')
      .mockResolvedValue({
        status: 'completed',
        model: 'gemma4:12b',
        latencyMs: 11,
        output: {
          answer: '후보 사실',
          sections: [
            {
              section_id: 'fact',
              heading: '후보',
              text: '후보 사실',
              source_refs: [`chunk:${sourceChunkId}`],
            },
          ],
          claims: [
            {
              claim_id: 'candidate-fact-1',
              kind: 'key_fact',
              text: `${marker} 계약 체결 사실 후보`,
              source_refs: [`chunk:${sourceChunkId}`],
              is_legal_conclusion: false,
            },
          ],
          warnings: [],
        },
      });

    try {
      app = await NestFactory.createApplicationContext(AppModule, { logger: false });
      const processor = app.get(AiPrepProcessor);
      await processor.handle({
        tenantId: tenantAlphaId,
        documentId,
        versionId,
        matterId,
        artifactKind: 'fact_candidates',
      });
    } finally {
      gemmaSpy.mockRestore();
    }

    const artifact = await candidateArtifact();
    expect(artifact).toMatchObject({
      artifact_kind: 'fact_candidates',
      status: 'completed',
    });
    expect(artifact?.payload_json.claims[0]).toMatchObject({
      claim_id: 'candidate-fact-1',
      kind: 'key_fact',
      source_refs: [`chunk:${sourceChunkId}`],
    });

    const workItem = await candidateWorkItem(artifact?.ai_prep_artifact_id ?? '');
    expect(workItem).toMatchObject({
      source: 'ai_prep',
      kind: 'ai_candidate_review',
      target_type: 'ai_prep_artifact',
      target_id: artifact?.ai_prep_artifact_id,
      matter_id: matterId,
      document_id: documentId,
      status: 'open',
      assigned_to_user_id: alphaOwnerUserId,
    });
    expect(await graphNodeCount()).toBe(graphNodeCountBefore);
  });

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
          VALUES ($1, $2, 'AI prep candidates local policy', ARRAY['local']::text[])
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

  async function candidateArtifact(): Promise<{
    ai_prep_artifact_id: string;
    artifact_kind: string;
    status: string;
    payload_json: {
      claims: Array<{ claim_id: string; kind: string; source_refs: string[] }>;
    };
  } | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        ai_prep_artifact_id: string;
        artifact_kind: string;
        status: string;
        payload_json: {
          claims: Array<{ claim_id: string; kind: string; source_refs: string[] }>;
        };
      }>(
        `
          SELECT ai_prep_artifact_id, artifact_kind, status, payload_json
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND document_version_id = $2
            AND artifact_kind = 'fact_candidates'
          LIMIT 1
        `,
        [tenantAlphaId, versionId],
      );
      return result.rows[0] ?? null;
    });
  }

  async function candidateWorkItem(artifactId: string): Promise<{
    source: string;
    kind: string;
    target_type: string;
    target_id: string;
    matter_id: string;
    document_id: string;
    status: string;
    assigned_to_user_id: string;
  } | null> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        source: string;
        kind: string;
        target_type: string;
        target_id: string;
        matter_id: string;
        document_id: string;
        status: string;
        assigned_to_user_id: string;
      }>(
        `
          SELECT source, kind, target_type, target_id, matter_id, document_id, status,
            assigned_to_user_id
          FROM work_items
          WHERE tenant_id = $1
            AND source = 'ai_prep'
            AND kind = 'ai_candidate_review'
            AND target_type = 'ai_prep_artifact'
            AND target_id = $2
          LIMIT 1
        `,
        [tenantAlphaId, artifactId],
      );
      return result.rows[0] ?? null;
    });
  }

  async function graphNodeCount(): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM graph_nodes
          WHERE tenant_id = $1
            AND matter_id = $2
            AND stale = false
        `,
        [tenantAlphaId, matterId],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  }
});
