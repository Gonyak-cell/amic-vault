import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { createDocumentComparisonRequestSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../../auth/session.guard';
import { DocumentComparisonService } from './document-comparison.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
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

function parseCreateComparisonBody(body: unknown) {
  try {
    return createDocumentComparisonRequestSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller('documents/:documentId/comparisons')
export class DocumentComparisonController {
  constructor(
    @Inject(DocumentComparisonService)
    private readonly comparisonService: DocumentComparisonService,
  ) {}

  @Post()
  createComparison(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.comparisonService.createComparison(
      sessionUserId(request),
      parseUuid(documentId),
      parseCreateComparisonBody(body),
    );
  }

  @Get(':comparisonId')
  getComparison(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('comparisonId') comparisonId: string,
  ) {
    return this.comparisonService.getComparison(
      sessionUserId(request),
      parseUuid(documentId),
      parseUuid(comparisonId),
    );
  }
}
