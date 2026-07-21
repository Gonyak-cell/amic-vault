import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { DartApiClient } from './dart-api.client';

let server: Server | undefined;

function listen(handler: RequestListener): Promise<string> {
  server = createServer(handler);
  return new Promise((resolve) => {
    server?.listen(0, '127.0.0.1', () => {
      const address = server?.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => {
      server = undefined;
      if (error) reject(error);
      else resolve();
    });
  });
}

function zipXml(fileName: string, xml: string): Buffer {
  const name = Buffer.from(fileName, 'utf8');
  const source = Buffer.from(xml, 'utf8');
  const compressed = deflateRawSync(source);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(source.length, 22);
  localHeader.writeUInt16LE(name.length, 26);

  const centralOffset = localHeader.length + name.length + compressed.length;
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt32LE(0, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(source.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralHeader.length + name.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([localHeader, name, compressed, centralHeader, name, endOfCentralDirectory]);
}

describe('DartApiClient', () => {
  afterEach(async () => {
    await closeServer();
  });

  it('reports not configured when no API key is available', () => {
    const client = new DartApiClient({ apiKey: '' });

    expect(client.isConfigured()).toBe(false);
  });

  it('normalizes list.json filings and retries one DART rate-limit status', async () => {
    const seen: string[] = [];
    const baseUrl = await listen((request, response) => {
      seen.push(request.url ?? '');
      response.writeHead(200, { 'content-type': 'application/json' });
      if (seen.length === 1) {
        response.end(JSON.stringify({ status: '020', message: 'rate limit' }));
        return;
      }
      response.end(
        JSON.stringify({
          status: '000',
          message: '정상',
          list: [
            {
              corp_code: '00126380',
              corp_name: '삼성전자',
              stock_code: '005930',
              corp_cls: 'Y',
              report_nm: '반기보고서',
              rcept_no: '20260701000001',
              flr_nm: '삼성전자',
              rcept_dt: '20260701',
              rm: '',
            },
          ],
        }),
      );
    });
    const client = new DartApiClient({ apiKey: 'dart-key', baseUrl });

    const filings = await client.listFilings({
      corpCode: '00126380',
      beginDate: '20260701',
      endDate: '20260705',
      pageNo: 2,
      pageCount: 5,
    });

    expect(filings).toEqual([
      {
        corpCode: '00126380',
        corpName: '삼성전자',
        stockCode: '005930',
        corpClass: 'Y',
        reportName: '반기보고서',
        receiptNo: '20260701000001',
        filerName: '삼성전자',
        receiptDate: '20260701',
        remarks: null,
      },
    ]);
    expect(seen[1]).toContain('crtfc_key=dart-key');
    expect(seen[1]).toContain('corp_code=00126380');
    expect(seen[1]).toContain('bgn_de=20260701');
  });

  it('treats DART no-data status as an empty result', async () => {
    const baseUrl = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: '013', message: 'no data' }));
    });
    const client = new DartApiClient({ apiKey: 'dart-key', baseUrl });

    await expect(client.listFilings({ corpCode: '00126380' })).resolves.toEqual([]);
  });

  it('searches zipped corpCode.xml companies by name and stock code', async () => {
    const seen: string[] = [];
    const baseUrl = await listen((request, response) => {
      seen.push(request.url ?? '');
      response.writeHead(200, { 'content-type': 'application/zip' });
      response.end(
        zipXml(
          'CORPCODE.xml',
          `<?xml version="1.0" encoding="UTF-8"?>
          <result>
            <list>
              <corp_code>00126380</corp_code>
              <corp_name>삼성전자</corp_name>
              <stock_code>005930</stock_code>
              <modify_date>20260701</modify_date>
            </list>
            <list>
              <corp_code>00401731</corp_code>
              <corp_name>삼성물산</corp_name>
              <stock_code>028260</stock_code>
              <modify_date>20260701</modify_date>
            </list>
          </result>`,
        ),
      );
    });
    const client = new DartApiClient({ apiKey: 'dart-key', baseUrl });

    await expect(client.searchCompanies({ query: '삼성전자', limit: 1 })).resolves.toEqual([
      {
        corpCode: '00126380',
        corpName: '삼성전자',
        stockCode: '005930',
        modifyDate: '20260701',
      },
    ]);
    await expect(client.searchCompanies({ query: '005930' })).resolves.toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/corpCode.xml');
    expect(seen[0]).toContain('crtfc_key=dart-key');
  });

  it('fails closed on non-retryable HTTP errors', async () => {
    const baseUrl = await listen((_request, response) => {
      response.writeHead(400);
      response.end();
    });
    const client = new DartApiClient({ apiKey: 'dart-key', baseUrl });

    await expect(client.listFilings({ corpCode: '00126380' })).rejects.toThrow(/fail-closed/iu);
  });
});
