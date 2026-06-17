import { describe, expect, it, vi } from 'vitest';
import {
  dashboardErrorState,
  dashboardOverviewToState,
  getDashboardOverview,
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
  });

  it('maps permission API failures to fail-closed dashboard sections', () => {
    const error = new ApiClientError(403, { code: 'PERMISSION_DENIED' });
    const state = dashboardErrorState(error);

    expect(state.recentFiles.status).toBe('forbidden');
    expect(state.integrationStatus.status).toBe('forbidden');
  });
});
