import { describe, expect, it } from 'vitest';
import { createOwnerClient, withClient } from './helpers/db';

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
            'alpha-member@test.local',
            'beta-matter-owner@test.local',
            'beta-member@test.local'
          )
        `,
      );
      const plaintextPasswords = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE password_hash LIKE 'dev-%password%'",
      );

      expect(tenants.rows[0]?.count).toBe('2');
      expect(users.rows[0]?.count).toBe('4');
      expect(plaintextPasswords.rows[0]?.count).toBe('0');
    });
  });
});
