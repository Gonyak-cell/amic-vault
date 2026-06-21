import { BadRequestException, Controller, ForbiddenException, Get, Inject, Query, Req } from '@nestjs/common';
import { orgDirectorySubjectQuerySchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { OrgDirectoryService } from './org-directory.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') throw validationFailed();
    throw error;
  }
}

function requestContext(request: RequestWithSession): {
  sessionId: string;
  tenantId: string;
  userId: string;
} {
  const sessionId = request.session?.sessionId;
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  if (!sessionId || !tenantId || !userId) throw permissionDenied();
  return { sessionId, tenantId, userId };
}

@Controller('org-directory')
export class OrgDirectoryController {
  constructor(@Inject(OrgDirectoryService) private readonly orgDirectory: OrgDirectoryService) {}

  @Get('subjects')
  searchSubjects(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => orgDirectorySubjectQuerySchema.parse(query));
    return this.orgDirectory.searchSubjects(requestContext(request), input);
  }
}
