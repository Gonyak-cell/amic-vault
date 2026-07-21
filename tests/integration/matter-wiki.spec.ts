import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { LocalGemmaGenerationService } from '../../apps/api/src/modules/ai/generation/local-gemma-generation.service';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

interface MatterWikiPage {
  pageId: string;
  pageKind: 'overview' | 'issue' | 'party' | 'timeline';
  markdownBody: string;
  reviewStatus: string;
  sourceRefs: Array<{ sourceRef: string; sourceKind: string }>;
}

interface MatterWikiRegenerateResponse {
  generatedCount: number;
  pages: MatterWikiPage[];
}

interface WorkQueueResponse {
  items: Array<{
    itemKey: string;
    targetId?: string;
    kind?: string;
    title: string;
    status?: string;
  }>;
}

async function login(
  baseUrl: string,
  input: { email: string; password: string; tenantId: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function expectJson<T>(response: Response, status: number): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(status);
  return JSON.parse(body) as T;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `F14 Wiki Client ${randomUUID()}` }),
  });
  return (await expectJson<{ clientId: string }>(response, 201)).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `F14-${randomUUID()}`,
      matterName: `F14 Wiki ${randomUUID()}`,
      matterType: 'litigation',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  return (await expectJson<{ matterId: string }>(response, 201)).matterId;
}

async function seedLitigationFact(matterId: string): Promise<string> {
  const factId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO litigation_facts (
          fact_id, tenant_id, matter_id, fact_code, fact_summary, status,
          materiality, citation_refs, created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5, 'verified',
          'high', ARRAY[$6]::text[], $7, $7
        )
      `,
      [
        factId,
        tenantAlphaId,
        matterId,
        `F14.${randomUUID().slice(0, 8).toUpperCase()}`,
        '인용 근거가 확인된 주요 사실이 계약 종료 쟁점과 직접 연결됩니다.',
        `litigation_fact:${factId}`,
        alphaOwnerUserId,
      ],
    );
  });
  return factId;
}

async function expectEmptySourceRefsRejected(matterId: string): Promise<void> {
  await expect(
    withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO matter_wiki_pages (
            tenant_id, matter_id, page_kind, title, markdown_body,
            source_refs, generated_by
          )
          VALUES ($1, $2, 'overview', 'Empty', '# Empty', '[]'::jsonb, $3)
        `,
        [tenantAlphaId, matterId, alphaOwnerUserId],
      );
    }),
  ).rejects.toThrow();
}

async function wikiAudits(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; metadata_json: Record<string, unknown> }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action IN ('WIKI_PAGE_PROPOSED', 'WIKI_PAGE_REVIEWED', 'WIKI_EXPORTED')
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows;
  });
}

