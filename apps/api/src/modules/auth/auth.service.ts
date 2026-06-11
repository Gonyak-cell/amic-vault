import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginRequestDto, LoginResponseDto, PasswordResetAcceptedDto } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import type { TenantEntity } from '../tenant/tenant.entity';
import { TenantService } from '../tenant/tenant.service';
import { normalizeEmail, verifyPasswordHash, verifyPasswordOrDummy } from '../user/password';
import { UserService } from '../user/user.service';
import { MfaPolicy } from './mfa.policy';
import {
  createOpaqueToken,
  hashOpaqueToken,
  SESSION_TTL_MS,
  type SessionRecord,
  SessionRepository,
} from './session.repository';

export interface LoginResult extends LoginResponseDto {
  sessionToken: string;
  session: SessionRecord;
  cookieMaxAgeMs: number;
}

export interface AuthSecurityEvent {
  action: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'SESSION_REVOKED';
  tenantId: string | null;
  userId: string | null;
  reason: string;
  createdAt: string;
}

function authRequired(reason?: string): UnauthorizedException {
  if (reason) {
    return new UnauthorizedException({ code: 'AUTH_REQUIRED', reason });
  }
  return new UnauthorizedException({ code: 'AUTH_REQUIRED' });
}

@Injectable()
export class AuthService {
  private readonly events: AuthSecurityEvent[] = [];

  constructor(
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(MfaPolicy) private readonly mfaPolicy: MfaPolicy,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async login(
    input: LoginRequestDto,
    metadata: { ipAddress: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const tenant = await this.resolveTenant(input);
    const user =
      tenant?.status === 'active'
        ? await this.userService.findByTenantAndEmail(tenant.tenantId, normalizedEmail)
        : null;

    const passwordOk =
      user?.status === 'active'
        ? await verifyPasswordHash(user.passwordHash, input.password)
        : await verifyPasswordOrDummy(undefined, input.password);

    if (!tenant || tenant.status !== 'active' || !user || user.status !== 'active' || !passwordOk) {
      this.recordEvent('LOGIN_FAILURE', tenant?.tenantId ?? null, user?.userId ?? null, 'invalid');
      if (tenant?.status === 'active') {
        await this.auditService.log({
          tenantId: tenant.tenantId,
          actorType: user ? 'user' : 'system',
          actorId: user?.userId ?? null,
          action: 'LOGIN_FAILURE',
          targetType: 'auth',
          targetId: user?.userId ?? null,
          result: 'failure',
          metadata: { reason_code: 'invalid_credentials', ip_address: metadata.ipAddress },
        });
      }
      throw authRequired();
    }

    const mfaDecision = this.mfaPolicy.evaluate(user);
    if (!mfaDecision.allowed) {
      this.recordEvent(
        'LOGIN_FAILURE',
        tenant.tenantId,
        user.userId,
        mfaDecision.reason ?? 'mfa_blocked',
      );
      await this.auditService.log({
        tenantId: tenant.tenantId,
        actorId: user.userId,
        action: 'LOGIN_FAILURE',
        targetType: 'auth',
        targetId: user.userId,
        result: 'denied',
        metadata: {
          reason_code: mfaDecision.reason ?? 'mfa_blocked',
          ip_address: metadata.ipAddress,
        },
      });
      throw authRequired(mfaDecision.reason);
    }

    const sessionToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.auditService.transaction(tenant.tenantId, async (client) => {
      const createdSession = await this.sessions.createSession({
        tenantId: tenant.tenantId,
        userId: user.userId,
        tokenHash,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        expiresAt,
      }, client);
      await this.userService.recordLoginSuccess(tenant.tenantId, user.userId, client);
      await this.auditService.log({
        tenantId: tenant.tenantId,
        actorId: user.userId,
        sessionId: createdSession.sessionId,
        action: 'LOGIN_SUCCESS',
        targetType: 'user',
        targetId: user.userId,
        metadata: {
          reason_code: 'ok',
          ip_address: metadata.ipAddress,
          session_id: createdSession.sessionId,
        },
      }, client);
      return createdSession;
    });
    this.recordEvent('LOGIN_SUCCESS', tenant.tenantId, user.userId, 'ok');

    return {
      user: user.toSummary(),
      mfaEnabled: user.mfaEnabled,
      sessionToken,
      session,
      cookieMaxAgeMs: SESSION_TTL_MS,
    };
  }

  async logoutByTokenHash(tokenHash: string | undefined): Promise<PasswordResetAcceptedDto> {
    if (tokenHash) {
      await this.sessions.revokeByTokenHash(tokenHash);
      this.recordEvent('SESSION_REVOKED', null, null, 'logout');
    }
    return { accepted: true };
  }

  securityEvents(): AuthSecurityEvent[] {
    return [...this.events];
  }

  private async resolveTenant(input: LoginRequestDto): Promise<TenantEntity | null> {
    if (input.tenantId) {
      return this.tenantService.findById(input.tenantId);
    }
    if (input.tenantSlug) {
      return this.tenantService.findBySlug(input.tenantSlug);
    }
    return null;
  }

  private recordEvent(
    action: AuthSecurityEvent['action'],
    tenantId: string | null,
    userId: string | null,
    reason: string,
  ): void {
    this.events.push({
      action,
      tenantId,
      userId,
      reason,
      createdAt: new Date().toISOString(),
    });
  }
}
