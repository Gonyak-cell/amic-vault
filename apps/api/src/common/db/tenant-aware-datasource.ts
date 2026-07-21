import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../modules/tenant/tenant-context';

export interface QueryClient {
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
}

@Injectable()
export class TenantAwareDataSource {
  constructor(private readonly tenantContext: TenantContextService) {}

  async transaction<T, Client extends QueryClient>(
    client: Client,
    work: (client: Client) => Promise<T>,
  ): Promise<T> {
    const context = this.tenantContext.current();
    if (!context) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    return this.transactionForTenant(client, context.tenantId, work);
  }

  async transactionForTenant<T, Client extends QueryClient>(
    client: Client,
    tenantId: string,
    work: (client: Client) => Promise<T>,
  ): Promise<T> {
    if (!tenantId.trim()) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    await client.query('BEGIN');
    try {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        tenantId,
      ]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}
