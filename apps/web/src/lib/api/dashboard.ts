import type {
  DashboardAiPrepStatusDto,
  DashboardIntegrationStatusDto,
  DashboardOverviewDto,
  DashboardPolicyAlertDto,
  DashboardRecentActivityDto,
  DashboardRecentFileDto,
  DashboardSectionId,
  DashboardUsageStatsQueryDto,
  DashboardUsageStatsResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import { apiBaseUrl } from '../config';
import type { DataState } from '@/lib/data-state';
import { uiErrorStateForApiError } from './error-messages';

export type {
  DashboardAiPrepStatusDto as DashboardAiPrepStatus,
  DashboardIntegrationStatusDto as DashboardIntegrationStatus,
  DashboardPolicyAlertDto as DashboardPolicyAlert,
  DashboardRecentActivityDto as DashboardRecentActivity,
  DashboardRecentFileDto as DashboardRecentFile,
  DashboardSectionId,
  DashboardUsageStatsResponseDto as DashboardUsageStats,
};

export interface DashboardOverviewState {
  recentFiles: DataState<DashboardRecentFileDto[]>;
  recentActivity: DataState<DashboardRecentActivityDto[]>;
  permissionPolicyAlerts: DataState<DashboardPolicyAlertDto[]>;
  aiPrepStatus: DataState<DashboardAiPrepStatusDto[]>;
  integrationStatus: DataState<DashboardIntegrationStatusDto[]>;
  usageStats: DataState<DashboardUsageStatsResponseDto>;
}

export function createDashboardUnavailableState(): DashboardOverviewState {
  return {
    recentFiles: { status: 'unavailable' },
    recentActivity: { status: 'unavailable' },
    permissionPolicyAlerts: { status: 'unavailable' },
    aiPrepStatus: { status: 'unavailable' },
    integrationStatus: { status: 'unavailable' },
    usageStats: { status: 'unavailable' },
  };
}

function arrayState<T>(items: T[]): DataState<T[]> {
  return items.length > 0 ? { status: 'ready', data: items } : { status: 'empty' };
}

export function dashboardOverviewToState(
  overview: DashboardOverviewDto,
  usageStats: DataState<DashboardUsageStatsResponseDto> = { status: 'unavailable' },
): DashboardOverviewState {
  return {
    recentFiles: arrayState(overview.recentFiles),
    recentActivity: arrayState(overview.recentActivity),
    permissionPolicyAlerts: arrayState(overview.permissionPolicyAlerts),
    aiPrepStatus: arrayState(overview.aiPrepStatus),
    integrationStatus: arrayState(overview.integrationStatus),
    usageStats,
  };
}

export function dashboardErrorState(error: unknown): DashboardOverviewState {
  const { dataStatus, kind } = uiErrorStateForApiError(error);
  const message =
    kind === 'api' ? '운영 데이터 연결을 확인할 수 없습니다.' : '접근 권한을 확인할 수 없습니다.';
  return {
    recentFiles: { status: dataStatus, error: message },
    recentActivity: { status: dataStatus, error: message },
    permissionPolicyAlerts: { status: dataStatus, error: message },
    aiPrepStatus: { status: dataStatus, error: message },
    integrationStatus: { status: dataStatus, error: message },
    usageStats: { status: dataStatus, error: message },
  };
}

export function dashboardUsageStatsErrorState(
  error: unknown,
): DataState<DashboardUsageStatsResponseDto> {
  const { dataStatus, kind } = uiErrorStateForApiError(error);
  const message =
    kind === 'api'
      ? '사용 통계 연결을 확인할 수 없습니다.'
      : '사용 통계 접근 권한을 확인할 수 없습니다.';
  return { status: dataStatus, error: message };
}

function queryString(query: Partial<DashboardUsageStatsQueryDto> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

export function getDashboardOverview(): Promise<DashboardOverviewDto> {
  return apiFetch<DashboardOverviewDto>('/dashboard/overview', {
    redirectOnAuthRequired: false,
  });
}

export function getDashboardUsageStats(
  query: Partial<DashboardUsageStatsQueryDto> = {},
): Promise<DashboardUsageStatsResponseDto> {
  return apiFetch<DashboardUsageStatsResponseDto>(`/dashboard/usage-stats${queryString(query)}`, {
    redirectOnAuthRequired: false,
  });
}

export async function exportDashboardUsageStatsCsv(
  query: Partial<DashboardUsageStatsQueryDto> = {},
): Promise<string> {
  const response = await fetch(
    `${apiBaseUrl()}/dashboard/usage-stats/export.csv${queryString(query)}`,
    {
      cache: 'no-store',
      credentials: 'include',
    },
  );
  if (!response.ok) throw new Error('DASHBOARD_USAGE_STATS_EXPORT_FAILED');
  return response.text();
}
