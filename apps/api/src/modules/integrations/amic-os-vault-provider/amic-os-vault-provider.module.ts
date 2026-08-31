import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { DlpModule } from '../../dlp/dlp.module';
import { FileSecurityModule } from '../../file-security/file-security.module';
import { MatterAppModule } from '../matter-app/matter-app.module';
import { PermissionModule } from '../../permission/permission.module';
import { SearchModule } from '../../search/search.module';
import { StorageModule } from '../../storage/storage.module';
import { TenantModule } from '../../tenant/tenant.module';
import { UserModule } from '../../user/user.module';
import { AmicOsVaultProviderController } from './amic-os-vault-provider.controller';
import {
  AmicOsVaultProviderConfig,
  AmicOsVaultProviderGuard,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultProviderService } from './amic-os-vault-provider.service';
import {
  AmicOsVaultCapabilityController,
  AmicOsVaultUploadController,
} from './amic-os-vault-upload.controller';
import { AmicOsVaultUploadService } from './amic-os-vault-upload.service';
import { AmicOsVaultReadController } from './amic-os-vault-read.controller';
import { AmicOsVaultReadService } from './amic-os-vault-read.service';

@Module({
  imports: [
    AuditModule,
    DlpModule,
    FileSecurityModule,
    MatterAppModule,
    PermissionModule,
    SearchModule,
    StorageModule,
    TenantModule,
    UserModule,
  ],
  controllers: [
    AmicOsVaultProviderController,
    AmicOsVaultUploadController,
    AmicOsVaultCapabilityController,
    AmicOsVaultReadController,
  ],
  providers: [
    AmicOsVaultProviderConfig,
    AmicOsVaultProviderGuard,
    AmicOsVaultProviderService,
    AmicOsVaultUploadService,
    AmicOsVaultReadService,
  ],
  exports: [
    AmicOsVaultProviderConfig,
    AmicOsVaultProviderService,
    AmicOsVaultUploadService,
    AmicOsVaultReadService,
  ],
})
export class AmicOsVaultProviderModule {}
