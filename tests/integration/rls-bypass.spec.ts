import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createAppClient, createOwnerClient, setTenant, withClient } from './helpers/db';
import { loadTenantFixtures } from './helpers/tenant-fixtures';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

function tokenHash(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

describe('RLS bypass attempts', () => {
  it('returns zero rows when app role uses tenant-alpha context for tenant-beta workspace id', async () => {
    const { alpha, beta } = await loadTenantFixtures();

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, alpha.tenantId);
      const result = await client.query(
        'SELECT workspace_id FROM workspaces WHERE workspace_id = $1',
        [beta.workspaceId],
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it('rejects mismatched tenant inserts through the app role', async () => {
    const { alpha, beta } = await loadTenantFixtures();

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, alpha.tenantId);
      await expect(
        client.query(
          `
            INSERT INTO workspaces (tenant_id, name)
            VALUES ($1, 'Forbidden Workspace')
          `,
          [beta.tenantId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('allows runtime auth helpers without opening tenant table scans', async () => {
    const { alpha } = await loadTenantFixtures();
    const sessionHash = tokenHash(`runtime-session-${Date.now()}`);
    const resetHash = tokenHash(`runtime-reset-${Date.now()}`);

    await withClient(createOwnerClient(), async (client) => {
      await client.query(
        `
          INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
          VALUES ($1, $2, $3, now() + interval '1 hour')
        `,
        [alpha.tenantId, alphaOwnerUserId, sessionHash],
      );
      await client.query(
        `
          INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at)
          VALUES ($1, $2, $3, now() + interval '30 minutes')
        `,
        [alpha.tenantId, alphaOwnerUserId, resetHash],
      );
    });

    await withClient(createAppClient(), async (client) => {
      const hiddenSessions = await client.query('SELECT session_id FROM sessions');
      expect(hiddenSessions.rowCount).toBe(0);

      const session = await client.query<{ tenant_id: string; user_id: string }>(
        'SELECT tenant_id, user_id FROM app_find_active_session_by_token_hash($1)',
        [sessionHash],
      );
      expect(session.rows).toEqual([{ tenant_id: alpha.tenantId, user_id: alphaOwnerUserId }]);

      const missing = await client.query(
        'SELECT tenant_id, user_id FROM app_find_active_session_by_token_hash($1)',
        [tokenHash('missing')],
      );
      expect(missing.rowCount).toBe(0);

      const consumed = await client.query<{ tenant_id: string; user_id: string }>(
        'SELECT tenant_id, user_id FROM app_consume_password_reset_token_hash($1)',
        [resetHash],
      );
      expect(consumed.rows).toEqual([{ tenant_id: alpha.tenantId, user_id: alphaOwnerUserId }]);

      const consumedAgain = await client.query(
        'SELECT tenant_id, user_id FROM app_consume_password_reset_token_hash($1)',
        [resetHash],
      );
      expect(consumedAgain.rowCount).toBe(0);

      await client.query('SELECT app_revoke_session_by_token_hash($1)', [sessionHash]);
      const revoked = await client.query(
        'SELECT tenant_id, user_id FROM app_find_active_session_by_token_hash($1)',
        [sessionHash],
      );
      expect(revoked.rowCount).toBe(0);
    });
  });
});
