import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  DdDataRoomMappingDto,
  DdIssueDto,
  DdRfiDto,
  DdRiskDto,
  DdTraceabilityResponseDto,
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

describe('DD Vault integration', () => {
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
      title: `DD ${marker} primary evidence`,
      text: 'Board approval package and capitalization table.',
      index: 1301,
    });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      title: `DD ${marker} denied evidence`,
      text: 'Denied diligence material.',
      index: 1302,
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

  it('creates internal RFI, mapping, issue, risk, and permission-scoped traceability', async () => {
    const rfi = await postJson<DdRfiDto>('/v1/dd/rfis', {
      matterId,
      rfiCode: `RFI-${marker}`,
      category: 'corporate',
      title: `Corporate charter ${marker}`,
      status: 'requested',
      priority: 'high',
    });
    expect(rfi.rfiCode).toBe(`RFI-${marker}`);

    const mapping = await postJson<DdDataRoomMappingDto>('/v1/dd/data-room-mappings', {
      matterId,
      rfiId: rfi.rfiId,
      documentId,
      internalLabel: `Corporate ${marker}`,
      sectionPath: '01.Corporate',
      mappingStatus: 'mapped',
    });
    expect(mapping.documentId).toBe(documentId);

    const issue = await postJson<DdIssueDto>('/v1/dd/issues', {
      matterId,
      rfiId: rfi.rfiId,
      documentId,
      issueCode: `ISS-${marker}`,
      title: `Missing approval ${marker}`,
      severity: 'high',
      status: 'open',
      citationRefs: [`document:${documentId}`],
      reportInclusion: true,
    });
    expect(issue.citationRefs).toEqual([`document:${documentId}`]);

    const risk = await postJson<DdRiskDto>('/v1/dd/risks', {
      matterId,
      issueId: issue.issueId,
      riskCode: `RSK-${marker}`,
      category: 'legal',
      severity: 'high',
      likelihood: 'medium',
      status: 'open',
      citationRefs: [`issue:${issue.issueId}`],
    });
    expect(risk.issueId).toBe(issue.issueId);

    const trace = await getJson<DdTraceabilityResponseDto>(
      `/v1/dd/traceability?matterId=${matterId}&limit=100`,
    );
    expect(trace.rfiCount).toBeGreaterThanOrEqual(1);
    expect(trace.mappingCount).toBeGreaterThanOrEqual(1);
    expect(trace.issueCount).toBeGreaterThanOrEqual(1);
    expect(trace.riskCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(trace)).toContain(documentId);
    expect(JSON.stringify(trace)).not.toContain('Board approval package');
    expect(JSON.stringify(trace)).not.toContain(deniedDocumentId);

    const traceAudit = await latestDdAudit('DD_TRACE_VIEWED', matterId);
    expect(traceAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      rfi_count: expect.any(Number),
      mapping_count: expect.any(Number),
      issue_count: expect.any(Number),
      risk_count: expect.any(Number),
      trace_count: expect.any(Number),
    });
    expect(JSON.stringify(traceAudit?.metadata_json)).not.toContain(`Corporate charter ${marker}`);
    expect(JSON.stringify(traceAudit?.metadata_json)).not.toContain('Board approval package');
  });

  it('blocks denied documents before internal data room mapping', async () => {
    const response = await fetch(`${baseUrl}/v1/dd/data-room-mappings`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        documentId: deniedDocumentId,
        internalLabel: `Denied ${marker}`,
        sectionPath: '99.Denied',
        mappingStatus: 'mapped',
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);

    const audit = await latestDdAudit('DD_DATA_ROOM_MAPPED', deniedDocumentId);
    expect(audit).toBeUndefined();
  });

  it('keeps DD scope free of VDR delivery and external Q&A tables after R11 core opens', async () => {
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
              OR table_name LIKE '%vdr%'
              OR table_name LIKE '%external_q%'
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
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
      input.index,
    );
  }
});

async function latestDdAudit(action: string, targetId: string) {
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
