import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function requestFor(pathname: string, search = '', hasSession = false) {
  const request = new NextRequest(`https://vault.example.test${pathname}${search}`);
  if (hasSession) request.cookies.set('amic_session', 'test-session');
  return request;
}

describe('middleware login boundary', () => {
  it('redirects legacy folders without carrying query text into the login URL', () => {
    const response = middleware(
      requestFor(
        '/search/folders',
        '?searchRef=11111111-1111-4111-8111-111111111902&q=민감한본문&title=민감한제목',
      ),
    );
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location ?? '').searchParams.get('next')).toBe(
      '/search/folders?searchRef=11111111-1111-4111-8111-111111111902',
    );
  });

  it('keeps authenticated routes on their existing fail-closed route path', () => {
    const response = middleware(requestFor('/search/folders', '?q=ignored', true));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
