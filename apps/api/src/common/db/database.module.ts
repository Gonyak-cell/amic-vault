import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { TenantModule } from '../../modules/tenant/tenant.module';
import { DATABASE_POOL } from './database.tokens';
import { DatabaseService } from './database.service';
import { TenantAwareDataSource } from './tenant-aware-datasource';

export function createRuntimeDatabasePool(): Pool {
  const connectionString = process.env.DATABASE_RUNTIME_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_RUNTIME_URL_REQUIRED');
  }
  return new Pool({ connectionString });
}

@Module({
  imports: [TenantModule],
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
