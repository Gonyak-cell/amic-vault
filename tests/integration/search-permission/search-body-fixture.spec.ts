import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-fixtures';
import { loginSearchUser, postSearch, resultTitles } from './search-http-helpers';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function latestSearchAudit(input: {
  queryHash: string;
  actorId: string;
}): Promise<{ metadata_json: Record<string, unknown>; raw_metadata: string } | undefined> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      metadata_json: Record<string, unknown>;
      raw_metadata: string;
    }>(
      `
        SELECT metadata_json, metadata_json::text AS raw_metadata
        FROM audit_events
        WHERE tenant_id = $1
          AND actor_id = $2
          AND action = 'SEARCH_EXECUTED'
          AND target_type = 'search'
          AND metadata_json->>'query_hash' = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, input.actorId, input.queryHash],
    );
    return result.rows[0];
  });
}

describe('DMS body search fixture integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let bodyOnlyToken: string;
  let visibleMatterId: string;
  let hiddenMatterId: string;
  let visibleDocumentId: string;
  let hiddenDocumentId: string;
  let visibleTitle: string;
  let hiddenTitle: string;

  beforeAll(async () => {
    const clientId = randomUUID();
    visibleMatterId = randomUUID();
    hiddenMatterId = randomUUID();
    visibleDocumentId = randomUUID();
    hiddenDocumentId = randomUUID();
    bodyOnlyToken = `dmsbody${randomUUID().replaceAll('-', '')}`;
    visibleTitle = 'DMS Body Fixture Visible Profile';
    hiddenTitle = 'DMS Body Fixture Hidden Profile';

    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId: visibleMatterId,
        documentId: visibleDocumentId,
        versionId: randomUUID(),
        title: visibleTitle,
        contentText: `This permitted matter body contains ${bodyOnlyToken} for full text search only.`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-19T00:00:00.000Z',
      },
      1301,
    );
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId: hiddenMatterId,
        documentId: hiddenDocumentId,
        versionId: randomUUID(),
        title: hiddenTitle,
        contentText: `This hidden matter body also contains ${bodyOnlyToken}.`,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-19T00:00:00.000Z',
      },
      1302,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: visibleMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
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

  it('proves body-only text is found by body/full-text search but not title-only search', async () => {
    const titleOnly = await postSearch(baseUrl, cookie, {
      query: bodyOnlyToken,
      target: 'title',
      pageSize: 10,
    });

    expect(titleOnly.total).toBe(0);
    expect(titleOnly.results).toEqual([]);
    expect(JSON.stringify(titleOnly)).not.toContain(visibleDocumentId);
    expect(JSON.stringify(titleOnly)).not.toContain(hiddenDocumentId);

    const bodySearch = await postSearch(baseUrl, cookie, {
      query: bodyOnlyToken,
      target: 'body',
      pageSize: 10,
    });

    expect(bodySearch.total).toBe(1);
    expect(resultTitles(bodySearch)).toEqual([visibleTitle]);
    expect(bodySearch.results[0]).toMatchObject({
      documentId: visibleDocumentId,
      matterId: visibleMatterId,
      title: visibleTitle,
    });
    expect(bodySearch.results[0]?.snippet).toContain(bodyOnlyToken);
    expect(bodySearch.results[0]?.highlights.length).toBeGreaterThan(0);
    expect(JSON.stringify(bodySearch)).not.toContain(hiddenMatterId);
    expect(JSON.stringify(bodySearch)).not.toContain(hiddenDocumentId);
    expect(JSON.stringify(bodySearch)).not.toContain(hiddenTitle);
  });

  it('records only bounded audit metadata for body searches', async () => {
    await postSearch(baseUrl, cookie, {
      query: bodyOnlyToken,
      target: 'body',
      pageSize: 10,
    });

    const audit = await latestSearchAudit({
      actorId: alphaOwnerUserId,
      queryHash: sha256Hex(bodyOnlyToken),
    });

    expect(audit?.metadata_json).toMatchObject({
      query_hash: sha256Hex(bodyOnlyToken),
      query_length: bodyOnlyToken.length,
      result_count: 1,
      scope_type: 'keyword',
    });
    expect(audit?.raw_metadata).not.toContain(bodyOnlyToken);
    expect(audit?.raw_metadata).not.toContain(visibleTitle);
    expect(audit?.raw_metadata).not.toContain(hiddenTitle);
    expect(audit?.raw_metadata).not.toContain(visibleDocumentId);
    expect(audit?.raw_metadata).not.toContain(hiddenDocumentId);
  });
});
