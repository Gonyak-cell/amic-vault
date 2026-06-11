import { Controller, Get, Module } from '@nestjs/common';
import { ERROR_CODES } from '@amic-vault/shared';

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
  controllers: [AppController],
})
export class AppModule {}
