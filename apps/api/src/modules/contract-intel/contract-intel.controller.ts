import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  contractProcessRequestSchema,
  createPlaybookRuleRequestSchema,
} from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { ContractIntelService } from './contract-intel.service';

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

function permissionContext(request: RequestWithSession): {
  tenantId: string;
  userId: string;
  sessionId: string;
} {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw validationFailed();
  return { tenantId, userId, sessionId };
}

@Controller('contract-intel')
export class ContractIntelController {
  constructor(@Inject(ContractIntelService) private readonly contracts: ContractIntelService) {}

  @Post('process')
  processDocument(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => contractProcessRequestSchema.parse(body ?? {}));
    return this.contracts.processDocument(permissionContext(request), input);
  }

  @Post('playbook-rules')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  createPlaybookRule(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createPlaybookRuleRequestSchema.parse(body ?? {}));
    return this.contracts.createPlaybookRule(permissionContext(request), input);
  }
}
