const protectedPaths = [
  '/dashboard',
  '/matters',
  '/documents',
  '/search',
  '/contracts',
  '/dd',
  '/litigation',
  '/records',
  '/enterprise',
  '/integrations',
  '/scale',
  '/audit',
  '/walls',
] as const;

export function isProtectedAppPath(pathname: string): boolean {
  return protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function loginRedirectUrl(origin: string, pathname: string): string {
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('next', pathname);
  return loginUrl.toString();
}

export function shouldRedirectToLogin(pathname: string, hasSession: boolean): boolean {
  return isProtectedAppPath(pathname) && !hasSession;
}
