import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { QueryClient as AuditQueryClient } from '../../modules/audit/audit.service';
import { TenantContextService } from '../../modules/tenant/tenant-context';
import { DatabaseService, type DatabasePool } from './database.service';
import { TenantAwareDataSource } from './tenant-aware-datasource';

const tenantId = '11111111-1111-4111-8111-111111111111';

class FakeClient {
  readonly queries: string[] = [];
  readonly params: Array<readonly unknown[] | undefined> = [];
  readonly release = vi.fn();
  readonly rows: unknown[] = [];

  async query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number | null }> {
    this.queries.push(sql);
    this.params.push(params);
    return { rows: this.rows as T[], rowCount: this.rows.length };
  }
}

class FakePool implements DatabasePool {
  readonly client = new FakeClient();
  readonly clients = [this.client];
  readonly end = vi.fn(async () => undefined);
  private nextClientIndex = 0;
  readonly connect = vi.fn(async () => {
    const client = this.clients[this.nextClientIndex] ?? new FakeClient();
    if (this.nextClientIndex === this.clients.length) this.clients.push(client);
    this.nextClientIndex += 1;
    return client as unknown as PoolClient;
  });
  private errorListener: ((error: Error) => void) | undefined;

  on(event: 'error', listener: (error: Error) => void): void {
    if (event === 'error') this.errorListener = listener;
  }

  fail(error = new Error('pool failed')): void {
    this.errorListener?.(error);
  }
}

function createService(pool = new FakePool()): { pool: FakePool; service: DatabaseService } {
  return { pool, service: new DatabaseService(pool, new TenantAwareDataSource(new TenantContextService())) };
}

describe('DatabaseService', () => {
  it('commits tenant work with a transaction-local GUC and releases the client', async () => {
    const { pool, service } = createService();
    await expect(service.tenantTransaction(tenantId, async () => 'ok')).resolves.toBe('ok');
    expect(pool.client.queries).toEqual(['BEGIN', 'SELECT set_config($1, $2, true)', 'COMMIT']);
    expect(pool.client.params[1]).toEqual(['app.current_tenant_id', tenantId]);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases when tenant work fails', async () => {
    const { pool, service } = createService();
    await expect(service.tenantTransaction(tenantId, async () => { throw new Error('expected test failure'); })).rejects.toThrow('expected test failure');
    expect(pool.client.queries).toEqual(['BEGIN', 'SELECT set_config($1, $2, true)', 'ROLLBACK']);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  it('permits an explicit repeatable-read tenant transaction without weakening the tenant GUC', async () => {
    const { pool, service } = createService();
    await expect(
      service.tenantTransaction(tenantId, async () => 'ok', { isolationLevel: 'repeatable read' }),
    ).resolves.toBe('ok');
    expect(pool.client.queries).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
      'SELECT set_config($1, $2, true)',
      'COMMIT',
    ]);
  });

  it('reuses the active client only for same-tenant nested work and rejects cross-tenant nesting', async () => {
    const { pool, service } = createService();
    await expect(service.tenantTransaction(' ', async () => undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await service.tenantTransaction(tenantId, async (outerClient) => {
      await service.tenantTransaction(tenantId, async (innerClient) => {
        expect(innerClient).toBe(outerClient);
        await innerClient.query('SELECT 1');
      });
      await expect(
        service.tenantTransaction('22222222-2222-4222-8222-222222222222', async () => undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
    expect(pool.client.queries).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'SELECT 1',
      'COMMIT',
    ]);
  });

  it('commits a named denial audit when the enclosing business transaction rolls back', async () => {
    const { pool, service } = createService();
    await expect(
      service.tenantTransaction(tenantId, async (businessClient) => {
        await service.auditTransaction(tenantId, async (auditClient) => {
          expect(auditClient).not.toBe(businessClient);
          await auditClient.query('INSERT ACCESS_DENIED');
        });
        throw new Error('safe denial');
      }),
    ).rejects.toThrow('safe denial');
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(pool.client.queries).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'ROLLBACK',
    ]);
    expect(pool.clients[1]?.queries).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'INSERT ACCESS_DENIED',
      'COMMIT',
    ]);
  });

  it('fails closed after an unexpected pool error', async () => {
    const { pool, service } = createService();
    pool.fail();
    await expect(service.tenantTransaction(tenantId, async () => undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('allows AuditService-compatible query clients without exporting a raw pool', async () => {
    const { service } = createService();
    let auditClient: AuditQueryClient | undefined;
    await service.tenantTransaction(tenantId, async (client) => { auditClient = client; await client.query('SELECT 1'); });
    expect(auditClient).toBeDefined();
  });

  it('exposes only the named boolean cross-tenant client classifier', async () => {
    const { pool, service } = createService();
    pool.client.rows.push({ exists: true });

    await expect(service.clientExistsAnyTenant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).resolves.toBe(
      true,
    );
    expect(pool.client.queries).toEqual(['SELECT app_client_exists_any_tenant($1) AS exists']);
  });

  it('resolves an external capability token only through its named bounded function', async () => {
    const { pool, service } = createService();
    pool.client.rows.push({ link_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenant_id: tenantId });

    await expect(service.findExternalLinkByTokenHash('a'.repeat(64))).resolves.toMatchObject({
      link_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenant_id: tenantId,
    });
    expect(pool.client.queries).toEqual(['SELECT * FROM app_find_external_link_by_token_hash($1)']);
  });

  it('returns only aggregate PgBoss counts from a bounded named query', async () => {
    const { pool, service } = createService();
    pool.client.rows.push({ queue: 'ai-prep', depth: '2', dead_letter_count: '1' });

    await expect(
      service.readPgBossQueueMetrics([
        { queue: 'ai-prep', mainQueue: 'ai.prep', deadLetterQueue: 'ai.prep.dead' },
      ]),
    ).resolves.toEqual([{ queue: 'ai-prep', depth: '2', dead_letter_count: '1' }]);
    expect(pool.client.queries[0]).toContain('LEFT JOIN "pgboss"."job"');
    expect(pool.client.queries[0]).not.toContain('data');
  });

  it('closes each singleton pool exactly once across 50 create/close loops', async () => {
    const pools: FakePool[] = [];
    for (let index = 0; index < 50; index += 1) {
      const pool = new FakePool();
      const service = createService(pool).service;
      pools.push(pool);
      await service.tenantTransaction(tenantId, async () => undefined);
      await service.onModuleDestroy();
      await service.onModuleDestroy();
    }
    expect(pools.every((pool) => pool.client.release.mock.calls.length === 1)).toBe(true);
    expect(pools.every((pool) => pool.end.mock.calls.length === 1)).toBe(true);
  });
});
