import { describe, expect, it } from 'vitest';
import {
  API_NO_STORE_HEADER_VALUE,
  applyNoStoreHeaders,
  enforceNoStoreHeaders,
  noStoreApiMiddleware,
} from './no-store.middleware';

class ResponseCapture {
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

describe('no-store API middleware', () => {
  it('applies the desktop no-store header set to API responses', () => {
    const response = new ResponseCapture();

    applyNoStoreHeaders(response);

    expect(response.headers.get('cache-control')).toBe(API_NO_STORE_HEADER_VALUE);
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
  });

  it('continues the middleware chain after applying headers', () => {
    const response = new ResponseCapture();
    let continued = false;

    noStoreApiMiddleware({}, response, () => {
      continued = true;
    });

    expect(continued).toBe(true);
    expect(response.headers.get('cache-control')).toBe(API_NO_STORE_HEADER_VALUE);
  });

  it('blocks downstream Cache-Control overrides', () => {
    const response = new ResponseCapture();

    enforceNoStoreHeaders(response);
    response.setHeader('cache-control', 'public, max-age=31536000');

    expect(response.headers.get('cache-control')).toBe(API_NO_STORE_HEADER_VALUE);
  });
});
