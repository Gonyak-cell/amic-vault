import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DlpService } from './dlp.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

@Module({
  imports: [AuditModule],
  providers: [DlpService, SensitiveDataDetector],
  exports: [DlpService],
})
export class DlpModule {}
