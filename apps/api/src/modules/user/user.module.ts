import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { UserRoleController } from './user-role.controller';
import { UserRoleService } from './user-role.service';
import { PgUserStore, USER_STORE, UserService } from './user.service';

@Module({
  imports: [AuditModule],
  controllers: [UserRoleController],
  providers: [
    PgUserStore,
    UserService,
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
