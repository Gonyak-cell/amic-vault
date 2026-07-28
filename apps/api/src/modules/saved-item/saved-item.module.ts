import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { SavedItemController } from './saved-item.controller';
import { SavedItemService } from './saved-item.service';

@Module({
  imports: [AuditModule, PermissionModule, SearchModule],
  controllers: [SavedItemController],
  providers: [SavedItemService],
  exports: [SavedItemService],
})
export class SavedItemModule {}
