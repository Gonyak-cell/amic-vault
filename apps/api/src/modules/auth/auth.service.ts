import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  canIssueSessionForRole,
  type LoginCompleteResponseDto,
  type LoginMfaRequiredResponseDto,
  type LoginRequestDto,
  type MfaActivateRequestDto,
  type MfaEnrollResponseDto,
  type MfaVerifyRequestDto,
  type CurrentUserResponseDto,
  type PasswordResetAcceptedDto,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import type { TenantEntity } from '../tenant/tenant.entity';
import { TenantService } from '../tenant/tenant.service';
import { normalizeEmail, verifyPasswordHash, verifyPasswordOrDummy } from '../user/password';
import type { UserEntity } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { MfaPolicy } from './mfa.policy';
import { MfaService } from './mfa.service';
import { AuthThrottleService } from './auth-throttle.service';
import {
  createOpaqueToken,
  hashOpaqueToken,
  SESSION_TTL_MS,
  type SessionRecord,
  SessionRepository,
} from './session.repository';

export type LoginCompleteResult = LoginCompleteResponseDto & {
  sessionToken: string;
  session: SessionRecord;
  cookieMaxAgeMs: number;
};

export type LoginResult = LoginCompleteResult | LoginMfaRequiredResponseDto;

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
    @Inject(MfaService) private readonly mfaService: MfaService,
    @Inject(AuthThrottleService) private readonly authThrottle: AuthThrottleService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async login(
    input: LoginRequestDto,
    metadata: { ipAddress: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const normalizedEmail = input.email ? normalizeEmail(input.email) : null;
    const candidate = await this.resolveLoginCandidate(input, normalizedEmail);
    const tenant = candidate?.tenant ?? null;
    const user = candidate?.user ?? null;
    let throttleKeys: ReturnType<AuthThrottleService['loginKeys']>;
    try {
      throttleKeys = this.authThrottle.loginKeys({
        ...(tenant && user
          ? { knownAccount: { tenantId: tenant.tenantId, userId: user.userId } }
          : {}),
        suppliedIdentifier: input.accountLedgerId ?? normalizedEmail,
        tenantHint: input.tenantId ?? input.tenantSlug ?? null,
        networkAddress: metadata.ipAddress,
      });
      if (!(await this.authThrottle.isAllowed(throttleKeys))) throw authRequired();
    } catch {
      this.recordEvent('LOGIN_FAILURE', tenant?.tenantId ?? null, user?.userId ?? null, 'throttled');
      throw authRequired();
    }

    const passwordOk =
      user?.status === 'active'
        ? await verifyPasswordHash(user.passwordHash, input.password)
        : await verifyPasswordOrDummy(undefined, input.password);

    if (!tenant || tenant.status !== 'active' || !user || user.status !== 'active' || !passwordOk) {
      try {
        await this.authThrottle.recordFailure(throttleKeys);
      } catch {
        throw authRequired();
      }
      this.recordEvent('LOGIN_FAILURE', tenant?.tenantId ?? null, user?.userId ?? null, 'invalid');
      if (tenant?.status === 'active') {
        try {
          await this.auditService.log({
            tenantId: tenant.tenantId,
            actorType: user ? 'user' : 'system',
            actorId: user?.userId ?? null,
            action: 'LOGIN_FAILURE',
            targetType: 'auth',
            targetId: user?.userId ?? null,
            result: 'failure',
            metadata: { reason_code: 'invalid_credentials' },
          });
        } catch {
          throw authRequired();
        }
      }
      throw authRequired();
    }

    try {
      await this.authThrottle.clear(throttleKeys);
    } catch {
      throw authRequired();
    }

    if (!canIssueSessionForRole(user.role)) {
      this.recordEvent('LOGIN_FAILURE', tenant.tenantId, user.userId, 'external_user_disabled');
      try {
        await this.auditService.log({
          tenantId: tenant.tenantId,
          actorId: user.userId,
          action: 'LOGIN_FAILURE',
          targetType: 'auth',
          targetId: user.userId,
          result: 'denied',
          metadata: {
            reason_code: 'external_user_disabled',
          },
        });
      } catch {
        throw authRequired();
      }
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    const mfaDecision = this.mfaPolicy.evaluate(user, {
      hasActiveSecret: await this.mfaService.hasActiveSecret(tenant.tenantId, user.userId),
      production: process.env.NODE_ENV === 'production',
    });
    if (mfaDecision.outcome === 'deny') {
      this.recordEvent(
        'LOGIN_FAILURE',
        tenant.tenantId,
        user.userId,
        mfaDecision.reason ?? 'mfa_blocked',
      );
      try {
        await this.auditService.log({
          tenantId: tenant.tenantId,
          actorId: user.userId,
          action: 'LOGIN_FAILURE',
          targetType: 'auth',
          targetId: user.userId,
          result: 'denied',
          metadata: {
            reason_code: mfaDecision.reason ?? 'mfa_blocked',
          },
        });
      } catch {
        throw authRequired();
      }
      throw authRequired(mfaDecision.reason);
    }
    if (mfaDecision.outcome === 'challenge') {
      return this.mfaService.startChallenge(tenant.tenantId, user.userId);
    }

    let issued: Awaited<ReturnType<AuthService['issueSession']>>;
    try {
      issued = await this.issueSession(user, tenant, metadata, false);
    } catch {
      throw authRequired();
    }
    return {
      user: user.toSummary(),
      mfaEnabled: user.mfaEnabled,
      ...(mfaDecision.outcome === 'bootstrap' ? { mfaEnrollmentRequired: true } : {}),
      ...issued,
    };
  }

  async verifyMfa(
    input: MfaVerifyRequestDto,
    metadata: { ipAddress: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    let throttleKeys: ReturnType<AuthThrottleService['mfaKeys']>;
    try {
      throttleKeys = this.authThrottle.mfaKeys({
        challengeId: input.challengeId,
        networkAddress: metadata.ipAddress,
      });
      if (!(await this.authThrottle.isAllowed(throttleKeys))) throw authRequired();
    } catch {
      throw authRequired();
    }

    let verified: Awaited<ReturnType<MfaService['verifyChallenge']>>;
    try {
      verified = await this.mfaService.verifyChallenge(input);
    } catch {
      try {
        await this.authThrottle.recordFailure(throttleKeys);
      } catch {
        // The outward response remains the same safe auth denial if throttle state is unavailable.
      }
      throw authRequired();
    }
    try {
      await this.authThrottle.clear(throttleKeys);
    } catch {
      throw authRequired();
    }
    const tenant = await this.tenantService.findById(verified.tenantId);
    const user = await this.userService.findByTenantAndId(verified.tenantId, verified.userId);
    if (!tenant || tenant.status !== 'active' || !user || user.status !== 'active') {
      throw authRequired();
    }
    if (!canIssueSessionForRole(user.role)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    let issued: Awaited<ReturnType<AuthService['issueSession']>>;
    try {
      issued = await this.issueSession(user, tenant, metadata, true);
    } catch {
      throw authRequired();
    }
    return {
      user: user.toSummary(),
      mfaEnabled: user.mfaEnabled,
      ...issued,
    };
  }

  enrollMfa(session: SessionRecord, accountName: string): Promise<MfaEnrollResponseDto> {
    return this.mfaService.enroll(session, accountName);
  }

  activateMfa(
    session: SessionRecord,
    input: MfaActivateRequestDto,
  ): Promise<PasswordResetAcceptedDto> {
    return this.mfaService.activate(session, input);
  }

  private async issueSession(
    user: UserEntity,
    tenant: TenantEntity,
    metadata: { ipAddress: string | null; userAgent: string | null },
    mfaVerified: boolean,
    options: { method?: string } = {},
  ): Promise<{ sessionToken: string; session: SessionRecord; cookieMaxAgeMs: number }> {
    const sessionToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.auditService.transaction(tenant.tenantId, async (client) => {
      const createdSession = await this.sessions.createSession(
        {
          tenantId: tenant.tenantId,
          userId: user.userId,
          tokenHash,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          expiresAt,
          mfaVerified,
        },
        client,
      );
      await this.userService.recordLoginSuccess(tenant.tenantId, user.userId, client);
      await this.auditService.log(
        {
          tenantId: tenant.tenantId,
          actorId: user.userId,
          sessionId: createdSession.sessionId,
          action: 'LOGIN_SUCCESS',
          targetType: 'user',
          targetId: user.userId,
          metadata: {
            reason_code: 'ok',
            session_id: createdSession.sessionId,
            ...(options.method ? { method: options.method } : {}),
          },
        },
        client,
      );
      return createdSession;
    });
    this.recordEvent('LOGIN_SUCCESS', tenant.tenantId, user.userId, 'ok');
    return {
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

  async currentUser(session: SessionRecord | undefined): Promise<CurrentUserResponseDto> {
    if (!session) {
      throw authRequired();
    }
    const user = await this.userService.findByTenantAndId(session.tenantId, session.userId);
    if (!user || user.status !== 'active') {
      throw authRequired();
    }
    return { user: user.toSummary() };
  }

  securityEvents(): AuthSecurityEvent[] {
    return [...this.events];
  }

  private async resolveLoginCandidate(
    input: LoginRequestDto,
    normalizedEmail: string | null,
  ): Promise<{ tenant: TenantEntity; user: UserEntity | null } | null> {
    const tenant = await this.resolveTenant(input);
    if (input.accountLedgerId) {
      const candidate = await this.userService.findLoginCandidateByAccountLedgerId(
        input.accountLedgerId,
      );
      if (!candidate) {
        return tenant ? { tenant, user: null } : null;
      }
      if (tenant && candidate.tenant.tenantId !== tenant.tenantId) {
        return { tenant, user: null };
      }
      return candidate;
    }
    if (!normalizedEmail) {
      return tenant ? { tenant, user: null } : null;
    }
    if (tenant) {
      return {
        tenant,
        user:
          tenant.status === 'active'
            ? await this.userService.findByTenantAndEmail(tenant.tenantId, normalizedEmail)
            : null,
      };
    }
    if (!input.tenantId && !input.tenantSlug) {
      return this.userService.findUniqueLoginCandidateByEmail(normalizedEmail);
    }
    return null;
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
