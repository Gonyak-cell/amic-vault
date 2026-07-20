import { Inject, Injectable, Optional } from '@nestjs/common';

export interface LawApiClientConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export const LAW_API_CLIENT_CONFIG = Symbol('LAW_API_CLIENT_CONFIG');

export interface LawSearchInput {
  query: string;
  display?: number | undefined;
  page?: number | undefined;
}

export interface NormalizedLawSearchResult {
  externalRef: string;
  title: string;
  citation: string;
  sourceUrl: string;
  effectiveDate: string | null;
  promulgationDate: string | null;
  ministry: string | null;
  payload: Record<string, unknown>;
}

const defaultBaseUrl = 'https://www.law.go.kr/DRF';

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function compactDate(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 8 ? digits : value.slice(0, 32);
}

function sourceUrlFrom(input: { baseUrl: string; title: string; link: string | null }): string {
  if (input.link?.startsWith('http://') || input.link?.startsWith('https://')) return input.link;
  if (input.link?.startsWith('/')) return `https://www.law.go.kr${input.link}`;
  return `https://www.law.go.kr/법령/${encodeURIComponent(input.title)}`;
}

function lawEntries(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const searchRoot = asRecord(root.LawSearch ?? root.lawSearch ?? root);
  return asArray(
    searchRoot.law ??
      searchRoot.Law ??
      searchRoot.items ??
      searchRoot.item ??
      searchRoot.results ??
      root.law,
  )
    .map(asRecord)
    .filter((entry) => Object.keys(entry).length > 0);
}

function normalizeLawEntry(entry: Record<string, unknown>, baseUrl: string): NormalizedLawSearchResult | null {
  const title = firstString(entry, [
    '법령명한글',
    '법령명',
    'lawName',
    'law_name',
    'title',
  ]);
  if (!title) return null;
  const externalRef =
    firstString(entry, ['법령ID', '법령일련번호', 'MST', 'mst', 'lawId', 'law_id', 'id']) ?? title;
  const ministry = firstString(entry, ['소관부처명', 'ministry', 'department']);
  const effectiveDate = compactDate(firstString(entry, ['시행일자', '시행일', 'effectiveDate']));
  const promulgationDate = compactDate(firstString(entry, ['공포일자', 'promulgationDate']));
  const link = firstString(entry, ['법령상세링크', 'link', 'url']);
  return {
    externalRef,
    title,
    citation: effectiveDate ? `${title} (${effectiveDate} 시행)` : title,
    sourceUrl: sourceUrlFrom({ baseUrl, title, link }),
    effectiveDate,
    promulgationDate,
    ministry,
    payload: entry,
  };
}

@Injectable()
export class LawApiClient {
  private readonly apiKeyOverride: string | undefined;
  private readonly useApiKeyOverride: boolean;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    @Optional() @Inject(LAW_API_CLIENT_CONFIG) config: LawApiClientConfig = {},
  ) {
    this.apiKeyOverride = config.apiKey?.trim() || undefined;
    this.useApiKeyOverride = Object.prototype.hasOwnProperty.call(config, 'apiKey');
    this.baseUrl = (config.baseUrl ?? envValue('LAW_DATA_API_BASE_URL') ?? defaultBaseUrl).replace(
      /\/+$/,
      '',
    );
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async searchLaws(input: LawSearchInput): Promise<NormalizedLawSearchResult[]> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('law data api not configured');
    const url = new URL(`${this.baseUrl}/lawSearch.do`);
    url.searchParams.set('OC', apiKey);
    url.searchParams.set('target', 'law');
    url.searchParams.set('type', 'JSON');
    url.searchParams.set('query', input.query);
    url.searchParams.set('display', String(input.display ?? 10));
    url.searchParams.set('page', String(input.page ?? 1));
    const payload = await this.fetchJsonWithRetry(url);
    return lawEntries(payload)
      .map((entry) => normalizeLawEntry(entry, this.baseUrl))
      .filter((entry): entry is NormalizedLawSearchResult => entry !== null);
  }

  private async fetchJsonWithRetry(url: URL): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImpl(url);
      if (response.ok) return response.json();
      lastError = new Error(`law data api fail-closed status ${response.status}`);
      if (response.status !== 429) break;
    }
    throw lastError instanceof Error ? lastError : new Error('law data api fail-closed');
  }

  private apiKey(): string | undefined {
    return this.useApiKeyOverride
      ? this.apiKeyOverride
      : envValue('LAW_DATA_OC', 'LAW_GO_KR_OC', 'LAW_API_OC');
  }
}
