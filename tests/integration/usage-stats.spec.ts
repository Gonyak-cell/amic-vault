import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import { loginSearchUser } from './search-permission/search-http-helpers';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface UsageStatsResponse {
  period: { from: string; to: string };
  totals: {
    activeUsers: number;
    uploads: number;
    downloads: number;
    searches: number;
    storageBytes: number;
  };
  topMatters: Array<{ matterLabel: string; activityCount: number }>;
}

describe('usage stats dashboard integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let memberCookie: string;
  let usageFixture: { from: string; to: string; matterLabel: string };
  let perfFixture: { from: string; to: string };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    firmAdminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    usageFixture = await seedUsageStatsFixture();
    perfFixture = await seedUsageStatsPerformanceFixture();
  });

  afterAll(async () => {
    await app.close();
  });

  it('aggregates active users, audit counts, storage, and top matters by tenant', async () => {
    const response = await fetch(
      `${baseUrl}/v1/dashboard/usage-stats?from=${encodeURIComponent(
        usageFixture.from,
      )}&to=${encodeURIComponent(usageFixture.to)}`,
      { headers: { cookie: firmAdminCookie } },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    const body = JSON.parse(text) as UsageStatsResponse;

    expect(body.period).toEqual({ from: usageFixture.from, to: usageFixture.to });
    expect(body.totals).toMatchObject({
      activeUsers: 3,
      uploads: 3,
      downloads: 2,
      searches: 5,
      storageBytes: 3072,
    });
    expect(body.topMatters[0]).toEqual({
      matterLabel: usageFixture.matterLabel,
      activityCount: 10,
    });
  });

  it('blocks non-admin usage stats access', async () => {
    const response = await fetch(
      `${baseUrl}/v1/dashboard/usage-stats?from=${encodeURIComponent(
        usageFixture.from,
      )}&to=${encodeURIComponent(usageFixture.to)}`,
      { headers: { cookie: memberCookie } },
    );

    expect(response.status, await response.text()).toBe(403);
  });

  it('exports usage stats CSV and records an audit export event', async () => {
    const response = await fetch(
      `${baseUrl}/v1/dashboard/usage-stats/export.csv?from=${encodeURIComponent(
        usageFixture.from,
      )}&to=${encodeURIComponent(usageFixture.to)}`,
      { headers: { cookie: firmAdminCookie } },
    );
    const csv = await response.text();

    expect(response.status, csv).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(csv).toContain('summary,uploads,3');
    expect(csv).toContain(`top_matter,${usageFixture.matterLabel},10`);
    await expect(latestUsageExportAudit()).resolves.toMatchObject({
      actor_id: alphaFirmAdminUserId,
      target_type: 'usage_stats',
      metadata_json: expect.objectContaining({
        scope_type: 'usage_stats',
        export_format: 'csv',
        result_count: 6,
      }),
    });
  });

  it('keeps 100k-event usage stats p95 below 2 seconds over 20 calls', async () => {
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      const response = await fetch(
        `${baseUrl}/v1/dashboard/usage-stats?from=${encodeURIComponent(
          perfFixture.from,
        )}&to=${encodeURIComponent(perfFixture.to)}`,
        { headers: { cookie: firmAdminCookie } },
      );
      const text = await response.text();
      durations.push(performance.now() - startedAt);
      expect(response.status, text).toBe(200);
      expect((JSON.parse(text) as UsageStatsResponse).totals.searches).toBe(100_000);
    }
    const sorted = durations.toSorted((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(2_000);
  });
});

