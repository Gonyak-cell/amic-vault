import { createHash, createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { runtimeSecretValue } from '../../common/config/runtime-secret';
import type {
  StorageAdapter,
  StorageCreateReadUrlInput,
  QuarantineInventoryStorageAdapter,
  StorageGetRangeInput,
  StorageGetObjectResult,
  StorageObjectVersion,
  StorageObjectMetadata,
  StorageObjectLockMetadata,
  StoragePutObjectInput,
  StorageReadUrlResult,
  StorageVersionedObjectMetadata,
  StorageVersionReference,
  VersionedStorageAdapter,
} from './storage-adapter.interface';
import {
  StorageAccessDeniedError,
  StorageExactVersionMissingError,
  StorageObjectAlreadyExistsError,
  StorageRequestTimeoutError,
  StorageUnavailableError,
  StorageVersioningUnsupportedError,
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

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readXmlTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1] === undefined ? undefined : decodeXmlText(match[1]);
}

function readXmlBoolean(block: string, tag: string): boolean {
  return readXmlTag(block, tag) === 'true';
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function objectLockFromHeaders(headers: Headers): StorageObjectLockMetadata {
  const legalHold = headers.get('x-amz-object-lock-legal-hold');
  const mode = headers.get('x-amz-object-lock-mode')?.toLowerCase();
  const retainUntilRaw = headers.get('x-amz-object-lock-retain-until-date');
  const retainUntil = retainUntilRaw ? new Date(retainUntilRaw) : null;
  if (
    (legalHold !== null && !['ON', 'OFF'].includes(legalHold.toUpperCase())) ||
    (mode !== undefined && mode !== 'governance' && mode !== 'compliance') ||
    (retainUntil !== null && Number.isNaN(retainUntil.getTime()))
  ) {
    throw new StorageUnavailableError('storage object lock metadata is invalid');
  }
  return {
    legalHold: legalHold?.toUpperCase() === 'ON',
    retentionMode: mode === 'governance' || mode === 'compliance' ? mode : null,
    retainUntil,
  };
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

export class S3StorageAdapter implements StorageAdapter, VersionedStorageAdapter, QuarantineInventoryStorageAdapter {
  private readonly endpoint: URL;
  private readonly readUrlEndpoint: URL;
  private readonly objectVersions = new WeakMap<StorageObjectVersion, string>();

  constructor(private readonly config: S3StorageAdapterConfig) {
    this.endpoint = new URL(config.endpoint);
    this.readUrlEndpoint = new URL(config.readUrlEndpoint ?? config.endpoint);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): S3StorageAdapter {
    const production = env.NODE_ENV === 'production';
    const endpoint = env.S3_ENDPOINT?.trim() || (production ? '' : 'http://localhost:9000');
    const bucket = env.S3_BUCKET?.trim() || (production ? '' : 'amic-vault-dev');
    const region = env.S3_REGION?.trim() || (production ? '' : 'us-east-1');
    if (!endpoint || !bucket || !region) {
      throw new Error('S3_CONFIGURATION_REQUIRED');
    }
    const accessKeyId = production
      ? runtimeSecretValue('S3_ACCESS_KEY_ID', env, { maximumBytes: 1024 })
      : (env.S3_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER ?? 'amic-vault-minio');
    const secretAccessKey = production
      ? runtimeSecretValue('S3_SECRET_ACCESS_KEY', env, { maximumBytes: 4096 })
      : (env.S3_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD ?? 'amic-vault-minio-dev-password');
    return new S3StorageAdapter({
      endpoint,
      ...(env.S3_READ_URL_ENDPOINT ? { readUrlEndpoint: env.S3_READ_URL_ENDPOINT } : {}),
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      ...(env.S3_SERVER_SIDE_ENCRYPTION
        ? { serverSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION }
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

  async listKeysByPrefix(prefix: string): Promise<readonly string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const response = await this.fetchSigned(
        'GET',
        '',
        { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
        undefined,
        {
          'list-type': '2',
          prefix,
          ...(continuationToken ? { 'continuation-token': continuationToken } : {}),
        },
      );
      if (response.status === 403) throw new StorageAccessDeniedError();
      if (!response.ok) throw new StorageUnavailableError(`storage inventory failed: ${response.status}`);
      const xml = await response.text();
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = readXmlTag(match[1] ?? '', 'Key');
        if (!key || !key.startsWith(prefix)) throw new StorageUnavailableError('storage inventory key is invalid');
        keys.push(key);
      }
      if (!readXmlBoolean(xml, 'IsTruncated')) return keys;
      continuationToken = readXmlTag(xml, 'NextContinuationToken');
      if (!continuationToken) throw new StorageUnavailableError('storage inventory continuation is unavailable');
    }
    throw new StorageUnavailableError('storage inventory page limit exceeded');
  }

  async listObjectVersions(key: string): Promise<readonly StorageVersionedObjectMetadata[]> {
    const response = await this.fetchSigned(
      'GET',
      '',
      { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
      undefined,
      { prefix: key, versions: '' },
    );
    if (response.status === 400 || response.status === 501) {
      throw new StorageVersioningUnsupportedError();
    }
    if (response.status === 403) throw new StorageAccessDeniedError();
    if (!response.ok) {
      throw new StorageUnavailableError(`storage version inventory failed: ${response.status}`);
    }

    const xml = await response.text();
    if (readXmlBoolean(xml, 'IsTruncated')) {
      throw new StorageUnavailableError('storage version inventory is truncated');
    }
    const entries: StorageVersionedObjectMetadata[] = [];
    for (const match of xml.matchAll(/<(Version|DeleteMarker)>([\s\S]*?)<\/\1>/g)) {
      const kind = match[1];
      const block = match[2];
      if (!kind || !block) throw new StorageUnavailableError('storage version inventory is malformed');
      const objectKey = readXmlTag(block, 'Key');
      const rawVersion = readXmlTag(block, 'VersionId');
      if (objectKey !== key) continue;
      if (!rawVersion || rawVersion === 'null') throw new StorageVersioningUnsupportedError();
      const contentLength = Number(readXmlTag(block, 'Size') ?? '0');
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        throw new StorageUnavailableError('storage version inventory size is invalid');
      }
      const version = {} as StorageObjectVersion;
      this.objectVersions.set(version, rawVersion);
      entries.push({
        key,
        contentLength,
        contentType: null,
        etag: readXmlTag(block, 'ETag') ?? null,
        version,
        versionFingerprint: sha256Hex(rawVersion),
        isDeleteMarker: kind === 'DeleteMarker',
        isLatest: readXmlBoolean(block, 'IsLatest'),
      });
    }
    return entries;
  }

  async headObjectVersion(reference: StorageVersionReference): Promise<StorageObjectMetadata | null> {
    const response = await this.fetchSigned(
      'HEAD',
      reference.key,
      { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
      undefined,
      { versionId: this.requireVersionId(reference.version) },
    );
    if (response.status === 404 || response.status === 405) return null;
    if (response.status === 403) throw new StorageAccessDeniedError();
    if (!response.ok) {
      throw new StorageUnavailableError(`storage version head failed: ${response.status}`);
    }
    return this.metadataFromResponse(reference.key, response);
  }

  async deleteObjectVersion(reference: StorageVersionReference): Promise<void> {
    const response = await this.fetchSigned(
      'DELETE',
      reference.key,
      { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
      undefined,
      { versionId: this.requireVersionId(reference.version) },
    );
    if (response.status === 404) throw new StorageExactVersionMissingError();
    if (response.status === 403) throw new StorageAccessDeniedError();
    if (!response.ok) {
      throw new StorageUnavailableError(`storage version delete failed: ${response.status}`);
    }
  }

  private metadataFromResponse(key: string, response: Response): StorageObjectMetadata {
    return {
      key,
      contentLength: Number(response.headers.get('content-length') ?? '0'),
      contentType: response.headers.get('content-type'),
      etag: response.headers.get('etag'),
      objectLock: objectLockFromHeaders(response.headers),
    };
  }

  private async fetchSigned(
    method: string,
    key: string,
    headers: SignedHeaders,
    body?: BodyInit,
    query?: Record<string, string>,
  ): Promise<Response> {
    const signed = this.signRequest(method, key, headers, query);
    const init: FetchInit = {
      method,
      headers: signed.headers,
      signal: AbortSignal.timeout(10_000),
      ...(body ? { body, duplex: 'half' } : {}),
    };
    try {
      return await fetch(signed.url, init);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new StorageRequestTimeoutError();
      }
      throw new StorageUnavailableError('storage request failed');
    }
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

  private requireVersionId(version: StorageObjectVersion): string {
    const versionId = this.objectVersions.get(version);
    if (!versionId) throw new StorageUnavailableError('storage version reference is invalid');
    return versionId;
  }

  private signRequest(
    method: string,
    key: string,
    headers: SignedHeaders,
    query: Record<string, string> = {},
  ): SignedRequest {
    if (!this.config.accessKeyId || !this.config.secretAccessKey) {
      throw new StorageUnavailableError('storage credentials are not configured');
    }

    const now = amzDate(new Date());
    const url = new URL(this.endpoint.toString());
    url.pathname = `/${this.config.bucket}/${encodeKey(key)}`;
    const queryString = canonicalQuery(query);
    if (queryString) url.search = queryString;
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
      queryString,
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
