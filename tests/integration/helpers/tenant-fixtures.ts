import { createOwnerClient, withClient } from './db';

export interface TenantFixture {
  tenantId: string;
  slug: string;
  workspaceId: string;
  workspaceName: string;
}

export async function loadTenantFixtures(): Promise<{
  alpha: TenantFixture;
  beta: TenantFixture;
}> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      tenant_id: string;
      slug: string;
      workspace_id: string;
      workspace_name: string;
    }>(
      `
        SELECT t.tenant_id, t.slug, w.workspace_id, w.name AS workspace_name
        FROM tenants t
        JOIN workspaces w ON w.tenant_id = t.tenant_id
        WHERE t.slug IN ('tenant-alpha', 'tenant-beta')
        ORDER BY t.slug
      `,
    );

    const alpha = result.rows.find((row) => row.slug === 'tenant-alpha');
    const beta = result.rows.find((row) => row.slug === 'tenant-beta');
    if (!alpha || !beta) {
      throw new Error('tenant fixtures are missing; run pnpm db:seed');
    }

    return {
      alpha: {
        tenantId: alpha.tenant_id,
        slug: alpha.slug,
        workspaceId: alpha.workspace_id,
        workspaceName: alpha.workspace_name,
      },
      beta: {
        tenantId: beta.tenant_id,
        slug: beta.slug,
        workspaceId: beta.workspace_id,
        workspaceName: beta.workspace_name,
      },
    };
  });
}
