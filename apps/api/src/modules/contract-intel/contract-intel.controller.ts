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
  UseGuards,
} from '@nestjs/common';
import {
  clauseBankEntryQuerySchema,
  clauseSearchRequestSchema,
  contractAiReviewFindingQuerySchema,
  contractClauseBankQuerySchema,
  contractProcessRequestSchema,
  contractRuleFindingsQuerySchema,
  counterpartyPatternsQuerySchema,
  createClauseBankEntryRequestSchema,
  createNegotiationPositionRequestSchema,
  createPlaybookRuleRequestSchema,
  negotiationIssueQuerySchema,
  negotiationPositionQuerySchema,
  updateNegotiationIssueStatusRequestSchema,
  updateNegotiationPositionRequestSchema,
  updateClauseBankEntryRequestSchema,
  wordClauseInsertionRequestSchema,
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

function parseUuidParam(value: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    return value;
  }
  throw validationFailed();
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

  @Post('negotiation-positions')
  createNegotiationPosition(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createNegotiationPositionRequestSchema.parse(body ?? {}));
    return this.contracts.createNegotiationPosition(permissionContext(request), input);
  }

  @Get('negotiation-positions')
  listNegotiationPositions(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => negotiationPositionQuerySchema.parse(query));
    return this.contracts.listNegotiationPositions(permissionContext(request), input);
  }

  @Get('negotiation-issues')
  listNegotiationIssues(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => negotiationIssueQuerySchema.parse(query));
    return this.contracts.listNegotiationIssues(permissionContext(request), input);
  }

  @Get('ai-review-findings')
  listContractAiReviewFindings(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => contractAiReviewFindingQuerySchema.parse(query));
    return this.contracts.listContractAiReviewFindings(permissionContext(request), input);
  }

  @Patch('ai-review-findings/:findingId/accept')
  acceptContractAiReviewFinding(
    @Req() request: RequestWithSession,
    @Param('findingId') findingIdParam: string,
  ) {
    const findingId = parseUuidParam(findingIdParam);
    return this.contracts.acceptContractAiReviewFinding(permissionContext(request), findingId);
  }

  @Patch('negotiation-issues/:issueId')
  updateNegotiationIssueStatus(
    @Req() request: RequestWithSession,
    @Param('issueId') issueIdParam: string,
    @Body() body: unknown,
  ) {
    const issueId = parseUuidParam(issueIdParam);
    const input = parseOrValidation(() =>
      updateNegotiationIssueStatusRequestSchema.parse(body ?? {}),
    );
    return this.contracts.updateNegotiationIssueStatus(permissionContext(request), issueId, input);
  }

  @Patch('negotiation-positions/:positionId')
  updateNegotiationPosition(
    @Req() request: RequestWithSession,
    @Param('positionId') positionIdParam: string,
    @Body() body: unknown,
  ) {
    const positionId = parseUuidParam(positionIdParam);
    const input = parseOrValidation(() => updateNegotiationPositionRequestSchema.parse(body ?? {}));
    return this.contracts.updateNegotiationPosition(permissionContext(request), positionId, input);
  }

  @Get('counterparty-patterns')
  getCounterpartyPatterns(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => counterpartyPatternsQuerySchema.parse(query));
    return this.contracts.getCounterpartyPatterns(permissionContext(request), input);
  }

  @Get('clause-bank')
  listClauseBank(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => contractClauseBankQuerySchema.parse(query));
    return this.contracts.listClauseBank(permissionContext(request), input);
  }

  @Post('clause-bank/entries')
  createClauseBankEntry(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createClauseBankEntryRequestSchema.parse(body ?? {}));
    return this.contracts.createClauseBankEntry(permissionContext(request), input);
  }

  @Get('clause-bank/entries')
  listClauseBankEntries(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => clauseBankEntryQuerySchema.parse(query));
    return this.contracts.listClauseBankEntries(permissionContext(request), input);
  }

  @Patch('clause-bank/entries/:entryId')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  updateClauseBankEntry(
    @Req() request: RequestWithSession,
    @Param('entryId') entryIdParam: string,
    @Body() body: unknown,
  ) {
    const entryId = parseUuidParam(entryIdParam);
    const input = parseOrValidation(() => updateClauseBankEntryRequestSchema.parse(body ?? {}));
    return this.contracts.updateClauseBankEntry(permissionContext(request), entryId, input);
  }

  @Post('clause-search')
  searchClauses(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => clauseSearchRequestSchema.parse(body ?? {}));
    return this.contracts.searchClauses(permissionContext(request), input);
  }

  @Post('word-addin/clause-insertions')
  prepareWordClauseInsertion(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => wordClauseInsertionRequestSchema.parse(body ?? {}));
    return this.contracts.prepareWordClauseInsertion(permissionContext(request), input);
  }

  @Get('rule-findings')
  listRuleFindings(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => contractRuleFindingsQuerySchema.parse(query));
    return this.contracts.evaluateRuleFindings(permissionContext(request), input);
  }
}
