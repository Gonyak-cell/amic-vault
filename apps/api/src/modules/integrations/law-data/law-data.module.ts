import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { DartApiClient } from './dart-api.client';
import {
  LawAmendmentRefreshSchedulerService,
  LawDataTenantReader,
} from './law-amendment-refresh-scheduler.service';
import { LawAuthoritySearchRepository } from './law-authority-search.repository';
import { LawApiClient } from './law-api.client';
import { LawDataController } from './law-data.controller';
import { LawDataService } from './law-data.service';

@Module({
  imports: [AuditModule],
  controllers: [LawDataController],
  providers: [
    DartApiClient,
    LawApiClient,
    LawAmendmentRefreshSchedulerService,
    LawAuthoritySearchRepository,
    LawDataService,
    LawDataTenantReader,
  ],
  exports: [LawAuthoritySearchRepository, LawDataService],
})
export class LawDataModule {}
