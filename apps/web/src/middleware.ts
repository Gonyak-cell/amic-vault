import { NextResponse, type NextRequest } from 'next/server';
import { loginRedirectUrl, shouldRedirectToLogin } from '@/lib/auth-guard';
import { DESKTOP_NO_STORE_HEADER_VALUE } from '@/lib/pwa/cache-policy';

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('cache-control', DESKTOP_NO_STORE_HEADER_VALUE);
  response.headers.set('pragma', 'no-cache');
  response.headers.set('expires', '0');
  return response;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!shouldRedirectToLogin(pathname, request.cookies.has('amic_session'))) {
    return withNoStore(NextResponse.next());
  }

  return withNoStore(
    NextResponse.redirect(
      loginRedirectUrl(request.nextUrl.origin, `${pathname}${request.nextUrl.search}`),
    ),
  );
}

export const config = {
  matcher: [
    '/login',
    '/v1/:path*',
    '/dashboard/:path*',
    '/matters/:path*',
    '/search/:path*',
    '/documents/:path*',
    '/audit/:path*',
    '/records/:path*',
    '/ai/:path*',
    '/contracts/:path*',
    '/dd/:path*',
    '/litigation/:path*',
    '/enterprise/:path*',
    '/scale/:path*',
    '/walls/:path*',
    '/external/:path*',
  ],
};
