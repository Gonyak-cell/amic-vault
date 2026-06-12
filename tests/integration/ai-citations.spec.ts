import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AiCitationDto, AiCitationSourceResponseDto } from '@amic-vault/shared';
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
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

interface CitationFixture {
  title: string;
  citation: AiCitationDto;
}

describe('AI citation source panel integration', () => {
  const marker = `ai-citation-${randomUUID()}`;
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let visible: CitationFixture;
  let denied: CitationFixture;

  beforeAll(async () => {
    visible = await insertCitationFixture({
      title: `${marker} Visible Source Memo`,
      contentText: `${marker} visible authorized citation source text`,
      index: 951,
      addMember: true,
    });
    denied = await insertCitationFixture({
      title: `${marker} Hidden Source Memo`,
      contentText: `${marker} hidden unauthorized citation source text`,
      index: 952,
      addMember: false,
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

  it('resolves source panel citations only after document permission recheck', async () => {
    const response = await postCitationSources(baseUrl, cookie, {
      matterId: visible.citation.matterId,
      citations: [visible.citation],
    });

    expect(response.sources).toHaveLength(1);
    expect(response.sources[0]).toMatchObject({
      citationRef: visible.citation.citationRef,
      documentId: visible.citation.documentId,
      versionId: visible.citation.versionId,
      chunkId: visible.citation.chunkId,
      title: visible.title,
      citationAllowed: true,
      included: true,
    });
    expect(JSON.stringify(response)).not.toContain(denied.title);
    expect(JSON.stringify(response)).not.toContain('hidden unauthorized citation source text');

    const audit = await latestCitationAudit(visible.citation.matterId, 'success');
    expect(audit?.metadata_json).toMatchObject({
      scope_type: 'ai_citation',
      scope_id: visible.citation.matterId,
      result_count: 1,
      document_count: 1,
    });
    expect(String(audit?.metadata_json?.filter_refs)).toContain('included:true');
    const metadata = JSON.stringify(audit?.metadata_json);
    expect(metadata).not.toContain(visible.citation.documentId);
    expect(metadata).not.toContain(visible.citation.versionId);
    expect(metadata).not.toContain(visible.citation.chunkId);

    const citedAudit = await latestCitedDocumentAudit(visible.citation.chunkId);
    expect(citedAudit?.metadata_json).toMatchObject({
      scope_type: 'ai_citation',
      scope_id: visible.citation.matterId,
      matter_id: visible.citation.matterId,
      document_id: visible.citation.documentId,
      version_id: visible.citation.versionId,
      chunk_id: visible.citation.chunkId,
      hash: visible.citation.sourceTextHash,
    });
    const citedMetadata = JSON.stringify(citedAudit?.metadata_json);
    expect(citedMetadata).not.toContain(visible.title);
    expect(citedMetadata).not.toContain('visible authorized citation source text');
  });

  it('fails closed with a safe denied response for unreadable cited sources', async () => {
    const response = await fetch(`${baseUrl}/v1/ai/citations/sources`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: denied.citation.matterId,
        citations: [denied.citation],
      }),
    });
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).toContain('PERMISSION_DENIED');
    expect(body).not.toContain(denied.title);
    expect(body).not.toContain(denied.citation.documentId);
    expect(body).not.toContain(denied.citation.chunkId);

    const audit = await latestCitationAudit(denied.citation.matterId, 'denied');
    expect(audit?.metadata_json).toMatchObject({
      scope_type: 'ai_citation',
      result_count: 0,
      document_count: 1,
    });
    expect(String(audit?.metadata_json?.filter_refs)).toContain('included:false');
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(denied.citation.documentId);
    await expect(citedDocumentAuditCount(denied.citation.matterId)).resolves.toBe(0);
  });
});

async function insertCitationFixture(input: {
  title: string;
  contentText: string;
  index: number;
  addMember: boolean;
}): Promise<CitationFixture> {
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId,
      matterId,
      documentId,
      versionId,
      title: input.title,
      contentText: input.contentText,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-24T00:00:00.000Z',
    },
    input.index,
  );
  await seedSemanticChunksForVersion({
    tenantId: tenantAlphaId,
    documentId,
    versionId,
    contentText: input.contentText,
  });
  if (input.addMember) {
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
  }
  const chunk = await firstChildChunk(documentId, versionId);
  return {
    title: input.title,
    citation: {
      citationRef: `chunk:${chunk.chunk_id}`,
      matterId,
      documentId,
      versionId,
      chunkId: chunk.chunk_id,
      quoteHash: chunk.text_hash,
      sourceTextHash: chunk.source_text_hash,
    },
  };
}

async function firstChildChunk(
  documentId: string,
  versionId: string,
): Promise<{ chunk_id: string; text_hash: string; source_text_hash: string }> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      chunk_id: string;
      text_hash: string;
      source_text_hash: string;
    }>(
      `
        SELECT chunk_id, text_hash, source_text_hash
        FROM document_chunks
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_id = $3
          AND chunk_kind = 'child'
          AND stale = false
        ORDER BY chunk_ordinal ASC
        LIMIT 1
      `,
      [tenantAlphaId, documentId, versionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('citation fixture child chunk missing');
    return row;
  });
}

async function postCitationSources(
  baseUrl: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<AiCitationSourceResponseDto> {
  const response = await fetch(`${baseUrl}/v1/ai/citations/sources`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(201);
  return JSON.parse(text) as AiCitationSourceResponseDto;
}

async function latestCitationAudit(
  matterId: string,
  result: 'success' | 'denied',
): Promise<{ metadata_json: Record<string, unknown> } | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const audit = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'SEARCH_EXECUTED'
          AND target_type = 'ai_citation'
          AND result = $3
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId, result],
    );
    return audit.rows[0] ?? null;
  });
}

async function latestCitedDocumentAudit(
  chunkId: string,
): Promise<{ metadata_json: Record<string, unknown> } | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const audit = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AI_CITED_DOCUMENT'
          AND target_type = 'ai_cited_document'
          AND target_id = $2
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, chunkId],
    );
    return audit.rows[0] ?? null;
  });
}

async function citedDocumentAuditCount(matterId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const audit = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AI_CITED_DOCUMENT'
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId],
    );
    return Number(audit.rows[0]?.count ?? '0');
  });
}
