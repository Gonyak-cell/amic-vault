import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { UserLoginIdentityController } from './user-login-identity.controller';
import { UserLoginIdentityService } from './user-login-identity.service';
import { UserRoleController } from './user-role.controller';
import { UserRoleService } from './user-role.service';
import { PgUserStore, USER_STORE, UserService } from './user.service';

@Module({
  imports: [AuditModule],
  controllers: [UserLoginIdentityController, UserRoleController],
  providers: [
    PgUserStore,
    UserService,
    UserLoginIdentityService,
    UserRoleService,
    PgRoleLookup,
    RequireRolesGuard,
    {
      provide: USER_STORE,
      useExisting: PgUserStore,
    },
  ],
  exports: [UserService],
})
export class UserModule {}
