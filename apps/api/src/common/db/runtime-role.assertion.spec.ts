import { describe, expect, it } from 'vitest';
import { assertRuntimeRole, configureRuntimeDatabaseUrl } from './runtime-role.assertion';

const allowedRole = {
  current_user: 'vault_app',
  rolsuper: false,
  rolbypassrls: false,
  owns_protected_table: false,
};

describe('runtime database role assertion', () => {
  it('requires an explicit runtime URL and bridges only that URL to legacy consumers', () => {
    expect(() => configureRuntimeDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: 'owner-url' })).toThrow('DATABASE_RUNTIME_URL_REQUIRED');
    const env = { NODE_ENV: 'production', DATABASE_URL: 'owner-url', DATABASE_RUNTIME_URL: 'runtime-url' };
    expect(configureRuntimeDatabaseUrl(env)).toBe('runtime-url');
    expect(env.DATABASE_URL).toBe('runtime-url');
  });

  it('accepts only a non-owner, non-superuser, non-bypass runtime role', async () => {
    await assertRuntimeRole({ query: async () => ({ rows: [allowedRole] }) });
    for (const invalid of [
      { ...allowedRole, current_user: 'amic_vault' },
      { ...allowedRole, rolsuper: true },
      { ...allowedRole, rolbypassrls: true },
      { ...allowedRole, owns_protected_table: true },
    ]) {
      await expect(assertRuntimeRole({ query: async () => ({ rows: [invalid] }) })).rejects.toThrow('RUNTIME_DATABASE_ROLE_INVALID');
    }
  });

  it('fails closed when role inspection returns no row', async () => {
    await expect(assertRuntimeRole({ query: async () => ({ rows: [] }) })).rejects.toThrow('RUNTIME_DATABASE_ROLE_INVALID');
  });
});
