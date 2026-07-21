export type ProcessRole = 'api' | 'worker';

const truthyValues = new Set(['1', 'true', 'yes']);
const falsyValues = new Set(['0', 'false', 'no']);

export function setDefaultProcessRole(
  role: ProcessRole,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.PROCESS_ROLE ??= role;
}

export function queueWorkerEnabled(
  legacyEnvName: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const legacyOverride = envBoolean(env[legacyEnvName]);
  if (legacyOverride !== undefined) return legacyOverride;
  return env.PROCESS_ROLE?.trim().toLowerCase() === 'worker';
}

function envBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return undefined;
}
