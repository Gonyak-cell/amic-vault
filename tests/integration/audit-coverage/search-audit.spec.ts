import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';
import {
  alphaOwnerUserId,
  createSearchFixture,
  tenantVersionScope,
  type SearchFixture,
} from '../search-permission/search-fixtures';

interface SearchAuditRow {
  result: 'success' | 'denied' | 'failure';
  metadata_json: {
    query_hash?: string;
    query_length?: number;
    filter_refs?: string;
    result_count?: number;
    duration_ms?: number;
  };
  raw_metadata: string;
}

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

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function createService(fixture: SearchFixture): SearchService {
  const snippetBuilder = new SnippetBuilder();
  const provider: SearchPermissionScopeProvider = {
    async scopeForSearch(_ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision> {
      return {
        effect: 'ALLOW',
        scope: tenantVersionScope(tenantAlphaId, fixture.alphaVersionIds),
      };
    },
  };
  return new SearchService(
    new AuditService(new TenantContextService(), new AuditMetadataNormalizer()),
    new SearchQueryBuilder(new SearchFilterBuilder(), snippetBuilder),
    snippetBuilder,
    provider,
  );
}

async function latestSearchAudit(queryHash: string): Promise<SearchAuditRow> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<SearchAuditRow>(
      `
        SELECT result, metadata_json, metadata_json::text AS raw_metadata
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'SEARCH_EXECUTED'
          AND metadata_json->>'query_hash' = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, queryHash],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as SearchAuditRow;
  });
}

describe('search audit coverage', () => {
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let fixture: SearchFixture;

  beforeAll(async () => {
    fixture = await createSearchFixture('SC Audit');
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await login(baseUrl);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records denied default-scope searches without storing the raw query', async () => {
    const rawQuery = 'raw-denied-query-8842';
    const response = await fetch(`${baseUrl}/v1/search`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ query: rawQuery }),
    });
    expect(response.status).toBe(403);

    const audit = await latestSearchAudit(sha256Hex(rawQuery));
    expect(audit.result).toBe('denied');
    expect(audit.metadata_json).toMatchObject({
      query_hash: sha256Hex(rawQuery),
      query_length: rawQuery.length,
      result_count: 0,
    });
    expect(audit.metadata_json.duration_ms).toBeGreaterThanOrEqual(0);
    expect(audit.raw_metadata).not.toContain(rawQuery);
  });

  it('records successful searches with counts and filter refs only', async () => {
    const rawQuery = 'termination covenant';
    const response = await createService(fixture).search(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      {
        query: rawQuery,
        filters: { matterId: fixture.alphaMatterId },
        page: 1,
        pageSize: 10,
      },
    );
    expect(response.total).toBeGreaterThan(0);

    const audit = await latestSearchAudit(sha256Hex(rawQuery));
    expect(audit.result).toBe('success');
    expect(audit.metadata_json.result_count).toBe(response.total);
    expect(audit.metadata_json.filter_refs).toContain(`matter_id:${fixture.alphaMatterId}`);
    expect(audit.raw_metadata).not.toContain(rawQuery);
    expect(audit.raw_metadata).not.toContain('termination covenant');
  });
});
