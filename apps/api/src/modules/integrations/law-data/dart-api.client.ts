import { inflateRawSync } from 'node:zlib';
import { Injectable } from '@nestjs/common';

export interface DartApiClientConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface DartFilingsInput {
  corpCode: string;
  beginDate?: string | undefined;
  endDate?: string | undefined;
  pageNo?: number | undefined;
  pageCount?: number | undefined;
}

export interface NormalizedDartFiling {
  corpCode: string;
  corpName: string;
  stockCode: string | null;
  corpClass: string | null;
  reportName: string;
  receiptNo: string;
  filerName: string | null;
  receiptDate: string;
  remarks: string | null;
}

export interface DartCompanySearchInput {
  query: string;
  limit?: number | undefined;
}

export interface NormalizedDartCompany {
  corpCode: string;
  corpName: string;
  stockCode: string | null;
  modifyDate: string | null;
}

const defaultBaseUrl = 'https://opendart.fss.or.kr/api';
const corpCodeCacheTtlMs = 24 * 60 * 60 * 1000;
const localFileHeaderSignature = 0x04034b50;
const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;

interface CorpCodeCache {
  fetchedAtMs: number;
  companies: NormalizedDartCompany[];
}

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

function firstString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value)) return 10;
  return Math.min(Math.max(value, 1), 50);
}

