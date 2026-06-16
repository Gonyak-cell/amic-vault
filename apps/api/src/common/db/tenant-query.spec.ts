import { describe, expect, it, vi } from 'vitest';
import { tenantQuery } from './tenant-query';

describe('tenantQuery', () => {
  it('sets the tenant RLS context before running the query', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ ok: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    };

    const result = await tenantQuery(
      pool as never,
      '11111111-1111-4111-8111-111111111111',
      'SELECT ok FROM tenant_table WHERE tenant_id = $1',
      ['11111111-1111-4111-8111-111111111111'],
    );

    expect(result.rows).toEqual([{ ok: true }]);
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(query).toHaveBeenNthCalledWith(3, 'SELECT ok FROM tenant_table WHERE tenant_id = $1', [
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(query).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the client when the tenant-scoped query fails', async () => {
    const error = new Error('query failed');
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    };

    await expect(
      tenantQuery(pool as never, '11111111-1111-4111-8111-111111111111', 'SELECT fail'),
    ).rejects.toThrow('query failed');

    expect(query).toHaveBeenNthCalledWith(4, 'ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });
});
