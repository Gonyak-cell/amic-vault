import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  Delete,
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import {
  createMatterRelatedMatterSchema,
  createMatterIssueSchema,
  createMatterKeyDateSchema,
  deleteMatterRelatedMatterQuerySchema,
  updateMatterIssueSchema,
  updateMatterKeyDateSchema,
  updateLegalHoldSchema,
  reviewKnowledgeCandidateSchema,
  reviewMatterWikiPageSchema,
  waiveMatterClosingChecklistItemSchema,
  matterClosingChecklistItemCodeSchema,
} from '@amic-vault/shared';
import { createMatterSchema } from './dto/create-matter.dto';
import { listMattersQuerySchema } from './dto/list-matters.query';
import { updateMatterSchema } from './dto/update-matter.dto';
import { updateMatterStatusSchema } from './dto/update-matter-status.dto';
import { MatterDashboardService } from './matter-dashboard.service';
import { MatterClosingService } from './matter-closing.service';
import { ClosingBinderService } from './closing-binder.service';
import { KnowledgeCandidateService } from './knowledge-candidate.service';
import { MatterIssueService } from './matter-issue.service';
import { MatterService } from './matter.service';
import { MatterWikiService } from './matter-wiki.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

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

function parseBinderManifestFormat(value: unknown): 'csv' | 'json' {
  if (value === undefined || value === 'json') return 'json';
  if (value === 'csv') return 'csv';
  throw validationFailed();
}

@Controller('matters')
export class MatterController {
  constructor(
    @Inject(MatterService) private readonly matterService: MatterService,
    @Inject(MatterIssueService) private readonly matterIssueService: MatterIssueService,
    @Inject(MatterDashboardService)
    private readonly matterDashboardService: MatterDashboardService,
    @Inject(MatterClosingService)
    private readonly matterClosingService: MatterClosingService,
    @Inject(ClosingBinderService)
    private readonly closingBinderService: ClosingBinderService,
    @Inject(KnowledgeCandidateService)
    private readonly knowledgeCandidateService: KnowledgeCandidateService,
    @Inject(MatterWikiService)
    private readonly matterWikiService: MatterWikiService,
  ) {}

