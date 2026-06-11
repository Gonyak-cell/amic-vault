import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailerStub } from './mailer.stub';
import { MfaPolicy } from './mfa.policy';
import {
  PASSWORD_RESET_STORE,
  PasswordResetService,
  PgPasswordResetStore,
} from './password-reset.service';
import { SessionGuard } from './session.guard';
import { SessionRepository } from './session.repository';

@Module({
  imports: [TenantModule, UserModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    MailerStub,
    MfaPolicy,
    PasswordResetService,
    PgPasswordResetStore,
    SessionRepository,
    {
      provide: PASSWORD_RESET_STORE,
      useExisting: PgPasswordResetStore,
    },
    {
      provide: APP_GUARD,
      useClass: SessionGuard,
    },
  ],
  exports: [AuthService, MailerStub, SessionRepository],
})
export class AuthModule {}
