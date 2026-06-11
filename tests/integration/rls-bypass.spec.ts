import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, withClient } from './helpers/db';
import { loadTenantFixtures } from './helpers/tenant-fixtures';

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
});
