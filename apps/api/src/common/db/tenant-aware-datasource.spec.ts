import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextService } from '../../modules/tenant/tenant-context';
import { TenantAwareDataSource, type QueryClient } from './tenant-aware-datasource';

class FakeClient implements QueryClient {
  readonly queries: string[] = [];

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql);
    return {};
  }
}

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

describe('TenantAwareDataSource', () => {
  it('fails closed before running queries when tenant context is absent', async () => {
    const client = new FakeClient();
    const dataSource = new TenantAwareDataSource(new TenantContextService());

    await expect(dataSource.transaction(client, async () => undefined))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(client.queries).toEqual([]);
  });

  it('sets app.current_tenant_id inside the transaction boundary', async () => {
    const context = new TenantContextService();
    const client = new FakeClient();
    const dataSource = new TenantAwareDataSource(context);

    await context.run(
      { tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' },
      () => dataSource.transaction(client, async () => 'ok'),
    );

    expect(client.queries).toEqual(['BEGIN', 'SELECT set_config($1, $2, true)', 'COMMIT']);
  });
});
