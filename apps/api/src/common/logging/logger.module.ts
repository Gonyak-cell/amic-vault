import { Module } from '@nestjs/common';
import { CorrelationMiddleware } from './correlation.middleware';
import { StructuredLogger } from './logger';

@Module({
  providers: [CorrelationMiddleware, StructuredLogger],
  exports: [CorrelationMiddleware, StructuredLogger],
})
export class LoggerModule {}
