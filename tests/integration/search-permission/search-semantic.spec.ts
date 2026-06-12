import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentAiAllowed,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

interface SemanticRef {
  documentId: string;
  versionId: string;
  matterId: string;
  title: string;
  contentText: string;
}

describe('semantic search permission integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let clientId: string;
  let visible: SemanticRef;
  let aiDenied: SemanticRef;
  let nonMember: SemanticRef;
  let explicitDenied: SemanticRef;
  let wallDenied: SemanticRef;

  beforeAll(async () => {
    clientId = randomUUID();
    visible = await insertSemanticRow({
      clientId,
      title: 'Semantic Visible Agreement',
      contentText: 'semanticvaultalpha allowed local vector context termination covenant',
      aiAllowed: true,
      index: 801,
    });
    aiDenied = await insertSemanticRow({
      clientId,
      title: 'Semantic AI Disabled Memo',
      contentText: 'semanticvaultalpha ai disabled document context',
      aiAllowed: false,
      index: 802,
    });
    nonMember = await insertSemanticRow({
      clientId,
      title: 'Semantic Nonmember Hidden',
      contentText: 'semanticvaultalpha nonmember hidden context',
      aiAllowed: true,
      index: 803,
    });
    explicitDenied = await insertSemanticRow({
      clientId,
      title: 'Semantic Explicit Deny Hidden',
      contentText: 'semanticvaultalpha explicit deny hidden context',
      aiAllowed: true,
      index: 804,
    });
    wallDenied = await insertSemanticRow({
      clientId,
      title: 'Semantic Wall Hidden',
      contentText: 'semanticvaultalpha wall hidden context',
      aiAllowed: true,
      index: 805,
    });

    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: visible.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: aiDenied.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: explicitDenied.matterId,
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
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: wallDenied.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: wallDenied.matterId,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns only permission-scoped aiAllowed chunks for semantic search', async () => {
    const response = await postSearch(baseUrl, cookie, {
      mode: 'semantic',
      query: 'semanticvaultalpha hidden context',
      filters: { clientId },
      page: 1,
      pageSize: 10,
    });

    expect(response.total).toBe(1);
    expect(resultTitles(response)).toEqual([visible.title]);
    expect(response.facets.clients).toEqual([{ value: clientId, count: 1 }]);
    expectNoDeniedReferences(response);
  });

  it('uses the same scoped candidate set for hybrid search and reference-only audit', async () => {
    const response = await postSearch(baseUrl, cookie, {
      mode: 'hybrid',
      query: 'semanticvaultalpha termination',
      filters: { clientId },
      page: 1,
      pageSize: 10,
    });

    expect(resultTitles(response)).toEqual([visible.title]);
    expectNoDeniedReferences(response);

    const audit = await latestHybridSearchAudit();
    expect(audit).toMatchObject({
      scope_type: 'hybrid',
      query_length: 'semanticvaultalpha termination'.length,
      result_count: 1,
    });
    expect(JSON.stringify(audit)).not.toContain('semanticvaultalpha termination');
  });

  it('keeps chunk and embedding rows tenant-scoped under RLS', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query(
        `
          SELECT count(*)::int AS count
          FROM document_chunks
          WHERE version_id = $1
        `,
        [visible.versionId],
      );
      expect(result.rows[0]?.count).toBe(0);
    });
  });

  function expectNoDeniedReferences(response: unknown): void {
    const raw = JSON.stringify(response);
    for (const denied of [aiDenied, nonMember, explicitDenied, wallDenied]) {
      expect(raw).not.toContain(denied.title);
      expect(raw).not.toContain(denied.documentId);
      expect(raw).not.toContain(denied.versionId);
    }
  }
});

async function insertSemanticRow(input: {
  clientId: string;
  title: string;
  contentText: string;
  aiAllowed: boolean;
  index: number;
}): Promise<SemanticRef> {
  const row: SemanticRef = {
    documentId: randomUUID(),
    versionId: randomUUID(),
    matterId: randomUUID(),
    title: input.title,
    contentText: input.contentText,
  };
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: row.matterId,
      documentId: row.documentId,
      versionId: row.versionId,
      title: row.title,
      contentText: row.contentText,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-22T00:00:00.000Z',
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

async function latestHybridSearchAudit(): Promise<Record<string, unknown>> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'SEARCH_EXECUTED'
          AND metadata_json->>'scope_type' = 'hybrid'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId],
    );
    return result.rows[0]?.metadata_json as Record<string, unknown>;
  });
}
