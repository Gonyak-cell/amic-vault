import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuditMetadataNormalizer } from '../../../apps/api/src/modules/audit/audit-metadata.normalizer';
import { AuditService } from '../../../apps/api/src/modules/audit/audit.service';
import type {
  SearchPermissionScopeDecision,
  SearchPermissionScopeProvider,
} from '../../../apps/api/src/modules/search/permission/search-permission-scope.provider';
import { SearchFilterBuilder } from '../../../apps/api/src/modules/search/query/search-filter.builder';
import { SearchQueryBuilder } from '../../../apps/api/src/modules/search/query/search-query.builder';
import { SnippetBuilder } from '../../../apps/api/src/modules/search/query/snippet-builder';
import { truncateUtf8 } from '../../../apps/api/src/modules/search/index/search-index.repository';
import { SearchService } from '../../../apps/api/src/modules/search/search.service';
import { TenantContextService } from '../../../apps/api/src/modules/tenant/tenant-context';
import { createRuntimeDatabaseExecutor, tenantAlphaId, tenantBetaId } from '../helpers/db';
import {
  addMatterMember,
  alphaOwnerUserId,
  betaOwnerUserId,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  tenantVersionScope,
} from './search-fixtures';

function createService(versionIds: readonly string[]): SearchService {
  const snippetBuilder = new SnippetBuilder();
  const provider: SearchPermissionScopeProvider = {
    async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
      return {
        effect: 'ALLOW',
        scope: tenantVersionScope(tenantAlphaId, versionIds),
      };
    },
  };
  return new SearchService(
    new AuditService(new TenantContextService(), new AuditMetadataNormalizer(), createRuntimeDatabaseExecutor() as never),
    new SearchQueryBuilder(new SearchFilterBuilder(), snippetBuilder),
    snippetBuilder,
    provider,
  );
}

function twoMegabyteBody(uniquePhrase: string): string {
  const prefix = 'alpha '.repeat(Math.ceil((1536 * 1024) / 6));
  const suffix = ' omega'.repeat(Math.ceil((512 * 1024) / 6));
  return `${prefix}${uniquePhrase}${suffix}`;
}

describe('search body fixture integration', () => {
  const marker = `D6Body${randomUUID().replaceAll('-', '')}`;
  const allowedClientId = randomUUID();
  const allowedMatterId = randomUUID();
  const allowedDocumentId = randomUUID();
  const allowedVersionId = randomUUID();
  const deniedClientId = randomUUID();
  const deniedMatterId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  const uniquePhrase = `${marker}TailNeedle`;
  const longBody = twoMegabyteBody(uniquePhrase);

  beforeAll(async () => {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId: allowedClientId,
        matterId: allowedMatterId,
        documentId: allowedDocumentId,
        versionId: allowedVersionId,
        title: `${marker} Large Body Memo`,
        contentText: truncateUtf8(longBody),
        contentTruncated: true,
        seedChunks: false,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
      8601,
    );
    await seedSemanticChunksForVersion({
      tenantId: tenantAlphaId,
      documentId: allowedDocumentId,
      versionId: allowedVersionId,
      contentText: longBody,
      embeddings: false,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: allowedMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });

    await insertSearchIndexedRow(
      {
        tenantId: tenantBetaId,
        ownerUserId: betaOwnerUserId,
        clientId: deniedClientId,
        matterId: deniedMatterId,
        documentId: deniedDocumentId,
        versionId: deniedVersionId,
        title: `${marker} Hidden Large Body Memo`,
        contentText: truncateUtf8(longBody),
        contentTruncated: true,
        seedChunks: false,
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
      8602,
    );
    await seedSemanticChunksForVersion({
      tenantId: tenantBetaId,
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      contentText: longBody,
      embeddings: false,
    });
  }, 60_000);

  it('finds a unique phrase after the 1MB preview limit through permission-scoped chunks', async () => {
    expect(truncateUtf8(longBody)).not.toContain(uniquePhrase);

    const response = await createService([allowedVersionId]).search(
      { tenantId: tenantAlphaId, userId: alphaOwnerUserId },
      { query: uniquePhrase, target: 'body', page: 1, pageSize: 10 },
    );

    expect(response.total).toBe(1);
    expect(response.results[0]).toMatchObject({
      versionId: allowedVersionId,
      contentTruncated: true,
    });
    expect(response.results[0]?.snippet).toContain(uniquePhrase);
    expect(response.results[0]?.versionId).not.toBe(deniedVersionId);
  });
});
