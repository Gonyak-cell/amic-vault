import type { DataState } from '@/lib/data-state';

export type DashboardSectionId =
  | 'recentFiles'
  | 'recentActivity'
  | 'permissionPolicyAlerts'
  | 'aiPrepStatus'
  | 'integrationStatus';

export interface DashboardRecentFile {
  title: string;
  matterLabel?: string;
  lastAccessedAt?: string;
}

export interface DashboardRecentActivity {
  actionLabel: string;
  targetLabel: string;
  resultLabel: string;
  occurredAt: string;
}

export interface DashboardPolicyAlert {
  title: string;
  description: string;
}

export interface DashboardAiPrepStatus {
  matterLabel: string;
  statusLabel: string;
}

export interface DashboardIntegrationStatus {
  integrationLabel: string;
  statusLabel: string;
}

export interface DashboardOverviewState {
  recentFiles: DataState<DashboardRecentFile[]>;
  recentActivity: DataState<DashboardRecentActivity[]>;
  permissionPolicyAlerts: DataState<DashboardPolicyAlert[]>;
  aiPrepStatus: DataState<DashboardAiPrepStatus[]>;
  integrationStatus: DataState<DashboardIntegrationStatus[]>;
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
