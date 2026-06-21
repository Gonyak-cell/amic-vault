import { Controller, Get, Inject } from '@nestjs/common';
import { MatterAppRuntimeService } from './matter-app-runtime.service';

@Controller('integrations/matter-app')
export class MatterAppStatusController {
  constructor(@Inject(MatterAppRuntimeService) private readonly matterApp: MatterAppRuntimeService) {}

  @Get('status')
  status() {
    return this.matterApp.status();
  }
}
