import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { AuditMetadataNormalizer } from '../../../apps/api/src/modules/audit/audit-metadata.normalizer';
import { AuditService } from '../../../apps/api/src/modules/audit/audit.service';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import type {
  SearchPermissionScopeDecision,
  SearchPermissionScopeProvider,
  SearchRequestContext,
} from '../../../apps/api/src/modules/search/permission/search-permission-scope.provider';
import { SearchFilterBuilder } from '../../../apps/api/src/modules/search/query/search-filter.builder';
import { SearchQueryBuilder } from '../../../apps/api/src/modules/search/query/search-query.builder';
import { SnippetBuilder } from '../../../apps/api/src/modules/search/query/snippet-builder';
import { SearchService } from '../../../apps/api/src/modules/search/search.service';
import { TenantContextService } from '../../../apps/api/src/modules/tenant/tenant-context';
import { tenantAlphaId } from '../helpers/db';
import {
  alphaOwnerUserId,
  createSearchFixture,
  tenantVersionScope,
  type SearchFixture,
} from './search-fixtures';

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

function createService(provider: SearchPermissionScopeProvider): SearchService {
  const snippetBuilder = new SnippetBuilder();
  return new SearchService(
    new AuditService(new TenantContextService(), new AuditMetadataNormalizer()),
    new SearchQueryBuilder(new SearchFilterBuilder(), snippetBuilder),
    snippetBuilder,
    provider,
  );
}

function allowProvider(fixture: SearchFixture): SearchPermissionScopeProvider {
  return {
    async scopeForSearch(_ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision> {
      return {
        effect: 'ALLOW',
        scope: tenantVersionScope(tenantAlphaId, fixture.alphaVersionIds),
      };
    },
  };
}

describe('search core integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let fixture: SearchFixture;

  beforeAll(async () => {
    fixture = await createSearchFixture('SC Core');
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await login(baseUrl);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the HTTP endpoint fail-closed before PACK-R3-04 permission provider replacement', async () => {
    const denied = await fetch(`${baseUrl}/v1/search`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'termination' }),
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');

    const unauthenticated = await fetch(`${baseUrl}/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'termination' }),
    });
    const unauthenticatedBody = await unauthenticated.text();
    expect(unauthenticated.status, unauthenticatedBody).toBe(401);
    expect(unauthenticatedBody).toContain('AUTH_REQUIRED');

    const invalid = await fetch(`${baseUrl}/v1/search`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'termination', pageSize: 51 }),
    });
    const invalidBody = await invalid.text();
    expect(invalid.status, invalidBody).toBe(400);
    expect(invalidBody).toContain('VALIDATION_FAILED');
  });

  it('runs full-text search with snippets/highlights inside an allow test scope', async () => {
    const service = createService(allowProvider(fixture));
    const response = await service.search(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      { query: 'termination', page: 1, pageSize: 10 },
    );

    expect(response.total).toBe(2);
    expect(response.results.map((result) => result.title)).toEqual([
      'SC Core Termination Agreement',
      'SC Core Background Memo',
    ]);
    expect(response.results[0]?.snippet).not.toContain('<script>');
    expect(response.results[0]?.snippet).not.toContain('</script>');
    expect(response.results[0]?.highlights.length).toBeGreaterThan(0);
  });

  it('supports metadata-only search and explicit superseded inclusion while excluding deleted rows', async () => {
    const service = createService(allowProvider(fixture));
    const metadataOnly = await service.search(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      {
        filters: { matterId: fixture.alphaMatterId, documentType: 'contract' },
        page: 1,
        pageSize: 10,
      },
    );
    expect(metadataOnly.results.map((result) => result.title)).toEqual([
      'SC Core Termination Agreement',
    ]);

    const allVersions = await service.search(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      {
        query: 'termination',
        filters: { versionStatus: 'all' },
        page: 1,
        pageSize: 10,
      },
    );
    expect(allVersions.results.map((result) => result.title)).toEqual(
      expect.arrayContaining(['SC Core Termination Agreement', 'SC Core Superseded Contract']),
    );
    expect(allVersions.results.map((result) => result.title)).not.toContain('SC Core Deleted Evidence');
  });

  it('fails closed when the scope provider throws', async () => {
    const service = createService({
      async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
        throw new Error('scope unavailable');
      },
    });
    await expect(
      service.search(
        { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
        { query: 'termination', page: 1, pageSize: 10 },
      ),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });
});
