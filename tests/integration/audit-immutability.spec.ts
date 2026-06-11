import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAppClient, createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';

async function ensureAuditFixture(): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO tenants (tenant_id, name, slug, region, data_residency, status)
        VALUES ($1, 'Tenant Alpha', 'tenant-alpha', 'kr', 'kr', 'active')
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      [tenantAlphaId],
    );

    const result = await client.query<{ event_id: string }>(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, action, target_type, target_id, result, metadata_json
        )
        VALUES ($1, 'system', 'PERMISSION_DENIED_HIT', 'system', NULL, 'denied', $2)
        RETURNING event_id
      `,
      [tenantAlphaId, { actor: 'system', code: 'fixture' }],
    );
    const row = result.rows[0];
    if (!row) throw new Error('audit fixture insert returned no row');
    return row.event_id;
  });
}

async function snapshotAuditEvent(eventId: string): Promise<{ count: string; checksum: string }> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string; checksum: string }>(
      `
        SELECT count(*)::text AS count,
               coalesce(md5(string_agg(md5(audit_events::text), ',' ORDER BY event_id)), '') AS checksum
        FROM audit_events
        WHERE event_id = $1
      `,
      [eventId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('audit snapshot returned no row');
    return row;
  });
}

async function expectAuditUnchanged(eventId: string, run: () => Promise<void>): Promise<void> {
  const before = await snapshotAuditEvent(eventId);
  await expect(run()).rejects.toThrow(/permission denied|append-only/i);
  await expect(snapshotAuditEvent(eventId)).resolves.toEqual(before);
}

describe('audit immutability', () => {
  let eventId: string;

  beforeAll(async () => {
    eventId = await ensureAuditFixture();
  });

  it('allows app role to append and read tenant audit rows', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const inserted = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, action, target_type, result, metadata_json
          )
          VALUES ($1, 'system', 'SESSION_REVOKED', 'session', 'success', $2)
          RETURNING event_id
        `,
        [tenantAlphaId, { actor: 'system', session_id: 'integration-session' }],
      );
      const insertedRow = inserted.rows[0];
      expect(insertedRow?.event_id).toMatch(/[0-9a-f-]{36}/);

      const visible = await client.query('SELECT event_id FROM audit_events WHERE event_id = $1', [
        insertedRow?.event_id,
      ]);
      expect(visible.rowCount).toBe(1);
    });
  });

  it('blocks direct SQL update, delete, and truncate through the app role', async () => {
    await expectAuditUnchanged(eventId, () =>
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query('UPDATE audit_events SET action = $1 WHERE event_id = $2', [
          'LOGIN_SUCCESS',
          eventId,
        ]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query('DELETE FROM audit_events WHERE event_id = $1', [eventId]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        await client.query('TRUNCATE audit_events');
      }),
    );
  });

  it('blocks owner mutation paths through append-only triggers', async () => {
    await expectAuditUnchanged(eventId, () =>
      withClient(createOwnerClient(), async (client) => {
        await client.query('UPDATE audit_events SET action = $1 WHERE event_id = $2', [
          'LOGIN_SUCCESS',
          eventId,
        ]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createOwnerClient(), async (client) => {
        await client.query('DELETE FROM audit_events WHERE event_id = $1', [eventId]);
      }),
    );

    await expectAuditUnchanged(eventId, () =>
      withClient(createOwnerClient(), async (client) => {
        await client.query('TRUNCATE audit_events');
      }),
    );
  });

  it('keeps mutation privileges and triggers absent from runtime paths', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const grants = await client.query(
        `
          SELECT grantee, privilege_type
          FROM information_schema.role_table_grants
          WHERE table_name = 'audit_events'
            AND grantee = 'vault_app'
            AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
        `,
      );
      expect(grants.rowCount).toBe(0);

      const triggers = await client.query<{ tgname: string }>(
        `
          SELECT tgname
          FROM pg_trigger
          WHERE tgrelid = 'audit_events'::regclass
            AND NOT tgisinternal
          ORDER BY tgname
        `,
      );
      expect(triggers.rows.map((row) => row.tgname)).toEqual([
        'trg_audit_events_block_truncate',
        'trg_audit_events_block_update_delete',
      ]);
    });
  });

  it('does not expose API controller routes that mutate audit events', () => {
    const apiRoot = path.resolve('apps/api/src');
    const entries = fs.readdirSync(apiRoot, { recursive: true });
    const controllerFiles = entries
      .map((entry) => entry.toString())
      .filter((entry) => entry.endsWith('.controller.ts'));
    const suspiciousRoutes = controllerFiles.flatMap((file) => {
      const body = fs.readFileSync(path.join(apiRoot, file), 'utf8');
      return /@(Patch|Put|Delete)\s*\([^)]*audit/i.test(body) ? [file] : [];
    });

    expect(suspiciousRoutes).toEqual([]);
  });
});
