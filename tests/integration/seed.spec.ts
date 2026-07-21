import { describe, expect, it } from 'vitest';
import { createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

describe('seed loader', () => {
  it('loads deterministic demo tenants and users idempotently', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const tenants = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM tenants WHERE slug IN ('tenant-alpha', 'tenant-beta')",
      );
      const users = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM users
          WHERE email IN (
            'alpha-matter-owner@test.local',
            'alpha-firm-admin@test.local',
            'alpha-security-admin@test.local',
            'alpha-member@test.local',
            'alpha-auth-reset@test.local',
            'alpha-rbac-target@test.local',
            'alpha-permission-member@test.local',
            'alpha-permission-audit-target@test.local',
            'beta-matter-owner@test.local',
            'beta-member@test.local',
            'beta-auth-mfa@test.local'
          )
        `,
      );
      const plaintextPasswords = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE password_hash LIKE 'dev-%password%'",
      );
      expect(tenants.rows[0]?.count).toBe('2');
      expect(users.rows[0]?.count).toBe('11');
      expect(plaintextPasswords.rows[0]?.count).toBe('0');

      for (const tenantId of [tenantAlphaId, tenantBetaId]) {
        await setTenant(client, tenantId);
        const matterIntakeTemplates = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
            FROM matter_intake_templates
            WHERE tenant_id = $1
              AND template_code IN ('default_open', 'restricted')
              AND status = 'active'
          `,
          [tenantId],
        );
        expect(matterIntakeTemplates.rows[0]?.count).toBe('2');
      }
    });
  });
});
