import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AiPolicyService } from './ai-policy.service';

@Module({
  imports: [AuditModule],
  providers: [AiPolicyService],
  exports: [AiPolicyService],
})
export class AiPolicyModule {}
