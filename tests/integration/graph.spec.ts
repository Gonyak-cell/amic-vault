import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  AiSummaryResponseDto,
  GraphConsistencyResponseDto,
  GraphFactsResponseDto,
  GraphSyncResponseDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
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
  alphaFirmAdminUserId,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentAiAllowed,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

interface GraphDocumentFixture {
  documentId: string;
  versionId: string;
  title: string;
  contentText: string;
}

describe('knowledge graph integration', () => {
  const marker = `graph-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const wallMatterId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let adminCookie: string;
  let visible: GraphDocumentFixture;
  let explicitDenied: GraphDocumentFixture;
  let deletedAfterSync: GraphDocumentFixture;
  let wallDenied: GraphDocumentFixture;

  beforeAll(async () => {
    visible = await insertGraphDocument({
      clientId,
      matterId,
      title: `${marker} Visible Contract`,
      contentText: `${marker} visible graph relationship covenant`,
      index: 1101,
    });
    explicitDenied = await insertGraphDocument({
      clientId,
      matterId,
      title: `${marker} Denied Contract`,
      contentText: `${marker} denied graph relationship covenant`,
      index: 1102,
    });
    deletedAfterSync = await insertGraphDocument({
      clientId,
      matterId,
      title: `${marker} Deleted Contract`,
      contentText: `${marker} deleted graph relationship covenant`,
      index: 1103,
    });
    wallDenied = await insertGraphDocument({
      clientId,
      matterId: wallMatterId,
      title: `${marker} Wall Contract`,
      contentText: `${marker} wall graph relationship covenant`,
      index: 1104,
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
      createdBy: alphaFirmAdminUserId,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
      createdBy: alphaFirmAdminUserId,
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
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('syncs RDB graph nodes idempotently and stales deleted documents without hard delete', async () => {
    const first = await syncMatter(matterId);
    expect(first.status).toBe('success');
    expect(first.nodeCount).toBeGreaterThan(0);
    expect(first.edgeCount).toBeGreaterThan(0);

    await markDocumentDeleted(deletedAfterSync.documentId);
    const second = await syncMatter(matterId);
    expect(second.status).toBe('success');
    expect(second.nodeCount).toBeGreaterThan(0);
    expect(second.edgeCount).toBeGreaterThan(0);
    expect(second.staleNodeCount + second.staleEdgeCount).toBeGreaterThan(0);

    const syncAudit = await latestGraphAudit(matterId, 'GRAPH_SYNCED');
    expect(syncAudit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        node_count: second.nodeCount,
        edge_count: second.edgeCount,
      },
    });
    expect(JSON.stringify(syncAudit?.metadata_json)).not.toContain(marker);
  });

  it('injects matter, document, and wall permission before graph traversal', async () => {
    await syncMatter(wallMatterId);

    const facts = await listFacts(matterId);
    const rawFacts = JSON.stringify(facts);
    expect(facts.facts.length).toBeGreaterThan(0);
    expect(rawFacts).toContain(visible.documentId);
    expect(rawFacts).not.toContain(explicitDenied.documentId);
    expect(rawFacts).not.toContain(deletedAfterSync.documentId);
    expect(rawFacts).not.toContain(explicitDenied.title);
    expect(rawFacts).not.toContain(deletedAfterSync.contentText);
    expect(facts.facts.map((fact) => fact.edgeType)).toContain('HAS_CLAUSE');

    const denied = await fetch(`${baseUrl}/v1/graph/facts?matterId=${wallMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).not.toContain(wallDenied.documentId);
    expect(deniedBody).not.toContain(wallDenied.contentText);

    const queryAudit = await latestGraphAudit(matterId, 'GRAPH_QUERY_EXECUTED');
    expect(queryAudit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        graph_scope: 'graph_query',
      },
    });
    expect(String(queryAudit?.metadata_json?.filter_refs)).toContain('matter.membership');
  });

  it('reports consistency drift by ids only and audits the check', async () => {
    const consistency = await checkConsistency(matterId);
    expect(consistency).toMatchObject({
      matterId,
      status: 'consistent',
      driftCount: 0,
      drifts: [],
    });

    const audit = await latestGraphAudit(matterId, 'GRAPH_CONSISTENCY_CHECKED');
    expect(audit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        consistency_status: 'consistent',
        drift_count: 0,
      },
    });
    expect(JSON.stringify(consistency)).not.toContain(visible.title);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(visible.contentText);
  });

  it('adds graph facts to AI evidence only for retrieval-admitted documents', async () => {
    const summary = await postSummary({
      matterId,
      task: 'matter_summary',
      query: `${marker} visible denied graph relationship`,
      filters: { clientId },
      maxChunks: 6,
    });
    expect(summary.status).toBe('completed');
    expectNoDeniedReference(summary);

    const graphAudit = await latestGraphAudit(matterId, 'GRAPH_QUERY_EXECUTED', 'ai_evidence_pack');
    expect(graphAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      graph_scope: 'ai_evidence_pack',
    });
    expect(Number(graphAudit?.metadata_json?.result_count ?? 0)).toBeGreaterThan(0);
    expect(JSON.stringify(graphAudit?.metadata_json)).not.toContain(explicitDenied.documentId);
    expect(JSON.stringify(graphAudit?.metadata_json)).not.toContain(deletedAfterSync.documentId);
  });

  async function syncMatter(targetMatterId: string): Promise<GraphSyncResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/sync`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId: targetMatterId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as GraphSyncResponseDto;
  }

  async function listFacts(targetMatterId: string): Promise<GraphFactsResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/facts?matterId=${targetMatterId}&limit=20`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as GraphFactsResponseDto;
  }

  async function checkConsistency(targetMatterId: string): Promise<GraphConsistencyResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/consistency?matterId=${targetMatterId}`, {
      headers: { cookie: adminCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as GraphConsistencyResponseDto;
  }

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

  function expectNoDeniedReference(output: unknown): void {
    const raw = JSON.stringify(output);
    for (const denied of [explicitDenied, deletedAfterSync, wallDenied]) {
      expect(raw).not.toContain(denied.title);
      expect(raw).not.toContain(denied.documentId);
      expect(raw).not.toContain(denied.versionId);
      expect(raw).not.toContain(denied.contentText);
    }
  }
});

async function insertGraphDocument(input: {
  clientId: string;
  matterId: string;
  title: string;
  contentText: string;
  index: number;
}): Promise<GraphDocumentFixture> {
  const documentId = randomUUID();
  const versionId = randomUUID();
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId,
      versionId,
      title: input.title,
      contentText: input.contentText,
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-27T00:00:00.000Z',
    },
    input.index,
  );
  await seedSemanticChunksForVersion({
    tenantId: tenantAlphaId,
    documentId,
    versionId,
    contentText: input.contentText,
  });
  await setDocumentAiAllowed({ tenantId: tenantAlphaId, documentId, aiAllowed: true });
  return { documentId, versionId, title: input.title, contentText: input.contentText };
}

async function markDocumentDeleted(documentId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE documents
        SET status = 'deleted',
          deleted_at = now(),
          deleted_by = $3,
          deleted_previous_status = 'draft',
          updated_at = now()
        WHERE tenant_id = $1
          AND document_id = $2
      `,
      [tenantAlphaId, documentId, alphaOwnerUserId],
    );
  });
}

async function enableAiPolicyForMatter(matterId: string): Promise<void> {
  const policyId = randomUUID();
  const accessPolicyId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO ai_policies (
          policy_id, tenant_id, name, allowed_model_tiers
        )
        VALUES ($1, $2, 'R7 graph local policy', ARRAY['local']::text[])
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

async function latestGraphAudit(
  matterId: string,
  action: 'GRAPH_SYNCED' | 'GRAPH_QUERY_EXECUTED' | 'GRAPH_CONSISTENCY_CHECKED',
  graphScope?: string,
): Promise<{
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
          AND action = $3
          AND ($4::text IS NULL OR metadata_json->>'graph_scope' = $4)
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId, action, graphScope ?? null],
    );
    return result.rows[0] ?? null;
  });
}
