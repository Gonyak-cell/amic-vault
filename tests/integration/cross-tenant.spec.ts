import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { TenantController } from '../../apps/api/src/modules/tenant/tenant.controller';
import { loadTenantFixtures } from './helpers/tenant-fixtures';

function tenantRoutes(): string[] {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, TenantController) as string;
  return Object.getOwnPropertyNames(TenantController.prototype)
    .filter((method) => method !== 'constructor')
    .flatMap((method) => {
      const handler = TenantController.prototype[method as keyof TenantController];
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const methodCode = Reflect.getMetadata(METHOD_METADATA, handler);
      return methodPath && methodCode !== undefined ? [`/v1/${controllerPath}/${methodPath}`] : [];
    });
}

async function login(baseUrl: string, tenantId: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId, email, password }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

describe('cross-tenant access harness', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('collects registered tenant routes instead of passing an empty harness', () => {
    expect(tenantRoutes()).toEqual(
      expect.arrayContaining([
        '/v1/tenant/settings',
        '/v1/tenant/workspaces',
        '/v1/tenant/workspaces/:workspaceId',
      ]),
    );
  });

  it('blocks tenant-alpha from reading tenant-beta workspace details', async () => {
    const { alpha, beta } = await loadTenantFixtures();
    const cookie = await login(
      baseUrl,
      alpha.tenantId,
      'alpha-matter-owner@test.local',
      'dev-alpha-owner-password',
    );

    const allowed = await fetch(`${baseUrl}/v1/tenant/workspaces/${alpha.workspaceId}`, {
      headers: { cookie },
    });
    const allowedBody = await allowed.text();
    expect(allowed.status, allowedBody).toBe(200);
    expect(JSON.parse(allowedBody)).toMatchObject({
      workspaceId: alpha.workspaceId,
      tenantId: alpha.tenantId,
      name: alpha.workspaceName,
    });

    const blocked = await fetch(`${baseUrl}/v1/tenant/workspaces/${beta.workspaceId}`, {
      headers: { cookie, 'x-tenant-id': beta.tenantId },
    });
    const body = await blocked.text();

    expect([403, 404]).toContain(blocked.status);
    expect(body).toContain('PERMISSION_DENIED');
    expect(body).not.toContain(beta.workspaceId);
    expect(body).not.toContain(beta.workspaceName);
    expect(body).not.toContain(beta.slug);
  });
});
