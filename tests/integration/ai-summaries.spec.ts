import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AiSummaryResponseDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { LocalGemmaGenerationService } from '../../apps/api/src/modules/ai/generation/local-gemma-generation.service';
import { configureApp } from '../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  alphaOwnerUserId,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentAiAllowed,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

interface SummaryFixtureDocument {
  documentId: string;
  versionId: string;
  title: string;
  contentText: string;
}

describe('AI summaries integration', () => {
  const marker = `ai-summary-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let cookie: string;
  let visible: SummaryFixtureDocument;
  let aiDenied: SummaryFixtureDocument;
  let explicitDenied: SummaryFixtureDocument;

  beforeAll(async () => {
    visible = await insertSummaryDocument({
      title: `${marker} Authorized Summary Memo`,
      contentText: `${marker} authorized closing covenant notice lawyer@example.test`,
      aiAllowed: true,
      index: 981,
    });
    aiDenied = await insertSummaryDocument({
      title: `${marker} AI Disabled Memo`,
      contentText: `${marker} hidden ai disabled summary evidence`,
      aiAllowed: false,
      index: 982,
    });
    explicitDenied = await insertSummaryDocument({
      title: `${marker} Explicit Deny Memo`,
      contentText: `${marker} hidden explicit deny summary evidence`,
      aiAllowed: true,
      index: 983,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
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
    await enableAiPolicyForMatter();

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

  it('creates cited matter summaries from authorized Evidence Pack sources only', async () => {
    const summary = await postSummary({
      matterId,
      task: 'matter_summary',
      query: `${marker} authorized hidden summary`,
      filters: { clientId },
      maxChunks: 6,
    });

    expect(summary).toMatchObject({
      matterId,
      task: 'matter_summary',
      status: 'completed',
      modelRoute: 'local_gemma',
      escalationRequired: false,
      legalConclusionAutoApproval: false,
    });
    expect(summary.sections.length).toBeGreaterThan(0);
    expect(summary.sections.every((section) => section.citationRefs.length > 0)).toBe(true);
    expect(summary.citations.map((citation) => citation.documentId)).toEqual([visible.documentId]);
    expectNoDeniedReference(summary);

    const chunks = await aiSessionChunks(summary.sessionId);
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: visible.documentId,
          included: true,
          reason_code: 'included',
        }),
        expect.objectContaining({
          document_id: aiDenied.documentId,
          included: false,
          reason_code: 'ai_policy_blocked',
        }),
      ]),
    );

    const audits = await aiAuditEvents(summary.sessionId, matterId);
    expect(audits.map((audit) => audit.action)).toEqual([
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_CITED_DOCUMENT',
      'AI_RESPONSE',
    ]);
    const rawAudit = audits.map((audit) => audit.raw_metadata).join('\n');
    expect(rawAudit).not.toContain(`${marker} authorized hidden summary`);
    expect(rawAudit).not.toContain(visible.contentText);
    expect(rawAudit).not.toContain(aiDenied.contentText);
    expect(rawAudit).not.toContain(explicitDenied.contentText);
    expect(rawAudit).not.toMatch(/prompt_text|response_text|body|snippet|raw/i);
  });

  it('creates document and filed email thread summaries with citations', async () => {
    const documentSummary = await postSummary({
      matterId,
      task: 'document_summary',
      query: `${marker} authorized closing covenant`,
      targetDocumentId: visible.documentId,
      filters: { clientId },
      maxChunks: 3,
    });
    const emailSummary = await postSummary({
      matterId,
      task: 'email_thread_summary',
      query: `${marker} lawyer@example.test closing covenant`,
      filters: { clientId },
      maxChunks: 3,
    });

    expect(documentSummary.status).toBe('completed');
    expect(documentSummary.citations.map((citation) => citation.documentId)).toEqual([
      visible.documentId,
    ]);
    expect(documentSummary.sections.every((section) => section.citationRefs.length > 0)).toBe(true);
    expect(emailSummary.status).toBe('completed');
    expect(emailSummary.sections.map((section) => section.text).join('\n')).toContain(
      '[REDACTED:email_address]',
    );
    expect(emailSummary.sections.every((section) => section.citationRefs.length > 0)).toBe(true);
    expectNoDeniedReference(documentSummary);
    expectNoDeniedReference(emailSummary);
  });

  it('returns R8 clause templates with required citations', async () => {
    const summary = await postSummary({
      matterId,
      task: 'clause_analysis',
      query: `${marker} closing covenant clause`,
      filters: { clientId },
      maxChunks: 3,
    });

    try {
      await setSummaryGenerationEnabled(true);
      const summary = await postSummary({
        matterId,
        task: 'email_thread_summary',
        query: `${marker} 금요일 계약서 회신 요청`,
        targetDocumentId: emailThread.documentId,
        filters: { clientId },
        maxChunks: 3,
      });

      expect(summary).toMatchObject({
        matterId,
        task: 'email_thread_summary',
        status: 'escalated',
        legalConclusionAutoApproval: false,
      });
      expect(summary.recommendedActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: expect.stringContaining('금요일까지 계약서 회신 요청'),
            reviewRequired: true,
          }),
          expect.objectContaining({
            action: expect.stringContaining('금요일 회신 기한'),
            reviewRequired: true,
          }),
        ]),
      );
      expect(summary.citations.map((citation) => citation.documentId)).toEqual([
        emailThread.documentId,
      ]);
      expect(summary.sections.every((section) => section.citationRefs.length > 0)).toBe(true);
      expect(await aiClaimKinds(summary.sessionId)).toEqual(
        expect.arrayContaining(['key_fact', 'timeline']),
      );
      expect(await aiClaimCitationCounts(summary.sessionId)).toEqual(
        expect.arrayContaining([
          { kind: 'key_fact', citation_count: 1 },
          { kind: 'timeline', citation_count: 1 },
        ]),
      );
      expect(gemmaSpy).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'summary' }), {
        compileOptions: {
          purpose: 'email_thread_summary',
          allowedClaimKinds: ['summary', 'key_fact', 'timeline', 'question'],
        },
      });
      expectNoDeniedReference(summary);
    } finally {
      gemmaSpy.mockRestore();
      await setSummaryGenerationEnabled(false);
    }
  });

  it('returns generated R8 clause risk analysis with required citations', async () => {
    const sourceChunkId = await firstSemanticChunkId(visible.versionId);
    const gemmaSpy = vi
      .spyOn(LocalGemmaGenerationService.prototype, 'generateGrounded')
      .mockResolvedValue({
        status: 'completed',
        output: {
          answer: 'Generated clause risk answer',
          sections: [
            {
              section_id: 'generated-clause-risk',
              heading: 'Generated clause risk',
              text: 'Generated cited clause risk',
              source_refs: [`chunk:${sourceChunkId}`],
            },
          ],
          claims: [
            {
              claim_id: 'generated-clause-risk-claim',
              kind: 'risk',
              text: 'Generated cited clause risk',
              source_refs: [`chunk:${sourceChunkId}`],
              is_legal_conclusion: false,
            },
          ],
          warnings: [],
        },
      });

    try {
      await setSummaryGenerationEnabled(true);
      const summary = await postSummary({
        matterId,
        task: 'clause_analysis',
        query: `${marker} closing covenant clause`,
        targetDocumentId: visible.documentId,
        filters: { clientId },
        maxChunks: 3,
      });

      expect(summary.status).toBe('escalated');
      expect(summary.sections[0]).toMatchObject({
        sectionId: 'generated-clause-risk',
        text: 'Generated cited clause risk',
      });
      expect(summary.citationWarnings).toEqual([]);
      expect(summary.warnings).not.toContain('RULE_FINDINGS_UNAVAILABLE_BEFORE_R8');
      expect(summary.sections.every((section) => section.citationRefs.length > 0)).toBe(true);
      expect(await aiClaimKinds(summary.sessionId)).toContain('risk');
      expect(gemmaSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleFindings: expect.any(Array),
          taskType: 'review',
        }),
        {
          compileOptions: {
            purpose: 'clause_risk_analysis',
            allowedClaimKinds: ['risk', 'clause', 'issue'],
          },
        },
      );
      expectNoDeniedReference(summary);
    } finally {
      gemmaSpy.mockRestore();
      await setSummaryGenerationEnabled(false);
    }
  });

  it('escalates risk extraction templates without unsupported conclusions', async () => {
    const summary = await postSummary({
      matterId,
      task: 'risk_extraction',
      query: `${marker} risk extraction closing covenant`,
      filters: { clientId },
      maxChunks: 3,
    });

    expect(summary.status).toBe('escalated');
    expect(summary.escalationRequired).toBe(true);
    expect(summary.warnings).toContain('HUMAN_REVIEW_REQUIRED');
    expect(summary.citationWarnings.map((warning) => warning.code)).toContain(
      'LEGAL_CONCLUSION_REQUIRES_REVIEW',
    );
    expectNoDeniedReference(summary);
  });

  async function insertSummaryDocument(input: {
    title: string;
    contentText: string;
    aiAllowed: boolean;
    index: number;
  }): Promise<SummaryFixtureDocument> {
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
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
      input.index,
    );
    await setDocumentAiAllowed({
      tenantId: tenantAlphaId,
      documentId,
      aiAllowed: input.aiAllowed,
    });
    await seedSemanticChunksForVersion({
      tenantId: tenantAlphaId,
      documentId,
      versionId,
      contentText: input.contentText,
    });
    return { documentId, versionId, title: input.title, contentText: input.contentText };
  }

  async function enableAiPolicyForMatter(): Promise<void> {
    const policyId = randomUUID();
    const accessPolicyId = randomUUID();
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO ai_policies (
            policy_id, tenant_id, name, allowed_model_tiers,
            summary_generation_enabled, session_payload_preservation_enabled
          )
          VALUES ($1, $2, 'R6 summary local policy', ARRAY['local']::text[], false, true)
        `,
        [policyId, tenantAlphaId],
      );
      await client.query(
        `
          INSERT INTO ai_model_access_policies (
            access_policy_id, tenant_id, route_key, model_tier, status
          )
          VALUES ($1, $2, 'local_gemma', 'local', 'enabled')
          ON CONFLICT (tenant_id, route_key)
          DO UPDATE SET status = 'enabled', updated_at = now()
        `,
        [accessPolicyId, tenantAlphaId],
      );
      await client.query(
        `
          UPDATE matters
          SET ai_policy_id = $3,
            updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
        `,
        [tenantAlphaId, matterId, policyId],
      );
    });
  }

  async function setSummaryGenerationEnabled(enabled: boolean): Promise<void> {
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          UPDATE ai_policies
          SET summary_generation_enabled = $3,
            updated_at = now()
          WHERE tenant_id = $1
            AND policy_id = (
              SELECT ai_policy_id
              FROM matters
              WHERE tenant_id = $1
                AND matter_id = $2
            )
        `,
        [tenantAlphaId, matterId, enabled],
      );
    });
  }

  async function firstSemanticChunkId(versionId: string): Promise<string> {
    return withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ chunk_id: string }>(
        `
          SELECT c.chunk_id
          FROM document_chunks c
          JOIN document_chunk_embeddings e
            ON e.tenant_id = c.tenant_id
           AND e.chunk_id = c.chunk_id
           AND e.stale = false
          WHERE c.tenant_id = $1
            AND c.version_id = $2
            AND c.stale = false
          ORDER BY c.chunk_ordinal ASC
          LIMIT 1
        `,
        [tenantAlphaId, versionId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('summary fixture semantic chunk missing');
      return row.chunk_id;
    });
  }

  async function postSummary(body: Record<string, unknown>): Promise<AiSummaryResponseDto> {
    const response = await fetch(`${baseUrl}/v1/ai/summaries`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as AiSummaryResponseDto;
  }

  function expectNoDeniedReference(output: unknown): void {
    const raw = JSON.stringify(output);
    for (const denied of [aiDenied, explicitDenied]) {
      expect(raw).not.toContain(denied.title);
      expect(raw).not.toContain(denied.documentId);
      expect(raw).not.toContain(denied.versionId);
      expect(raw).not.toContain(denied.contentText);
    }
  }
});

async function aiAuditEvents(sessionId: string, matterId: string): Promise<
  {
    action: string;
    metadata_json: Record<string, unknown>;
    raw_metadata: string;
  }[]
> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      action: string;
      metadata_json: Record<string, unknown>;
      raw_metadata: string;
    }>(
      `
        SELECT action, metadata_json, metadata_json::text AS raw_metadata
        FROM audit_events
        WHERE tenant_id = $1
          AND (
            metadata_json->>'ai_session_id' = $2
            OR (
              action = 'AI_CITED_DOCUMENT'
              AND matter_id = $3
              AND created_at > now() - interval '5 minutes'
            )
          )
          AND action IN (
            'AI_QUERY_SUBMITTED',
            'AI_RETRIEVAL',
            'AI_RESPONSE',
            'AI_RETRIEVAL_EXCLUDED',
            'AI_CITED_DOCUMENT'
          )
        ORDER BY seq ASC
      `,
      [tenantAlphaId, sessionId, matterId],
    );
    return result.rows.filter(
      (row, index, rows) =>
        row.action !== 'AI_CITED_DOCUMENT' ||
        index === rows.findIndex((candidate) => candidate.action === 'AI_CITED_DOCUMENT'),
    );
  });
}
