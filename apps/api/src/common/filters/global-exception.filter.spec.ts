import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ErrorTrackerContext } from '../errors/error-tracker';
import { GlobalExceptionFilter } from './global-exception.filter';
import { runWithRequestId } from '../logging/correlation.middleware';

class SpyTracker {
  readonly capture = vi.fn((error: unknown, context: ErrorTrackerContext) => ({
    error,
    requestId: context.requestId,
  }));
}

function createHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', originalUrl: '/v1/boom', body: { password: 'x' } }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('GlobalExceptionFilter', () => {
  it('adds requestId to standard error responses', () => {
    const tracker = new SpyTracker();
    const filter = new GlobalExceptionFilter(tracker as never);
    const { host, json, status } = createHost();

    runWithRequestId('req-filter-1', () => {
      filter.catch(new HttpException({ code: 'AUTH_REQUIRED' }, HttpStatus.UNAUTHORIZED), host);
    });

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ code: 'AUTH_REQUIRED', requestId: 'req-filter-1' });
    expect(tracker.capture).not.toHaveBeenCalled();
  });

  it('calls tracker for unhandled exceptions without leaking request bodies', () => {
    const tracker = new SpyTracker();
    const filter = new GlobalExceptionFilter(tracker as never);
    const { host, json } = createHost();

    runWithRequestId('req-filter-2', () => {
      filter.catch(new Error('forced'), host);
    });

    expect(json).toHaveBeenCalledWith({ code: 'VALIDATION_FAILED', requestId: 'req-filter-2' });
    expect(tracker.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ requestId: 'req-filter-2', path: '/v1/boom' }),
    );
    expect(JSON.stringify(tracker.capture.mock.calls)).not.toContain('password');
  });

  it('keeps responses stable when the tracker throws', () => {
    const tracker = { capture: vi.fn(() => Promise.reject(new Error('tracker failed'))) };
    const filter = new GlobalExceptionFilter(tracker as never);
    const { host, json } = createHost();

    filter.catch(new Error('forced'), host);

    expect(json).toHaveBeenCalledWith({ code: 'VALIDATION_FAILED', requestId: undefined });
  });
});
