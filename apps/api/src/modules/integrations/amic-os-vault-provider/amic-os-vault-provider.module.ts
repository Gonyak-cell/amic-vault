import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { DlpModule } from '../../dlp/dlp.module';
import { PermissionModule } from '../../permission/permission.module';
import { StorageModule } from '../../storage/storage.module';
import { TenantModule } from '../../tenant/tenant.module';
import { UserModule } from '../../user/user.module';
import { AmicOsVaultProviderController } from './amic-os-vault-provider.controller';
import {
  AmicOsVaultProviderConfig,
  AmicOsVaultProviderGuard,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultProviderService } from './amic-os-vault-provider.service';

@Module({
  imports: [AuditModule, DlpModule, PermissionModule, StorageModule, TenantModule, UserModule],
  controllers: [AmicOsVaultProviderController],
  providers: [
    AmicOsVaultProviderConfig,
    AmicOsVaultProviderGuard,
    AmicOsVaultProviderService,
  ],
  exports: [AmicOsVaultProviderConfig, AmicOsVaultProviderService],
})
export class AmicOsVaultProviderModule {}
