import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  acceptExternalNdaRequestSchema,
  createExternalAnswerRequestSchema,
  createExternalLinkRequestSchema,
  createExternalQuestionRequestSchema,
  createExternalUserRequestSchema,
  createExternalWorkspaceRequestSchema,
} from '@amic-vault/shared';
import { Public } from '../auth/public.decorator';
import type { RequestWithSession } from '../auth/session.guard';
import { ExternalService } from './external.service';

const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/u;

interface RequestWithMetadata extends RequestWithSession {
  ip?: string;
  socket?: { remoteAddress?: string };
}

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

function parseToken(value: string): string {
  if (!tokenPattern.test(value)) throw validationFailed();
  return value;
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

function externalActorRefHash(request: RequestWithMetadata): string | null {
  const raw =
    firstHeader(request.headers['x-amic-external-actor-ref']) ??
    request.ip ??
    request.socket?.remoteAddress ??
    null;
  return raw;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

@Controller('external')
export class ExternalController {
  constructor(@Inject(ExternalService) private readonly external: ExternalService) {}

  @Post('workspaces')
  createWorkspace(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createExternalWorkspaceRequestSchema.parse(body ?? {}));
    return this.external.createWorkspace(permissionContext(request), input);
  }

  @Post('users')
  createExternalUser(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createExternalUserRequestSchema.parse(body ?? {}));
    return this.external.createExternalUser(permissionContext(request), input);
  }

  @Post('links')
  createLink(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createExternalLinkRequestSchema.parse(body ?? {}));
    return this.external.createLink(permissionContext(request), input);
  }

  @Post('links/:linkId/revoke')
  @HttpCode(200)
  revokeLink(@Req() request: RequestWithSession, @Param('linkId') linkId: string) {
    return this.external.revokeLink(permissionContext(request), linkId);
  }

  @Get('workspaces/:workspaceId/qa')
  listWorkspaceQa(@Req() request: RequestWithSession, @Param('workspaceId') workspaceId: string) {
    return this.external.listWorkspaceQa(permissionContext(request), workspaceId);
  }

  @Post('qa/:messageId/answers')
  createAnswer(
    @Req() request: RequestWithSession,
    @Param('messageId') messageId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => createExternalAnswerRequestSchema.parse(body ?? {}));
    return this.external.createAnswer(permissionContext(request), messageId, input);
  }

  @Public()
  @Get('access/:token')
  accessStatus(@Param('token') token: string, @Req() request: RequestWithMetadata) {
    return this.external.accessStatus(parseToken(token), {
      actorRef: externalActorRefHash(request),
    });
  }

  @Public()
  @Post('access/:token/nda')
  acceptNda(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: RequestWithMetadata,
  ) {
    const input = parseOrValidation(() => acceptExternalNdaRequestSchema.parse(body ?? {}));
    return this.external.acceptNda(parseToken(token), input, {
      actorRef: externalActorRefHash(request),
    });
  }

  @Public()
  @Get('access/:token/manifest')
  manifest(@Param('token') token: string, @Req() request: RequestWithMetadata) {
    return this.external.manifest(parseToken(token), {
      actorRef: externalActorRefHash(request),
    });
  }

  @Public()
  @Get('access/:token/download-ticket')
  downloadTicket(@Param('token') token: string, @Req() request: RequestWithMetadata) {
    return this.external.downloadTicket(parseToken(token), {
      actorRef: externalActorRefHash(request),
    });
  }

  @Public()
  @Get('access/:token/qa')
  listQa(@Param('token') token: string) {
    return this.external.listQa(parseToken(token));
  }

  @Public()
  @Post('access/:token/qa/questions')
  createQuestion(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: RequestWithMetadata,
  ) {
    const input = parseOrValidation(() => createExternalQuestionRequestSchema.parse(body ?? {}));
    return this.external.createQuestion(parseToken(token), input, {
      actorRef: externalActorRefHash(request),
    });
  }
}
