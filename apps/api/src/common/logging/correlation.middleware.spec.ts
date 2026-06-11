import { describe, expect, it } from 'vitest';
import { CorrelationMiddleware, currentRequestId } from './correlation.middleware';

class ResponseCapture {
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

describe('CorrelationMiddleware', () => {
  it('accepts a valid external request id and exposes it to the response and ALS', () => {
    const middleware = new CorrelationMiddleware();
    const response = new ResponseCapture();
    let observed: string | undefined;

    middleware.use({ headers: { 'x-request-id': 'req-valid-1' } }, response, () => {
      observed = currentRequestId();
    });

    expect(response.headers.get('x-request-id')).toBe('req-valid-1');
    expect(observed).toBe('req-valid-1');
  });

  it('discards malformed external request ids', () => {
    const middleware = new CorrelationMiddleware();
    const response = new ResponseCapture();

    middleware.use({ headers: { 'x-request-id': 'bad id with spaces' } }, response, () => {});

    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
