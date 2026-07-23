import { describe, expect, it } from 'vitest';
import { createRuntimeDatabasePool } from './database.module';

describe('DatabaseModule runtime pool factory', () => {
  it('requires the dedicated runtime credential', () => {
    expect(() => createRuntimeDatabasePool({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_RUNTIME_URL_REQUIRED',
    );
  });

  it('creates a pool only from the dedicated runtime credential', async () => {
    const pool = createRuntimeDatabasePool({
      NODE_ENV: 'test',
      DATABASE_RUNTIME_URL: 'postgres://vault_app:test@localhost:55432/amic_vault',
    });

    await pool.end();
  });
});
