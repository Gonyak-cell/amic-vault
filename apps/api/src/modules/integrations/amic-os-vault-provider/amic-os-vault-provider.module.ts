import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { DlpModule } from '../../dlp/dlp.module';
import { ExternalModule } from '../../external/external.module';
import { FileSecurityModule } from '../../file-security/file-security.module';
import { MatterAppModule } from '../matter-app/matter-app.module';
import { PermissionModule } from '../../permission/permission.module';
import { PreviewModule } from '../../preview/preview.module';
import { SearchModule } from '../../search/search.module';
import { StorageModule } from '../../storage/storage.module';
import { TenantModule } from '../../tenant/tenant.module';
import { UserModule } from '../../user/user.module';
import { DocumentModule } from '../../document/document.module';
import { AmicOsVaultEditorController } from './amic-os-vault-editor.controller';
import { AmicOsVaultEditorService } from './amic-os-vault-editor.service';
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
    DocumentModule,
    ExternalModule,
    FileSecurityModule,
    MatterAppModule,
    PermissionModule,
    PreviewModule,
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
    AmicOsVaultEditorController,
  ],
  providers: [
    AmicOsVaultProviderConfig,
    AmicOsVaultProviderGuard,
    AmicOsVaultProviderService,
    AmicOsVaultUploadService,
    AmicOsVaultReadService,
    AmicOsVaultEditorService,
  ],
  exports: [
    AmicOsVaultProviderConfig,
    AmicOsVaultProviderService,
    AmicOsVaultUploadService,
    AmicOsVaultReadService,
    AmicOsVaultEditorService,
  ],
})
export class AmicOsVaultProviderModule {}
