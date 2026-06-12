import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createAppClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
    body: JSON.stringify({ name: `Email Filing Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string) {
  const matterCode = `EMAIL-FILE-${randomUUID()}`;
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode,
      matterName: `Email Filing ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
      metadata: { domain: 'sender.example' },
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return { matterCode, matterId: (JSON.parse(body) as { matterId: string }).matterId };
}

async function insertEmailFixture(matterCode: string): Promise<string> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const emailId = randomUUID();
    const fileObjectId = randomUUID();
    const rawSha256 = sha256Hex(`raw:${emailId}`);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
        )
        VALUES ($1, $2, $3, 'filing.eml', 'filing.eml', 'message/rfc822', 64, $4, NULL, 'email_ingest', $5)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        `s3://amic-vault-dev/tenants/${tenantAlphaId}/emails/${emailId}/raw/${fileObjectId}`,
        rawSha256,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_messages (
          email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parse_status, failure_reason_code, subject, raw_sha256, raw_size_bytes, created_by
        )
        VALUES ($1, $2, $3, $4, 'eml', 'parsed', NULL, $5, $6, 64, $7)
      `,
      [
        emailId,
        tenantAlphaId,
        fileObjectId,
        sha256Hex(`message:${emailId}`),
        `Filing request ${matterCode}`,
        rawSha256,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_participants (
          tenant_id, email_id, role, address_hash, domain_ref, display_name, is_outside
        )
        VALUES ($1, $2, 'from', $3, 'sender.example', 'Sender', true)
      `,
      [tenantAlphaId, emailId, sha256Hex(`sender:${emailId}`)],
    );
    return emailId;
  });
}

async function addMemberAndExclude(matterId: string): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, 'member', 'read', $4)
        ON CONFLICT (matter_id, user_id) DO NOTHING
      `,
      [tenantAlphaId, matterId, alphaMemberUserId, alphaOwnerUserId],
    );
    const wallId = randomUUID();
    await client.query(
      `
        INSERT INTO ethical_walls (wall_id, tenant_id, matter_id, wall_name, reason, created_by)
        VALUES ($1, $2, $3, $4, 'conflict_check', $5)
      `,
      [wallId, tenantAlphaId, matterId, `Email Filing Wall ${wallId}`, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO ethical_wall_memberships (
          tenant_id, wall_id, subject_type, subject_id, membership_type, created_by
        )
        VALUES ($1, $2, 'user', $3, 'excluded', $4)
      `,
      [tenantAlphaId, wallId, alphaMemberUserId, alphaOwnerUserId],
    );
  });
}

async function auditCount(input: {
  action: string;
  actorId?: string;
  targetId: string;
  unsafe?: string;
}): Promise<string> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND target_id = $3
          AND ($4::uuid IS NULL OR actor_id = $4::uuid)
          AND ($5::text IS NULL OR metadata_json::text NOT LIKE '%' || $5::text || '%')
      `,
      [
        tenantAlphaId,
        input.action,
        input.targetId,
        input.actorId ?? null,
        input.unsafe ?? null,
      ],
    );
    return result.rows[0]?.count ?? '0';
  });
}

describe('email filing integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
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
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('suggests, files, audits, and timeline-filters emails through matter permission', async () => {
    const { matterCode, matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const emailId = await insertEmailFixture(matterCode);

    const suggestions = await fetch(`${baseUrl}/v1/emails/${emailId}/matter-suggestions`, {
      headers: { cookie: ownerCookie },
    });
    const suggestionBody = (await suggestions.json()) as {
      items: Array<{ matterId: string; reasonCodes: string[] }>;
    };
    expect(suggestions.status, JSON.stringify(suggestionBody)).toBe(200);
    expect(suggestionBody.items[0]).toMatchObject({
      matterId,
      reasonCodes: expect.arrayContaining(['subject', 'participant_domain']),
    });

    const denied = await fetch(`${baseUrl}/v1/emails/${emailId}/file`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    expect(denied.status, await denied.text()).toBe(403);
    await expect(
      auditCount({ action: 'ACCESS_DENIED', actorId: alphaMemberUserId, targetId: matterId }),
    ).resolves.toBe('1');

    const filed = await fetch(`${baseUrl}/v1/emails/${emailId}/file`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    const filedBody = (await filed.json()) as { emailId: string; matterId: string };
    expect(filed.status, JSON.stringify(filedBody)).toBe(201);
    expect(filedBody).toMatchObject({ emailId, matterId });
    await expect(
      auditCount({
        action: 'EMAIL_FILED',
        actorId: alphaOwnerUserId,
        targetId: emailId,
        unsafe: matterCode,
      }),
    ).resolves.toBe('1');

    const timeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: ownerCookie },
    });
    const timelineBody = (await timeline.json()) as { items: Array<{ emailId: string }> };
    expect(timeline.status, JSON.stringify(timelineBody)).toBe(200);
    expect(timelineBody.items).toEqual([expect.objectContaining({ emailId })]);

    await addMemberAndExclude(matterId);
    const excludedTimeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: memberCookie },
    });
    const excludedBody = (await excludedTimeline.json()) as { items: unknown[] };
    expect(excludedTimeline.status, JSON.stringify(excludedBody)).toBe(200);
    expect(excludedBody.items).toEqual([]);
  });
});
