import { BadRequestException, Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { RequestWithSession } from '../../auth/session.guard';
import { LawDataService, type LawDataContext } from './law-data.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') throw validationFailed();
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw validationFailed();
  return trimmed;
}

function optionalDate(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const date = boundedString(value, 8);
  if (!/^\d{8}$/u.test(date)) throw validationFailed();
  return date;
}

function optionalNumber(
  value: unknown,
  input: { min: number; max: number; fallback: number },
): number {
  if (value === undefined) return input.fallback;
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < input.min || numberValue > input.max) {
    throw validationFailed();
  }
  return numberValue;
}

function sessionContext(request: RequestWithSession): LawDataContext {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw validationFailed();
  return { tenantId, userId, sessionId };
}

@Controller('integrations')
export class LawDataController {
  constructor(@Inject(LawDataService) private readonly lawData: LawDataService) {}

  @Get('law/search')
  searchLaws(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    return this.lawData.searchLaws(sessionContext(request), {
      query: boundedString(query.query, 120),
      display: optionalNumber(query.display, { min: 1, max: 20, fallback: 10 }),
      page: optionalNumber(query.page, { min: 1, max: 50, fallback: 1 }),
    });
  }

  @Get('dart/filings')
  listDartFilings(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const corpCode = boundedString(query.corpCode, 8);
    if (!/^\d{8}$/u.test(corpCode)) throw validationFailed();
    const beginDate = optionalDate(query.beginDate);
    const endDate = optionalDate(query.endDate);
    return this.lawData.listDartFilings(sessionContext(request), {
      corpCode,
      pageNo: optionalNumber(query.pageNo, { min: 1, max: 1000, fallback: 1 }),
      pageCount: optionalNumber(query.pageCount, { min: 1, max: 100, fallback: 10 }),
      ...(beginDate ? { beginDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
  }

  @Get('dart/companies')
  searchDartCompanies(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    return this.lawData.searchDartCompanies(sessionContext(request), {
      query: boundedString(query.query, 120),
      limit: optionalNumber(query.limit, { min: 1, max: 50, fallback: 10 }),
    });
  }
}
