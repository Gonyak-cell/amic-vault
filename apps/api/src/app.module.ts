import { Controller, Get, Module } from '@nestjs/common';
import { ERROR_CODES } from '@amic-vault/shared';
import { AuditModule } from './modules/audit/audit.module';

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
  imports: [AuditModule],
  controllers: [AppController],
})
export class AppModule {}
