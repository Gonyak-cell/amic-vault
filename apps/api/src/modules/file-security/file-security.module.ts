import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { FileScanQueueService } from './file-scan-queue.service';
import { FileSecurityService } from './file-security.service';

@Module({ imports: [AuditModule, StorageModule], providers: [FileSecurityService, FileScanQueueService], exports: [FileSecurityService, FileScanQueueService] })
export class FileSecurityModule {}
