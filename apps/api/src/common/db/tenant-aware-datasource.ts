import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../modules/tenant/tenant-context';

export interface QueryClient {
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
}

@Injectable()
export class TenantAwareDataSource {
  constructor(private readonly tenantContext: TenantContextService) {}

  async transaction<T>(client: QueryClient, work: (client: QueryClient) => Promise<T>): Promise<T> {
    const context = this.tenantContext.current();
    if (!context) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    await client.query('BEGIN');
    try {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        context.tenantId,
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
