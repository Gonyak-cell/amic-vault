export type ProcessRole = 'api' | 'worker';

const truthyValues = new Set(['1', 'true', 'yes']);
const falsyValues = new Set(['0', 'false', 'no']);

export function setDefaultProcessRole(
  role: ProcessRole,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.PROCESS_ROLE ??= role;
}

export function currentProcessRole(env: NodeJS.ProcessEnv = process.env): ProcessRole {
  const configured = env.PROCESS_ROLE?.trim().toLowerCase();
  if (!configured) return 'api';
  if (configured === 'api' || configured === 'worker') return configured;
  throw new Error('PROCESS_ROLE_INVALID');
}

export function queueWorkerEnabled(
  legacyEnvName: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const legacyOverride = envBoolean(env[legacyEnvName]);
  if (legacyOverride !== undefined) return legacyOverride;
  return currentProcessRole(env) === 'worker';
}

function envBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return undefined;
}
