import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const defaultMaximumBytes = 16 * 1024;
const productionSecretRoot = '/run/secrets';
const knownDevelopmentValues = new Set([
  'amic-vault-minio',
  'amic-vault-minio-dev-password',
  'amic_vault_dev_password',
  'vault_app_dev_password',
  'changeme',
  'development',
  'example',
]);

export class RuntimeSecretError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RuntimeSecretError';
  }
}

interface RuntimeFileOptions {
  confidential?: boolean;
  expectedUid?: number;
  maximumBytes?: number;
  productionRoot?: string;
}

function fail(code: string): never {
  throw new RuntimeSecretError(code);
}

function inside(root: string, path: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath !== resolvedRoot && dirname(resolvedPath) === resolvedRoot;
}

function assertSafeValue(name: string, value: string, rejectDevelopmentValue: boolean): void {
  const normalized = value.trim().toLowerCase();
  if (
    !value ||
    value.includes('\0') ||
    (rejectDevelopmentValue &&
      (knownDevelopmentValues.has(normalized) ||
        normalized.includes('_dev_password') ||
        normalized.includes('-dev-password')))
  ) {
    fail(`${name}_VALUE_INVALID`);
  }
}

export function readRuntimeFile(
  name: string,
  path: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeFileOptions = {},
): Buffer {
  const production = env.NODE_ENV === 'production';
  const maximumBytes = options.maximumBytes ?? defaultMaximumBytes;
  const root = options.productionRoot ?? productionSecretRoot;
  if (!path) fail(`${name}_REQUIRED`);
  if (path.includes('\0') || !isAbsolute(path) || (production && !inside(root, path))) {
    fail(`${name}_PATH_INVALID`);
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 1024 * 1024) {
    fail(`${name}_POLICY_INVALID`);
  }

  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 1 || stat.size > maximumBytes) {
      fail(`${name}_FILE_INVALID`);
    }
    if (production) {
      const expectedUid = options.expectedUid ?? process.getuid?.();
      if (stat.uid !== 0 && (expectedUid === undefined || stat.uid !== expectedUid)) {
        fail(`${name}_OWNER_INVALID`);
      }
      const permissionBits = stat.mode & 0o777;
      if (options.confidential !== false) {
        if ((permissionBits & 0o077) !== 0 || (permissionBits & 0o400) === 0) {
          fail(`${name}_PERMISSIONS_INVALID`);
        }
      } else if ((permissionBits & 0o022) !== 0 || (permissionBits & 0o444) === 0) {
        fail(`${name}_PERMISSIONS_INVALID`);
      }
    }
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytesRead < 1 || bytesRead > maximumBytes) fail(`${name}_FILE_INVALID`);
    return buffer.subarray(0, bytesRead);
  } catch (error) {
    if (error instanceof RuntimeSecretError) throw error;
    fail(`${name}_FILE_INVALID`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return fail(`${name}_FILE_INVALID`);
}

export function runtimeSecretValue(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeFileOptions = {},
): string {
  const direct = env[name]?.trim();
  const production = env.NODE_ENV === 'production';
  if (production && direct) fail(`${name}_DIRECT_ENV_FORBIDDEN`);
  if (!production && direct) {
    assertSafeValue(name, direct, false);
    return direct;
  }

  const raw = readRuntimeFile(name, env[`${name}_FILE`], env, options).toString('utf8');
  const value = raw.replace(/\r?\n$/u, '');
  assertSafeValue(name, value, production);
  return value;
}
