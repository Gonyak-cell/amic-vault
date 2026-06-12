import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import {
  createEthicalWall,
  addMatterMember,
  addWallMembership,
  createSearchFixture,
  alphaOwnerUserId,
  alphaFirmAdminUserId,
  alphaSecurityAdminUserId,
} from './search-fixtures';
import {
  createOwnerClient,
  tenantAlphaId,
  withClient,
} from '../helpers/db';

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function search(baseUrl: string, cookie: string, query: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 10 }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { results: Array<{ documentId: string }> }).results.map(
    (result) => result.documentId,
  );
}

async function insertApprovedBreakGlass(input: { wallId: string; matterId: string }) {
  return withClient(createOwnerClient(), async (client) => {
    const requestId = randomUUID();
    await client.query(
      `
        INSERT INTO break_glass_requests (
          request_id, tenant_id, wall_id, matter_id, requester_id, reason_code,
          status, expires_at
        )
        VALUES (
          $1, $2, $3, $4, $5, 'court_deadline',
          'pending', now() + interval '1 hour'
        )
      `,
      [requestId, tenantAlphaId, input.wallId, input.matterId, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO break_glass_approvals (tenant_id, request_id, approver_id)
        VALUES ($1, $2, $3), ($1, $2, $4)
      `,
      [tenantAlphaId, requestId, alphaSecurityAdminUserId, alphaFirmAdminUserId],
    );
    await client.query(
      `
        UPDATE break_glass_requests
        SET status = 'approved',
          approved_at = now()
        WHERE tenant_id = $1
          AND request_id = $2
      `,
      [tenantAlphaId, requestId],
    );
    return requestId;
  });
}

describe('search break glass permission filter integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps wall filtering in SQL and only reveals rows for approved unexpired overrides', async () => {
    const marker = `breakglass-${randomUUID()}`;
    const fixture = await createSearchFixture(marker);
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.alphaMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: fixture.alphaMatterId,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
    });

    await expect(search(baseUrl, ownerCookie, marker)).resolves.toEqual([]);

    const requestId = await insertApprovedBreakGlass({
      wallId,
      matterId: fixture.alphaMatterId,
    });
    await expect(search(baseUrl, ownerCookie, marker)).resolves.toEqual(
      expect.arrayContaining(fixture.alphaDocumentIds.slice(0, 2)),
    );

    await withClient(createOwnerClient(), async (client) => {
      await client.query(
        `
          UPDATE break_glass_requests
          SET status = 'revoked',
            revoked_by = $3,
            revoked_at = now()
          WHERE tenant_id = $1
            AND request_id = $2
        `,
        [tenantAlphaId, requestId, alphaSecurityAdminUserId],
      );
    });

    await expect(search(baseUrl, ownerCookie, marker)).resolves.toEqual([]);
  });
});
