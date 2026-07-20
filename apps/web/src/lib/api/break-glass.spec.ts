import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import {
  approveBreakGlassRequest,
  createBreakGlassRequest,
  listBreakGlassRequests,
  revokeBreakGlassRequest,
} from './break-glass';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ init, path })),
}));

describe('break glass API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists requests with an optional status filter', async () => {
    await listBreakGlassRequests({ status: 'pending' });

    expect(apiFetch).toHaveBeenCalledWith('/break-glass/requests?status=pending');
  });

  it('maps request, approval, and revoke actions to existing endpoints', async () => {
    await createBreakGlassRequest({
      wallId: '11111111-1111-4111-8111-111111111177',
      reasonCode: 'security_review',
      expiresAt: '2026-07-03T10:00:00+00:00',
    });
    await approveBreakGlassRequest('11111111-1111-4111-8111-111111111188');
    await revokeBreakGlassRequest('11111111-1111-4111-8111-111111111188', {
      reasonCode: 'security_review',
    });

    expect(apiFetch).toHaveBeenCalledWith('/break-glass/requests', {
      method: 'POST',
      body: JSON.stringify({
        wallId: '11111111-1111-4111-8111-111111111177',
        reasonCode: 'security_review',
        expiresAt: '2026-07-03T10:00:00+00:00',
      }),
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/break-glass/requests/11111111-1111-4111-8111-111111111188/approvals',
      {
        method: 'POST',
      },
    );
    expect(apiFetch).toHaveBeenCalledWith(
      '/break-glass/requests/11111111-1111-4111-8111-111111111188/revoke',
      {
        method: 'POST',
        body: JSON.stringify({ reasonCode: 'security_review' }),
      },
    );
  });
});
