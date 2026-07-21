import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  DlpBehaviorAlertListResponseDto,
  DmsNotificationCenterResponseDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { BulkDownloadMonitorService } from '../../apps/api/src/modules/dlp/bulk-download-monitor.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import {
  alphaOwnerUserId,
  betaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

interface AlertEvidenceRow {
  alert_id: string;
  event_count: number;
  total_bytes: string;
}

describe('DLP bulk download monitor integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let securityAdminCookie: string;
  let monitor: BulkDownloadMonitorService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    monitor = app.get(BulkDownloadMonitorService);
    securityAdminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates one alert, audit event, notification, and admin API row for 51 downloads in one hour', async () => {
    const fixture = await createDownloadFixture({
      index: 15_070,
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      title: `H7 bulk ${randomUUID()}`,
    });
    const actorUserId = await createTenantUser(tenantAlphaId, 'h7-bulk-alpha');
    const asOf = new Date('2036-07-04T10:00:00.000Z');
    await seedDownloadAuditEvents({
      actorUserId,
      count: 51,
      documentId: fixture.documentId,
      matterId: fixture.matterId,
      startAt: new Date('2036-07-04T09:00:00.000Z'),
      tenantId: tenantAlphaId,
      versionId: fixture.versionId,
    });

    await expect(
      monitor.sweepBulkDownloadAlerts({ asOf, tenantIds: [tenantAlphaId] }),
    ).resolves.toEqual({ alertCount: 1, reviewedTenantCount: 1, tenantCount: 1 });
    await expect(
      monitor.sweepBulkDownloadAlerts({ asOf, tenantIds: [tenantAlphaId] }),
    ).resolves.toEqual({ alertCount: 0, reviewedTenantCount: 1, tenantCount: 1 });

    const alert = await latestAlertForActor(tenantAlphaId, actorUserId);
    expect(alert).toMatchObject({ event_count: 51 });
    expect(Number(alert.total_bytes)).toBe(51 * 32);
    await expect(countBulkDownloadAudits(tenantAlphaId, alert.alert_id)).resolves.toBe(1);
    await expect(countBulkDownloadNotifications(tenantAlphaId, alert.alert_id)).resolves.toBe(1);

    const alertsResponse = await getJson<DlpBehaviorAlertListResponseDto>(
      `${baseUrl}/v1/dlp/behavior-alerts`,
      securityAdminCookie,
    );
    expect(alertsResponse.items.some((item) => item.alertId === alert.alert_id)).toBe(true);

    const notifications = await getJson<DmsNotificationCenterResponseDto>(
      `${baseUrl}/v1/notifications`,
      securityAdminCookie,
    );
    const dlpNotification = notifications.items.find((item) =>
      item.href.includes('panel=dlp-downloads'),
    );
    expect(dlpNotification).toMatchObject({
      category: '보안 운영',
      title: '대량 다운로드 감지',
    });

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const hidden = await client.query(
        'SELECT alert_id FROM dlp_behavior_alerts WHERE alert_id = $1',
        [alert.alert_id],
      );
      expect(hidden.rowCount).toBe(0);
    });
  });

  it('does not aggregate below-threshold downloads across tenants', async () => {
    const asOf = new Date('2036-07-04T12:00:00.000Z');
    const alphaFixture = await createDownloadFixture({
      index: 15_071,
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      title: `H7 alpha under threshold ${randomUUID()}`,
    });
    const betaFixture = await createDownloadFixture({
      index: 15_072,
      tenantId: tenantBetaId,
      ownerUserId: betaOwnerUserId,
      title: `H7 beta under threshold ${randomUUID()}`,
    });
    const alphaActorUserId = await createTenantUser(tenantAlphaId, 'h7-under-alpha');
    const betaActorUserId = await createTenantUser(tenantBetaId, 'h7-under-beta');

    await seedDownloadAuditEvents({
      actorUserId: alphaActorUserId,
      count: 49,
      documentId: alphaFixture.documentId,
      matterId: alphaFixture.matterId,
      startAt: new Date('2036-07-04T11:00:00.000Z'),
      tenantId: tenantAlphaId,
      versionId: alphaFixture.versionId,
    });
    await seedDownloadAuditEvents({
      actorUserId: betaActorUserId,
      count: 49,
      documentId: betaFixture.documentId,
      matterId: betaFixture.matterId,
      startAt: new Date('2036-07-04T11:00:00.000Z'),
      tenantId: tenantBetaId,
      versionId: betaFixture.versionId,
    });

    await expect(
      monitor.sweepBulkDownloadAlerts({ asOf, tenantIds: [tenantAlphaId, tenantBetaId] }),
    ).resolves.toEqual({ alertCount: 0, reviewedTenantCount: 2, tenantCount: 2 });
    await expect(countAlertsForActor(tenantAlphaId, alphaActorUserId)).resolves.toBe(0);
    await expect(countAlertsForActor(tenantBetaId, betaActorUserId)).resolves.toBe(0);
  });
});

