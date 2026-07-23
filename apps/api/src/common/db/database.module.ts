import { forwardRef, Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { TenantModule } from '../../modules/tenant/tenant.module';
import { runtimeSecretValue } from '../config/runtime-secret';
import { DATABASE_POOL } from './database.tokens';
import { DatabaseService } from './database.service';
import { TenantAwareDataSource } from './tenant-aware-datasource';

export function createRuntimeDatabasePool(env: NodeJS.ProcessEnv = process.env): Pool {
  const connectionString = runtimeSecretValue('DATABASE_RUNTIME_URL', env, {
    maximumBytes: 4096,
  });
  return new Pool({ connectionString });
}

@Global()
@Module({
  imports: [forwardRef(() => TenantModule)],
  providers: [
    TenantAwareDataSource,
    {
      provide: DATABASE_POOL,
      useFactory: createRuntimeDatabasePool,
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
