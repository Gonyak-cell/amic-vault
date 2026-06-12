import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { graphFactsQuerySchema, graphSyncRequestSchema } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { GraphConsistencyService } from './graph-consistency.service';
import { GraphQueryService } from './graph-query.service';
import { GraphSyncService } from './graph-sync.service';

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

@Controller('graph')
export class GraphController {
  constructor(
    @Inject(GraphSyncService) private readonly sync: GraphSyncService,
    @Inject(GraphQueryService) private readonly query: GraphQueryService,
    @Inject(GraphConsistencyService) private readonly consistency: GraphConsistencyService,
  ) {}

  @Post('sync')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  syncMatter(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => graphSyncRequestSchema.parse(body ?? {}));
    return this.sync.syncMatter(sessionParts(request), input.matterId);
  }

  @Get('facts')
  listFacts(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => graphFactsQuerySchema.parse(query));
    return this.query.listFacts(sessionParts(request), {
      matterId: input.matterId,
      documentId: input.documentId,
      limit: input.limit,
      scopeLabel: 'graph_query',
    });
  }

  @Get('consistency')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  checkConsistency(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => graphFactsQuerySchema.parse(query));
    return this.consistency.checkMatter(sessionParts(request), input.matterId);
  }
}
