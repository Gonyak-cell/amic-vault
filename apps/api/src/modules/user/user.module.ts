import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PreviewModule } from '../preview/preview.module';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { PgPasswordResetStore } from '../auth/password-reset.service';
import { SessionRepository } from '../auth/session.repository';
import { UserDirectoryController } from './user-directory.controller';
import { UserLoginIdentityController } from './user-login-identity.controller';
import { UserLoginIdentityService } from './user-login-identity.service';
import { UserLifecycleController } from './user-lifecycle.controller';
import { UserLifecycleService } from './user-lifecycle.service';
import { UserRoleController } from './user-role.controller';
import { UserRoleService } from './user-role.service';
import { PgUserStore, USER_STORE, UserService } from './user.service';

@Module({
  imports: [AuditModule, PreviewModule],
  controllers: [
    UserDirectoryController,
    UserLoginIdentityController,
    UserLifecycleController,
    UserRoleController,
  ],
  providers: [
    PgPasswordResetStore,
    PgUserStore,
    SessionRepository,
    UserService,
    UserLoginIdentityService,
    UserLifecycleService,
    UserRoleService,
    PgRoleLookup,
    RequireRolesGuard,
    {
      provide: USER_STORE,
      useExisting: PgUserStore,
    },
  ],
  exports: [PgRoleLookup, RequireRolesGuard, UserService],
})
export class UserModule {}
