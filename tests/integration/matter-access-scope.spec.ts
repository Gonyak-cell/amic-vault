import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';
import { insertSearchIndexedRow } from './search-permission/search-fixtures';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
let searchFixtureIndex = 1000;

const accessScopeBackfillSql = readAccessScopeBackfillSql();

function readAccessScopeBackfillSql(): string {
  const migration = readFileSync(
    new URL('../../db/migrations/0100_add_matter_access_scope.sql', import.meta.url),
    'utf8',
  );
  const match = migration.match(
    /UPDATE matters m\s+SET access_scope = 'restricted',[\s\S]+?AND ew\.status = 'active'\s+\);/,
  );
  if (!match) throw new Error('0100 access_scope backfill SQL not found');
  return match[0];
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
    body: JSON.stringify({ name: `Access Scope Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  input: { accessScope?: 'firm_open' | 'restricted'; clientId: string },
) {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      accessScope: input.accessScope,
      clientId: input.clientId,
      matterCode: `AS-${randomUUID()}`,
      matterName: `Access Scope ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as { accessScope: 'firm_open' | 'restricted'; matterId: string };
}

async function seedIndexedDocument(input: { clientId: string; matterId: string; title: string }) {
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: input.title,
      contentText: 'access scope standard matter document',
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
    searchFixtureIndex++,
  );
}

async function forceMatterAccessScope(
  matterId: string,
  accessScope: 'firm_open' | 'restricted',
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        UPDATE matters
        SET access_scope = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId, accessScope],
    );
    expect(result.rowCount).toBe(1);
  });
}

async function getMatterAccessScope(matterId: string): Promise<string | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ access_scope: string }>(
      `
        SELECT access_scope
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows[0]?.access_scope ?? null;
  });
}

async function runAccessScopeBackfill(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(accessScopeBackfillSql);
  });
}

describe('matter access scope integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let ownerCookie: string;
  let securityAdminCookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('defaults new matters to firm_open but still requires matter membership for reads', async () => {
    const matter = await createMatter(baseUrl, ownerCookie, { clientId });
    expect(matter.accessScope).toBe('firm_open');
    await seedIndexedDocument({
      clientId,
      matterId: matter.matterId,
      title: 'Access Scope Standard Contract',
    });

    const detail = await fetch(`${baseUrl}/v1/matters/${matter.matterId}`, {
      headers: { cookie: firmAdminCookie },
    });
    const detailBody = await detail.text();
    expect(detail.status, detailBody).toBe(404);
    expect(detailBody).not.toContain(matter.matterId);

    const documents = await fetch(
      `${baseUrl}/v1/matters/${matter.matterId}/documents?pageSize=10`,
      {
        headers: { cookie: firmAdminCookie },
      },
    );
    const documentsBody = await documents.text();
    expect(documents.status, documentsBody).toBe(200);
    expect(documentsBody).not.toContain('Access Scope Standard Contract');

    const writeDenied = await fetch(`${baseUrl}/v1/matters/${matter.matterId}`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterName: 'Non-member firm-open write attempt' }),
    });
    const writeDeniedBody = await writeDenied.text();
    expect(writeDenied.status, writeDeniedBody).toBe(403);
    expect(writeDeniedBody).toContain('PERMISSION_DENIED');
  });

  it('hides all non-member matters, including firm_open matters with an ethical wall', async () => {
    const restricted = await createMatter(baseUrl, ownerCookie, {
      accessScope: 'restricted',
      clientId,
    });
    const restrictedDetail = await fetch(`${baseUrl}/v1/matters/${restricted.matterId}`, {
      headers: { cookie: firmAdminCookie },
    });
    const restrictedBody = await restrictedDetail.text();
    expect(restrictedDetail.status, restrictedBody).toBe(404);
    expect(restrictedBody).not.toContain(restricted.matterId);

    const firmOpen = await createMatter(baseUrl, ownerCookie, {
      accessScope: 'firm_open',
      clientId,
    });
    const wall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: firmOpen.matterId,
        wallName: `Access Scope Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaFirmAdminUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(wall.status, await wall.text()).toBe(201);

    const wallBlocked = await fetch(`${baseUrl}/v1/matters/${firmOpen.matterId}`, {
      headers: { cookie: firmAdminCookie },
    });
    const wallBlockedBody = await wallBlocked.text();
    expect(wallBlocked.status, wallBlockedBody).toBe(403);
    expect(wallBlockedBody).toContain('ETHICAL_WALL_BLOCKED');
  });

  it('backfills existing active-walled matters to restricted while preserving ordinary firm_open matters', async () => {
    const walledMatter = await createMatter(baseUrl, ownerCookie, {
      accessScope: 'firm_open',
      clientId,
    });
    const openMatter = await createMatter(baseUrl, ownerCookie, {
      accessScope: 'firm_open',
      clientId,
    });
    const wall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: walledMatter.matterId,
        wallName: `Access Scope Backfill Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaFirmAdminUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(wall.status, await wall.text()).toBe(201);

    await forceMatterAccessScope(walledMatter.matterId, 'firm_open');
    await runAccessScopeBackfill();

    await expect(getMatterAccessScope(walledMatter.matterId)).resolves.toBe('restricted');
    await expect(getMatterAccessScope(openMatter.matterId)).resolves.toBe('firm_open');
  });
});