  @Post()
  create(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createMatterSchema.parse(body));
    return this.matterService.create(sessionUserId(request), input);
  }

  @Get()
  list(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => listMattersQuerySchema.parse(query));
    return this.matterService.list(sessionUserId(request), input);
  }

  @Get(':matterId/dashboard')
  getDashboard(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterDashboardService.getDashboard(sessionUserId(request), parseUuid(matterId));
  }

  @Get(':matterId/closing-binder')
  getClosingBinder(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.closingBinderService.getBinder(sessionUserId(request), parseUuid(matterId));
  }

  @Get(':matterId/closing-binder/manifest')
  async downloadClosingBinderManifest(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Query('format') format: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const download = await this.closingBinderService.downloadManifest(
      sessionUserId(request),
      parseUuid(matterId),
      parseBinderManifestFormat(format),
    );
    response.setHeader('content-type', download.mimeType);
    response.setHeader('content-disposition', `attachment; filename="${download.filename}"`);
    return download.body;
  }

  @Get(':matterId/closing-binder/archive')
  async downloadClosingBinderArchive(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const download = await this.closingBinderService.downloadArchive(
      sessionUserId(request),
      parseUuid(matterId),
    );
    response.setHeader('content-type', download.mimeType);
    response.setHeader('content-disposition', `attachment; filename="${download.filename}"`);
    response.setHeader('x-content-sha256', download.sha256);
    response.setHeader('x-file-count', String(download.fileCount));
    response.setHeader('x-item-count', String(download.itemCount));
    return new StreamableFile(download.body);
  }

  @Get(':matterId/wiki')
  listWikiPages(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterWikiService.list(sessionUserId(request), parseUuid(matterId));
  }

  @Post(':matterId/wiki/regenerate')
  regenerateWiki(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterWikiService.regenerate(sessionUserId(request), parseUuid(matterId));
  }

  @Patch(':matterId/wiki/:pageId/review')
  reviewWikiPage(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => reviewMatterWikiPageSchema.parse(body ?? {}));
    return this.matterWikiService.reviewPage(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(pageId),
      input,
    );
  }

  @Get(':matterId/wiki-export')
  async exportWiki(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const download = await this.matterWikiService.exportConfirmed(
      sessionUserId(request),
      parseUuid(matterId),
    );
    response.setHeader('content-type', download.mimeType);
    response.setHeader('content-disposition', `attachment; filename="${download.filename}"`);
    response.setHeader('x-content-sha256', download.sha256);
    response.setHeader('x-page-count', String(download.pageCount));
    return new StreamableFile(Buffer.from(download.body));
  }

  @Get(':matterId')
  get(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterService.get(sessionUserId(request), parseUuid(matterId));
  }

  @Get(':matterId/related-matters')
  listRelatedMatters(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterService.listRelatedMatters(sessionUserId(request), parseUuid(matterId));
  }

  @Post(':matterId/related-matters')
  addRelatedMatter(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => createMatterRelatedMatterSchema.parse(body));
    return this.matterService.addRelatedMatter(sessionUserId(request), parseUuid(matterId), input);
  }

  @Delete(':matterId/related-matters/:relatedMatterId')
  removeRelatedMatter(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('relatedMatterId') relatedMatterId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => deleteMatterRelatedMatterQuerySchema.parse(query));
    return this.matterService.removeRelatedMatter(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(relatedMatterId),
      input.relationType,
    );
  }

  @Get(':matterId/issues')
  listIssues(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterIssueService.listIssues(sessionUserId(request), parseUuid(matterId));
  }

  @Post(':matterId/issues')
  createIssue(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => createMatterIssueSchema.parse(body));
    return this.matterIssueService.createIssue(sessionUserId(request), parseUuid(matterId), input);
  }

  @Patch(':matterId/issues/:issueId')
  updateIssue(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('issueId') issueId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateMatterIssueSchema.parse(body));
    return this.matterIssueService.updateIssue(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(issueId),
      input,
    );
  }

  @Delete(':matterId/issues/:issueId')
  @HttpCode(204)
  deleteIssue(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('issueId') issueId: string,
  ) {
    return this.matterIssueService.deleteIssue(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(issueId),
    );
  }

  @Get(':matterId/key-dates')
  listKeyDates(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterIssueService.listKeyDates(sessionUserId(request), parseUuid(matterId));
  }

  @Post(':matterId/key-dates')
  createKeyDate(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => createMatterKeyDateSchema.parse(body));
    return this.matterIssueService.createKeyDate(
      sessionUserId(request),
      parseUuid(matterId),
      input,
    );
  }

  @Patch(':matterId/key-dates/:keyDateId')
  updateKeyDate(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('keyDateId') keyDateId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateMatterKeyDateSchema.parse(body));
    return this.matterIssueService.updateKeyDate(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(keyDateId),
      input,
    );
  }

  @Delete(':matterId/key-dates/:keyDateId')
  @HttpCode(204)
  deleteKeyDate(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('keyDateId') keyDateId: string,
  ) {
    return this.matterIssueService.deleteKeyDate(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(keyDateId),
    );
  }

  @Patch(':matterId')
  update(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateMatterSchema.parse(body));
    return this.matterService.update(sessionUserId(request), parseUuid(matterId), input);
  }

  @Patch(':matterId/status')
  updateStatus(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateMatterStatusSchema.parse(body));
    return this.matterService.updateStatus(sessionUserId(request), parseUuid(matterId), input);
  }

  @Patch('knowledge-candidates/:candidateId/review')
  reviewKnowledgeCandidate(
    @Req() request: RequestWithSession,
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => reviewKnowledgeCandidateSchema.parse(body ?? {}));
    return this.knowledgeCandidateService.reviewCandidate(
      sessionUserId(request),
      parseUuid(candidateId),
      input,
    );
  }

  @Patch('wiki-pages/:pageId/review')
  reviewWikiPageById(
    @Req() request: RequestWithSession,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => reviewMatterWikiPageSchema.parse(body ?? {}));
    return this.matterWikiService.reviewPageById(sessionUserId(request), parseUuid(pageId), input);
  }

  @Get(':matterId/closing-checklist')
  getClosingChecklist(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterClosingService.getChecklist(sessionUserId(request), parseUuid(matterId));
  }

  @Post(':matterId/closing-checklist/evaluate')
  evaluateClosingChecklist(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
  ) {
    return this.matterClosingService.evaluateChecklist(sessionUserId(request), parseUuid(matterId));
  }

  @Post(':matterId/closing-checklist/:itemCode/waive')
  waiveClosingChecklistItem(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('itemCode') itemCode: string,
    @Body() body: unknown,
  ) {
    const parsedItemCode = parseOrValidation(() =>
      matterClosingChecklistItemCodeSchema.parse(itemCode),
    );
    const input = parseOrValidation(() => waiveMatterClosingChecklistItemSchema.parse(body));
    return this.matterClosingService.waiveItem(
      sessionUserId(request),
      parseUuid(matterId),
      parsedItemCode,
      input,
    );
  }

  @Patch(':matterId/legal-hold')
  updateLegalHold(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateLegalHoldSchema.parse(body));
    return this.matterService.updateLegalHold(sessionUserId(request), parseUuid(matterId), input);
  }
}
