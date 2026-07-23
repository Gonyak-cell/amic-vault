import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRuntimeFile, RuntimeSecretError, runtimeSecretValue } from './runtime-secret';

let root = '';

function secretFile(name = 'secret', value = 'synthetic-production-value'): string {
  const path = join(root, name);
  writeFileSync(path, `${value}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function productionEnv(name: string, path: string): NodeJS.ProcessEnv {
  return { NODE_ENV: 'production', [`${name}_FILE`]: path };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amic-vault-runtime-secret-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('runtime secret reader', () => {
  it('keeps direct development values but requires a bounded file in production', () => {
    expect(
      runtimeSecretValue('DATABASE_RUNTIME_URL', {
        NODE_ENV: 'test',
        DATABASE_RUNTIME_URL:
          'postgres://vault_app:vault_app_dev_password@localhost:5432/amic_vault',
      }),
    ).toBe('postgres://vault_app:vault_app_dev_password@localhost:5432/amic_vault');
    const path = secretFile('database-url', 'postgres://vault_app:synthetic@db/vault');
    const env = productionEnv('DATABASE_RUNTIME_URL', path);

    expect(
      runtimeSecretValue('DATABASE_RUNTIME_URL', env, {
        productionRoot: root,
        ...(process.getuid ? { expectedUid: process.getuid() } : {}),
      }),
    ).toBe('postgres://vault_app:synthetic@db/vault');
    expect(env.DATABASE_RUNTIME_URL).toBeUndefined();
  });

  it('rejects direct production values and omits the value from the error', () => {
    const canary = 'DO_NOT_ECHO_RUNTIME_SECRET_CANARY';
    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', {
        NODE_ENV: 'production',
        DATABASE_RUNTIME_URL: canary,
      }),
    ).toThrow('DATABASE_RUNTIME_URL_DIRECT_ENV_FORBIDDEN');
    try {
      runtimeSecretValue('DATABASE_RUNTIME_URL', {
        NODE_ENV: 'production',
        DATABASE_RUNTIME_URL: canary,
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(canary);
    }
  });

  it('rejects missing outside symlink directory weak-mode and wrong-owner inputs', () => {
    expect(() =>
      runtimeSecretValue(
        'DATABASE_RUNTIME_URL',
        { NODE_ENV: 'production' },
        { productionRoot: root },
      ),
    ).toThrow('DATABASE_RUNTIME_URL_REQUIRED');

    const outside = secretFile('outside');
    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', productionEnv('DATABASE_RUNTIME_URL', outside), {
        productionRoot: join(root, 'nested'),
      }),
    ).toThrow('DATABASE_RUNTIME_URL_PATH_INVALID');

    const target = secretFile('target');
    const link = join(root, 'link');
    symlinkSync(target, link);
    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', productionEnv('DATABASE_RUNTIME_URL', link), {
        productionRoot: root,
      }),
    ).toThrow('DATABASE_RUNTIME_URL_FILE_INVALID');

    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', productionEnv('DATABASE_RUNTIME_URL', root), {
        productionRoot: tmpdir(),
      }),
    ).toThrow('DATABASE_RUNTIME_URL_FILE_INVALID');

    const fifo = join(root, 'fifo');
    execFileSync('mkfifo', [fifo]);
    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', productionEnv('DATABASE_RUNTIME_URL', fifo), {
        productionRoot: root,
      }),
    ).toThrow('DATABASE_RUNTIME_URL_FILE_INVALID');

    const weak = secretFile('weak');
    chmodSync(weak, 0o644);
    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', productionEnv('DATABASE_RUNTIME_URL', weak), {
        productionRoot: root,
      }),
    ).toThrow('DATABASE_RUNTIME_URL_PERMISSIONS_INVALID');

    const owned = secretFile('owned');
    expect(() =>
      runtimeSecretValue('DATABASE_RUNTIME_URL', productionEnv('DATABASE_RUNTIME_URL', owned), {
        productionRoot: root,
        expectedUid: (process.getuid?.() ?? 0) + 1000,
      }),
    ).toThrow('DATABASE_RUNTIME_URL_OWNER_INVALID');
  });

  it('rejects oversized NUL and known development defaults', () => {
    const oversized = secretFile('oversized', 'x'.repeat(33));
    expect(() =>
      runtimeSecretValue('S3_SECRET_ACCESS_KEY', productionEnv('S3_SECRET_ACCESS_KEY', oversized), {
        productionRoot: root,
        maximumBytes: 32,
      }),
    ).toThrow('S3_SECRET_ACCESS_KEY_FILE_INVALID');

    const nul = secretFile('nul', 'safe\0unsafe');
    expect(() =>
      runtimeSecretValue('S3_SECRET_ACCESS_KEY', productionEnv('S3_SECRET_ACCESS_KEY', nul), {
        productionRoot: root,
      }),
    ).toThrow('S3_SECRET_ACCESS_KEY_VALUE_INVALID');

    const development = secretFile('development', 'amic-vault-minio-dev-password');
    expect(() =>
      runtimeSecretValue(
        'S3_SECRET_ACCESS_KEY',
        productionEnv('S3_SECRET_ACCESS_KEY', development),
        { productionRoot: root },
      ),
    ).toThrow('S3_SECRET_ACCESS_KEY_VALUE_INVALID');
  });

  it('allows a non-secret public certificate to be read-only for all users', () => {
    const certificate = secretFile('public.crt', 'synthetic-public-certificate');
    chmodSync(certificate, 0o444);
    expect(
      readRuntimeFile(
        'INGESTION_GATEWAY_CA_FILE',
        certificate,
        { NODE_ENV: 'production' },
        {
          confidential: false,
          productionRoot: root,
          ...(process.getuid ? { expectedUid: process.getuid() } : {}),
        },
      ).toString('utf8'),
    ).toContain('synthetic-public-certificate');
  });

  it('uses bounded enumerable errors only', () => {
    try {
      runtimeSecretValue('MFA_SECRET_ENCRYPTION_KEY', { NODE_ENV: 'production' });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeSecretError);
      expect((error as RuntimeSecretError).code).toBe('MFA_SECRET_ENCRYPTION_KEY_REQUIRED');
    }
  });
});
