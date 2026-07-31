import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { PermissionService } from '../../../apps/api/src/modules/permission/permission.service';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';

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

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Matter Permission Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
  accessScope: 'firm_open' | 'restricted' = 'restricted',
  labels: { matterCode?: string; matterName?: string } = {},
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: labels.matterCode ?? `MP-${randomUUID()}`,
      matterName: labels.matterName ?? `Matter Permission ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
      accessScope,
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
  accessLevel: 'read' | 'edit' = 'read',
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

async function insertExplicitPermission(
  matterId: string,
  userId: string,
  effect: 'ALLOW' | 'DENY',
  conditionJson: Record<string, unknown> | null = null,
) {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, condition_json, created_by
        )
        VALUES ($1, 'user', $2, 'matter', $3, 'read', $4, $5, $6)
      `,
      [tenantAlphaId, userId, matterId, effect, conditionJson, alphaOwnerUserId],
    );
  });
}

async function setMatterConflictsCleared(matterId: string) {
  await withClient(createOwnerClient(), async (client) => {
    const result = await client.query(
      `
        UPDATE matters
        SET conflicts_status = 'cleared',
            updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId],
    );
    expect(result.rowCount).toBe(1);
  });
}

async function latestMatterUpdateAudit(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_UPDATED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows[0];
  });
}

describe('matter permission integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let permissionService: PermissionService;
  let firmAdminCookie: string;
  let securityAdminCookie: string;
  let ownerCookie: string;
  let memberCookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    permissionService = app.get(PermissionService);
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
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
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows restricted matter reads only for members and hides non-member existence', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted');
    await addMember(baseUrl, ownerCookie, matterId);

    const ownerRead = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownerRead.status, await ownerRead.text()).toBe(200);

    const memberRead = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: memberCookie },
    });
    expect(memberRead.status, await memberRead.text()).toBe(200);

    const adminDenied = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: firmAdminCookie },
    });
    const adminDeniedBody = await adminDenied.text();
    expect(adminDenied.status, adminDeniedBody).toBe(404);
    expect(adminDeniedBody).not.toContain(matterId);
  });

  it('requires membership to read and write firm_open matters', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, 'firm_open');

    const adminRead = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: firmAdminCookie },
    });
    const adminReadBody = await adminRead.text();
    expect(adminRead.status, adminReadBody).toBe(404);

    await addMember(baseUrl, ownerCookie, matterId, 'read');
    const memberRead = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: memberCookie },
    });
    const memberReadBody = await memberRead.text();
    expect(memberRead.status, memberReadBody).toBe(200);
    expect(JSON.parse(memberReadBody)).toMatchObject({
      accessScope: 'firm_open',
      matterId,
    });

    await expect(
      permissionService.canEditMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['matter.edit:membership_not_edit'],
    });

    const writeDenied = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterName: 'Non-member edit attempt' }),
    });
    expect(writeDenied.status, await writeDenied.text()).toBe(403);
  });

  it('requires edit-level membership for matter edits and uploads', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted');
    await addMember(baseUrl, ownerCookie, matterId, 'read');

    await expect(
      permissionService.canEditMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({ effect: 'DENY' });

    const readOnlyStatus = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(readOnlyStatus.status, await readOnlyStatus.text()).toBe(403);

    const updateMember = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${alphaPermissionMemberUserId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'edit' }),
      },
    );
    expect(updateMember.status, await updateMember.text()).toBe(200);

    await expect(
      permissionService.canEditMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({ effect: 'ALLOW' });

    await setMatterConflictsCleared(matterId);
    const editStatus = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(editStatus.status, await editStatus.text()).toBe(200);

    await expect(
      permissionService.canUploadToMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({ effect: 'ALLOW' });
  });

  it('requires matter owner authority and records audit for access scope changes', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId, 'firm_open');
    await addMember(baseUrl, ownerCookie, matterId, 'edit');

    const memberDenied = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accessScope: 'restricted' }),
    });
    expect(memberDenied.status, await memberDenied.text()).toBe(403);

    const ownerUpdate = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accessScope: 'restricted' }),
    });
    const ownerUpdateBody = await ownerUpdate.text();
    expect(ownerUpdate.status, ownerUpdateBody).toBe(200);
    expect(JSON.parse(ownerUpdateBody)).toMatchObject({
      accessScope: 'restricted',
      matterId,
    });

    const audit = await latestMatterUpdateAudit(matterId);
    expect(audit?.metadata_json).toEqual({
      matter_id: matterId,
      diff_keys: ['access_scope'],
    });
  });

  it('applies deny overrides from ethical walls and explicit permission rows', async () => {
    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'firm_open');
    const wall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `Matter Permission Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaOwnerUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(wall.status, await wall.text()).toBe(201);

    const wallDenied = await fetch(`${baseUrl}/v1/matters/${wallMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    const wallDeniedBody = await wallDenied.text();
    expect(wallDenied.status, wallDeniedBody).toBe(403);
    expect(wallDeniedBody).toContain('ETHICAL_WALL_BLOCKED');

    const deniedMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'firm_open');
    await insertExplicitPermission(deniedMatterId, alphaOwnerUserId, 'DENY');
    const explicitDenied = await fetch(`${baseUrl}/v1/matters/${deniedMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(explicitDenied.status, await explicitDenied.text()).toBe(404);
  });

  it('filters matter lists at query time for rows and total count', async () => {
    const ownerMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted');
    const memberMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted');
    const firmOpenMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'firm_open');
    await addMember(baseUrl, ownerCookie, memberMatterId);

    const memberList = await fetch(`${baseUrl}/v1/matters?clientId=${clientId}&pageSize=100`, {
      headers: { cookie: memberCookie },
    });
    const body = await memberList.text();
    expect(memberList.status, body).toBe(200);
    const parsed = JSON.parse(body) as { items: Array<{ matterId: string }>; totalCount: number };
    expect(parsed.items.some((item) => item.matterId === memberMatterId)).toBe(true);
    expect(parsed.items.some((item) => item.matterId === firmOpenMatterId)).toBe(false);
    expect(parsed.items.some((item) => item.matterId === ownerMatterId)).toBe(false);
    expect(parsed.totalCount).toBe(parsed.items.length);
  });

  it('applies q search after permission deny overrides for rows and total count', async () => {
    const searchToken = `SFQ${randomUUID().replaceAll('-', '')}`;
    const allowedMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted', {
      matterCode: `${searchToken}-ALLOW`,
      matterName: `${searchToken} allowed`,
    });
    const nonMemberMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted', {
      matterCode: `${searchToken}-NONMEMBER`,
      matterName: `${searchToken} nonmember`,
    });
    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted', {
      matterCode: `${searchToken}-WALL`,
      matterName: `${searchToken} wall blocked`,
    });
    const explicitDenyMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted', {
      matterCode: `${searchToken}-DENY`,
      matterName: `${searchToken} explicit deny`,
    });
    const invalidConditionMatterId = await createMatter(
      baseUrl,
      ownerCookie,
      clientId,
      'restricted',
      {
        matterCode: `${searchToken}-CONDITION`,
        matterName: `${searchToken} invalid condition`,
      },
    );
    const insiderMatterId = await createMatter(baseUrl, ownerCookie, clientId, 'restricted', {
      matterCode: `${searchToken}-INSIDER`,
      matterName: `${searchToken} insider required`,
    });
    await addMember(baseUrl, ownerCookie, allowedMatterId);
    await addMember(baseUrl, ownerCookie, wallMatterId);
    await addMember(baseUrl, ownerCookie, explicitDenyMatterId);
    await addMember(baseUrl, ownerCookie, invalidConditionMatterId);
    await addMember(baseUrl, ownerCookie, insiderMatterId);
    await insertExplicitPermission(explicitDenyMatterId, alphaPermissionMemberUserId, 'DENY');
    await insertExplicitPermission(invalidConditionMatterId, alphaPermissionMemberUserId, 'ALLOW', {
      attribute: 'matter.billing_rate',
      operator: 'eq',
      value: 'secret',
    });

    const wall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `Matter Search Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaPermissionMemberUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(wall.status, await wall.text()).toBe(201);

    const insiderWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: insiderMatterId,
        wallName: `Matter Search Insider Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaOwnerUserId,
            membershipType: 'insider',
          },
        ],
      }),
    });
    expect(insiderWall.status, await insiderWall.text()).toBe(201);

    const explicitDenyDetail = await fetch(`${baseUrl}/v1/matters/${explicitDenyMatterId}`, {
      headers: { cookie: memberCookie },
    });
    expect(explicitDenyDetail.status, await explicitDenyDetail.text()).toBe(404);

    const invalidConditionDetail = await fetch(
      `${baseUrl}/v1/matters/${invalidConditionMatterId}`,
      { headers: { cookie: memberCookie } },
    );
    expect(invalidConditionDetail.status, await invalidConditionDetail.text()).toBe(404);

    const insiderDetail = await fetch(`${baseUrl}/v1/matters/${insiderMatterId}`, {
      headers: { cookie: memberCookie },
    });
    const insiderDetailBody = await insiderDetail.text();
    expect(insiderDetail.status, insiderDetailBody).toBe(403);
    expect(insiderDetailBody).toContain('ETHICAL_WALL_BLOCKED');

    const memberList = await fetch(
      `${baseUrl}/v1/matters?q=${encodeURIComponent(searchToken)}&pageSize=100`,
      { headers: { cookie: memberCookie } },
    );
    const body = await memberList.text();
    expect(memberList.status, body).toBe(200);
    const parsed = JSON.parse(body) as { items: Array<{ matterId: string }>; totalCount: number };
    expect(parsed.items.map((item) => item.matterId)).toEqual([allowedMatterId]);
    expect(parsed.items.some((item) => item.matterId === nonMemberMatterId)).toBe(false);
    expect(parsed.items.some((item) => item.matterId === wallMatterId)).toBe(false);
    expect(parsed.items.some((item) => item.matterId === explicitDenyMatterId)).toBe(false);
    expect(parsed.items.some((item) => item.matterId === invalidConditionMatterId)).toBe(false);
    expect(parsed.items.some((item) => item.matterId === insiderMatterId)).toBe(false);
    expect(parsed.totalCount).toBe(1);
  });

  it.each([
    ['blank q', 'q=%20%20%20'],
    ['oversized q', `q=${'x'.repeat(201)}`],
    ['unsupported owner filter', `owner=${alphaOwnerUserId}`],
  ])('rejects %s for matter list search', async (_caseName, query) => {
    const response = await fetch(`${baseUrl}/v1/matters?${query}`, {
      headers: { cookie: memberCookie },
    });
    const body = await response.text();
    expect(response.status, body).toBe(400);
    expect(body).toContain('VALIDATION_FAILED');
  });
});
