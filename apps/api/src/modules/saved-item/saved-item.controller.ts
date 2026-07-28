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
  Put,
  Req,
} from '@nestjs/common';
import { createSavedItemSchema, reorderSavedItemsSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { SavedItemService } from './saved-item.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
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

function parseCreateBody(body: unknown) {
  try {
    return createSavedItemSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseReorderBody(body: unknown) {
  try {
    return reorderSavedItemsSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller('saved-items')
export class SavedItemController {
  constructor(@Inject(SavedItemService) private readonly savedItemService: SavedItemService) {}

  @Get()
  list(@Req() request: RequestWithSession) {
    return this.savedItemService.list(sessionParts(request));
  }

  @Post()
  create(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.savedItemService.create(sessionParts(request), parseCreateBody(body));
  }

  @Delete(':savedItemId')
  @HttpCode(204)
  remove(@Req() request: RequestWithSession, @Param('savedItemId') savedItemId: string) {
    return this.savedItemService.remove(
      sessionParts(request),
      parseUuidParam(savedItemId),
    );
  }

  @Put('order')
  @HttpCode(204)
  reorder(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.savedItemService.reorder(sessionParts(request), parseReorderBody(body));
  }
}
