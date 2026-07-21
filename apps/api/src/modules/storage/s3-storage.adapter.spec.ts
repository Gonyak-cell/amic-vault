import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3StorageAdapter } from './s3-storage.adapter';

function createAdapter(input: { serverSideEncryption?: string } = {}): S3StorageAdapter {
  return new S3StorageAdapter({
    endpoint: 'http://minio.local:9000',
    bucket: 'amic-vault-dev',
    region: 'ap-northeast-2',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    ...input,
  });
}

describe('S3StorageAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs range GET requests with the Range header', async () => {
    const calls: Array<{ init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      calls.push({ init });
      return new Response('0123456789', {
        status: 206,
        headers: {
          'content-length': '10',
          'content-type': 'application/pdf',
          etag: '"range"',
        },
      });
    });

    const object = await createAdapter().getRange({
      key: 'tenants/t1/documents/file.pdf',
      start: 0,
      end: 1023,
    });

    expect(object.contentLength).toBe(10);
    expect(calls[0]?.init?.method).toBe('GET');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.range).toBe('bytes=0-1023');
    expect(headers.authorization).toContain(
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date',
    );
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it('creates expiring SigV4 presigned GET URLs', async () => {
    const result = await createAdapter().createReadUrl({
      key: 'tenants/t1/documents/file.pdf',
      expiresInSeconds: 120,
    });
    const url = new URL(result.url);

    expect(url.pathname).toBe('/amic-vault-dev/tenants/t1/documents/file.pdf');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('test-access/');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('can sign read URLs against a worker-visible endpoint', async () => {
    const result = await new S3StorageAdapter({
      endpoint: 'http://localhost:9000',
      readUrlEndpoint: 'http://host.docker.internal:9000',
      bucket: 'amic-vault-dev',
      region: 'ap-northeast-2',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
    }).createReadUrl({
      key: 'tenants/t1/documents/file.pdf',
      expiresInSeconds: 120,
    });
    const url = new URL(result.url);

    expect(url.origin).toBe('http://host.docker.internal:9000');
    expect(url.pathname).toBe('/amic-vault-dev/tenants/t1/documents/file.pdf');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('adds S3 SSE headers to object PUTs', async () => {
    const calls: Array<{ init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_input, init) => {
        calls.push({ init });
        return new Response('', { status: 404 });
      })
      .mockImplementationOnce(async (_input, init) => {
        calls.push({ init });
        return new Response('', { status: 200 });
      });

    await createAdapter({ serverSideEncryption: 'AES256' }).putIfAbsent({
      key: 'tenants/t1/documents/file.pdf',
      body: Buffer.from('contract'),
      contentLength: 8,
      contentType: 'application/pdf',
    });

    const putHeaders = calls[1]?.init?.headers as Record<string, string>;
    expect(calls[1]?.init?.method).toBe('PUT');
    expect(putHeaders['x-amz-server-side-encryption']).toBe('AES256');
    expect(putHeaders.authorization).toContain(
      'SignedHeaders=content-length;content-type;host;if-none-match;x-amz-content-sha256;x-amz-date;x-amz-server-side-encryption',
    );
  });

  it('streams Readable PUT bodies without routing them through fetch', async () => {
    const calls: Array<{ method: string | undefined; body: Buffer; headers: string[] }> = [];
    const server = createServer((request, response) => {
      if (request.method === 'HEAD') {
        response.writeHead(404);
        response.end();
        return;
      }
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        calls.push({
          method: request.method,
          body: Buffer.concat(chunks),
          headers: request.rawHeaders,
        });
        response.writeHead(200);
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('test server did not expose a TCP address');
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await new S3StorageAdapter({
        endpoint: `http://127.0.0.1:${address.port}`,
        bucket: 'amic-vault-dev',
        region: 'ap-northeast-2',
        accessKeyId: 'test-access',
        secretAccessKey: 'test-secret',
      }).putIfAbsent({
        key: 'tenants/t1/documents/file.pdf',
        body: Readable.from([Buffer.from('contract')]),
        contentLength: 8,
        contentType: 'application/pdf',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.body.toString()).toBe('contract');
    expect(calls[0]?.headers.join('\n')).toContain('if-none-match\n*');
  });
});
