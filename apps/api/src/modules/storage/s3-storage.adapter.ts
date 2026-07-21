import { createHash, createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type {
  StorageAdapter,
  StorageCreateReadUrlInput,
  StorageGetRangeInput,
  StorageGetObjectResult,
  StorageObjectMetadata,
  StoragePutObjectInput,
  StorageReadUrlResult,
} from './storage-adapter.interface';
import {
  StorageObjectAlreadyExistsError,
  StorageUnavailableError,
} from './storage-adapter.interface';

interface S3StorageAdapterConfig {
  endpoint: string;
  readUrlEndpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  serverSideEncryption?: string;
}

type SignedHeaders = Record<string, string>;
type FetchInit = RequestInit & { duplex?: 'half' };
type SignedRequest = { url: URL; headers: SignedHeaders };
type SignedWriteResponse = { status: number; ok: boolean };
const defaultReadUrlTtlSeconds = 300;

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function amzDate(date: Date): { stamp: string; short: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { stamp: iso, short: iso.slice(0, 8) };
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function canonicalHeaders(headers: SignedHeaders): { canonical: string; signed: string } {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonical: entries.map(([key, value]) => `${key}:${value}\n`).join(''),
    signed: entries.map(([key]) => key).join(';'),
  };
}

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeQueryComponent(key)}=${encodeQueryComponent(value)}`)
    .join('&');
}

function signingKey(secret: string, shortDate: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

function toFetchBody(body: StoragePutObjectInput['body']): BodyInit {
  if (Buffer.isBuffer(body)) return body as unknown as BodyInit;
  return Readable.toWeb(body) as unknown as BodyInit;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly endpoint: URL;
  private readonly readUrlEndpoint: URL;

  constructor(private readonly config: S3StorageAdapterConfig) {
    this.endpoint = new URL(config.endpoint);
    this.readUrlEndpoint = new URL(config.readUrlEndpoint ?? config.endpoint);
  }

  static fromEnv(): S3StorageAdapter {
    return new S3StorageAdapter({
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      ...(process.env.S3_READ_URL_ENDPOINT
        ? { readUrlEndpoint: process.env.S3_READ_URL_ENDPOINT }
        : {}),
      bucket: process.env.S3_BUCKET ?? 'amic-vault-dev',
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKeyId:
        process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? 'amic-vault-minio',
      secretAccessKey:
        process.env.S3_SECRET_ACCESS_KEY ??
        process.env.MINIO_ROOT_PASSWORD ??
        'amic-vault-minio-dev-password',
      ...(process.env.S3_SERVER_SIDE_ENCRYPTION
        ? { serverSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION }
        : {}),
    });
  }

  async putIfAbsent(input: StoragePutObjectInput): Promise<void> {
    const existing = await this.head(input.key);
    if (existing) throw new StorageObjectAlreadyExistsError(input.key);

    const payloadHash = input.payloadSha256 ?? 'UNSIGNED-PAYLOAD';
    const headers: SignedHeaders = {
      'content-length': String(input.contentLength),
      'content-type': input.contentType,
      'if-none-match': '*',
      'x-amz-content-sha256': payloadHash,
      ...(this.config.serverSideEncryption
        ? { 'x-amz-server-side-encryption': this.config.serverSideEncryption }
        : {}),
    };
    const response = Buffer.isBuffer(input.body)
      ? await this.fetchSigned('PUT', input.key, headers, toFetchBody(input.body))
      : await this.writeSignedStream('PUT', input.key, headers, input.body);
    if (response.status === 412 || response.status === 409) {
      throw new StorageObjectAlreadyExistsError(input.key);
    }
    if (!response.ok) {
      throw new StorageUnavailableError(`storage put failed: ${response.status}`);
    }
  }

  async get(key: string): Promise<StorageGetObjectResult> {
    const response = await this.fetchSigned('GET', key, {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    });
    if (response.status === 404) {
      throw new StorageUnavailableError('storage object missing');
    }
    if (!response.ok || !response.body) {
      throw new StorageUnavailableError(`storage get failed: ${response.status}`);
    }
    return {
      ...this.metadataFromResponse(key, response),
      body: Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
    };
  }

  async getRange(input: StorageGetRangeInput): Promise<StorageGetObjectResult> {
    const response = await this.fetchSigned('GET', input.key, {
      range: `bytes=${input.start}-${input.end}`,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    });
    if (response.status === 404) {
      throw new StorageUnavailableError('storage object missing');
    }
    if (!response.ok || !response.body) {
      throw new StorageUnavailableError(`storage range get failed: ${response.status}`);
    }
    return {
      ...this.metadataFromResponse(input.key, response),
      body: Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
    };
  }

  async createReadUrl(input: StorageCreateReadUrlInput): Promise<StorageReadUrlResult> {
    if (!this.config.accessKeyId || !this.config.secretAccessKey) {
      throw new StorageUnavailableError('storage credentials are not configured');
    }
    const ttl = input.expiresInSeconds ?? defaultReadUrlTtlSeconds;
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 86_400) {
      throw new StorageUnavailableError('storage read url ttl is invalid');
    }

    const nowDate = new Date();
    const now = amzDate(nowDate);
    const url = new URL(this.readUrlEndpoint.toString());
    url.pathname = `/${this.config.bucket}/${encodeKey(input.key)}`;
    const credentialScope = `${now.short}/${this.config.region}/s3/aws4_request`;
    const params: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': now.stamp,
      'X-Amz-Expires': String(ttl),
      'X-Amz-SignedHeaders': 'host',
    };
    const headers = canonicalHeaders({ host: url.host });
    const canonicalRequest = [
      'GET',
      url.pathname,
      canonicalQuery(params),
      headers.canonical,
      headers.signed,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      now.stamp,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    params['X-Amz-Signature'] = createHmac(
      'sha256',
      signingKey(this.config.secretAccessKey, now.short, this.config.region),
    )
      .update(stringToSign)
      .digest('hex');
    url.search = canonicalQuery(params);
    return {
      url: url.toString(),
      expiresAt: new Date(nowDate.getTime() + ttl * 1000),
    };
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    const response = await this.fetchSigned('HEAD', key, {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new StorageUnavailableError(`storage head failed: ${response.status}`);
    }
    return this.metadataFromResponse(key, response);
  }

  async delete(key: string): Promise<void> {
    const response = await this.fetchSigned('DELETE', key, {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    });
    if (!response.ok && response.status !== 404) {
      throw new StorageUnavailableError(`storage delete failed: ${response.status}`);
    }
  }

  private metadataFromResponse(key: string, response: Response): StorageObjectMetadata {
    return {
      key,
      contentLength: Number(response.headers.get('content-length') ?? '0'),
      contentType: response.headers.get('content-type'),
      etag: response.headers.get('etag'),
    };
  }

  private async fetchSigned(
    method: string,
    key: string,
    headers: SignedHeaders,
    body?: BodyInit,
  ): Promise<Response> {
    const signed = this.signRequest(method, key, headers);
    const init: FetchInit = {
      method,
      headers: signed.headers,
      ...(body ? { body, duplex: 'half' } : {}),
    };
    return fetch(signed.url, init);
  }

  private writeSignedStream(
    method: string,
    key: string,
    headers: SignedHeaders,
    body: Readable,
  ): Promise<SignedWriteResponse> {
    const signed = this.signRequest(method, key, headers);
    const request = signed.url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const req = request(
        signed.url,
        {
          method,
          headers: signed.headers,
        },
        (res) => {
          res.resume();
          res.once('end', () => {
            const status = res.statusCode ?? 0;
            resolve({ status, ok: status >= 200 && status < 300 });
          });
        },
      );
      req.once('error', reject);
      body.once('error', reject);
      body.pipe(req);
    });
  }

  private signRequest(method: string, key: string, headers: SignedHeaders): SignedRequest {
    if (!this.config.accessKeyId || !this.config.secretAccessKey) {
      throw new StorageUnavailableError('storage credentials are not configured');
    }

    const now = amzDate(new Date());
    const url = new URL(this.endpoint.toString());
    url.pathname = `/${this.config.bucket}/${encodeKey(key)}`;
    const host = url.host;
    const signedHeaders: SignedHeaders = {
      host,
      'x-amz-date': now.stamp,
      ...headers,
    };
    const canonical = canonicalHeaders(signedHeaders);
    const canonicalRequest = [
      method,
      url.pathname,
      '',
      canonical.canonical,
      canonical.signed,
      signedHeaders['x-amz-content-sha256'] ?? 'UNSIGNED-PAYLOAD',
    ].join('\n');
    const credentialScope = `${now.short}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      now.stamp,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const signature = createHmac(
      'sha256',
      signingKey(this.config.secretAccessKey, now.short, this.config.region),
    )
      .update(stringToSign)
      .digest('hex');
    signedHeaders.authorization =
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${canonical.signed}, Signature=${signature}`;

    return { url, headers: signedHeaders };
  }
}