describe('matter wiki integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let betaCookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    betaCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await app.close();
  });

  it('generates cited wiki drafts, reviews one page, exports an Obsidian zip, and denies unauthorized access', async () => {
    vi.stubEnv('MATTER_WIKI_LOCAL_GEMMA_ENABLED', 'true');
    process.env.MATTER_WIKI_LOCAL_GEMMA_ENABLED = 'true';
    const gemmaSpy = vi
      .spyOn(LocalGemmaGenerationService.prototype, 'generateGrounded')
      .mockImplementation(async (pack, options) => {
        const allowedRef = pack.citationRequirements.sourceRefs[0] ?? 'graph:wiki_fallback';
        expect(options?.compileOptions?.allowedClaimKinds).toContain('summary');
        return {
          status: 'completed',
          model: 'gemma4:12b',
          latencyMs: 7,
          output: {
            answer: 'LocalGemma 위키 초안',
            sections: [
              {
                section_id: 'wiki-section',
                heading: 'LocalGemma 근거 섹션',
                text: 'LocalGemma가 citation source ref만 사용해 위키 초안을 생성했습니다.',
                source_refs: [allowedRef],
              },
            ],
            claims: [
              {
                claim_id: 'wiki-claim',
                kind: 'summary',
                text: 'LocalGemma 위키 초안은 허용된 source ref를 인용합니다.',
                source_refs: [allowedRef],
                is_legal_conclusion: false,
              },
            ],
            warnings: [],
          },
        };
      });

    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const factId = await seedLitigationFact(matterId);
    await expectEmptySourceRefsRejected(matterId);

    const regenerated = await expectJson<MatterWikiRegenerateResponse>(
      await fetch(`${baseUrl}/v1/matters/${matterId}/wiki/regenerate`, {
        method: 'POST',
        headers: { cookie: ownerCookie },
      }),
      201,
    );
    expect(regenerated.generatedCount).toBe(4);
    expect(gemmaSpy).toHaveBeenCalledTimes(4);
    expect(gemmaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'summary',
        citationRequirements: expect.objectContaining({
          required: true,
          sourceRefs: expect.arrayContaining([expect.stringMatching(/^graph:/u)]),
        }),
      }),
      expect.objectContaining({
        compileOptions: expect.objectContaining({
          purpose: 'grounded_answer',
          artifactKind: 'matter_wiki_overview',
        }),
      }),
    );
    expect(regenerated.pages.map((page) => page.pageKind).sort()).toEqual([
      'issue',
      'overview',
      'party',
      'timeline',
    ]);
    expect(regenerated.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageKind: 'overview',
          reviewStatus: 'proposed',
          sourceRefs: expect.arrayContaining([
            expect.objectContaining({ sourceRef: `litigation_fact:${factId}` }),
          ]),
        }),
      ]),
    );
    const overview = regenerated.pages.find((page) => page.pageKind === 'overview');
    expect(overview).toBeDefined();
    expect(overview!.markdownBody).toContain('LocalGemma 위키 초안');
    expect(overview!.markdownBody).toContain('[^1]:');

    const queue = await expectJson<WorkQueueResponse>(
      await fetch(`${baseUrl}/v1/work/items?kind=wiki_page_review&assignee=all&limit=100`, {
        headers: { cookie: ownerCookie },
      }),
      200,
    );
    expect(queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: overview!.pageId,
          kind: 'wiki_page_review',
          title: '위키 페이지 검토',
        }),
      ]),
    );

    const reviewed = await expectJson<MatterWikiPage>(
      await fetch(`${baseUrl}/v1/matters/${matterId}/wiki/${overview!.pageId}/review`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          reviewReason: 'F14 wiki integration confirmation',
        }),
      }),
      200,
    );
    expect(reviewed.reviewStatus).toBe('confirmed');

    const deniedExport = await fetch(`${baseUrl}/v1/matters/${matterId}/wiki-export`, {
      headers: { cookie: betaCookie },
    });
    expect(deniedExport.status).toBe(403);

    const exported = await fetch(`${baseUrl}/v1/matters/${matterId}/wiki-export`, {
      headers: { cookie: ownerCookie },
    });
    const exportedBytes = Buffer.from(await exported.arrayBuffer());
    expect(exported.status, exportedBytes.toString('utf8')).toBe(200);
    expect(exported.headers.get('content-type')).toContain('application/zip');
    expect(exported.headers.get('x-page-count')).toBe('1');
    expect(exportedBytes.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(exportedBytes.toString('utf8')).toContain('# 사건 개요');
    expect(exportedBytes.toString('utf8')).toContain(`litigation_fact:${factId}`);

    const audits = await wikiAudits(matterId);
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(['WIKI_PAGE_PROPOSED', 'WIKI_PAGE_REVIEWED', 'WIKI_EXPORTED']),
    );
    expect(JSON.stringify(audits)).not.toContain('주요 사실');
    expect(audits.find((row) => row.action === 'WIKI_EXPORTED')?.metadata_json).toEqual(
      expect.objectContaining({
        matter_id: matterId,
        item_count: 1,
        export_format: 'obsidian_zip',
      }),
    );
    gemmaSpy.mockRestore();
  });
});
