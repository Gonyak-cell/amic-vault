import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import {
  AmicOsVaultProviderGuard,
  type AmicOsVaultProviderPrincipal,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultReadService } from './amic-os-vault-read.service';
import type {
  AmicOsVaultReadInput,
  AmicOsVaultReadResponse,
} from './amic-os-vault-read.service';

const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerId = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const date = /^\d{4}-\d{2}-\d{2}$/u;

function invalid(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[]): void {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length
      || keys.some((key, index) => key !== [...expected].sort()[index])) throw invalid();
}

function principalAccountLedgerId(value: unknown): string {
  const input = object(value);
  exactKeys(input, ['tenant_id', 'user_id']);
  if (typeof input.tenant_id !== 'string' || !safeRef.test(input.tenant_id)) throw invalid();
  const userId = typeof input.user_id === 'string'
    ? input.user_id.trim().toLowerCase()
    : '';
  if (!accountLedgerId.test(userId)) throw invalid();
  return userId;
}

function matterId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !safeRef.test(value)) throw invalid();
  return value;
}

function page(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) throw invalid();
  return Number(value);
}

function optionalDate(value: unknown): string | null {
  if (value === null) return null;
  const parsed = typeof value === 'string'
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(Number.NaN);
  if (typeof value !== 'string'
      || !date.test(value)
      || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== value) {
    throw invalid();
  }
  return value;
}

function parseList(value: unknown): AmicOsVaultReadInput {
  const input = object(value);
  exactKeys(input, ['principal', 'lawos_matter_id', 'page', 'page_size']);
  return {
    accountLedgerId: principalAccountLedgerId(input.principal),
    lawosMatterId: matterId(input.lawos_matter_id),
    page: page(input.page, 1_000),
    pageSize: page(input.page_size, 50),
    query: null,
    dateFrom: null,
    dateTo: null,
  };
}

function parseSearch(value: unknown): AmicOsVaultReadInput {
  const input = object(value);
  exactKeys(input, [
    'principal',
    'query',
    'lawos_matter_id',
    'current_version_only',
    'date_from',
    'date_to',
    'page',
    'page_size',
  ]);
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const dateFrom = optionalDate(input.date_from);
  const dateTo = optionalDate(input.date_to);
  if (query.length > 2_000
      || input.current_version_only !== true
      || (dateFrom && dateTo && dateFrom > dateTo)) throw invalid();
  return {
    accountLedgerId: principalAccountLedgerId(input.principal),
    lawosMatterId: matterId(input.lawos_matter_id),
    page: page(input.page, 1_000),
    pageSize: page(input.page_size, 50),
    query: query || null,
    dateFrom,
    dateTo,
  };
}

function principal(request: RequestWithAmicOsVaultProvider): AmicOsVaultProviderPrincipal {
  if (!request.amicOsVaultPrincipal) throw invalid();
  return request.amicOsVaultPrincipal;
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/read')
export class AmicOsVaultReadController {
  constructor(
    @Inject(AmicOsVaultReadService)
    private readonly service: AmicOsVaultReadService,
  ) {}

  @Post('documents')
  list(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
  ): Promise<AmicOsVaultReadResponse> {
    return this.service.list(principal(request), parseList(body));
  }

  @Post('search')
  search(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
  ): Promise<AmicOsVaultReadResponse> {
    return this.service.search(principal(request), parseSearch(body));
  }
}
