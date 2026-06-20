import { BadRequestException, Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { matterAppLookupQuerySchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../../auth/session.guard';
import { MatterAppRuntimeService } from './matter-app-runtime.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    throw validationFailed();
  }
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('integrations/matter-app')
export class MatterAppLookupController {
  constructor(@Inject(MatterAppRuntimeService) private readonly matterApp: MatterAppRuntimeService) {}

  @Get('matter-lookup')
  lookup(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => matterAppLookupQuerySchema.parse(query));
    return this.matterApp.lookup(sessionUserId(request), input);
  }
}
