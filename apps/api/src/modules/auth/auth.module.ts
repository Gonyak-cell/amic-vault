import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { MailerStub } from './mailer.stub';
import { MfaPolicy } from './mfa.policy';
import { MfaService } from './mfa.service';
import {
  PASSWORD_RESET_STORE,
  PasswordResetService,
  PgPasswordResetStore,
} from './password-reset.service';
import { SessionGuard } from './session.guard';
import { SessionRepository } from './session.repository';
import { TotpService } from './totp.service';

@Module({
  imports: [AuditModule, TenantModule, UserModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthThrottleService,
    MailerStub,
    MfaPolicy,
    MfaService,
    PasswordResetService,
    PgPasswordResetStore,
    SessionRepository,
    TotpService,
    {
      provide: PASSWORD_RESET_STORE,
      useExisting: PgPasswordResetStore,
    },
    {
      provide: APP_GUARD,
      useClass: SessionGuard,
    },
  ],
  exports: [AuthService, MailerStub, MfaService, SessionRepository, TotpService],
})
export class AuthModule {}
