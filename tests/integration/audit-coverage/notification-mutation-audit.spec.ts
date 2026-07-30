import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { DmsNotificationCenterResponseDto } from '@amic-vault/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  betaOwnerUserId,
  createClient,
  createMatter,
  loginBetaMember,
  loginBetaOwner,
} from '../document-access/document-api-helpers';
import { createOwnerClient, tenantBetaId, withClient } from '../helpers/db';

const auditFaultFunction = 'test_notification_mutation_audit_fault';
const auditFaultTrigger = 'test_notification_mutation_audit_fault';

describe('notification mutation audit integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let matterId: string;
  let memberCookie: string;
  let ownerCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginBetaOwner(baseUrl);
    memberCookie = await loginBetaMember(baseUrl);
    const clientId = await createClient(baseUrl, ownerCookie, 'NOTIFICATION-AUDIT');
    matterId = await createMatter(baseUrl, ownerCookie, clientId, 'NOTIFICATION-AUDIT');
  });

  afterAll(async () => {
    await removeAuditFault();
    await app.close();
  });

  it('audits read and dismiss in the mutation transaction and denies another recipient', async () => {
    const notificationId = await insertNotification(matterId);
    const itemKey = notificationKey(notificationId);

    const denied = await fetch(`${baseUrl}/v1/notifications/${itemKey}/read`, {
      method: 'PATCH',
      headers: { cookie: memberCookie },
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(404);
    expect(deniedBody).toContain('PERMISSION_DENIED');
    expect(deniedBody).not.toContain(notificationId);
    await expect(notificationState(notificationId)).resolves.toMatchObject({
      status: 'unread',
      readAuditCount: 0,
      dismissAuditCount: 0,
    });

    const read = await fetch(`${baseUrl}/v1/notifications/${itemKey}/read`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie },
    });
    const readBody = await read.text();
    expect(read.status, readBody).toBe(200);
    expect(JSON.parse(readBody)).toEqual({ itemKey, status: 'read' });
    await expect(notificationState(notificationId)).resolves.toMatchObject({
      status: 'read',
      readAuditCount: 1,
      dismissAuditCount: 0,
    });

    const dismissed = await fetch(`${baseUrl}/v1/notifications/${itemKey}/dismiss`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie },
    });
    const dismissedBody = await dismissed.text();
    expect(dismissed.status, dismissedBody).toBe(200);
    expect(JSON.parse(dismissedBody)).toEqual({ itemKey, status: 'dismissed' });
    await expect(notificationState(notificationId)).resolves.toMatchObject({
      status: 'dismissed',
      readAuditCount: 1,
      dismissAuditCount: 1,
    });
  });

  it('rolls back read state when the same-transaction audit insert fails', async () => {
    const notificationId = await insertNotification(matterId);
    const itemKey = notificationKey(notificationId);
    await installAuditFault(notificationId);

    try {
      const failed = await fetch(`${baseUrl}/v1/notifications/${itemKey}/read`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie },
      });
      expect(failed.status, await failed.text()).toBe(500);
      await expect(notificationState(notificationId)).resolves.toMatchObject({
        status: 'unread',
        readAuditCount: 0,
        dismissAuditCount: 0,
      });
    } finally {
      await removeAuditFault();
    }
  });

  it('returns twenty rows with explicit partial state when more notifications are visible', async () => {
    await insertNotifications(matterId, 21);

    const response = await fetch(`${baseUrl}/v1/notifications`, {
      headers: { cookie: ownerCookie },
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    const notifications = JSON.parse(body) as DmsNotificationCenterResponseDto;
    expect(notifications.items).toHaveLength(20);
    expect(notifications).toMatchObject({ partial: true, hasMore: true });
  });
});

function notificationKey(notificationId: string): string {
  const digest = createHash('sha256').update(notificationId).digest('hex').slice(0, 16);
  return `notification-${digest}`;
}

async function insertNotification(matterId: string): Promise<string> {
  const [notificationId] = await insertNotifications(matterId, 1);
  if (!notificationId) throw new Error('notification fixture was not created');
  return notificationId;
}

async function insertNotifications(matterId: string, count: number): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    const notificationIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const result = await client.query<{ notification_id: string }>(
        `
          INSERT INTO notifications (
            tenant_id, source, kind, target_type, target_id, matter_id,
            recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
            created_audit_event_id, last_audit_event_id
          )
          VALUES (
            $1, 'operational_data', 'email_autofile_completed', 'email', $2, $3,
            'user', $4, $5, 'unread', $6,
            $7, $7
          )
          RETURNING notification_id
        `,
        [
          tenantBetaId,
          randomUUID(),
          matterId,
          betaOwnerUserId,
          `user:${betaOwnerUserId}`,
          new Date(Date.UTC(2099, 0, 1, 0, index)),
          randomUUID(),
        ],
      );
      const notificationId = result.rows[0]?.notification_id;
      if (!notificationId) throw new Error('notification fixture insert returned no row');
      notificationIds.push(notificationId);
    }
    return notificationIds;
  });
}

async function notificationState(notificationId: string): Promise<{
  dismissAuditCount: number;
  readAuditCount: number;
  status: string;
}> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      dismiss_audit_count: string;
      read_audit_count: string;
      status: string;
    }>(
      `
        SELECT
          n.status,
          count(a.event_id) FILTER (WHERE a.action = 'NOTIFICATION_READ')::text
            AS read_audit_count,
          count(a.event_id) FILTER (WHERE a.action = 'NOTIFICATION_DISMISSED')::text
            AS dismiss_audit_count
        FROM notifications n
        LEFT JOIN audit_events a
          ON a.tenant_id = n.tenant_id
         AND a.target_type = 'notification'
         AND a.target_id = n.notification_id
        WHERE n.tenant_id = $1
          AND n.notification_id = $2
        GROUP BY n.status
      `,
      [tenantBetaId, notificationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('notification fixture state is missing');
    return {
      status: row.status,
      readAuditCount: Number(row.read_audit_count),
      dismissAuditCount: Number(row.dismiss_audit_count),
    };
  });
}

async function installAuditFault(notificationId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION ${auditFaultFunction}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.action = 'NOTIFICATION_READ'
          AND NEW.target_id = '${notificationId}'::uuid
        THEN
          RAISE EXCEPTION 'test notification mutation audit fault';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await client.query(`
      CREATE TRIGGER ${auditFaultTrigger}
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION ${auditFaultFunction}()
    `);
  });
}

async function removeAuditFault(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(`DROP TRIGGER IF EXISTS ${auditFaultTrigger} ON audit_events`);
    await client.query(`DROP FUNCTION IF EXISTS ${auditFaultFunction}()`);
  });
}
