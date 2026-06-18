import type { MatterDto } from '@amic-vault/shared';

export const matterAppSourceModes = [
  'unconfigured',
  'matter_app_api',
  'matter_app_event_projection',
  'vault_projection_only',
] as const;

export type MatterAppSourceMode = (typeof matterAppSourceModes)[number];

export interface MatterCodeOption {
  matterReference: string;
  matterCode: string;
  matterName: string;
  status: string;
  practiceGroup: string | null;
  sourceMode: MatterAppSourceMode;
}

function envFlagEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isMatterAppSourceConfigured(
  mode: MatterAppSourceMode,
  options: {
    sourceConfigured?: string | undefined;
    projectionFallbackAllowed?: string | undefined;
    nodeEnv?: string | undefined;
  } = {},
): boolean {
  if (mode === 'unconfigured') return false;
  if (mode === 'matter_app_api' || mode === 'matter_app_event_projection') {
    return envFlagEnabled(options.sourceConfigured ?? process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED);
  }
  return (
    !((options.nodeEnv ?? process.env.NODE_ENV) === 'production') &&
    envFlagEnabled(
      options.projectionFallbackAllowed ??
        process.env.NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE,
    )
  );
}

export function matterAppSourceMode(): MatterAppSourceMode {
  const value = process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_MODE;
  const mode = matterAppSourceModes.includes(value as MatterAppSourceMode)
    ? (value as MatterAppSourceMode)
    : 'unconfigured';
  return isMatterAppSourceConfigured(mode) ? mode : 'unconfigured';
}

export function isMatterAppSourceAvailable(mode: MatterAppSourceMode): boolean {
  return mode !== 'unconfigured' && (mode !== 'vault_projection_only' || !isProductionRuntime());
}

export function isMatterUploadSourceMode(mode: MatterAppSourceMode): boolean {
  return mode === 'matter_app_api' || mode === 'matter_app_event_projection';
}

export function toMatterCodeOption(
  matter: MatterDto,
  sourceMode: MatterAppSourceMode,
): MatterCodeOption {
  return {
    matterReference: matter.matterId,
    matterCode: matter.matterCode,
    matterName: matter.matterName,
    status: matter.status,
    practiceGroup: matter.practiceGroup,
    sourceMode,
  };
}

export function filterMatterCodeOptions(
  options: readonly MatterCodeOption[],
  query: string,
): MatterCodeOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...options];
  return options.filter((option) =>
    [option.matterCode, option.matterName, option.practiceGroup ?? '']
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
}
