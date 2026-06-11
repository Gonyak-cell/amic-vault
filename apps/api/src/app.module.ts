import { Controller, Get, Module } from '@nestjs/common';
import { ERROR_CODES } from '@amic-vault/shared';
import { AuditModule } from './modules/audit/audit.module';
import { TenantModule } from './modules/tenant/tenant.module';

@Controller()
class AppController {
  @Get()
  getApiRoot() {
    return {
      service: 'amic-vault-api',
      apiPrefix: '/v1',
      errorCodes: ERROR_CODES,
    };
  }
}

@Module({
  imports: [AuditModule, TenantModule],
  controllers: [AppController],
})
export class AppModule {}
