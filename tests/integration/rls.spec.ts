import { describe, expect, it } from 'vitest';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

async function ensureTenantRows(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    for (const [tenantId, slug] of [
      [tenantAlphaId, 'tenant-alpha'],
      [tenantBetaId, 'tenant-beta'],
    ] as const) {
      await client.query(
        `
          INSERT INTO tenants (tenant_id, name, slug, region, data_residency, status)
          VALUES ($1, $2, $2, 'kr', 'kr', 'active')
          ON CONFLICT (tenant_id) DO NOTHING
        `,
        [tenantId, slug],
      );
      await client.query(
        `
          INSERT INTO users (tenant_id, email, name, role, password_hash)
          VALUES ($1, $2, $3, 'matter_member', 'dev-sha256:fixture')
          ON CONFLICT (tenant_id, email) DO NOTHING
        `,
        [tenantId, `${slug}-rls@test.local`, `${slug} RLS User`],
      );
      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, action, target_type, result, metadata_json
          )
          VALUES ($1, 'system', 'LOGIN_SUCCESS', 'user', 'success', $2)
        `,
        [tenantId, { reason_code: 'rls_fixture', correlation_id: tenantId }],
      );
    }
  });
}

describe('tenant RLS', () => {
  it('returns no tenant-scoped rows without app.current_tenant_id', async () => {
    await ensureTenantRows();
    await withClient(createAppClient(), async (client) => {
      const users = await client.query('SELECT user_id FROM users');
      const auditEvents = await client.query('SELECT event_id FROM audit_events');
      expect(users.rowCount).toBe(0);
      expect(auditEvents.rowCount).toBe(0);
    });
  });

  it('shows only rows for the active tenant context', async () => {
    await ensureTenantRows();
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);

      const users = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM users');
      const auditEvents = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM audit_events',
      );

      expect(users.rowCount).toBeGreaterThan(0);
      expect(auditEvents.rowCount).toBeGreaterThan(0);
      expect(users.rows.every((row) => row.tenant_id === tenantAlphaId)).toBe(true);
      expect(auditEvents.rows.every((row) => row.tenant_id === tenantAlphaId)).toBe(true);
    });
  });

  it('rejects users without tenant_id', async () => {
    await withClient(createOwnerClient(), async (client) => {
      await expect(
        client.query(
          `
            INSERT INTO users (email, name, role, password_hash)
            VALUES ('missing-tenant@test.local', 'Missing Tenant', 'matter_member', 'hash')
          `,
        ),
      ).rejects.toThrow(/null value in column "tenant_id"/i);
    });
  });
});
