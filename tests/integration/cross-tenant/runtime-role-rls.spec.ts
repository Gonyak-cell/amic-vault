import 'reflect-metadata';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { DatabaseService } from '../../../apps/api/src/common/db/database.service';
import { loadTenantFixtures } from '../helpers/tenant-fixtures';

describe('central runtime database service RLS', () => {
  let app: INestApplicationContext;
  let database: DatabaseService;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    database = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not expose a tenant-beta workspace inside a tenant-alpha transaction', async () => {
    const { alpha, beta } = await loadTenantFixtures();
    const own = await database.tenantTransaction(alpha.tenantId, (client) => client.query<{ workspace_id: string }>('SELECT workspace_id FROM workspaces WHERE workspace_id = $1', [alpha.workspaceId]));
    const crossTenant = await database.tenantTransaction(alpha.tenantId, (client) => client.query<{ workspace_id: string }>('SELECT workspace_id FROM workspaces WHERE workspace_id = $1', [beta.workspaceId]));
    expect(own.rows.map((row) => row.workspace_id)).toEqual([alpha.workspaceId]);
    expect(crossTenant.rows).toEqual([]);
  });
});
