import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from './api-client';

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses standard error code responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'AUTH_REQUIRED', requestId: 'req-1' }), {
            status: 401,
          }),
      ),
    );

    await expect(
      apiFetch('/tenant/settings', { redirectOnAuthRequired: false }),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      requestId: 'req-1',
      status: 401,
    });
  });

  it('returns JSON on success with credentials included', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch<{ ok: boolean }>('/health/live')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/health/live',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('forces API fetches to no-store even when a caller passes cache options', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch<{ ok: boolean }>('/health/live', { cache: 'force-cache' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/health/live',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('accepts empty 204 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(
      apiFetch<void>('/matters/id/members/user-id', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('uses ApiClientError for non-standard responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );

    await expect(apiFetch('/boom', { redirectOnAuthRequired: false })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
