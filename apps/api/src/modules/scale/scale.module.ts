import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ScaleController } from './scale.controller';
import { ScaleService } from './scale.service';

@Module({
  imports: [AuditModule],
  controllers: [ScaleController],
  providers: [ScaleService],
  exports: [ScaleService],
})
export class ScaleModule {}
