import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextService } from '../../modules/tenant/tenant-context';
import { TenantAwareDataSource, type QueryClient } from './tenant-aware-datasource';

class FakeClient implements QueryClient {
  readonly queries: string[] = [];
  readonly params: Array<readonly unknown[] | undefined> = [];

  async query(sql: string, params?: readonly unknown[]): Promise<unknown> {
    this.queries.push(sql);
    this.params.push(params);
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
    expect(client.params[1]).toEqual(['app.current_tenant_id', tenantId]);
  });

  it('uses the supplied tenant only inside the transaction-local GUC', async () => {
    const client = new FakeClient();
    const dataSource = new TenantAwareDataSource(new TenantContextService());
    await dataSource.transactionForTenant(client, tenantId, async () => 'ok');
    expect(client.queries).toEqual(['BEGIN', 'SELECT set_config($1, $2, true)', 'COMMIT']);
    expect(client.params[1]).toEqual(['app.current_tenant_id', tenantId]);
  });

  it('fails closed for a missing explicit tenant before beginning a transaction', async () => {
    const client = new FakeClient();
    const dataSource = new TenantAwareDataSource(new TenantContextService());
    await expect(dataSource.transactionForTenant(client, '   ', async () => undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.queries).toEqual([]);
  });

  it('rolls back when tenant work fails', async () => {
    const client = new FakeClient();
    const dataSource = new TenantAwareDataSource(new TenantContextService());
    await expect(dataSource.transactionForTenant(client, tenantId, async () => { throw new Error('expected test failure'); })).rejects.toThrow('expected test failure');
    expect(client.queries).toEqual(['BEGIN', 'SELECT set_config($1, $2, true)', 'ROLLBACK']);
  });
});
