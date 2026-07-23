import { describe, expect, it } from 'vitest';
import { assertRuntimeRole, configureRuntimeDatabaseUrl } from './runtime-role.assertion';

const allowedRole = {
  current_user: 'vault_app',
  rolsuper: false,
  rolbypassrls: false,
  owns_protected_table: false,
};

describe('runtime database role assertion', () => {
  it('requires an explicit runtime URL without copying it into legacy environment keys', () => {
    expect(() =>
      configureRuntimeDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: 'owner-url' }),
    ).toThrow('DATABASE_RUNTIME_URL_REQUIRED');
    const env = {
      NODE_ENV: 'test',
      DATABASE_URL: 'owner-url',
      DATABASE_RUNTIME_URL: 'postgres://vault_app:test@db/vault',
    };
    expect(configureRuntimeDatabaseUrl(env)).toBe('postgres://vault_app:test@db/vault');
    expect(env.DATABASE_URL).toBe('owner-url');
  });

  it('accepts only a non-owner, non-superuser, non-bypass runtime role', async () => {
    await assertRuntimeRole({ query: async () => ({ rows: [allowedRole] }) });
    for (const invalid of [
      { ...allowedRole, current_user: 'amic_vault' },
      { ...allowedRole, rolsuper: true },
      { ...allowedRole, rolbypassrls: true },
      { ...allowedRole, owns_protected_table: true },
    ]) {
      await expect(assertRuntimeRole({ query: async () => ({ rows: [invalid] }) })).rejects.toThrow(
        'RUNTIME_DATABASE_ROLE_INVALID',
      );
    }
  });

  it('fails closed when role inspection returns no row', async () => {
    await expect(assertRuntimeRole({ query: async () => ({ rows: [] }) })).rejects.toThrow(
      'RUNTIME_DATABASE_ROLE_INVALID',
    );
  });
});
