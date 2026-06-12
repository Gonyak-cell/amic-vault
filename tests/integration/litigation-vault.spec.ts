import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  LitigationCaseMapResponseDto,
  LitigationEvidenceDto,
  LitigationFactDto,
  LitigationIssueDto,
  LitigationPleadingDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
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
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('Litigation Vault integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;

  beforeAll(async () => {
    await insertDocument({
      documentId,
      versionId,
      title: `Litigation ${marker} primary exhibit`,
      text: 'Witness timeline and exhibit packet.',
      index: 1401,
    });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      title: `Litigation ${marker} denied exhibit`,
      text: 'Denied litigation material.',
      index: 1402,
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
      resourceId: deniedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates evidence, fact, issue, pleading, and permission-scoped case map', async () => {
    const evidence = await postJson<LitigationEvidenceDto>('/v1/litigation/evidence', {
      matterId,
      documentId,
      evidenceCode: `EV-${marker}`,
      evidenceType: 'document',
      exhibitLabel: `Exhibit ${marker}`,
      custodyStatus: 'reviewed',
      admittedStatus: 'unknown',
    });
    expect(evidence.documentId).toBe(documentId);

    const fact = await postJson<LitigationFactDto>('/v1/litigation/facts', {
      matterId,
      evidenceId: evidence.evidenceId,
      factCode: `FACT-${marker}`,
      factSummary: `Witness timeline aligns with exhibit ${marker}.`,
      status: 'verified',
      materiality: 'high',
      citationRefs: [`evidence:${evidence.evidenceId}`],
    });
    expect(fact.evidenceId).toBe(evidence.evidenceId);

    const issue = await postJson<LitigationIssueDto>('/v1/litigation/issues', {
      matterId,
      issueCode: `ISSUE-${marker}`,
      label: `Liability element ${marker}`,
      issueType: 'claim',
      status: 'developing',
      position: 1,
    });
    expect(issue.issueCode).toBe(`ISSUE-${marker}`);

    const pleading = await postJson<LitigationPleadingDto>('/v1/litigation/pleadings', {
      matterId,
      documentId,
      pleadingCode: `PLD-${marker}`,
      pleadingType: 'brief',
      filingStatus: 'internal_draft',
      citationRefs: [`document:${documentId}`],
    });
    expect(pleading.documentId).toBe(documentId);

    const caseMap = await getJson<LitigationCaseMapResponseDto>(
      `/v1/litigation/case-map?matterId=${matterId}&limit=100`,
    );
    expect(caseMap.evidenceCount).toBeGreaterThanOrEqual(1);
    expect(caseMap.factCount).toBeGreaterThanOrEqual(1);
    expect(caseMap.issueCount).toBeGreaterThanOrEqual(1);
    expect(caseMap.pleadingCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(caseMap)).toContain(documentId);
    expect(JSON.stringify(caseMap)).not.toContain('Witness timeline and exhibit packet');
    expect(JSON.stringify(caseMap)).not.toContain(`Litigation ${marker} primary exhibit`);
    expect(JSON.stringify(caseMap)).not.toContain(deniedDocumentId);

    const audit = await latestLitigationAudit('LIT_CASE_MAP_VIEWED', matterId);
    expect(audit?.metadata_json).toMatchObject({
      matter_id: matterId,
      evidence_count: expect.any(Number),
      fact_count: expect.any(Number),
      issue_node_count: expect.any(Number),
      pleading_count: expect.any(Number),
      case_map_count: expect.any(Number),
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(`Witness timeline ${marker}`);
  });

  it('blocks denied documents before litigation evidence registration', async () => {
    const response = await fetch(`${baseUrl}/v1/litigation/evidence`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        documentId: deniedDocumentId,
        evidenceCode: `EV-DENY-${marker}`,
        evidenceType: 'document',
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);

    const audit = await latestLitigationAudit('LIT_EVIDENCE_CHANGED', deniedDocumentId);
    expect(audit).toBeUndefined();
  });

  it('does not introduce e-filing or external transmission tables after R11 core opens', async () => {
    const unexpectedExternalTables = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND (
              (
                table_name LIKE 'external_%'
                AND table_name NOT IN (
                  'external_workspaces',
                  'external_users',
                  'external_workspace_members',
                  'external_secure_links',
                  'external_nda_acceptances'
                )
              )
              OR table_name LIKE '%efile%'
              OR table_name LIKE '%court_upload%'
              OR table_name LIKE '%external_transmission%'
            )
          ORDER BY table_name
        `,
      );
      return result.rows.map((row) => row.table_name);
    });
    expect(unexpectedExternalTables).toEqual([]);
  });

  async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function insertDocument(input: {
    documentId: string;
    versionId: string;
    title: string;
    text: string;
    index: number;
  }): Promise<void> {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId: input.documentId,
        versionId: input.versionId,
        title: input.title,
        contentText: input.text,
        documentType: 'evidence',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
      input.index,
    );
  }
});

async function latestLitigationAudit(action: string, targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND (target_id = $3 OR metadata_json @> $4::jsonb)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        tenantAlphaId,
        action,
        targetId,
        JSON.stringify({ document_id: targetId }),
      ],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}
