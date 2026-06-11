import { BadRequestException, Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { searchQuerySchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { SearchService } from './search.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseSearchBody(body: unknown) {
  try {
    return searchQuerySchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function sessionParts(request: RequestWithSession): { tenantId: string; userId: string; sessionId: string } {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw validationFailed();
  return { tenantId, userId, sessionId };
}

@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Post()
  search(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.searchService.search(sessionParts(request), parseSearchBody(body));
  }
}
