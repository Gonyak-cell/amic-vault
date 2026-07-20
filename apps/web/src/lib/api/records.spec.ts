import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import {
  approveDisposalRequest,
  createDisposalRequest,
  listDisposalRequests,
} from './records';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ init, path })),
}));

describe('records API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps disposal list and actions to records endpoints', async () => {
    await listDisposalRequests();
    await createDisposalRequest({
      documentId: '11111111-1111-4111-8111-111111111133',
      reasonCode: 'CLIENT_RECORDS',
    });
    await approveDisposalRequest('11111111-1111-4111-8111-111111111166');

    expect(apiFetch).toHaveBeenCalledWith('/records/disposals');
    expect(apiFetch).toHaveBeenCalledWith('/records/disposals', {
      method: 'POST',
      body: JSON.stringify({
        documentId: '11111111-1111-4111-8111-111111111133',
        reasonCode: 'CLIENT_RECORDS',
      }),
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/records/disposals/11111111-1111-4111-8111-111111111166/approve',
      { method: 'POST' },
    );
  });
});
