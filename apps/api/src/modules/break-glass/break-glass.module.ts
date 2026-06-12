import { forwardRef, Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../tenant/tenant.module';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassOverrideReader } from './break-glass-override.reader';
import { BreakGlassService } from './break-glass.service';

@Module({
  imports: [forwardRef(() => AuditModule), TenantModule],
  controllers: [BreakGlassController],
  providers: [BreakGlassOverrideReader, BreakGlassService, PgRoleLookup, RequireRolesGuard],
  exports: [BreakGlassOverrideReader, BreakGlassService],
})
export class BreakGlassModule {}
