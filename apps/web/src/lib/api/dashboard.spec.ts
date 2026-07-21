import { describe, expect, it, vi } from 'vitest';
import {
  dashboardErrorState,
  dashboardOverviewToState,
  dashboardUsageStatsErrorState,
  exportDashboardUsageStatsCsv,
  getDashboardOverview,
  getDashboardUsageStats,
} from './dashboard';
import { ApiClientError, apiFetch } from '../api-client';

vi.mock('../api-client', async () => {
  const actual = await vi.importActual<typeof import('../api-client')>('../api-client');
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
  };
});

describe('dashboard API client', () => {
  it('loads the dashboard overview without auth redirects', async () => {
    await getDashboardOverview();

    expect(apiFetch).toHaveBeenCalledWith('/dashboard/overview', {
      redirectOnAuthRequired: false,
    });
  });

  it('loads usage stats without auth redirects and exports CSV through the API base URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('section,label,value\nsummary,uploads,3')),
    );

    await getDashboardUsageStats({ from: '2026-06-01T00:00:00.000Z' });
    const csv = await exportDashboardUsageStatsCsv({ to: '2026-06-30T23:59:59.999Z' });

    expect(apiFetch).toHaveBeenCalledWith(
      '/dashboard/usage-stats?from=2026-06-01T00%3A00%3A00.000Z',
      {
        redirectOnAuthRequired: false,
      },
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/v1/dashboard/usage-stats/export.csv?to=2026-06-30T23%3A59%3A59.999Z',
      {
        cache: 'no-store',
        credentials: 'include',
      },
    );
    expect(csv).toContain('summary,uploads,3');
    vi.unstubAllGlobals();
  });

  it('maps successful overview arrays to ready or empty states', () => {
    const state = dashboardOverviewToState({
      generatedAt: '2026-06-17T00:00:00.000Z',
      recentFiles: [{ title: 'Board minutes' }],
      recentActivity: [],
      permissionPolicyAlerts: [],
      aiPrepStatus: [],
      integrationStatus: [],
    });

    expect(state.recentFiles).toEqual({ status: 'ready', data: [{ title: 'Board minutes' }] });
    expect(state.recentActivity).toEqual({ status: 'empty' });
    expect(state.usageStats.status).toBe('unavailable');
  });

  it('maps permission API failures to fail-closed dashboard sections', () => {
    const error = new ApiClientError(403, { code: 'PERMISSION_DENIED' });
    const state = dashboardErrorState(error);

    expect(state.recentFiles.status).toBe('forbidden');
    expect(state.integrationStatus.status).toBe('forbidden');
    expect(dashboardUsageStatsErrorState(error).status).toBe('forbidden');
  });
});
