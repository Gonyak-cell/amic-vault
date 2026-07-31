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
        const matterIntakeTemplates = await client.query<{
          template_code: string;
          display_name: string;
          description: string;
        }>(
          `
            SELECT template_code, display_name, description
            FROM matter_intake_templates
            WHERE tenant_id = $1
              AND template_code IN ('default_open', 'restricted')
              AND status = 'active'
            ORDER BY template_code
          `,
          [tenantId],
        );
        expect(matterIntakeTemplates.rows).toEqual([
          {
            template_code: 'default_open',
            display_name: '일반 Matter',
            description: '담당 변호사를 책임자로 지정하고 기본 접근 범위로 시작합니다.',
          },
          {
            template_code: 'restricted',
            display_name: '제한 Matter',
            description: '지정된 Matter 구성원만 열람할 수 있습니다.',
          },
        ]);
      }
    });
  });
});
