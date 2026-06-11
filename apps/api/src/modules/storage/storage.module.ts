import { Module } from '@nestjs/common';
import { ENCRYPTION_HOOK } from './encryption-hook.interface';
import { FileObjectService } from './file-object.service';
import { NoopEncryptionHook } from './noop-encryption.hook';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE_ADAPTER, StorageService } from './storage.service';
import { StoragePathResolver } from './storage-path.resolver';

@Module({
  providers: [
    FileObjectService,
    StoragePathResolver,
    StorageService,
    {
      provide: STORAGE_ADAPTER,
      useFactory: () => S3StorageAdapter.fromEnv(),
    },
    {
      provide: ENCRYPTION_HOOK,
      useClass: NoopEncryptionHook,
    },
  ],
  exports: [FileObjectService, StoragePathResolver, StorageService],
})
export class StorageModule {}
