import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MatterIssueDto, MatterKeyDateDto, MatterKeyDateListDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';

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
    body: JSON.stringify({ name: `Matter Issues Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `A9-${randomUUID()}`,
      matterName: `Matter Issues ${randomUUID()}`,
      matterType: 'advisory',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

describe('matter issues and key dates integration', () => {
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

  it('supports issue and key-date CRUD with reference-only audit records', async () => {
    const issue = await postJson<MatterIssueDto>(ownerCookie, `/v1/matters/${matterId}/issues`, {
      title: 'A9 liability issue',
      summary: 'Track liability posture.',
      riskLevel: 'high',
    });
    expect(issue).toMatchObject({ matterId, status: 'open', riskLevel: 'high' });

    const updatedIssue = await patchJson<MatterIssueDto>(
      ownerCookie,
      `/v1/matters/${matterId}/issues/${issue.issueId}`,
      { status: 'monitoring', riskLevel: 'critical' },
    );
    expect(updatedIssue).toMatchObject({ status: 'monitoring', riskLevel: 'critical' });

    const keyDate = await postJson<MatterKeyDateDto>(
      ownerCookie,
      `/v1/matters/${matterId}/key-dates`,
      {
        title: 'A9 filing deadline',
        dueDate: '2026-07-10',
        dateType: 'court',
      },
    );
    expect(keyDate).toMatchObject({
      matterId,
      dueDate: '2026-07-10',
      sourceType: 'core',
      mutable: true,
    });

    const updatedKeyDate = await patchJson<MatterKeyDateDto>(
      ownerCookie,
      `/v1/matters/${matterId}/key-dates/${keyDate.sourceId}`,
      { status: 'completed' },
    );
    expect(updatedKeyDate.status).toBe('completed');

    const issueList = await getJson<{ items: MatterIssueDto[] }>(
      ownerCookie,
      `/v1/matters/${matterId}/issues`,
    );
    expect(issueList.items.map((item) => item.issueId)).toContain(issue.issueId);

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query(
        'SELECT issue_id FROM matter_issues WHERE tenant_id = $1 AND matter_id = $2',
        [tenantAlphaId, matterId],
      );
      expect(result.rowCount).toBe(0);
    });

    const audits = await matterUpdateAudits(matterId);
    expect(audits.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(audits)).not.toContain('A9 liability issue');
    expect(JSON.stringify(audits)).not.toContain('A9 filing deadline');

    await expectDelete(ownerCookie, `/v1/matters/${matterId}/issues/${issue.issueId}`);
    await expectDelete(ownerCookie, `/v1/matters/${matterId}/key-dates/${keyDate.sourceId}`);
  });

  it('blocks mutations when the matter is closed', async () => {
    const closedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          UPDATE matters
          SET status = 'closed',
              closed_at = now(),
              updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = $2
        `,
        [tenantAlphaId, closedMatterId],
      );
    });

    const blocked = await fetch(`${baseUrl}/v1/matters/${closedMatterId}/issues`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Closed matter issue' }),
    });
    const body = await blocked.text();
    expect(blocked.status, body).toBe(409);
    expect(body).toContain('MATTER_CLOSED');
  });

  it('bridges DD and litigation deadlines into matter key dates with source tags', async () => {
    const marker = randomUUID().slice(0, 8).toUpperCase();
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO dd_rfis (
            tenant_id, matter_id, rfi_code, title, due_date, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, '2026-07-12'::date, $5, $5)
        `,
        [tenantAlphaId, matterId, `RFI-${marker}`, 'Bridge RFI deadline', alphaOwnerUserId],
      );
      await client.query(
        `
          INSERT INTO litigation_pleadings (
            tenant_id, matter_id, pleading_code, pleading_type,
            internal_deadline, created_by, updated_by
          )
          VALUES ($1, $2, $3, 'brief', '2026-07-15'::date, $4, $4)
        `,
        [tenantAlphaId, matterId, `PLD-${marker}`, alphaOwnerUserId],
      );
    });

    const keyDates = await getJson<MatterKeyDateListDto>(
      ownerCookie,
      `/v1/matters/${matterId}/key-dates`,
    );
    expect(keyDates.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'dd_rfi',
          dueDate: '2026-07-12',
          mutable: false,
        }),
        expect.objectContaining({
          sourceType: 'litigation_pleading',
          dueDate: '2026-07-15',
          mutable: false,
        }),
      ]),
    );
  });

  it('fails closed when an ethical wall excludes a key-date reader', async () => {
    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await postJson<MatterKeyDateDto>(ownerCookie, `/v1/matters/${wallMatterId}/key-dates`, {
      title: 'Wall blocked key date',
      dueDate: '2026-07-20',
      dateType: 'internal',
    });

    const createWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `A9 wall ${randomUUID()}`,
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

    const blocked = await fetch(`${baseUrl}/v1/matters/${wallMatterId}/key-dates`, {
      headers: { cookie: memberCookie },
    });
    const body = await blocked.text();
    expect(blocked.status, body).toBe(403);
    expect(body).toContain('ETHICAL_WALL_BLOCKED');
  });

  async function postJson<T>(
    cookie: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function patchJson<T>(
    cookie: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function getJson<T>(cookie: string, path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function expectDelete(cookie: string, path: string): Promise<void> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(response.status, await response.text()).toBe(204);
  }
});

async function matterUpdateAudits(matterId: string): Promise<Array<Record<string, unknown>>> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_UPDATED'
          AND matter_id = $2
          AND target_type IN ('matter_issue', 'matter_key_date')
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows.map((row) => row.metadata_json);
  });
}
