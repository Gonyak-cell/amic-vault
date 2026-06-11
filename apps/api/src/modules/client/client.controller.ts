import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ClientService } from './client.service';
import { createClientSchema } from './dto/create-client.dto';
import { listClientsQuerySchema } from './dto/list-clients.query';
import { updateClientSchema } from './dto/update-client.dto';
import type { RequestWithSession } from '../auth/session.guard';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') throw validationFailed();
    throw error;
  }
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('clients')
export class ClientController {
  constructor(@Inject(ClientService) private readonly clientService: ClientService) {}

  @Post()
  create(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createClientSchema.parse(body));
    return this.clientService.create(sessionUserId(request), input);
  }

  @Get()
  list(@Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => listClientsQuerySchema.parse(query));
    return this.clientService.list(input);
  }

  @Get(':clientId')
  get(@Param('clientId') clientId: string) {
    return this.clientService.get(parseUuid(clientId));
  }

  @Patch(':clientId')
  update(
    @Req() request: RequestWithSession,
    @Param('clientId') clientId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateClientSchema.parse(body));
    return this.clientService.update(sessionUserId(request), parseUuid(clientId), input);
  }
}
