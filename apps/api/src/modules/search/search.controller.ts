import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  createSavedSearchSchema,
  matterSuggestionQuerySchema,
  searchQuerySchema,
} from '@amic-vault/shared';
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

function parseMatterSuggestionBody(body: unknown) {
  try {
    return matterSuggestionQuerySchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSavedSearchBody(body: unknown) {
  try {
    return createSavedSearchSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseUuidParam(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw validationFailed();
  }
  return value;
}

function sessionParts(request: RequestWithSession): {
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

@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Post()
  search(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.searchService.search(sessionParts(request), parseSearchBody(body));
  }

  @Post('matter-suggestions')
  suggestMatters(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.searchService.suggestMatters(
      sessionParts(request),
      parseMatterSuggestionBody(body),
    );
  }

  @Get('saved-searches')
  listSavedSearches(@Req() request: RequestWithSession) {
    return this.searchService.listSavedSearches(sessionParts(request));
  }

  @Post('saved-searches')
  saveSavedSearch(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.searchService.saveSavedSearch(sessionParts(request), parseSavedSearchBody(body));
  }

  @Delete('saved-searches/:savedSearchId')
  @HttpCode(204)
  deleteSavedSearch(
    @Req() request: RequestWithSession,
    @Param('savedSearchId') savedSearchId: string,
  ) {
    return this.searchService.deleteSavedSearch(
      sessionParts(request),
      parseUuidParam(savedSearchId),
    );
  }
}
