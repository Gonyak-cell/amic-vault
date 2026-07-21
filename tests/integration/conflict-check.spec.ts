import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

interface ConflictCandidateResponse {
  sourceType: string;
  sourceId: string;
  sourceName: string;
  sourceMatterId: string | null;
  sourceMatterName: string | null;
  targetName: string;
  similarity: number;
}

interface ConflictCheckResponse {
  conflictCheckId: string;
  matterId: string;
  status: string;
  targetNames: string[];
  candidates: ConflictCandidateResponse[];
  resolutionRationale: string | null;
}

interface MatterResponse {
  matterId: string;
  conflictsStatus: string;
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

async function createClient(
  baseUrl: string,
  cookie: string,
  name: string,
  aliases: string[] = [],
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ aliases, name }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  input: {
    clientId: string;
    matterName: string;
    matterCode?: string;
    matterType?: string;
    leadLawyerId?: string;
  },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      matterCode: input.matterCode ?? `CONFLICT-${randomUUID()}`,
      matterName: input.matterName,
      matterType: input.matterType ?? 'contract',
      leadLawyerId: input.leadLawyerId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const parsed = JSON.parse(body) as { matterId?: unknown };
  expect(parsed.matterId, body).toEqual(expect.any(String));
  if (typeof parsed.matterId !== 'string') throw new Error('matter create response missing matterId');
  return parsed.matterId;
}

async function addParty(
  baseUrl: string,
  cookie: string,
  matterId: string,
  name: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/parties`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      partyType: 'corporation',
      partyRole: 'counterparty',
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
}

async function runConflictCheck(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<ConflictCheckResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/conflict-checks`, {
    method: 'POST',
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as ConflictCheckResponse;
}

async function resolveConflictCheck(
  baseUrl: string,
  cookie: string,
  matterId: string,
  conflictCheckId: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/matters/${matterId}/conflict-checks/${conflictCheckId}`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getMatter(baseUrl: string, cookie: string, matterId: string): Promise<MatterResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as MatterResponse;
}

async function countConflictAudits(matterId: string, action: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = $3
      `,
      [tenantBetaId, matterId, action],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function seedPerformanceCorpus(baseUrl: string, betaOwnerCookie: string): Promise<void> {
  const marker = randomUUID().replace(/-/g, '');
  const bulkClientId = await createClient(baseUrl, betaOwnerCookie, `무관 더미 고객 ${marker}`);
  const bulkMatterId = await createMatter(baseUrl, betaOwnerCookie, {
    clientId: bulkClientId,
    matterName: `무관 더미 사건 ${marker}`,
    leadLawyerId: betaOwnerUserId,
  });
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO clients (tenant_id, name, created_by)
        SELECT $1, '무관 법인 ' || series::text || ' ${marker}', $2
        FROM generate_series(1, 200) AS series
      `,
      [tenantBetaId, betaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO parties (tenant_id, matter_id, name, party_type, party_role, created_by)
        SELECT $1, $2, '무관 상대방 ' || series::text || ' ${marker}', 'corporation', 'counterparty', $3
        FROM generate_series(1, 1000) AS series
      `,
      [tenantBetaId, bulkMatterId, betaOwnerUserId],
    );
  });
}

