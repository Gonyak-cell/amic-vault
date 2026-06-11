import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type {
  StorageAdapter,
  StorageGetObjectResult,
  StorageObjectMetadata,
  StoragePutObjectInput,
} from './storage-adapter.interface';
import {
  StorageObjectAlreadyExistsError,
  StorageUnavailableError,
} from './storage-adapter.interface';

interface S3StorageAdapterConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

type SignedHeaders = Record<string, string>;
type FetchInit = RequestInit & { duplex?: 'half' };

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

  constructor(private readonly config: S3StorageAdapterConfig) {
    this.endpoint = new URL(config.endpoint);
  }

  static fromEnv(): S3StorageAdapter {
    return new S3StorageAdapter({
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      bucket: process.env.S3_BUCKET ?? 'amic-vault-dev',
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? 'amic-vault-minio',
      secretAccessKey:
        process.env.S3_SECRET_ACCESS_KEY ??
        process.env.MINIO_ROOT_PASSWORD ??
        'amic-vault-minio-dev-password',
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
    };
    const response = await this.fetchSigned('PUT', input.key, headers, toFetchBody(input.body));
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

    const init: FetchInit = {
      method,
      headers: signedHeaders,
      ...(body ? { body, duplex: 'half' } : {}),
    };
    return fetch(url, init);
  }
}
