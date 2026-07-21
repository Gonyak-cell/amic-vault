import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
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
} from '../../../apps/api/src/modules/search/permission/search-permission-scope.provider';
import { SearchFilterBuilder } from '../../../apps/api/src/modules/search/query/search-filter.builder';
import { SearchQueryBuilder } from '../../../apps/api/src/modules/search/query/search-query.builder';
import { SnippetBuilder } from '../../../apps/api/src/modules/search/query/snippet-builder';
import { SearchService } from '../../../apps/api/src/modules/search/search.service';
import { TenantContextService } from '../../../apps/api/src/modules/tenant/tenant-context';
import {
  createOwnerClient,
  createRuntimeTenantTransactionExecutor,
  setTenant,
  tenantAlphaId,
  withClient,
} from '../helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  createSearchFixture,
  tenantVersionScope,
  type SearchFixture,
} from './search-fixtures';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function seedD5DisplayMetadata(fixture: SearchFixture): Promise<string> {
  const documentId = fixture.alphaDocumentIds[0];
  const currentVersionId = fixture.alphaVersionIds[0];
  const previousVersionId = randomUUID();
  const previousFileObjectId = randomUUID();
  const previousHash = sha256Hex(previousVersionId);
  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO file_objects (
            file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
            mime_type, size_bytes, sha256, created_by
          )
          VALUES ($1, $2, $3, 'D5 previous version.pdf', 'D5 previous version.pdf',
            'application/pdf', 32, $4, $5)
        `,
        [
          previousFileObjectId,
          tenantAlphaId,
          `s3://amic-vault-dev/tenants/${tenantAlphaId}/matters/${fixture.alphaMatterId}/documents/${documentId}/${previousFileObjectId}`,
          previousHash,
          alphaOwnerUserId,
        ],
      );
      await client.query(
        `
          UPDATE document_versions
          SET version_no = 2
          WHERE tenant_id = $1
            AND version_id = $2
        `,
        [tenantAlphaId, currentVersionId],
      );
      await client.query(
        `
          INSERT INTO document_versions (
            version_id, tenant_id, document_id, version_no, version_status,
            file_object_id, file_hash, created_by
          )
          VALUES ($1, $2, $3, 1, 'superseded', $4, $5, $6)
        `,
        [
          previousVersionId,
          tenantAlphaId,
          documentId,
          previousFileObjectId,
          previousHash,
          alphaOwnerUserId,
        ],
      );
      await client.query(
        `
          UPDATE document_versions
          SET supersedes_version_id = $3
          WHERE tenant_id = $1
            AND version_id = $2
        `,
        [tenantAlphaId, currentVersionId, previousVersionId],
      );
      await client.query(
        `
          UPDATE documents
          SET ai_allowed = true,
              updated_at = '2026-06-14T00:00:00.000Z'::timestamptz
          WHERE tenant_id = $1
            AND document_id = $2
        `,
        [tenantAlphaId, documentId],
      );
      await client.query(
        `
          UPDATE document_search_index
          SET author_user_id = $3,
              ai_allowed = true,
              prev_version_id = $4,
              next_version_id = NULL,
              updated_at = '2026-06-14T00:00:00.000Z'::timestamptz
          WHERE tenant_id = $1
            AND version_id = $2
        `,
        [tenantAlphaId, currentVersionId, alphaOwnerUserId, previousVersionId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  return previousVersionId;
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

function createService(provider: SearchPermissionScopeProvider): SearchService {
  const snippetBuilder = new SnippetBuilder();
  return new SearchService(
    new AuditService(
      new TenantContextService(),
      new AuditMetadataNormalizer(),
      createRuntimeTenantTransactionExecutor(),
    ),
    new SearchQueryBuilder(new SearchFilterBuilder(), snippetBuilder),
    snippetBuilder,
    provider,
  );
}

function allowProvider(fixture: SearchFixture): SearchPermissionScopeProvider {
  return {
    async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
      return {
        effect: 'ALLOW',
        scope: tenantVersionScope(tenantAlphaId, fixture.alphaVersionIds),
      };
    },
  };
}

describe('search core integration', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let cookie: string;
  let fixture: SearchFixture;
  let d5PreviousVersionId: string;

  beforeAll(async () => {
    fixture = await createSearchFixture('SC Core');
    d5PreviousVersionId = await seedD5DisplayMetadata(fixture);
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.alphaMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await login(baseUrl);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs the HTTP endpoint through the permission-bound search provider', async () => {
    const allowed = await fetch(`${baseUrl}/v1/search`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'termination', filters: { matterId: fixture.alphaMatterId } }),
    });
    const allowedBody = await allowed.text();
    expect(allowed.status, allowedBody).toBe(201);
    const parsed = JSON.parse(allowedBody) as { total: number; results: Array<{ title: string }> };
    expect(parsed.total).toBe(2);
    expect(parsed.results.map((result) => result.title)).toEqual([
      'SC Core Termination Agreement',
      'SC Core Background Memo',
    ]);

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

  it('returns D5 display fields from actual document metadata', async () => {
    const service = createService(allowProvider(fixture));
    const response = await service.search(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      { query: 'termination', page: 1, pageSize: 10 },
    );
    const result = response.results.find((item) => item.title === 'SC Core Termination Agreement');
    expect(result).toBeDefined();
    expect(result).toMatchObject({
      aiAllowed: true,
      author: {
        userId: alphaOwnerUserId,
      },
      permissionBadges: {
        confidentiality: 'standard',
        legalHold: 'no_hold',
        privilege: 'none',
      },
      prevVersionId: d5PreviousVersionId,
    });
    expect(typeof result?.score).toBe('number');

    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const metadata = await client.query<{
        ai_allowed: boolean;
        author_user_id: string;
        confidentiality_level: string;
        legal_hold: boolean;
        privilege_status: string;
        supersedes_version_id: string | null;
      }>(
        `
          SELECT d.ai_allowed, d.confidentiality_level, d.legal_hold, d.privilege_status,
            dv.created_by AS author_user_id, dv.supersedes_version_id
          FROM documents d
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
          WHERE d.tenant_id = $1
            AND dv.version_id = $2
          LIMIT 1
        `,
        [tenantAlphaId, fixture.alphaVersionIds[0]],
      );
      expect(metadata.rows[0]).toMatchObject({
        ai_allowed: true,
        author_user_id: alphaOwnerUserId,
        confidentiality_level: 'standard',
        legal_hold: false,
        privilege_status: 'none',
        supersedes_version_id: d5PreviousVersionId,
      });
    });
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
    expect(allVersions.results.map((result) => result.title)).not.toContain(
      'SC Core Deleted Evidence',
    );
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