describe('conflict check integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    betaOwnerCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    betaMemberCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-member@test.local',
      password: 'dev-beta-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns legal suffix conflict candidates and requires rationale to resolve', async () => {
    const marker = randomUUID().replace(/-/g, '').slice(0, 10);
    const priorClientId = await createClient(baseUrl, betaOwnerCookie, `선행 고객 ${marker}`);
    const priorMatterId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: priorClientId,
      matterName: `선행 자문 ${marker}`,
      leadLawyerId: betaOwnerUserId,
    });
    await addParty(baseUrl, betaOwnerCookie, priorMatterId, `(주)한빛${marker}`);

    const targetClientId = await createClient(baseUrl, betaOwnerCookie, `주식회사 한빛${marker}`);
    const targetMatterId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: targetClientId,
      matterName: `신규 자문 ${marker}`,
      leadLawyerId: betaOwnerUserId,
    });

    const check = await runConflictCheck(baseUrl, betaOwnerCookie, targetMatterId);

    expect(check.status).toBe('in_review');
    expect(check.targetNames).toContain(`주식회사 한빛${marker}`);
    expect(check.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'party',
          sourceName: `(주)한빛${marker}`,
          sourceMatterId: priorMatterId,
        }),
      ]),
    );

    const invalidResolve = await resolveConflictCheck(
      baseUrl,
      betaOwnerCookie,
      targetMatterId,
      check.conflictCheckId,
      { status: 'cleared' },
    );
    expect(invalidResolve.status).toBe(400);

    const validResolve = await resolveConflictCheck(
      baseUrl,
      betaOwnerCookie,
      targetMatterId,
      check.conflictCheckId,
      { status: 'cleared', rationale: '내부 검토 결과 수임 가능' },
    );
    const validBody = await validResolve.text();
    expect(validResolve.status, validBody).toBe(200);
    expect((JSON.parse(validBody) as ConflictCheckResponse).resolutionRationale).toBe(
      '내부 검토 결과 수임 가능',
    );
    await expect(getMatter(baseUrl, betaOwnerCookie, targetMatterId)).resolves.toMatchObject({
      conflictsStatus: 'cleared',
    });
    await expect(countConflictAudits(targetMatterId, 'CONFLICT_CHECK_EXECUTED')).resolves.toBe(1);
    await expect(countConflictAudits(targetMatterId, 'CONFLICT_CHECK_RESOLVED')).resolves.toBe(1);
  });

  it('uses client aliases as conflict-check target and candidate names', async () => {
    const marker = randomUUID().replace(/-/g, '').slice(0, 10);
    const aliasName = `A4 별칭 고객 ${marker}`;
    const priorClientId = await createClient(
      baseUrl,
      betaOwnerCookie,
      `선행 원고객 ${marker}`,
      [aliasName],
    );
    const targetClientId = await createClient(
      baseUrl,
      betaOwnerCookie,
      `신규 원고객 ${marker}`,
      [aliasName],
    );
    const targetMatterId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: targetClientId,
      matterName: `신규 별칭 검토 ${marker}`,
      leadLawyerId: betaOwnerUserId,
    });

    const check = await runConflictCheck(baseUrl, betaOwnerCookie, targetMatterId);

    expect(check.targetNames).toContain(aliasName);
    expect(check.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: priorClientId,
          sourceName: aliasName,
          sourceType: 'client',
          targetName: aliasName,
        }),
      ]),
    );
  });

  it('returns zero candidates for unrelated names and excludes cross-tenant parties', async () => {
    const marker = randomUUID().replace(/-/g, '').slice(0, 10);
    const alphaClientId = await createClient(baseUrl, alphaOwnerCookie, `알파 고객 ${marker}`);
    const alphaMatterId = await createMatter(baseUrl, alphaOwnerCookie, {
      clientId: alphaClientId,
      matterName: `알파 사건 ${marker}`,
      leadLawyerId: alphaOwnerUserId,
    });
    await addParty(baseUrl, alphaOwnerCookie, alphaMatterId, `주식회사 은하${marker}`);

    const betaClientId = await createClient(baseUrl, betaOwnerCookie, `주식회사 은하${marker}`);
    const betaMatterId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterName: `베타 신규 사건 ${marker}`,
      leadLawyerId: betaOwnerUserId,
    });

    const check = await runConflictCheck(baseUrl, betaOwnerCookie, betaMatterId);

    expect(check.candidates).toHaveLength(0);
  });

  it('denies conflict check execution for same-tenant users without matter edit permission', async () => {
    const marker = randomUUID().replace(/-/g, '').slice(0, 10);
    const clientId = await createClient(baseUrl, betaOwnerCookie, `권한 검증 고객 ${marker}`);
    const matterId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId,
      matterName: `권한 검증 사건 ${marker}`,
      leadLawyerId: betaOwnerUserId,
    });

    const denied = await fetch(`${baseUrl}/v1/matters/${matterId}/conflict-checks`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie },
    });
    const deniedBody = await denied.text();

    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');
    await expect(getMatter(baseUrl, betaOwnerCookie, matterId)).resolves.toMatchObject({
      conflictsStatus: 'not_started',
    });
  });

  it('checks 200 clients and 1000 parties within the internal p95 target', async () => {
    await seedPerformanceCorpus(baseUrl, betaOwnerCookie);
    const marker = randomUUID().replace(/-/g, '').slice(0, 10);
    const clientId = await createClient(baseUrl, betaOwnerCookie, `성능 대상 ${marker}`);
    const matterId = await createMatter(baseUrl, betaOwnerCookie, {
      clientId,
      matterName: `성능 대상 사건 ${marker}`,
      leadLawyerId: betaOwnerUserId,
    });

    const startedAt = Date.now();
    const check = await runConflictCheck(baseUrl, betaOwnerCookie, matterId);
    const durationMs = Date.now() - startedAt;

    expect(check.candidates).toHaveLength(0);
    expect(durationMs).toBeLessThan(2000);
  }, 30000);
});
