import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LawApiClient } from './law-api.client';

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

describe('LawApiClient', () => {
  afterEach(async () => {
    await closeServer();
  });

  it('reports not configured when no OC key is available', () => {
    const client = new LawApiClient({ apiKey: '' });

    expect(client.isConfigured()).toBe(false);
  });

  it('normalizes law.go.kr search results and retries one rate-limit response', async () => {
    const seen: string[] = [];
    const baseUrl = await listen((request, response) => {
      seen.push(request.url ?? '');
      if (seen.length === 1) {
        response.writeHead(429);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
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
    });
    const client = new LawApiClient({ apiKey: 'oc-key', baseUrl });

    const results = await client.searchLaws({ query: '상법 제398조', display: 5, page: 2 });

    expect(results).toEqual([
      {
        externalRef: '001570',
        title: '상법',
        citation: '상법 (20260701 시행)',
        sourceUrl: 'https://www.law.go.kr/법령/상법',
        effectiveDate: '20260701',
        promulgationDate: '20260101',
        ministry: '법무부',
        payload: {
          법령ID: '001570',
          법령명한글: '상법',
          시행일자: '20260701',
          공포일자: '20260101',
          소관부처명: '법무부',
          법령상세링크: '/법령/상법',
        },
      },
    ]);
    const requestUrl = new URL(seen[1] ?? '', 'http://127.0.0.1');
    expect(requestUrl.searchParams.get('OC')).toBe('oc-key');
    expect(requestUrl.searchParams.get('target')).toBe('law');
    expect(requestUrl.searchParams.get('type')).toBe('JSON');
    expect(requestUrl.searchParams.get('query')).toBe('상법 제398조');
  });

  it('fails closed on non-retryable HTTP errors', async () => {
    const baseUrl = await listen((_request, response) => {
      response.writeHead(400);
      response.end();
    });
    const client = new LawApiClient({ apiKey: 'oc-key', baseUrl });

    await expect(client.searchLaws({ query: '상법' })).rejects.toThrow(/fail-closed/iu);
  });
});