async function seedUsageStatsFixture(): Promise<{ from: string; to: string; matterLabel: string }> {
  const { from, to } = freshUsageWindow(0, 1);
  const alphaClientId = randomUUID();
  const alphaMatterId = randomUUID();
  const alphaDocumentId = randomUUID();
  const alphaFileObjectA = randomUUID();
  const alphaFileObjectB = randomUUID();
  const betaClientId = randomUUID();
  const betaMatterId = randomUUID();
  const betaDocumentId = randomUUID();
  const betaFileObjectId = randomUUID();
  const matterLabel = `H13-${alphaMatterId.slice(0, 8)} · Usage Stats`;

  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO clients (client_id, tenant_id, name, created_by)
        VALUES ($1, $2, $3, $4)
      `,
      [alphaClientId, tenantAlphaId, `H13 Usage Client ${alphaClientId}`, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO matters (
          matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, lead_lawyer_id, created_by, opened_at
        )
        VALUES ($1, $2, $3, $4, 'Usage Stats', 'advisory', 'open', $5, $5, $6)
      `,
      [
        alphaMatterId,
        tenantAlphaId,
        alphaClientId,
        `H13-${alphaMatterId.slice(0, 8)}`,
        alphaOwnerUserId,
        from,
      ],
    );
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          created_by, created_at
        )
        VALUES ($1, $2, $3, $1, 'H13 usage document', 'final', $4, $5)
      `,
      [alphaDocumentId, tenantAlphaId, alphaMatterId, alphaOwnerUserId, from],
    );
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by, created_at
        )
        VALUES
          ($1, $2, $3, 'usage-a.pdf', 'usage-a.pdf', 'application/pdf', 2048, $5, $7, $9),
          ($4, $2, $8, 'usage-b.pdf', 'usage-b.pdf', 'application/pdf', 1024, $6, $7, $9)
      `,
      [
        alphaFileObjectA,
        tenantAlphaId,
        storageUri(tenantAlphaId, alphaMatterId, alphaDocumentId, alphaFileObjectA),
        alphaFileObjectB,
        sha256Hex(alphaFileObjectA),
        sha256Hex(alphaFileObjectB),
        alphaOwnerUserId,
        storageUri(tenantAlphaId, alphaMatterId, alphaDocumentId, alphaFileObjectB),
        from,
      ],
    );
    await seedUsageAuditRows(client, tenantAlphaId, alphaMatterId, alphaDocumentId, from, [
      ['DOCUMENT_UPLOADED', alphaOwnerUserId, 0],
      ['DOCUMENT_UPLOADED', alphaOwnerUserId, 1],
      ['DOCUMENT_UPLOADED', alphaMemberUserId, 2],
      ['DOCUMENT_DOWNLOADED', alphaFirmAdminUserId, 3],
      ['DOCUMENT_DOWNLOADED', alphaOwnerUserId, 4],
      ['SEARCH_EXECUTED', alphaMemberUserId, 5],
      ['SEARCH_EXECUTED', alphaMemberUserId, 6],
      ['SEARCH_EXECUTED', alphaFirmAdminUserId, 7],
      ['SEARCH_EXECUTED', alphaOwnerUserId, 8],
      ['SEARCH_EXECUTED', alphaMemberUserId, 9],
    ]);

    await setTenant(client, tenantBetaId);
    await client.query(
      `
        INSERT INTO clients (client_id, tenant_id, name, created_by)
        VALUES ($1, $2, $3, $4)
      `,
      [betaClientId, tenantBetaId, `H13 Beta Client ${betaClientId}`, betaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO matters (
          matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, lead_lawyer_id, created_by, opened_at
        )
        VALUES ($1, $2, $3, $4, 'Beta Usage Stats', 'advisory', 'open', $5, $5, $6)
      `,
      [
        betaMatterId,
        tenantBetaId,
        betaClientId,
        `H13B-${betaMatterId.slice(0, 8)}`,
        betaOwnerUserId,
        from,
      ],
    );
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          created_by, created_at
        )
        VALUES ($1, $2, $3, $1, 'H13 beta usage document', 'final', $4, $5)
      `,
      [betaDocumentId, tenantBetaId, betaMatterId, betaOwnerUserId, from],
    );
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by, created_at
        )
        VALUES ($1, $2, $3, 'beta.pdf', 'beta.pdf', 'application/pdf', 99999, $4, $5, $6)
      `,
      [
        betaFileObjectId,
        tenantBetaId,
        storageUri(tenantBetaId, betaMatterId, betaDocumentId, betaFileObjectId),
        sha256Hex(betaFileObjectId),
        betaOwnerUserId,
        from,
      ],
    );
    await seedUsageAuditRows(client, tenantBetaId, betaMatterId, betaDocumentId, from, [
      ['DOCUMENT_UPLOADED', betaOwnerUserId, 0],
      ['DOCUMENT_DOWNLOADED', betaOwnerUserId, 1],
      ['SEARCH_EXECUTED', betaOwnerUserId, 2],
    ]);
  });

  return { from, to, matterLabel };
}

async function seedUsageStatsPerformanceFixture(): Promise<{ from: string; to: string }> {
  const { from, to } = freshUsageWindow(3, 3);
  const clientId = randomUUID();
  const matterId = randomUUID();

  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO clients (client_id, tenant_id, name, created_by)
        VALUES ($1, $2, $3, $4)
      `,
      [clientId, tenantAlphaId, `H13 Perf Client ${clientId}`, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO matters (
          matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, lead_lawyer_id, created_by, opened_at
        )
        VALUES ($1, $2, $3, $4, 'Usage Perf', 'advisory', 'open', $5, $5, $6)
      `,
      [matterId, tenantAlphaId, clientId, `H13P-${matterId.slice(0, 8)}`, alphaOwnerUserId, from],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, actor_id, action, target_type, target_id,
          matter_id, result, metadata_json, created_at
        )
        SELECT
          $1,
          'user',
          $2,
          'SEARCH_EXECUTED',
          'matter',
          $3,
          $3,
          'success',
          jsonb_build_object('query_hash', md5(series.i::text)),
          $4::timestamptz + (series.i || ' seconds')::interval
        FROM generate_series(1, 100000) AS series(i)
      `,
      [tenantAlphaId, alphaFirmAdminUserId, matterId, from],
    );
  });

  return { from, to };
}

