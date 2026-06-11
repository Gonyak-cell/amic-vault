import { Module } from '@nestjs/common';
import { PgUserStore, USER_STORE, UserService } from './user.service';

@Module({
  providers: [
    PgUserStore,
    UserService,
    {
      provide: USER_STORE,
      useExisting: PgUserStore,
    },
  ],
  exports: [UserService],
})
export class UserModule {}
