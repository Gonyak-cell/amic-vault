import { describe, expect, it } from 'vitest';
import { isProtectedAppPath, loginRedirectUrl } from './auth-guard';

describe('auth guard paths', () => {
  it('protects internal work surfaces while leaving token portal routes isolated', () => {
    expect(isProtectedAppPath('/contracts')).toBe(true);
    expect(isProtectedAppPath('/contracts/rules')).toBe(true);
    expect(isProtectedAppPath('/dd')).toBe(true);
    expect(isProtectedAppPath('/litigation')).toBe(true);
    expect(isProtectedAppPath('/files')).toBe(true);
    expect(isProtectedAppPath('/files/recent')).toBe(true);
    expect(isProtectedAppPath('/documents/11111111-1111-4111-8111-111111111177')).toBe(true);
    expect(isProtectedAppPath('/audit')).toBe(true);
    expect(isProtectedAppPath('/walls')).toBe(true);
    expect(isProtectedAppPath('/admin')).toBe(true);
    expect(isProtectedAppPath('/admin/security')).toBe(true);
    expect(isProtectedAppPath('/integrations/outlook')).toBe(true);
    expect(isProtectedAppPath('/external/opaque-token')).toBe(false);
  });

  it('preserves same-origin deep-link query parameters in the login next URL', () => {
    const url = new URL(
      loginRedirectUrl(
        'https://vault.example.test',
        '/documents/11111111-1111-4111-8111-111111111201?edit=1&versionId=11111111-1111-4111-8111-111111111501',
      ),
    );

    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe(
      '/documents/11111111-1111-4111-8111-111111111201?edit=1&versionId=11111111-1111-4111-8111-111111111501',
    );
  });

  it('does not allow absolute next targets in login redirects', () => {
    const url = new URL(loginRedirectUrl('https://vault.example.test', 'https://evil.example/'));

    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('/dashboard');
  });
});
