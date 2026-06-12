import { NextResponse, type NextRequest } from 'next/server';
import { loginRedirectUrl, shouldRedirectToLogin } from '@/lib/auth-guard';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!shouldRedirectToLogin(pathname, request.cookies.has('amic_session'))) {
    return NextResponse.next();
  }

  return NextResponse.redirect(loginRedirectUrl(request.nextUrl.origin, pathname));
}

export const config = {
  matcher: ['/dashboard/:path*', '/matters/:path*', '/search/:path*'],
};
