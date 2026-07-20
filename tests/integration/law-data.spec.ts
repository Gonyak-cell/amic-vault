import 'reflect-metadata';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from './helpers/db';
import { loginAlphaOwner } from './document-access/document-api-helpers';

const envKeys = [
  'LAW_DATA_API_BASE_URL',
  'LAW_DATA_OC',
  'LAW_GO_KR_OC',
  'LAW_API_OC',
  'DART_API_BASE_URL',
  'DART_API_KEY',
  'OPENDART_API_KEY',
] as const;

let server: Server;
let app: INestApplication;
let baseUrl: string;
let cookie: string;
const previousEnv = new Map<string, string | undefined>();

function listen(handler: RequestListener): Promise<string> {
  server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function authorityRows(externalRef: string): Promise<
  {
    title: string;
    citation: string;
    node_type: string;
    source_table: string;
    matter_id: string | null;
  }[]
> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT ea.title, ea.citation, gn.node_type, gn.source_table, gn.matter_id
        FROM external_authorities ea
        JOIN graph_nodes gn
          ON gn.tenant_id = ea.tenant_id
          AND gn.source_id = ea.authority_id
        WHERE ea.tenant_id = $1
          AND ea.external_ref = $2
      `,
      [tenantAlphaId, externalRef],
    );
    return result.rows as {
      title: string;
      citation: string;
      node_type: string;
      source_table: string;
      matter_id: string | null;
    }[];
  });
}

async function dartCacheCount(corpCode: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM law_data_dart_filing_cache
        WHERE tenant_id = $1
          AND corp_code = $2
      `,
      [tenantAlphaId, corpCode],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function opendartAuditCount(scopeType: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'SEARCH_EXECUTED'
          AND metadata_json->>'provider_key' = 'opendart'
          AND metadata_json->>'scope_type' = $2
      `,
      [tenantAlphaId, scopeType],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

describe('law data integrations', () => {
  beforeAll(async () => {
    for (const key of envKeys) previousEnv.set(key, process.env[key]);
    const upstreamBaseUrl = await listen((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      response.setHeader('content-type', 'application/json');
      if (url.pathname === '/lawSearch.do') {
        expect(url.searchParams.get('OC')).toBe('law-fixture-key');
        response.end(
          JSON.stringify({
            LawSearch: {
              law: [
                {
                  법령ID: '001570',
                  법령명한글: '상법',
                  시행일자: '20260701',
                  공포일자: '20260101',
                  소관부처명: '법무부',
                  법령상세링크: '/법령/상법',
                },
              ],
            },
          }),
        );
        return;
      }
      if (url.pathname === '/corpCode.xml') {
        expect(url.searchParams.get('crtfc_key')).toBe('dart-fixture-key');
        response.setHeader('content-type', 'application/xml');
        response.end(`<?xml version="1.0" encoding="UTF-8"?>
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
          </result>`);
        return;
      }
      if (url.pathname === '/list.json') {
        expect(url.searchParams.get('crtfc_key')).toBe('dart-fixture-key');
        response.end(
          JSON.stringify({
            status: '000',
            message: '정상',
            list: [
              {
                corp_code: url.searchParams.get('corp_code') ?? '00126380',
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
        return;
      }
      response.writeHead(404);
      response.end(JSON.stringify({ error: 'not_found' }));
    });
    process.env.LAW_DATA_API_BASE_URL = upstreamBaseUrl;
    process.env.LAW_DATA_OC = 'law-fixture-key';
    process.env.DART_API_BASE_URL = upstreamBaseUrl;
    process.env.DART_API_KEY = 'dart-fixture-key';
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    cookie = await loginAlphaOwner(baseUrl);
  });

  afterAll(async () => {
    await app.close();
    await closeServer();
    previousEnv.forEach((value, key) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it('returns not_configured without writing when law.go.kr key is absent', async () => {
    const key = process.env.LAW_DATA_OC;
    delete process.env.LAW_DATA_OC;
    try {
      const response = await fetch(`${baseUrl}/v1/integrations/law/search?query=상법`, {
        headers: { cookie },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: 'not_configured', query: '상법', results: [] });
    } finally {
      process.env.LAW_DATA_OC = key;
    }
  });

  it('returns not_configured without writing when DART key is absent for company search', async () => {
    const dartKey = process.env.DART_API_KEY;
    const openDartKey = process.env.OPENDART_API_KEY;
    delete process.env.DART_API_KEY;
    delete process.env.OPENDART_API_KEY;
    try {
      const response = await fetch(
        `${baseUrl}/v1/integrations/dart/companies?query=${encodeURIComponent('삼성')}`,
        { headers: { cookie } },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: 'not_configured', query: '삼성', companies: [] });
    } finally {
      if (dartKey === undefined) delete process.env.DART_API_KEY;
      else process.env.DART_API_KEY = dartKey;
      if (openDartKey === undefined) delete process.env.OPENDART_API_KEY;
      else process.env.OPENDART_API_KEY = openDartKey;
    }
  });

  it('searches law.go.kr fixtures and upserts authority graph nodes', async () => {
    const response = await fetch(
      `${baseUrl}/v1/integrations/law/search?query=${encodeURIComponent('상법 제398조')}`,
      { headers: { cookie } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      externalRef: '001570',
      title: '상법',
      citation: '상법 (20260701 시행)',
    });
    await expect(authorityRows('001570')).resolves.toEqual([
      {
        title: '상법',
        citation: '상법 (20260701 시행)',
        node_type: 'authority',
        source_table: 'external_authorities',
        matter_id: null,
      },
    ]);
  });

  it('proxies DART company search and audits the public lookup', async () => {
    const response = await fetch(
      `${baseUrl}/v1/integrations/dart/companies?query=${encodeURIComponent('삼성')}&limit=5`,
      { headers: { cookie } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.query).toBe('삼성');
    expect(body.companies).toEqual(
      expect.arrayContaining([
        {
          corpCode: '00126380',
          corpName: '삼성전자',
          stockCode: '005930',
          modifyDate: '20260701',
        },
      ]),
    );
    expect(body.companies).toHaveLength(2);
    await expect(opendartAuditCount('dart_company_search')).resolves.toBeGreaterThanOrEqual(1);
  });

  it('proxies DART filings and caches the response by tenant', async () => {
    const response = await fetch(
      `${baseUrl}/v1/integrations/dart/filings?corpCode=00126380&beginDate=20260701&endDate=20260705`,
      { headers: { cookie } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      corpCode: '00126380',
      filings: [
        {
          corpCode: '00126380',
          corpName: '삼성전자',
          reportName: '반기보고서',
          receiptNo: '20260701000001',
        },
      ],
    });
    await expect(dartCacheCount('00126380')).resolves.toBeGreaterThanOrEqual(1);
    await expect(opendartAuditCount('dart_filings')).resolves.toBeGreaterThanOrEqual(1);
  });
});
