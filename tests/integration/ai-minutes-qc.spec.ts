import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
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

interface MinutesQcPayload {
  answer: string;
}

interface WorkQueueItem {
  source: string;
  kind?: string | undefined;
  title: string;
  description: string;
}

interface WorkQueueResponse {
  items: WorkQueueItem[];
}

describe('AI minutes QC integration', () => {
  const marker = `ai-minutes-qc-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const timelineDocumentId = randomUUID();
  const timelineVersionId = randomUUID();
  const minutesDocumentId = randomUUID();
  const minutesVersionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;

  beforeAll(async () => {
    await insertQcDocument({
      documentId: timelineDocumentId,
      versionId: timelineVersionId,
      title: `${marker} confirmed timeline evidence`,
      contentText: `${marker} 2026-06-15 계약 체결 사실이 확인된 증거 문서입니다.`,
      index: 1090,
    });
    await insertQcDocument({
      documentId: minutesDocumentId,
      versionId: minutesVersionId,
      title: `${marker} 회의록`,
      contentText: `${marker} 회의록에는 2026-06-16 계약 체결로 기재되어 있습니다.`,
      index: 1091,
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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates a minutes QC artifact and review work item without mutating confirmed graph facts', async () => {
    const timelineChunkId = await firstChildChunkId(timelineVersionId);
    const minutesChunkId = await firstChildChunkId(minutesVersionId);
    const confirmedGraphFactsBefore = await confirmedGraphFactCount();
    const gemmaSpy = vi
      .spyOn(LocalGemmaGenerationService.prototype, 'generateGrounded')
      .mockResolvedValueOnce(dateFactOutput('2026-06-15 계약 체결', timelineChunkId))
      .mockResolvedValueOnce(documentProfileOutput(minutesChunkId))
      .mockResolvedValueOnce(dateFactOutput('2026-06-16 계약 체결', minutesChunkId));

    try {
      const processor = app.get(AiPrepProcessor);
      await processor.handle({
        tenantId: tenantAlphaId,
        documentId: timelineDocumentId,
        versionId: timelineVersionId,
        matterId,
        artifactKind: 'date_facts',
      });
      await processor.handle({
        tenantId: tenantAlphaId,
        documentId: minutesDocumentId,
        versionId: minutesVersionId,
        matterId,
        artifactKind: 'document_profile',
      });
      await processor.handle({
        tenantId: tenantAlphaId,
        documentId: minutesDocumentId,
        versionId: minutesVersionId,
        matterId,
        artifactKind: 'date_facts',
      });
    } finally {
      gemmaSpy.mockRestore();
    }

    const qcArtifact = await completedMinutesQcArtifact();
    expect(qcArtifact.payload.answer).toContain('날짜 불일치 1건');
    expect(JSON.stringify(qcArtifact.payload)).toContain(`chunk:${minutesChunkId}`);
    expect(JSON.stringify(qcArtifact.payload)).toContain(`chunk:${timelineChunkId}`);
    await expect(minutesQcWorkItemCount(qcArtifact.artifactId)).resolves.toBe(1);
    await expect(confirmedGraphFactCount()).resolves.toBe(confirmedGraphFactsBefore);

    const response = await fetch(
      `${baseUrl}/v1/work/items?kind=ai_candidate_review&assignee=all&limit=100`,
      {
        headers: { cookie: ownerCookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    const workQueue = JSON.parse(text) as WorkQueueResponse;
    const minutesQcItem = workQueue.items.find((item) => item.title === '회의록 정합성 QC');
    expect(minutesQcItem).toMatchObject({
      source: 'ai_prep',
      kind: 'ai_candidate_review',
      title: '회의록 정합성 QC',
    });
    expect(minutesQcItem?.description).toContain('회의록 불일치 검토');
  });

  async function insertQcDocument(input: {
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
        documentType: 'memo',
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
          VALUES ($1, $2, 'Minutes QC local policy', ARRAY['local']::text[])
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

  async function completedMinutesQcArtifact(): Promise<{
    artifactId: string;
    payload: MinutesQcPayload;
  }> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{
        ai_prep_artifact_id: string;
        payload_json: MinutesQcPayload;
      }>(
        `
          SELECT ai_prep_artifact_id, payload_json
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND matter_id = $2
            AND document_version_id = $3
            AND artifact_kind = 'minutes_qc'
            AND status = 'completed'
            AND is_stale = false
          ORDER BY generated_at DESC NULLS LAST, updated_at DESC
          LIMIT 1
        `,
        [tenantAlphaId, matterId, minutesVersionId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('expected completed minutes QC artifact');
      return {
        artifactId: row.ai_prep_artifact_id,
        payload: row.payload_json,
      };
    });
  }

  async function minutesQcWorkItemCount(artifactId: string): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM work_items
          WHERE tenant_id = $1
            AND source = 'ai_prep'
            AND kind = 'ai_candidate_review'
            AND target_type = 'ai_prep_artifact'
            AND target_id = $2
            AND document_id = $3
            AND status = 'open'
        `,
        [tenantAlphaId, artifactId, minutesDocumentId],
      );
      return Number.parseInt(result.rows[0]?.count ?? '0', 10);
    });
  }

  async function confirmedGraphFactCount(): Promise<number> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM graph_nodes
          WHERE tenant_id = $1
            AND matter_id = $2
            AND provenance = 'human_confirmed'
            AND review_status = 'confirmed'
            AND stale = false
        `,
        [tenantAlphaId, matterId],
      );
      return Number.parseInt(result.rows[0]?.count ?? '0', 10);
    });
  }
});

function documentProfileOutput(chunkId: string) {
  return {
    status: 'completed' as const,
    model: 'gemma4:12b',
    latencyMs: 9,
    output: {
      answer: '회의록 문서입니다.',
      sections: [
        {
          section_id: 'profile',
          heading: '문서 프로필',
          text: '이 문서는 회의록입니다.',
          source_refs: [`chunk:${chunkId}`],
        },
      ],
      claims: [
        {
          claim_id: `profile-${chunkId.slice(0, 8)}`,
          kind: 'summary' as const,
          text: '회의록 문서',
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
      ],
      warnings: [],
    },
  };
}

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
          kind: 'timeline' as const,
          text,
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
      ],
      warnings: [],
    },
  };
}
