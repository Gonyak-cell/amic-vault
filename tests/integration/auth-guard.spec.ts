import { describe, expect, it } from 'vitest';
import {
  isProtectedAppPath,
  loginRedirectUrl,
  shouldRedirectToLogin,
} from '../../apps/web/src/lib/auth-guard';

describe('frontend auth guard integration', () => {
  it('redirects unauthenticated app routes to login', () => {
    expect(isProtectedAppPath('/dashboard')).toBe(true);
    expect(isProtectedAppPath('/records')).toBe(true);
    expect(isProtectedAppPath('/enterprise')).toBe(true);
    expect(isProtectedAppPath('/scale')).toBe(true);
    expect(shouldRedirectToLogin('/dashboard', false)).toBe(true);
    expect(loginRedirectUrl('http://localhost', '/dashboard')).toBe(
      'http://localhost/login?next=%2Fdashboard',
    );
  });

  it('does not redirect the login page or authenticated dashboard requests', () => {
    expect(shouldRedirectToLogin('/login', false)).toBe(false);
    expect(shouldRedirectToLogin('/dashboard', true)).toBe(false);
  });
});
