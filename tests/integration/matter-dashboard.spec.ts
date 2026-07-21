import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';
const upcomingKeyDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface MatterDashboardResponse {
  matterSummary: {
    matterCode: string;
  };
  recentActivity: Array<{
    actionLabel: string;
    targetLabel: string;
    resultLabel: string;
  }>;
  keyDocuments: Array<{
    title: string;
    versionLabel: string | null;
    versionSignificance: string;
  }>;
  issueSummary: {
    openCount: number;
    highestRiskLevel: string | null;
  };
  upcomingKeyDates: Array<{
    title: string;
    dueDate: string;
    sourceType: string;
  }>;
  externalActivity: Array<{
    workspaceCode: string;
    activeLinkCount: number;
    accessCount: number;
  }>;
  aiSessions: Array<{
    sessionId: string;
    modelRoute: string;
    policySummary: string;
  }>;
}

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
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

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Matter Dashboard Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
  accessScope: 'firm_open' | 'restricted' = 'firm_open',
): Promise<string> {
  const marker = randomUUID().slice(0, 8);
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      accessScope,
      clientId,
      matterCode: `A10-${marker}`,
      matterName: `Matter Dashboard ${marker}`,
      matterType: 'advisory',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

describe('matter dashboard integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let securityAdminCookie: string;
  let clientId: string;
  let matterId: string;

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
    memberCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
    matterId = await createMatter(baseUrl, ownerCookie, clientId);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns seven dashboard sections without mixing other matter AI or external rows', async () => {
    const otherMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const fixture = await seedDashboardFixture(matterId, otherMatterId);

    const dashboard = await getJson<MatterDashboardResponse>(
      ownerCookie,
      `/v1/matters/${matterId}/dashboard`,
    );

    expect(Object.keys(dashboard)).toEqual(
      expect.arrayContaining([
        'matterSummary',
        'recentActivity',
        'keyDocuments',
        'issueSummary',
        'upcomingKeyDates',
        'externalActivity',
        'aiSessions',
      ]),
    );
    expect(dashboard.matterSummary.matterCode).toMatch(/^A10-/);
    expect(dashboard.recentActivity[0]).toMatchObject({
      actionLabel: '문서 업로드',
      targetLabel: '문서',
      resultLabel: '성공',
    });
    expect(dashboard.keyDocuments[0]).toMatchObject({
      title: fixture.documentTitle,
      versionLabel: 'Final',
      versionSignificance: 'final',
    });
    expect(dashboard.issueSummary).toMatchObject({
      openCount: 1,
      highestRiskLevel: 'critical',
    });
    expect(dashboard.upcomingKeyDates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: fixture.keyDateTitle,
          dueDate: upcomingKeyDate,
          sourceType: 'core',
        }),
      ]),
    );
    expect(dashboard.externalActivity).toEqual([
      expect.objectContaining({
        workspaceCode: fixture.workspaceCode,
        activeLinkCount: 1,
        accessCount: 3,
      }),
    ]);
    expect(dashboard.aiSessions).toEqual([
      expect.objectContaining({
        sessionId: fixture.aiSessionId,
        modelRoute: 'local_gemma',
        policySummary: '정책 통과',
      }),
    ]);
    expect(JSON.stringify(dashboard)).not.toContain(fixture.otherWorkspaceCode);
    expect(JSON.stringify(dashboard)).not.toContain(fixture.otherAiSessionId);
  });

  it('returns 403 for a user without read permission', async () => {
    const restrictedMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted');
    const response = await fetch(`${baseUrl}/v1/matters/${restrictedMatterId}/dashboard`, {
      headers: { cookie: memberCookie },
    });
    const body = await response.text();

    expect(response.status, body).toBe(403);
    expect(body).toContain('PERMISSION_DENIED');
  });

  it('fails closed when an ethical wall excludes the reader', async () => {
    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const createWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `A10 wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaMemberUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(createWall.status, await createWall.text()).toBe(201);

    const response = await fetch(`${baseUrl}/v1/matters/${wallMatterId}/dashboard`, {
      headers: { cookie: memberCookie },
    });
    const body = await response.text();

    expect(response.status, body).toBe(403);
    expect(body).toContain('ETHICAL_WALL_BLOCKED');
  });

  it('keeps the dashboard aggregate p95 under 1.5s with 500 docs and 2000 audit events', async () => {
    const perfMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await seedPerformanceMatter(perfMatterId);
    await getJson<MatterDashboardResponse>(
      ownerCookie,
      `/v1/matters/${perfMatterId}/dashboard`,
    );

    const durations: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const started = performance.now();
      await getJson<MatterDashboardResponse>(
        ownerCookie,
        `/v1/matters/${perfMatterId}/dashboard`,
      );
      durations.push(performance.now() - started);
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
    expect(p95).toBeLessThan(1500);
  });

  async function getJson<T>(cookie: string, path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }
});

async function seedDashboardFixture(matterId: string, otherMatterId: string): Promise<{
  aiSessionId: string;
  documentTitle: string;
  keyDateTitle: string;
  otherAiSessionId: string;
  otherWorkspaceCode: string;
  workspaceCode: string;
}> {
  const documentTitle = `A10 Dashboard Document ${randomUUID()}`;
  const keyDateTitle = `A10 Dashboard Deadline ${randomUUID()}`;
  const workspaceCode = `A10_${randomUUID().replace(/-/gu, '').slice(0, 10).toUpperCase()}`;
  const otherWorkspaceCode = `A10_${randomUUID().replace(/-/gu, '').slice(0, 10).toUpperCase()}`;
  const aiSessionId = randomUUID();
  const otherAiSessionId = randomUUID();
  const document = await insertDocument(matterId, documentTitle);

  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO matter_issues (
          tenant_id, matter_id, title, summary, status, risk_level, created_by, updated_by
        )
        VALUES ($1, $2, 'A10 critical issue', 'Dashboard fixture issue.', 'open', 'critical', $3, $3)
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO matter_key_dates (
          tenant_id, matter_id, title, due_date, date_type, status, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4::date, 'court', 'pending', $5, $5)
      `,
      [tenantAlphaId, matterId, keyDateTitle, upcomingKeyDate, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_id, action, target_type, target_id, matter_id, result, metadata_json
        )
        VALUES ($1, $2, 'DOCUMENT_UPLOADED', 'document', $3, $4, 'success', '{}'::jsonb)
      `,
      [tenantAlphaId, alphaOwnerUserId, document.documentId, matterId],
    );
    await insertExternalRows(client, {
      matterId,
      documentId: document.documentId,
      versionId: document.versionId,
      workspaceCode,
      accessCount: 3,
      withLink: true,
    });
    await insertExternalRows(client, {
      matterId: otherMatterId,
      documentId: document.documentId,
      versionId: document.versionId,
      workspaceCode: otherWorkspaceCode,
      accessCount: 7,
      withLink: false,
    });
    await client.query(
      `
        INSERT INTO ai_sessions (
          ai_session_id, tenant_id, matter_id, actor_id, model_route, status,
          prompt_hash, prompt_length, response_hash, response_length,
          response_token_count, latency_ms, escalation_required
        )
        VALUES
          ($1, $2, $3, $4, 'local_gemma', 'responded', $5, 24, $6, 48, 12, 42, false),
          ($7, $2, $8, $4, 'local_gemma', 'responded', $9, 24, $10, 48, 12, 42, false)
      `,
      [
        aiSessionId,
        tenantAlphaId,
        matterId,
        alphaOwnerUserId,
        sha256Hex(`prompt:${aiSessionId}`),
        sha256Hex(`response:${aiSessionId}`),
        otherAiSessionId,
        otherMatterId,
        sha256Hex(`prompt:${otherAiSessionId}`),
        sha256Hex(`response:${otherAiSessionId}`),
      ],
    );
  });

  return { aiSessionId, documentTitle, keyDateTitle, otherAiSessionId, otherWorkspaceCode, workspaceCode };
}

async function insertDocument(
  matterId: string,
  title: string,
): Promise<{ documentId: string; versionId: string }> {
  const documentId = randomUUID();
  const fileObjectId = randomUUID();
  const versionId = randomUUID();
  const hash = sha256Hex(`document:${documentId}`);
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by
        )
        VALUES ($1, $2, $3, $4, $4, 'application/pdf', 32, $5, $6)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        storageUri(matterId, documentId, fileObjectId),
        `${title}.pdf`,
        hash,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          document_type, confidentiality_level, privilege_status, ai_allowed, created_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'draft', 'memo', 'standard', 'none', true, $6, now())
      `,
      [documentId, tenantAlphaId, matterId, randomUUID(), title, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO document_versions (
          version_id, tenant_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, version_label, version_significance
        )
        VALUES ($1, $2, $3, 1, 'current', $4, $5, $6, 'Final', 'final')
      `,
      [versionId, tenantAlphaId, documentId, fileObjectId, hash, alphaOwnerUserId],
    );
  });
  return { documentId, versionId };
}

async function insertExternalRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    accessCount: number;
    documentId: string;
    matterId: string;
    versionId: string;
    withLink: boolean;
    workspaceCode: string;
  },
): Promise<void> {
  const workspaceId = randomUUID();
  const externalUserId = randomUUID();
  await client.query(
    `
      INSERT INTO external_workspaces (
        workspace_id, tenant_id, matter_id, workspace_code, display_ref, status,
        expires_at, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, 'A10 Dashboard Workspace', 'active', now() + interval '7 days', $5, $5)
    `,
    [workspaceId, tenantAlphaId, input.matterId, input.workspaceCode, alphaOwnerUserId],
  );
  await client.query(
    `
      INSERT INTO external_users (
        external_user_id, tenant_id, email_hash, display_ref, status, created_by, updated_by
      )
      VALUES ($1, $2, $3, 'A10 External User', 'active', $4, $4)
    `,
    [
      externalUserId,
      tenantAlphaId,
      sha256Hex(`external:${externalUserId}`),
      alphaOwnerUserId,
    ],
  );
  await client.query(
    `
      INSERT INTO external_workspace_members (
        tenant_id, workspace_id, external_user_id, status, created_by
      )
      VALUES ($1, $2, $3, 'active', $4)
    `,
    [tenantAlphaId, workspaceId, externalUserId, alphaOwnerUserId],
  );
  if (!input.withLink) return;
  await client.query(
    `
      INSERT INTO external_secure_links (
        tenant_id, workspace_id, external_user_id, document_id, version_id, token_hash, status,
        expires_at, access_count, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active', now() + interval '7 days', $7, $8)
    `,
    [
      tenantAlphaId,
      workspaceId,
      externalUserId,
      input.documentId,
      input.versionId,
      sha256Hex(`token:${workspaceId}`),
      input.accessCount,
      alphaOwnerUserId,
    ],
  );
}

async function seedPerformanceMatter(matterId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        CREATE TEMP TABLE a10_dashboard_docs AS
        SELECT gen_random_uuid() AS document_id,
          gen_random_uuid() AS document_family_id,
          gen_random_uuid() AS file_object_id,
          gen_random_uuid() AS version_id,
          generate_series(1, 500) AS row_no
      `,
    );
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by
        )
        SELECT file_object_id, $1::uuid,
          's3://amic-vault-dev/tenants/' || $1::text || '/matters/' || $2::text ||
            '/documents/' || document_id || '/' || file_object_id,
          'a10-perf-' || row_no || '.pdf',
          'a10-perf-' || row_no || '.pdf',
          'application/pdf',
          32,
          repeat('a', 64),
          $3
        FROM a10_dashboard_docs
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          document_type, confidentiality_level, privilege_status, ai_allowed, created_by, updated_at
        )
        SELECT document_id, $1, $2, document_family_id, 'A10 perf document ' || row_no,
          'draft', 'memo', 'standard', 'none', true, $3, now()
        FROM a10_dashboard_docs
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO document_versions (
          version_id, tenant_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, version_label, version_significance
        )
        SELECT version_id, $1::uuid, document_id, 1, 'current', file_object_id,
          repeat('a', 64), $2::uuid, 'v1.0', 'internal_draft'
        FROM a10_dashboard_docs
      `,
      [tenantAlphaId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_id, action, target_type, target_id, matter_id, result, metadata_json
        )
        SELECT $1, $2, 'DOCUMENT_VIEWED', 'document', gen_random_uuid(), $3, 'success', '{}'::jsonb
        FROM generate_series(1, 2000)
      `,
      [tenantAlphaId, alphaOwnerUserId, matterId],
    );
  });
}

function storageUri(matterId: string, documentId: string, fileObjectId: string): string {
  return `s3://amic-vault-dev/tenants/${tenantAlphaId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