async function seedUsageAuditRows(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  matterId: string,
  documentId: string,
  from: string,
  rows: ReadonlyArray<readonly [string, string, number]>,
): Promise<void> {
  for (const [action, actorId, offsetMinutes] of rows) {
    const createdAt = new Date(new Date(from).getTime() + offsetMinutes * 60_000).toISOString();
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, actor_id, action, target_type, target_id,
          matter_id, result, metadata_json, created_at
        )
        VALUES ($1, 'user', $2, $3, $4, $5, $6, 'success', $7::jsonb, $8)
      `,
      [
        tenantId,
        actorId,
        action,
        action === 'SEARCH_EXECUTED' ? 'matter' : 'document',
        action === 'SEARCH_EXECUTED' ? matterId : documentId,
        matterId,
        JSON.stringify({ query_hash: `h13-${offsetMinutes}` }),
        createdAt,
      ],
    );
  }
}

async function latestUsageExportAudit() {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      actor_id: string | null;
      target_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT actor_id, target_type, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AUDIT_EXPORT_CREATED'
          AND target_type = 'usage_stats'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId],
    );
    return result.rows[0];
  });
}

function storageUri(
  tenantId: string,
  matterId: string,
  documentId: string,
  fileObjectId: string,
): string {
  return `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function freshUsageWindow(monthIndex: number, days: number): { from: string; to: string } {
  const offsetHours = Number.parseInt(randomUUID().slice(0, 6), 16) % 500;
  const startedAt = Date.UTC(2040, monthIndex, 1, 0, 0, 0) + offsetHours * 60 * 60 * 1000;
  return {
    from: new Date(startedAt).toISOString(),
    to: new Date(startedAt + days * 24 * 60 * 60 * 1000 - 1).toISOString(),
  };
}
