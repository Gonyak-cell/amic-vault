import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeDatabasePool } from './database.module';

const originalRuntimeUrl = process.env.DATABASE_RUNTIME_URL;

describe('DatabaseModule runtime pool factory', () => {
  afterEach(() => {
    if (originalRuntimeUrl === undefined) {
      delete process.env.DATABASE_RUNTIME_URL;
    } else {
      process.env.DATABASE_RUNTIME_URL = originalRuntimeUrl;
    }
  });

  it('requires the dedicated runtime credential', () => {
    delete process.env.DATABASE_RUNTIME_URL;

    expect(() => createRuntimeDatabasePool()).toThrow('DATABASE_RUNTIME_URL_REQUIRED');
  });

  it('creates a pool only from the dedicated runtime credential', async () => {
    process.env.DATABASE_RUNTIME_URL = 'postgres://vault_app:test@localhost:55432/amic_vault';
    const pool = createRuntimeDatabasePool();

    await pool.end();
  });
});
