import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const alphaPermissionMemberUserId = '11111111-1111-4111-8111-111111111105';

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

async function createClient(baseUrl: string, cookie: string, prefix = 'Party'): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `${prefix} Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
  leadLawyerId: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `PTY-${randomUUID()}`,
      matterName: `Party Matter ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function addMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  accessLevel: 'read' | 'edit',
) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: alphaPermissionMemberUserId,
      matterRole: 'member',
      accessLevel,
    }),
  });
  expect(response.status, await response.text()).toBe(201);
}

async function createParty(
  baseUrl: string,
  cookie: string,
  matterId: string,
  body: Record<string, unknown> = {},
) {
  return fetch(`${baseUrl}/v1/matters/${matterId}/parties`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Counterparty ${randomUUID()}`,
      partyType: 'corporation',
      partyRole: 'counterparty',
      ...body,
    }),
  });
}

async function updateStatus(baseUrl: string, cookie: string, matterId: string, status: string) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  expect(response.status, await response.text()).toBe(200);
}

async function latestAudit(action: string, targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      metadata_json: Record<string, unknown>;
      matter_id: string | null;
    }>(
      `
        SELECT metadata_json, matter_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND target_id = $3
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, action, targetId],
    );
    return result.rows[0];
  });
}

async function partyRestrictedAuditCount(partyId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'PARTY_RESTRICTED_MARKED'
          AND target_id = $2
      `,
      [tenantAlphaId, partyId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

describe('party integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let securityAdminCookie: string;
  let firmAdminCookie: string;
  let betaOwnerCookie: string;
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
    memberCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-permission-member@test.local',
      password: 'dev-alpha-permission-member-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    betaOwnerCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and lists parties only through matter permissions and reference-only audit', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, alphaOwnerUserId);
    await addMember(baseUrl, ownerCookie, matterId, 'edit');

    const created = await createParty(baseUrl, memberCookie, matterId, { partyRole: 'witness' });
    const createdBody = await created.text();
    expect(created.status, createdBody).toBe(201);
    const party = JSON.parse(createdBody) as { partyId: string; name: string };
    expect(party.name).toContain('Counterparty');

    const audit = await latestAudit('PARTY_ADDED', party.partyId);
    expect(audit?.matter_id).toBe(matterId);
    expect(audit?.metadata_json).toMatchObject({
      party_id: party.partyId,
      matter_id: matterId,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(party.name);

    const list = await fetch(`${baseUrl}/v1/matters/${matterId}/parties`, {
      headers: { cookie: memberCookie },
    });
    const listBody = await list.text();
    expect(list.status, listBody).toBe(200);
    expect((JSON.parse(listBody) as { items: Array<{ partyId: string }> }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ partyId: party.partyId })]),
    );
  });

  it('denies nonmembers, read-only members, cross-tenant related clients, and closed matters', async () => {
    const readMatterId = await createMatter(baseUrl, ownerCookie, clientId, alphaOwnerUserId);
    await addMember(baseUrl, ownerCookie, readMatterId, 'read');

    const readOnlyDenied = await createParty(baseUrl, memberCookie, readMatterId);
    expect(readOnlyDenied.status, await readOnlyDenied.text()).toBe(403);

    const nonmemberList = await fetch(`${baseUrl}/v1/matters/${readMatterId}/parties`, {
      headers: { cookie: firmAdminCookie },
    });
    const nonmemberListBody = await nonmemberList.text();
    expect(nonmemberList.status, nonmemberListBody).toBe(404);
    expect(nonmemberListBody).not.toContain(readMatterId);

    const betaClientId = await createClient(baseUrl, betaOwnerCookie, 'Beta Party');
    const editMatterId = await createMatter(baseUrl, ownerCookie, clientId, alphaOwnerUserId);
    await addMember(baseUrl, ownerCookie, editMatterId, 'edit');
    const crossTenantClient = await createParty(baseUrl, memberCookie, editMatterId, {
      relatedClientId: betaClientId,
    });
    expect(crossTenantClient.status, await crossTenantClient.text()).toBe(404);

    const closedMatterId = await createMatter(baseUrl, ownerCookie, clientId, alphaOwnerUserId);
    for (const status of ['open', 'active', 'closing', 'closed']) {
      await updateStatus(baseUrl, ownerCookie, closedMatterId, status);
    }
    const closedDenied = await createParty(baseUrl, ownerCookie, closedMatterId);
    const closedDeniedBody = await closedDenied.text();
    expect(closedDenied.status, closedDeniedBody).toBe(400);
    expect(closedDeniedBody).toContain('MATTER_CLOSED');
  });

  it('marks restricted parties through security admin or matter owner only', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, alphaOwnerUserId);
    await addMember(baseUrl, ownerCookie, matterId, 'edit');
    const create = await createParty(baseUrl, memberCookie, matterId);
    const createBody = await create.text();
    expect(create.status, createBody).toBe(201);
    const party = JSON.parse(createBody) as { partyId: string };

    const memberDenied = await fetch(`${baseUrl}/v1/parties/${party.partyId}`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ isRestricted: true }),
    });
    expect(memberDenied.status, await memberDenied.text()).toBe(403);

    const securityMarked = await fetch(`${baseUrl}/v1/parties/${party.partyId}`, {
      method: 'PATCH',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ isRestricted: true }),
    });
    const securityMarkedBody = await securityMarked.text();
    expect(securityMarked.status, securityMarkedBody).toBe(200);
    expect(JSON.parse(securityMarkedBody)).toMatchObject({ isRestricted: true });

    const beforeNoop = await partyRestrictedAuditCount(party.partyId);
    const noop = await fetch(`${baseUrl}/v1/parties/${party.partyId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ isRestricted: true }),
    });
    expect(noop.status, await noop.text()).toBe(200);
    await expect(partyRestrictedAuditCount(party.partyId)).resolves.toBe(beforeNoop);

    const audit = await latestAudit('PARTY_RESTRICTED_MARKED', party.partyId);
    expect(audit?.metadata_json).toMatchObject({
      party_id: party.partyId,
      matter_id: matterId,
      before_ref: 'restricted:false',
      after_ref: 'restricted:true',
    });
  });

  it('keeps party rows tenant-isolated through RLS', async () => {
    const betaClientId = await createClient(baseUrl, betaOwnerCookie, 'Beta RLS Party');
    const betaMatterId = await createMatter(
      baseUrl,
      betaOwnerCookie,
      betaClientId,
      '22222222-2222-4222-8222-222222222201',
    );
    const betaParty = await createParty(baseUrl, betaOwnerCookie, betaMatterId);
    const betaPartyBody = await betaParty.text();
    expect(betaParty.status, betaPartyBody).toBe(201);
    const betaPartyId = (JSON.parse(betaPartyBody) as { partyId: string }).partyId;

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query('SELECT party_id FROM parties WHERE party_id = $1', [
        betaPartyId,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });
});
