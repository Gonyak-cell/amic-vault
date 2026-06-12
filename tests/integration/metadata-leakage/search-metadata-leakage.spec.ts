import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { tenantAlphaId } from '../helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
} from '../search-permission/search-fixtures';
import {
  loginSearchUser,
  postSearch,
  resultTitles,
  type SearchHttpResponse,
} from '../search-permission/search-http-helpers';

interface LeakageCorpus {
  commonToken: string;
  deniedOnlyToken: string;
  visibleTitles: string[];
  hiddenTitles: string[];
}

interface HiddenReference {
  documentId: string;
  title: string;
}

const corpusPath = path.join(
  process.cwd(),
  'tests/fixtures/search/leakage-corpus/search-metadata-leakage.json',
);
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8')) as LeakageCorpus;

describe('search metadata leakage integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let clientId: string;
  let hiddenRefs: HiddenReference[];

  beforeAll(async () => {
    const accessibleMatterId = randomUUID();
    const hiddenMatterId = randomUUID();
    const wallMatterId = randomUUID();
    clientId = randomUUID();
    hiddenRefs = [
      { documentId: randomUUID(), title: corpus.hiddenTitles[0]! },
      { documentId: randomUUID(), title: corpus.hiddenTitles[1]! },
      { documentId: randomUUID(), title: corpus.hiddenTitles[2]! },
    ];

    await insertLeakageRow({
      matterId: accessibleMatterId,
      clientId,
      documentId: randomUUID(),
      title: corpus.visibleTitles[0]!,
      contentText: `${corpus.commonToken} visible first`,
      index: 701,
    });
    await insertLeakageRow({
      matterId: accessibleMatterId,
      clientId,
      documentId: randomUUID(),
      title: corpus.visibleTitles[1]!,
      contentText: `${corpus.commonToken} visible second`,
      index: 702,
    });
    await insertLeakageRow({
      matterId: hiddenMatterId,
      clientId,
      documentId: hiddenRefs[0]!.documentId,
      title: hiddenRefs[0]!.title,
      contentText: `${corpus.commonToken} ${corpus.deniedOnlyToken} nonmember hidden`,
      index: 703,
    });
    await insertLeakageRow({
      matterId: accessibleMatterId,
      clientId,
      documentId: hiddenRefs[1]!.documentId,
      title: hiddenRefs[1]!.title,
      contentText: `${corpus.commonToken} explicit deny hidden`,
      index: 704,
    });
    await insertLeakageRow({
      matterId: wallMatterId,
      clientId,
      documentId: hiddenRefs[2]!.documentId,
      title: hiddenRefs[2]!.title,
      contentText: `${corpus.commonToken} wall hidden`,
      index: 705,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: accessibleMatterId,
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
      resourceId: hiddenRefs[1]!.documentId,
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

  it('does not leak title, id, snippet, count, or facets for denied-only hits', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: corpus.deniedOnlyToken,
      filters: { clientId },
    });

    expect(response.total).toBe(0);
    expect(response.results).toEqual([]);
    expect(response.facets).toEqual(emptyFacets());
    expectNoHiddenReferences(response);
  });

  it('counts only authorized rows when allowed and denied documents share the query', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: corpus.commonToken,
      filters: { clientId },
      page: 1,
      pageSize: 10,
    });

    expect(response.total).toBe(2);
    expect(resultTitles(response).sort()).toEqual([...corpus.visibleTitles].sort());
    expect(response.facets.clients).toEqual([{ value: clientId, count: 2 }]);
    expect(sumCounts(response.facets.documentTypes)).toBe(2);
    expect(sumCounts(response.facets.matters)).toBe(2);
    expectNoHiddenReferences(response);
  });

  it('does not fill authorized page slots with unauthorized rows', async () => {
    const response = await postSearch(baseUrl, cookie, {
      query: corpus.commonToken,
      filters: { clientId },
      page: 2,
      pageSize: 1,
    });

    expect(response.total).toBe(2);
    expect(response.results).toHaveLength(1);
    expect(corpus.visibleTitles).toContain(response.results[0]?.title);
    expectNoHiddenReferences(response);
  });

  function expectNoHiddenReferences(response: SearchHttpResponse): void {
    const raw = JSON.stringify(response);
    for (const hidden of hiddenRefs) {
      expect(raw).not.toContain(hidden.documentId);
      expect(raw).not.toContain(hidden.title);
    }
    expect(raw).not.toContain(corpus.deniedOnlyToken);
  }
});

function emptyFacets(): SearchHttpResponse['facets'] {
  return {
    clients: [],
    matters: [],
    documentTypes: [],
    versionStatuses: [],
    dateRanges: [],
  };
}

function sumCounts(buckets: readonly { count: number }[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

async function insertLeakageRow(input: {
  matterId: string;
  clientId: string;
  documentId: string;
  title: string;
  contentText: string;
  index: number;
}): Promise<void> {
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId: input.documentId,
      versionId: randomUUID(),
      title: input.title,
      contentText: input.contentText,
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-21T00:00:00.000Z',
    },
    input.index,
  );
}
