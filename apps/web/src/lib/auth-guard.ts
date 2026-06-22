const protectedPaths = [
  '/dashboard',
  '/matters',
  '/documents',
  '/files',
  '/search',
  '/contracts',
  '/dd',
  '/litigation',
  '/records',
  '/admin',
  '/enterprise',
  '/integrations',
  '/scale',
  '/audit',
  '/walls',
] as const;

export function isProtectedAppPath(pathname: string): boolean {
  return protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function safeNextPath(nextPathAndSearch: string): string {
  if (!nextPathAndSearch.startsWith('/') || nextPathAndSearch.startsWith('//')) {
    return '/dashboard';
  }
  return nextPathAndSearch;
}

export function loginRedirectUrl(origin: string, nextPathAndSearch: string): string {
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('next', safeNextPath(nextPathAndSearch));
  return loginUrl.toString();
}

export function shouldRedirectToLogin(pathname: string, hasSession: boolean): boolean {
  return isProtectedAppPath(pathname) && !hasSession;
}
