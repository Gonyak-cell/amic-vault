import { Body, Controller, Get, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type {
  LoginRequestDto,
  MfaActivateRequestDto,
  MfaVerifyRequestDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
} from '@amic-vault/shared';
import { AuthService } from './auth.service';
import { AllowUnverifiedMfaBootstrapMutation } from './mfa-bootstrap.decorator';
import { Public } from './public.decorator';
import { PasswordResetService } from './password-reset.service';
import { SESSION_COOKIE_NAME } from './session.repository';
import type { RequestWithSession } from './session.guard';

interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
  expires?: Date;
}

interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: Pick<CookieOptions, 'path'>): void;
}

interface RequestMetadata extends RequestWithSession {
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PasswordResetService) private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: LoginRequestDto,
    @Req() request: RequestMetadata,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.login(body, {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: firstHeader(request.headers['user-agent']) ?? null,
    });
    if (result.mfaRequired) return result;
    setSessionCookie(response, result.sessionToken, result.cookieMaxAgeMs);
    return {
      user: result.user,
      mfaEnabled: result.mfaEnabled,
      ...(result.mfaEnrollmentRequired ? { mfaEnrollmentRequired: true } : {}),
    };
  }

  @Public()
  @Post('mfa/verify')
  async verifyMfa(
    @Body() body: MfaVerifyRequestDto,
    @Req() request: RequestMetadata,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.verifyMfa(body, {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: firstHeader(request.headers['user-agent']) ?? null,
    });
    if (result.mfaRequired) return result;
    setSessionCookie(response, result.sessionToken, result.cookieMaxAgeMs);
    return { user: result.user, mfaEnabled: result.mfaEnabled };
  }

  @Post('mfa/enroll')
  @AllowUnverifiedMfaBootstrapMutation()
  enrollMfa(@Req() request: RequestWithSession) {
    const session = request.session;
    if (!session) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    return this.authService.enrollMfa(session, session.userId);
  }

  @Post('mfa/activate')
  @AllowUnverifiedMfaBootstrapMutation()
  activateMfa(@Req() request: RequestWithSession, @Body() body: MfaActivateRequestDto) {
    const session = request.session;
    if (!session) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    return this.authService.activateMfa(session, body);
  }

  @Post('logout')
  @AllowUnverifiedMfaBootstrapMutation()
  async logout(
    @Req() request: RequestWithSession,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.authService.logoutByTokenHash(request.session?.tokenHash);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { accepted: true };
  }

  @Get('me')
  currentUser(@Req() request: RequestWithSession) {
    return this.authService.currentUser(request.session);
  }

  @Public()
  @Post('password-reset/request')
  requestPasswordReset(@Body() body: PasswordResetRequestDto, @Req() request: RequestMetadata) {
    return this.passwordResetService.requestReset(body, {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
    });
  }

  @Public()
  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    return this.passwordResetService.confirmReset(body);
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function setSessionCookie(response: CookieResponse, sessionToken: string, maxAge: number): void {
  response.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}
