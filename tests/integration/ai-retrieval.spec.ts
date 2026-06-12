import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AiRetrievalOrchestratorService } from '../../apps/api/src/modules/ai/retrieval/retrieval-orchestrator.service';
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
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentAiAllowed,
} from './search-permission/search-fixtures';

interface AiRetrievalRef {
  documentId: string;
  versionId: string;
  matterId: string;
  title: string;
  contentText: string;
}

describe('AI retrieval orchestrator integration', () => {
  let app: INestApplication;
  let retrieval: AiRetrievalOrchestratorService;
  let clientId: string;
  let matterId: string;
  let visible: AiRetrievalRef;
  let aiDenied: AiRetrievalRef;
  let explicitDenied: AiRetrievalRef;
  let wallMatterId: string;
  let wallDenied: AiRetrievalRef;

  beforeAll(async () => {
    clientId = randomUUID();
    matterId = randomUUID();
    wallMatterId = randomUUID();

    visible = await insertAiRetrievalRow({
      clientId,
      matterId,
      title: 'AI Retrieval Visible Agreement',
      contentText: 'airetrievalalpha termination covenant contact lawyer@example.test',
      aiAllowed: true,
      index: 901,
    });
    aiDenied = await insertAiRetrievalRow({
      clientId,
      matterId,
      title: 'AI Retrieval Disabled Memo',
      contentText: 'airetrievalalpha hidden ai disabled context',
      aiAllowed: false,
      index: 902,
    });
    explicitDenied = await insertAiRetrievalRow({
      clientId,
      matterId,
      title: 'AI Retrieval Explicit Deny Memo',
      contentText: 'airetrievalalpha hidden explicit deny context',
      aiAllowed: true,
      index: 903,
    });
    wallDenied = await insertAiRetrievalRow({
      clientId,
      matterId: wallMatterId,
      title: 'AI Retrieval Wall Denied Memo',
      contentText: 'aiwallretrievalalpha wall hidden context',
      aiAllowed: true,
      index: 904,
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
      matterId: wallMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: explicitDenied.documentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: wallMatterId,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });
    await enableAiPolicyForMatters([matterId, wallMatterId]);

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    retrieval = app.get(AiRetrievalOrchestratorService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds AI context only from permission-scoped aiAllowed candidates', async () => {
    const result = await retrieval.retrieve({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId,
      query: 'airetrievalalpha hidden termination contact',
      filters: { clientId },
      maxChunks: 6,
    });

    expect(result.status).toBe('ready');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      documentId: visible.documentId,
      versionId: visible.versionId,
      matterId,
    });
    expect(result.chunks[0]?.redactedText).toContain('[REDACTED:email_address]');
    expectNoDeniedReference(result);

    const audit = await latestAiRetrievalAudit(matterId);
    expect(audit).toMatchObject({
      result: 'success',
      metadata_json: {
        scope_type: 'ai_retrieval',
        scope_id: matterId,
        result_count: 1,
        document_count: 1,
      },
    });
    expect(String(audit?.metadata_json?.filter_refs)).toContain('matter_member');
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(
      'airetrievalalpha hidden termination contact',
    );
  });

  it('supports graph-oriented retrieval in R7 while keeping rule-dependent questions blocked', async () => {
    const graph = await retrieval.retrieve({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId,
      query: 'show the relationship graph for airetrievalalpha',
      maxChunks: 3,
    });
    const rule = await retrieval.retrieve({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId,
      query: 'run clause classification for airetrievalalpha',
      maxChunks: 3,
    });

    expect(graph).toMatchObject({
      status: 'ready',
      questionKind: 'retrieval',
    });
    expect(graph.appliedRules).toContain('question.graph:supported_r7');
    expect(graph.chunks).toHaveLength(1);
    expectNoDeniedReference(graph);
    expect(rule).toMatchObject({
      status: 'unsupported',
      questionKind: 'unsupported_rule',
      chunks: [],
    });
  });

  it('fails closed for metadata matter override attempts', async () => {
    const result = await retrieval.retrieve({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId,
      query: 'airetrievalalpha',
      filters: { matterId: wallMatterId },
      maxChunks: 3,
    });

    expect(result).toMatchObject({
      status: 'denied',
      reasonCode: 'metadata_matter_mismatch',
      chunks: [],
    });
  });

  it('enforces ethical walls before AI context and records zero visible chunks', async () => {
    const result = await retrieval.retrieve({
      tenantId: tenantAlphaId,
      userId: alphaOwnerUserId,
      matterId: wallMatterId,
      query: 'aiwallretrievalalpha wall hidden context',
      maxChunks: 3,
    });

    expect(result.status).toBe('ready');
    expect(result.chunks).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(wallDenied.documentId);

    const audit = await latestAiRetrievalAudit(wallMatterId);
    expect(audit).toMatchObject({
      result: 'success',
      metadata_json: {
        scope_type: 'ai_retrieval',
        scope_id: wallMatterId,
        result_count: 0,
        document_count: 0,
      },
    });
    expect(String(audit?.metadata_json?.filter_refs)).toContain('wall_excluded');
  });

  function expectNoDeniedReference(result: unknown): void {
    const raw = JSON.stringify(result);
    for (const denied of [aiDenied, explicitDenied, wallDenied]) {
      expect(raw).not.toContain(denied.title);
      expect(raw).not.toContain(denied.documentId);
      expect(raw).not.toContain(denied.versionId);
      expect(raw).not.toContain(denied.contentText);
    }
  }
});

async function insertAiRetrievalRow(input: {
  clientId: string;
  matterId: string;
  title: string;
  contentText: string;
  aiAllowed: boolean;
  index: number;
}): Promise<AiRetrievalRef> {
  const row: AiRetrievalRef = {
    documentId: randomUUID(),
    versionId: randomUUID(),
    matterId: input.matterId,
    title: input.title,
    contentText: input.contentText,
  };
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId: row.documentId,
      versionId: row.versionId,
      title: row.title,
      contentText: row.contentText,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-23T00:00:00.000Z',
    },
    input.index,
  );
  await setDocumentAiAllowed({
    tenantId: tenantAlphaId,
    documentId: row.documentId,
    aiAllowed: input.aiAllowed,
  });
  await seedSemanticChunksForVersion({
    tenantId: tenantAlphaId,
    documentId: row.documentId,
    versionId: row.versionId,
    contentText: row.contentText,
  });
  return row;
}

async function enableAiPolicyForMatters(matterIds: readonly string[]): Promise<string> {
  const policyId = randomUUID();
  const accessPolicyId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO ai_policies (
          policy_id, tenant_id, name, allowed_model_tiers
        )
        VALUES ($1, $2, 'R6 retrieval local policy', ARRAY['local']::text[])
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
          AND matter_id = ANY($2::uuid[])
      `,
      [tenantAlphaId, matterIds, policyId],
    );
  });
  return policyId;
}

async function latestAiRetrievalAudit(matterId: string): Promise<{
  result: string;
  metadata_json: Record<string, unknown>;
} | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      result: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'SEARCH_EXECUTED'
          AND target_type = 'ai_retrieval'
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows[0] ?? null;
  });
}
