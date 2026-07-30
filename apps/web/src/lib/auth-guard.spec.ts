import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isProtectedAppPath,
  loginRedirectUrl,
  protectedPaths,
  resolveLoginNextPath,
  safeNextPath,
  shouldRedirectToLogin,
} from './auth-guard';

describe('auth guard paths', () => {
  it('protects internal work surfaces while leaving token portal routes isolated', () => {
    expect(isProtectedAppPath('/contracts')).toBe(true);
    expect(isProtectedAppPath('/contracts/rules')).toBe(true);
    expect(isProtectedAppPath('/dd')).toBe(true);
    expect(isProtectedAppPath('/litigation')).toBe(true);
    expect(isProtectedAppPath('/clients')).toBe(true);
    expect(isProtectedAppPath('/clients/11111111-1111-4111-8111-111111111199')).toBe(true);
    expect(isProtectedAppPath('/files')).toBe(true);
    expect(isProtectedAppPath('/files/recent')).toBe(true);
    expect(isProtectedAppPath('/documents/11111111-1111-4111-8111-111111111177')).toBe(true);
    expect(isProtectedAppPath('/audit')).toBe(true);
    expect(isProtectedAppPath('/walls')).toBe(true);
    expect(isProtectedAppPath('/admin')).toBe(true);
    expect(isProtectedAppPath('/admin/security')).toBe(true);
    expect(isProtectedAppPath('/integrations/outlook')).toBe(true);
    expect(isProtectedAppPath('/notifications')).toBe(true);
    expect(isProtectedAppPath('/notifications/unread')).toBe(true);
    expect(isProtectedAppPath('/work')).toBe(true);
    expect(isProtectedAppPath('/external/opaque-token')).toBe(false);
  });

  it('requires a session for both the legacy notification route and the canonical work route', () => {
    expect(shouldRedirectToLogin('/notifications', false)).toBe(true);
    expect(shouldRedirectToLogin('/notifications', true)).toBe(false);
    expect(shouldRedirectToLogin('/work', false)).toBe(true);
    expect(shouldRedirectToLogin('/work', true)).toBe(false);
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

  it('fails closed for protocol-relative, backslash, encoded, and login-loop next targets', () => {
    const unsafeNextValues = [
      '//evil.example/dashboard',
      '/\\evil.example/dashboard',
      '/%5Cevil.example/dashboard',
      '/%2F%2Fevil.example/dashboard',
      '/%252F%252Fevil.example/dashboard',
      '/%6Cogin?next=%2Fdashboard',
      '/login?next=%2Fdashboard',
      '/login/settings',
      '/foo',
      '/api/v1/documents',
    ];

    for (const value of unsafeNextValues) {
      expect(safeNextPath(value), value).toBe('/dashboard');
    }
  });

  it('keeps only allowlisted deep-link state and strips legacy folder query text', () => {
    const searchRef = '11111111-1111-4111-8111-111111111902';
    const documentId = '11111111-1111-4111-8111-111111111201';
    const versionId = '11111111-1111-4111-8111-111111111501';

    expect(
      safeNextPath(
        `/search/folders?searchRef=${searchRef}&q=${encodeURIComponent('민감한 본문')}&title=secret`,
      ),
    ).toBe(`/search/folders?searchRef=${searchRef}`);
    expect(safeNextPath('/search/folders?searchRef=not-a-uuid&q=secret')).toBe('/search/folders');
    expect(
      safeNextPath(
        `/documents/${documentId}?edit=1&versionId=${versionId}&secret=${encodeURIComponent('본문')}`,
      ),
    ).toBe(`/documents/${documentId}?edit=1&versionId=${versionId}`);
    expect(safeNextPath(`/documents/${documentId}?edit=1&malformed=%ZZ`)).toBe(
      `/documents/${documentId}`,
    );
    expect(safeNextPath('/matters/11111111-1111-4111-8111-111111111001?tab=work#matter-work')).toBe(
      '/matters/11111111-1111-4111-8111-111111111001?tab=work#matter-work',
    );
    expect(
      safeNextPath('/matters/11111111-1111-4111-8111-111111111001?tab=work#not-allowlisted'),
    ).toBe('/matters/11111111-1111-4111-8111-111111111001?tab=work');
    expect(
      safeNextPath(
        '/work?view=mine&assignee=unassigned&kind=document_ocr_pending&limit=50&offset=100&page=7&cursor=secret',
      ),
    ).toBe('/work?view=mine&assignee=unassigned&kind=document_ocr_pending&limit=50&offset=100');
    expect(safeNextPath('/work?view=all&assignee=admin')).toBe('/work');
    expect(safeNextPath('/work?view=notifications&assignee=mine')).toBe(
      '/work?view=notifications&assignee=mine',
    );
    expect(
      safeNextPath(
        '/work?view=notifications&view=mine&assignee=all&assignee=mine&kind=dd_rfi_due&limit=20&offset=40',
      ),
    ).toBe('/work?kind=dd_rfi_due&limit=20&offset=40');
    expect(safeNextPath('/work?limit=101&offset=-1')).toBe('/work');
  });

  it('resolves exactly one sanitized next value for login navigation', () => {
    expect(resolveLoginNextPath('?next=%2Fdocuments%2Fdoc%3Fedit%3D1')).toBe(
      '/documents/doc?edit=1',
    );
    expect(resolveLoginNextPath('?next=%2Flogin&next=%2Fdashboard')).toBe('/dashboard');
    expect(resolveLoginNextPath('?next=%2Fsearch%2Ffolders%3FsearchRef%3Dnot-a-uuid')).toBe(
      '/search/folders',
    );
    expect(resolveLoginNextPath('?next=%ZZ')).toBe('/dashboard');
  });

  it('keeps the Next middleware matcher aligned with protected app paths', () => {
    const middlewareSource = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
    for (const path of protectedPaths) {
      expect(middlewareSource).toContain(`'${path}/:path*'`);
    }
  });
});
