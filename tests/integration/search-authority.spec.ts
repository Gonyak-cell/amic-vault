import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';
import {
  addMatterMember,
  alphaMemberUserId,
  createSearchFixture,
  type SearchFixture,
} from './search-permission/search-fixtures';

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function postSearch(
  baseUrl: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: JSON.parse(text) as Record<string, unknown>,
  };
}

async function seedAuthority(marker: string): Promise<string> {
  const externalRef = `D12-${randomUUID()}`;
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO external_authorities (
          tenant_id,
          source_type,
          external_ref,
          title,
          citation,
          source_url,
          search_text,
          payload_json,
          fetched_at
        )
        VALUES (
          $1,
          'law_statute',
          $2,
          $3,
          $4,
          'https://www.law.go.kr/법령/상법/제398조',
          $5,
          '{"fixture":"D12"}'::jsonb,
          now()
        )
      `,
      [
        tenantAlphaId,
        externalRef,
        `상법 ${marker}`,
        `상법 제398조 ${marker}`,
        `상법 제398조 ${marker} 이사 등과 회사 간의 거래`,
      ],
    );
  });
  return externalRef;
}

describe('authority search integration', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let cookie: string;
  let fixture: SearchFixture;
  let externalRef: string;
  let marker: string;
  let authorityMarker: string;

  beforeAll(async () => {
    marker = `D12AUTH${Date.now().toString(36)}`;
    authorityMarker = `D12LAW${Date.now().toString(36)}`;
    fixture = await createSearchFixture(marker);
    externalRef = await seedAuthority(authorityMarker);
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    cookie = await login(baseUrl);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('searches public authorities without applying internal document permission scope', async () => {
    const authority = await postSearch(baseUrl, cookie, {
      page: 1,
      pageSize: 10,
      query: authorityMarker,
      target: 'authority',
    });

    expect(authority.status, JSON.stringify(authority.body)).toBe(201);
    expect(authority.body.total).toBe(1);
    expect(authority.body.results).toEqual([
      expect.objectContaining({
        citation: `상법 제398조 ${authorityMarker}`,
        documentType: 'authority',
        externalRef,
        resultKind: 'authority',
        sourceType: 'law_statute',
        title: `상법 ${authorityMarker}`,
      }),
    ]);

    const inaccessibleInternal = await postSearch(baseUrl, cookie, {
      page: 1,
      pageSize: 10,
      query: marker,
      target: 'all',
    });
    expect(inaccessibleInternal.status, JSON.stringify(inaccessibleInternal.body)).toBe(201);
    expect(inaccessibleInternal.body.total).toBe(0);

    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: fixture.alphaMatterId,
      userId: alphaMemberUserId,
      matterRole: 'member',
      accessLevel: 'read',
    });
    const accessibleInternal = await postSearch(baseUrl, cookie, {
      page: 1,
      pageSize: 10,
      query: marker,
      target: 'all',
    });
    expect(accessibleInternal.status, JSON.stringify(accessibleInternal.body)).toBe(201);
    expect(accessibleInternal.body.total).toBe(2);
    expect(JSON.stringify(accessibleInternal.body)).not.toContain('Beta Contract');
  });
});