function searchKey(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

function companyRank(query: string, company: NormalizedDartCompany): number {
  const queryKey = searchKey(query);
  const nameKey = searchKey(company.corpName);
  if (company.corpCode === query) return 0;
  if (company.stockCode === query) return 1;
  if (nameKey === queryKey) return 2;
  if (nameKey.startsWith(queryKey)) return 3;
  return company.stockCode ? 4 : 5;
}

function companyMatches(query: string, company: NormalizedDartCompany): boolean {
  const queryKey = searchKey(query);
  if (!queryKey) return false;
  if (searchKey(company.corpName).includes(queryKey)) return true;
  if (company.corpCode.includes(query)) return true;
  return Boolean(company.stockCode?.includes(query));
}

function normalizeFiling(value: unknown): NormalizedDartFiling | null {
  const entry = asRecord(value);
  const corpCode = firstString(entry, 'corp_code');
  const corpName = firstString(entry, 'corp_name');
  const reportName = firstString(entry, 'report_nm');
  const receiptNo = firstString(entry, 'rcept_no');
  const receiptDate = firstString(entry, 'rcept_dt');
  if (!corpCode || !corpName || !reportName || !receiptNo || !receiptDate) return null;
  return {
    corpCode,
    corpName,
    stockCode: firstString(entry, 'stock_code'),
    corpClass: firstString(entry, 'corp_cls'),
    reportName,
    receiptNo,
    filerName: firstString(entry, 'flr_nm'),
    receiptDate,
    remarks: firstString(entry, 'rm'),
  };
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function xmlTagText(input: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*</${tagName}>`, 'u');
  const match = pattern.exec(input);
  const value = match?.[1]?.trim();
  return value ? decodeXmlText(value) : null;
}

function normalizeCompany(entryXml: string): NormalizedDartCompany | null {
  const corpCode = xmlTagText(entryXml, 'corp_code');
  const corpName = xmlTagText(entryXml, 'corp_name');
  if (!corpCode || !/^\d{8}$/u.test(corpCode) || !corpName) return null;
  const stockCode = xmlTagText(entryXml, 'stock_code');
  const modifyDate = xmlTagText(entryXml, 'modify_date');
  return {
    corpCode,
    corpName,
    stockCode: stockCode && /^\d{6}$/u.test(stockCode) ? stockCode : null,
    modifyDate: modifyDate && /^\d{8}$/u.test(modifyDate) ? modifyDate : null,
  };
}

function parseCorpCodeCompanies(xml: string): NormalizedDartCompany[] {
  const status = xmlTagText(xml, 'status');
  if (status && status !== '000') {
    if (status === '013') return [];
    throw new Error(`dart api fail-closed status ${status}`);
  }
  return Array.from(xml.matchAll(/<list>\s*([\s\S]*?)\s*<\/list>/gu))
    .map((match) => normalizeCompany(match[1] ?? ''))
    .filter((entry): entry is NormalizedDartCompany => entry !== null);
}

function zipReadUInt16(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buffer.length) throw new Error('dart api fail-closed zip');
  return buffer.readUInt16LE(offset);
}

function zipReadUInt32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) throw new Error('dart api fail-closed zip');
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zipReadUInt32(buffer, offset) === endOfCentralDirectorySignature) return offset;
  }
  return -1;
}

function extractZipEntryText(
  buffer: Buffer,
  input: { compressionMethod: number; compressedSize: number; localHeaderOffset: number },
): string {
  if (zipReadUInt32(buffer, input.localHeaderOffset) !== localFileHeaderSignature) {
    throw new Error('dart api fail-closed zip');
  }
  const localNameLength = zipReadUInt16(buffer, input.localHeaderOffset + 26);
  const localExtraLength = zipReadUInt16(buffer, input.localHeaderOffset + 28);
  const dataOffset = input.localHeaderOffset + 30 + localNameLength + localExtraLength;
  if (dataOffset + input.compressedSize > buffer.length)
    throw new Error('dart api fail-closed zip');
  const compressed = buffer.subarray(dataOffset, dataOffset + input.compressedSize);
  if (input.compressionMethod === 0) return compressed.toString('utf8');
  if (input.compressionMethod === 8) return inflateRawSync(compressed).toString('utf8');
  throw new Error('dart api fail-closed zip compression');
}

function extractFirstXmlFromZip(buffer: Buffer): string {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error('dart api fail-closed zip');
  const entryCount = zipReadUInt16(buffer, eocdOffset + 10);
  let directoryOffset = zipReadUInt32(buffer, eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (zipReadUInt32(buffer, directoryOffset) !== centralDirectorySignature) {
      throw new Error('dart api fail-closed zip');
    }
    const compressionMethod = zipReadUInt16(buffer, directoryOffset + 10);
    const compressedSize = zipReadUInt32(buffer, directoryOffset + 20);
    const fileNameLength = zipReadUInt16(buffer, directoryOffset + 28);
    const extraLength = zipReadUInt16(buffer, directoryOffset + 30);
    const commentLength = zipReadUInt16(buffer, directoryOffset + 32);
    const localHeaderOffset = zipReadUInt32(buffer, directoryOffset + 42);
    const fileNameOffset = directoryOffset + 46;
    const fileName = buffer.toString('utf8', fileNameOffset, fileNameOffset + fileNameLength);
    const nextDirectoryOffset = fileNameOffset + fileNameLength + extraLength + commentLength;
    if (fileName.toLocaleLowerCase('en-US').endsWith('.xml')) {
      return extractZipEntryText(buffer, { compressionMethod, compressedSize, localHeaderOffset });
    }
    directoryOffset = nextDirectoryOffset;
  }
  throw new Error('dart api fail-closed zip xml');
}

function corpCodeXmlFromBytes(bytes: ArrayBuffer): string {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 4 && zipReadUInt32(buffer, 0) === localFileHeaderSignature) {
    return extractFirstXmlFromZip(buffer);
  }
  return buffer.toString('utf8');
}

@Injectable()
export class DartApiClient {
  private readonly apiKeyOverride: string | undefined;
  private readonly useApiKeyOverride: boolean;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private corpCodeCache: CorpCodeCache | undefined;

  constructor(config: DartApiClientConfig = {}) {
    this.apiKeyOverride = config.apiKey?.trim() || undefined;
    this.useApiKeyOverride = Object.prototype.hasOwnProperty.call(config, 'apiKey');
    this.baseUrl = (config.baseUrl ?? envValue('DART_API_BASE_URL') ?? defaultBaseUrl).replace(
      /\/+$/,
      '',
    );
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async listFilings(input: DartFilingsInput): Promise<NormalizedDartFiling[]> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('dart api not configured');
    const url = new URL(`${this.baseUrl}/list.json`);
    url.searchParams.set('crtfc_key', apiKey);
    url.searchParams.set('corp_code', input.corpCode);
    url.searchParams.set('page_no', String(input.pageNo ?? 1));
    url.searchParams.set('page_count', String(input.pageCount ?? 10));
    url.searchParams.set('last_reprt_at', 'N');
    if (input.beginDate) url.searchParams.set('bgn_de', input.beginDate);
    if (input.endDate) url.searchParams.set('end_de', input.endDate);
    const payload = asRecord(await this.fetchJsonWithRetry(url));
    const status = firstString(payload, 'status');
    if (status === '013') return [];
    if (status !== '000') {
      throw new Error(`dart api fail-closed status ${status ?? 'unknown'}`);
    }
    const list = Array.isArray(payload.list) ? payload.list : [];
    return list
      .map(normalizeFiling)
      .filter((entry): entry is NormalizedDartFiling => entry !== null);
  }

  async searchCompanies(input: DartCompanySearchInput): Promise<NormalizedDartCompany[]> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('dart api not configured');
    const query = input.query.trim();
    if (!query) return [];
    const companies = await this.loadCompanies(apiKey);
    return companies
      .filter((company) => companyMatches(query, company))
      .sort((left, right) => {
        const rankDelta = companyRank(query, left) - companyRank(query, right);
        if (rankDelta !== 0) return rankDelta;
        return left.corpName.localeCompare(right.corpName, 'ko-KR');
      })
      .slice(0, boundedLimit(input.limit));
  }

  private async loadCompanies(apiKey: string): Promise<NormalizedDartCompany[]> {
    const now = Date.now();
    if (this.corpCodeCache && now - this.corpCodeCache.fetchedAtMs < corpCodeCacheTtlMs) {
      return this.corpCodeCache.companies;
    }
    const url = new URL(`${this.baseUrl}/corpCode.xml`);
    url.searchParams.set('crtfc_key', apiKey);
    const companies = parseCorpCodeCompanies(await this.fetchCorpCodeXmlWithRetry(url));
    this.corpCodeCache = { fetchedAtMs: now, companies };
    return companies;
  }

  private async fetchJsonWithRetry(url: URL): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        lastError = new Error(`dart api fail-closed http ${response.status}`);
        if (response.status === 429) continue;
        break;
      }
      const payload = await response.json();
      if (asRecord(payload).status === '020' && attempt === 0) {
        lastError = new Error('dart api rate limit');
        continue;
      }
      return payload;
    }
    throw lastError instanceof Error ? lastError : new Error('dart api fail-closed');
  }

  private async fetchCorpCodeXmlWithRetry(url: URL): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        lastError = new Error(`dart api fail-closed http ${response.status}`);
        if (response.status === 429) continue;
        break;
      }
      const xml = corpCodeXmlFromBytes(await response.arrayBuffer());
      if (xmlTagText(xml, 'status') === '020' && attempt === 0) {
        lastError = new Error('dart api rate limit');
        continue;
      }
      return xml;
    }
    throw lastError instanceof Error ? lastError : new Error('dart api fail-closed');
  }

  private apiKey(): string | undefined {
    return this.useApiKeyOverride
      ? this.apiKeyOverride
      : envValue('DART_API_KEY', 'OPENDART_API_KEY');
  }
}
