import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';
import {
  addMatterMember,
  addWallMembership,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
} from './search-fixtures';
import { loginSearchUser, postSearch } from './search-http-helpers';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

interface ClauseSearchSeed {
  clientId: string;
  clauseId: string;
  documentId: string;
  matterId: string;
  title: string;
  versionId: string;
}

async function seedClauseSearchDocument(input: {
  clientId: string;
  contentText: string;
  index: number;
  title: string;
}): Promise<ClauseSearchSeed> {
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const clauseId = randomUUID();
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId,
      documentId,
      versionId,
      title: input.title,
      contentText: input.contentText,
      documentType: 'contract',
      documentStatus: 'draft',
      seedChunks: false,
      versionStatus: 'current',
      updatedAt: '2026-06-20T00:00:00.000Z',
    },
    input.index,
  );

  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO contract_clauses (
          clause_id, tenant_id, matter_id, document_id, version_id, clause_kind,
          clause_number, start_offset, end_offset, heading_hash, text_hash, parser_version,
          stale, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'article', '제12조', 0, $6, $7, $8, 'r8-d11-test',
          false, now())
      `,
      [
        clauseId,
        tenantAlphaId,
        matterId,
        documentId,
        versionId,
        input.contentText.length,
        sha256Hex(`${input.title}:제12조`),
        sha256Hex(input.contentText),
      ],
    );
    await client.query(
      `
        INSERT INTO contract_clause_chunks (
          tenant_id, clause_id, matter_id, document_id, version_id, chunk_ordinal,
          start_offset, end_offset, chunk_text, text_hash, stale, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, $8, false, now())
      `,
      [
        tenantAlphaId,
        clauseId,
        matterId,
        documentId,
        versionId,
        input.contentText.length,
        input.contentText,
        sha256Hex(`${versionId}:0:${input.contentText.length}`),
      ],
    );
  });

  return { clientId: input.clientId, clauseId, documentId, matterId, title: input.title, versionId };
}

describe('clause search permission integration', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let cookie: string;
  let accessible: ClauseSearchSeed;
  let hidden: ClauseSearchSeed;
  let wallExcluded: ClauseSearchSeed;

  beforeAll(async () => {
    const clientId = randomUUID();
    accessible = await seedClauseSearchDocument({
      clientId,
      contentText: '손해배상 책임 한도는 계약금액으로 제한한다. D11 visible clause.',
      index: 701,
      title: 'D11 Clause Search Visible Contract',
    });
    hidden = await seedClauseSearchDocument({
      clientId,
      contentText: '손해배상 책임 한도는 숨김 계약에도 존재한다. D11 hidden clause.',
      index: 702,
      title: 'D11 Clause Search Hidden Contract',
    });
    wallExcluded = await seedClauseSearchDocument({
      clientId,
      contentText: '손해배상 책임 한도는 차이니즈월 계약에도 존재한다. D11 wall clause.',
      index: 703,
      title: 'D11 Clause Search Wall Contract',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: accessible.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: wallExcluded.matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: wallExcluded.matterId,
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
    await app?.close();
  });

  it('returns clause snippets only when the owning document is searchable', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: '손해배상',
      target: 'clause',
      filters: { clientId: accessible.clientId },
      pageSize: 10,
    });

    expect(response.total).toBe(1);
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      clauseId: accessible.clauseId,
      clauseKind: 'article',
      clauseNumber: '제12조',
      documentId: accessible.documentId,
      matterId: accessible.matterId,
      resultKind: 'clause',
      title: accessible.title,
    });
    expect(response.results[0]?.snippet).toContain('손해배상');

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(hidden.documentId);
    expect(serialized).not.toContain(hidden.title);
    expect(serialized).not.toContain(wallExcluded.documentId);
    expect(serialized).not.toContain(wallExcluded.title);
    expect(serialized).not.toContain('D11 hidden clause');
    expect(serialized).not.toContain('D11 wall clause');
  });
});
