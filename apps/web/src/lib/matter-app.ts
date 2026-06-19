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

export interface MatterAppSourceStatus {
  mode: MatterAppSourceMode;
  label: string;
  description: string;
  sourceConfigured: boolean;
  sourceAvailable: boolean;
  uploadAuthoritative: boolean;
  productionRuntime: boolean;
  projectionFallbackAllowed: boolean;
}

export const matterAppSourceLabels = {
  unconfigured: '연결 필요',
  matter_app_api: 'Matter app 확인됨',
  matter_app_event_projection: 'Matter app 동기화됨',
  vault_projection_only: '로컬 Matter 목록',
} as const satisfies Record<MatterAppSourceMode, string>;

export const matterAppSourceDescriptions = {
  unconfigured: 'Matter app에서 확인된 Matter Code를 사용할 수 있을 때 업로드할 수 있습니다.',
  matter_app_api: 'Matter app에서 확인된 Matter Code 기준으로 파일 작업을 진행합니다.',
  matter_app_event_projection: 'Matter app 동기화 데이터 기준으로 파일 작업을 진행합니다.',
  vault_projection_only: '개발/검증용 로컬 목록입니다. 운영 업로드 source로 사용하지 않습니다.',
} as const satisfies Record<MatterAppSourceMode, string>;

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

export function matterAppSourceStatus(
  options: {
    sourceMode?: string | undefined;
    sourceConfigured?: string | undefined;
    projectionFallbackAllowed?: string | undefined;
    nodeEnv?: string | undefined;
  } = {},
): MatterAppSourceStatus {
  const requestedMode = matterAppSourceModes.includes(options.sourceMode as MatterAppSourceMode)
    ? (options.sourceMode as MatterAppSourceMode)
    : 'unconfigured';
  const sourceConfigured = envFlagEnabled(
    options.sourceConfigured ?? process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED,
  );
  const projectionFallbackAllowed = envFlagEnabled(
    options.projectionFallbackAllowed ??
      process.env.NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE,
  );
  const productionRuntime = (options.nodeEnv ?? process.env.NODE_ENV) === 'production';
  const mode = isMatterAppSourceConfigured(requestedMode, {
    sourceConfigured: sourceConfigured ? 'true' : 'false',
    projectionFallbackAllowed: projectionFallbackAllowed ? 'true' : 'false',
    nodeEnv: productionRuntime ? 'production' : 'development',
  })
    ? requestedMode
    : 'unconfigured';

  return {
    mode,
    label: matterAppSourceLabels[mode],
    description: matterAppSourceDescriptions[mode],
    sourceConfigured,
    sourceAvailable: mode !== 'unconfigured' && (mode !== 'vault_projection_only' || !productionRuntime),
    uploadAuthoritative: isMatterUploadSourceMode(mode),
    productionRuntime,
    projectionFallbackAllowed,
  };
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