async function createDownloadFixture(input: {
  index: number;
  ownerUserId: string;
  tenantId: string;
  title: string;
}): Promise<{ documentId: string; matterId: string; versionId: string }> {
  const clientId = randomUUID();
  const documentId = randomUUID();
  const matterId = randomUUID();
  const versionId = randomUUID();
  await insertSearchIndexedRow(
    {
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      clientId,
      matterId,
      documentId,
      versionId,
      title: input.title,
      contentText: `${input.title} fixture`,
      documentType: 'memo',
      documentStatus: 'draft',
      seedChunks: false,
      versionStatus: 'current',
      updatedAt: '2036-07-04T00:00:00.000Z',
    },
    input.index,
  );
  return { documentId, matterId, versionId };
}

async function createTenantUser(tenantId: string, prefix: string): Promise<string> {
  const userId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    await client.query(
      `
        INSERT INTO users (user_id, tenant_id, email, name, role, password_hash)
        VALUES ($1, $2, $3, $4, 'matter_member', 'dev-sha256:h7')
      `,
      [userId, tenantId, `${prefix}-${userId}@test.local`, `${prefix} actor`],
    );
  });
  return userId;
}

async function seedDownloadAuditEvents(input: {
  actorUserId: string;
  count: number;
  documentId: string;
  matterId: string;
  startAt: Date;
  tenantId: string;
  versionId: string;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, actor_id, action, target_type, target_id,
          matter_id, result, metadata_json, created_at
        )
        SELECT
          $1,
          'user',
          $2,
          'DOCUMENT_DOWNLOADED',
          'document',
          $3,
          $4,
          'success',
          jsonb_build_object(
            'document_id', $3::uuid,
            'matter_id', $4::uuid,
            'version_id', $5::uuid
          ),
          $6::timestamptz + ((download_no - 1) * interval '1 second')
        FROM generate_series(1, $7::int) AS download_no
      `,
      [
        input.tenantId,
        input.actorUserId,
        input.documentId,
        input.matterId,
        input.versionId,
        input.startAt,
        input.count,
      ],
    );
  });
}

async function latestAlertForActor(
  tenantId: string,
  actorUserId: string,
): Promise<AlertEvidenceRow> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    const result = await client.query<AlertEvidenceRow>(
      `
        SELECT alert_id::text AS alert_id, event_count, total_bytes::text AS total_bytes
        FROM dlp_behavior_alerts
        WHERE tenant_id = $1
          AND actor_user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, actorUserId],
    );
    expect(result.rows[0]).toBeDefined();
    return result.rows[0] as AlertEvidenceRow;
  });
}

async function countAlertsForActor(tenantId: string, actorUserId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM dlp_behavior_alerts
        WHERE tenant_id = $1
          AND actor_user_id = $2
      `,
      [tenantId, actorUserId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function countBulkDownloadAudits(tenantId: string, alertId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'DLP_BULK_DOWNLOAD_DETECTED'
          AND target_type = 'dlp_behavior_alert'
          AND target_id = $2
      `,
      [tenantId, alertId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function countBulkDownloadNotifications(tenantId: string, alertId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM notifications
        WHERE tenant_id = $1
          AND kind = 'dlp_bulk_download'
          AND target_type = 'dlp_behavior_alert'
          AND target_id = $2
      `,
      [tenantId, alertId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function getJson<T>(url: string, cookie: string): Promise<T> {
  const response = await fetch(url, { headers: { cookie } });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as T;
}
