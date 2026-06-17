import type {
  DashboardAiPrepStatusDto,
  DashboardIntegrationStatusDto,
  DashboardOverviewDto,
  DashboardPolicyAlertDto,
  DashboardRecentActivityDto,
  DashboardRecentFileDto,
  DashboardSectionId,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import type { DataState } from '@/lib/data-state';
import { uiErrorStateForApiError } from './error-messages';

export type {
  DashboardAiPrepStatusDto as DashboardAiPrepStatus,
  DashboardIntegrationStatusDto as DashboardIntegrationStatus,
  DashboardPolicyAlertDto as DashboardPolicyAlert,
  DashboardRecentActivityDto as DashboardRecentActivity,
  DashboardRecentFileDto as DashboardRecentFile,
  DashboardSectionId,
};

export interface DashboardOverviewState {
  recentFiles: DataState<DashboardRecentFileDto[]>;
  recentActivity: DataState<DashboardRecentActivityDto[]>;
  permissionPolicyAlerts: DataState<DashboardPolicyAlertDto[]>;
  aiPrepStatus: DataState<DashboardAiPrepStatusDto[]>;
  integrationStatus: DataState<DashboardIntegrationStatusDto[]>;
}

export function createDashboardUnavailableState(): DashboardOverviewState {
  return {
    recentFiles: { status: 'unavailable' },
    recentActivity: { status: 'unavailable' },
    permissionPolicyAlerts: { status: 'unavailable' },
    aiPrepStatus: { status: 'unavailable' },
    integrationStatus: { status: 'unavailable' },
  };
}

function arrayState<T>(items: T[]): DataState<T[]> {
  return items.length > 0 ? { status: 'ready', data: items } : { status: 'empty' };
}

export function dashboardOverviewToState(overview: DashboardOverviewDto): DashboardOverviewState {
  return {
    recentFiles: arrayState(overview.recentFiles),
    recentActivity: arrayState(overview.recentActivity),
    permissionPolicyAlerts: arrayState(overview.permissionPolicyAlerts),
    aiPrepStatus: arrayState(overview.aiPrepStatus),
    integrationStatus: arrayState(overview.integrationStatus),
  };
}

export function dashboardErrorState(error: unknown): DashboardOverviewState {
  const { dataStatus, kind } = uiErrorStateForApiError(error);
  const message = kind === 'api' ? '운영 데이터 연결을 확인할 수 없습니다.' : '접근 권한을 확인할 수 없습니다.';
  return {
    recentFiles: { status: dataStatus, error: message },
    recentActivity: { status: dataStatus, error: message },
    permissionPolicyAlerts: { status: dataStatus, error: message },
    aiPrepStatus: { status: dataStatus, error: message },
    integrationStatus: { status: dataStatus, error: message },
  };
}

export function getDashboardOverview(): Promise<DashboardOverviewDto> {
  return apiFetch<DashboardOverviewDto>('/dashboard/overview', {
    redirectOnAuthRequired: false,
  });
}
