import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type {
  LoginRequestDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
} from '@amic-vault/shared';
import { AuthService } from './auth.service';
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
    response.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: result.cookieMaxAgeMs,
    });
    return {
      user: result.user,
      mfaEnabled: result.mfaEnabled,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: RequestWithSession,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.authService.logoutByTokenHash(request.session?.tokenHash);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { accepted: true };
  }

  @Public()
  @Post('password-reset/request')
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.passwordResetService.requestReset(body);
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
