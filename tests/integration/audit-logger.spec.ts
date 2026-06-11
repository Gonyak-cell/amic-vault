import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { AuditService } from '../../apps/api/src/modules/audit/audit.service';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

async function login(baseUrl: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password,
    }),
  });
}

async function latestAudit(action: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      actor_id: string | null;
      target_type: string;
      target_id: string | null;
      metadata_json: Record<string, unknown>;
      retention_label: string;
    }>(
      `
        SELECT action, actor_id, target_type, target_id, metadata_json, retention_label
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, action],
    );
    return result.rows[0];
  });
}

describe('audit logger integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let auditService: AuditService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    auditService = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records login success and failure audit events without credentials', async () => {
    const failed = await login(baseUrl, 'wrong-password');
    expect(failed.status).toBe(401);
    const failureAudit = await latestAudit('LOGIN_FAILURE');
    expect(failureAudit).toMatchObject({
      action: 'LOGIN_FAILURE',
      actor_id: alphaOwnerUserId,
      target_type: 'auth',
      target_id: alphaOwnerUserId,
      retention_label: 'PERMANENT',
    });
    expect(JSON.stringify(failureAudit?.metadata_json)).not.toContain('wrong-password');

    const success = await login(baseUrl, 'dev-alpha-owner-password');
    expect(success.status).toBe(201);
    const successAudit = await latestAudit('LOGIN_SUCCESS');
    expect(successAudit).toMatchObject({
      action: 'LOGIN_SUCCESS',
      actor_id: alphaOwnerUserId,
      target_type: 'user',
      target_id: alphaOwnerUserId,
      retention_label: 'PERMANENT',
    });
    expect(JSON.stringify(successAudit?.metadata_json)).not.toContain('dev-alpha-owner-password');
    expect(JSON.stringify(successAudit?.metadata_json)).not.toMatch(/sha256:[0-9a-f]{64}/);
  });

  it('rolls back business writes when audit metadata normalization fails', async () => {
    const clientName = `Rollback Client ${Date.now()}`;

    await expect(
      auditService.transaction(tenantAlphaId, async (tx) => {
        await tx.query(
          `
            INSERT INTO clients (tenant_id, name, client_type, confidentiality_level, status, created_by)
            VALUES ($1, $2, 'corporation', 'standard', 'active', $3)
          `,
          [tenantAlphaId, clientName, alphaOwnerUserId],
        );
        await auditService.log(
          {
            tenantId: tenantAlphaId,
            actorId: alphaOwnerUserId,
            action: 'CLIENT_CREATED',
            targetType: 'client',
            metadata: { reason_code: 'x'.repeat(257) },
          },
          tx,
        );
      }),
    ).rejects.toThrow(/too long/);

    await withClient(createOwnerClient(), async (client) => {
      const result = await client.query('SELECT client_id FROM clients WHERE name = $1', [
        clientName,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });
});
