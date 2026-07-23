import { createPrivateKey, X509Certificate } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { readRuntimeFile } from '../../../common/config/runtime-secret';
import {
  createWorkerIdentityAdapter,
  createWorkerIdentityHeaders,
  privateGatewayUrl,
} from './worker-identity.adapters';

const MAX_PEM_BYTES = 64 * 1024;
const BINDING_HEADERS = [
  'x-amic-request-id',
  'x-amic-ingestion-nonce',
  'x-amic-ingestion-expires-at',
] as const;
const CLIENT_ONLY_IDENTITY_HEADERS = [
  'x-amic-dev-loopback-identity',
  'x-amic-gateway-mtls-verified',
  'x-amic-gateway-workload-subject',
  'x-amic-gateway-audience',
] as const;

export const ingestionWorkerPaths = [
  '/extract',
  '/extract-revisions',
  '/extract-annotations',
  '/extract-clause-tree',
  '/ocr',
  '/convert/docx-to-pdf',
  '/convert/office-to-pdf',
  '/email/parse',
  '/security/scan',
  '/zip/inspect',
] as const;

export type IngestionWorkerPath = (typeof ingestionWorkerPaths)[number];

type TransportEnvironment = NodeJS.ProcessEnv;

function configurationError(): Error {
  return new Error('INGESTION_GATEWAY_CONFIGURATION_INVALID');
}

function requestError(): Error {
  return new Error('INGESTION_GATEWAY_REQUEST_FAILED');
}

function validateBindingHeaders(headers: Headers, env: TransportEnvironment): void {
  const present = BINDING_HEADERS.filter((name) => headers.has(name));
  if (present.length === 0) {
    for (const [name, value] of Object.entries(createWorkerIdentityHeaders(env))) {
      headers.set(name, value);
    }
  } else if (present.length !== BINDING_HEADERS.length) {
    throw configurationError();
  }
  const requestId = headers.get('x-amic-request-id') ?? '';
  const nonce = headers.get('x-amic-ingestion-nonce') ?? '';
  const expiresAt = headers.get('x-amic-ingestion-expires-at') ?? '';
  const canonicalUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if (
    !canonicalUuid.test(requestId) ||
    !canonicalUuid.test(nonce) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(expiresAt)
  ) {
    throw configurationError();
  }
}

function boundedHeaders(init: RequestInit, env: TransportEnvironment): Record<string, string> {
  const adapter = createWorkerIdentityAdapter(env);
  const headers = new Headers(init.headers);
  validateBindingHeaders(headers, env);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('transfer-encoding');
  if (adapter.profile === 'private-gateway-mtls') {
    for (const name of CLIENT_ONLY_IDENTITY_HEADERS) headers.delete(name);
  } else if (headers.get('x-amic-dev-loopback-identity') !== 'true') {
    throw configurationError();
  }
  return Object.fromEntries(headers.entries());
}

function readPem(
  name:
    | 'INGESTION_GATEWAY_CA_FILE'
    | 'INGESTION_GATEWAY_CLIENT_CERT_FILE'
    | 'INGESTION_GATEWAY_CLIENT_KEY_FILE',
  env: TransportEnvironment,
  confidential: boolean,
): Buffer {
  try {
    return readRuntimeFile(name, env[name], env, {
      confidential,
      maximumBytes: MAX_PEM_BYTES,
    });
  } catch {
    throw configurationError();
  }
}

function assertCurrentClientCertificate(certificate: Buffer, key: Buffer): void {
  try {
    const parsed = new X509Certificate(certificate);
    const now = Date.now();
    if (
      parsed.subject !== 'CN=amic-vault-api' ||
      Date.parse(parsed.validFrom) > now ||
      Date.parse(parsed.validTo) <= now ||
      !parsed.checkPrivateKey(createPrivateKey(key))
    ) {
      throw configurationError();
    }
  } catch {
    throw configurationError();
  }
}

async function privateGatewayFetch(
  url: URL,
  init: RequestInit,
  env: TransportEnvironment,
  headers: Record<string, string>,
): Promise<Response> {
  const ca = readPem('INGESTION_GATEWAY_CA_FILE', env, false);
  const certificate = readPem('INGESTION_GATEWAY_CLIENT_CERT_FILE', env, false);
  const key = readPem('INGESTION_GATEWAY_CLIENT_KEY_FILE', env, true);
  try {
    new X509Certificate(ca);
  } catch {
    throw configurationError();
  }
  assertCurrentClientCertificate(certificate, key);

  let webRequest: Request;
  try {
    webRequest = new Request(url, { ...init, headers });
  } catch {
    throw configurationError();
  }

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const fail = (): void => {
      if (!settled) {
        settled = true;
        reject(requestError());
      }
    };
    const outgoing = httpsRequest(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: webRequest.method,
        headers: Object.fromEntries(webRequest.headers.entries()),
        ca,
        cert: certificate,
        key,
        servername: env.INGESTION_GATEWAY_SERVER_NAME,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        rejectUnauthorized: true,
      },
      (incoming) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) responseHeaders.append(name, entry);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }
        settled = true;
        const responseInit: ResponseInit = {
          status: incoming.statusCode ?? 502,
          headers: responseHeaders,
        };
        if (incoming.statusMessage !== undefined) {
          responseInit.statusText = incoming.statusMessage;
        }
        resolve(
          new Response(
            Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>,
            responseInit,
          ),
        );
      },
    );
    outgoing.once('error', fail);

    const abort = (): void => {
      outgoing.destroy(requestError());
    };
    if (webRequest.signal.aborted) {
      abort();
      return;
    }
    webRequest.signal.addEventListener('abort', abort, { once: true });
    outgoing.once('close', () => webRequest.signal.removeEventListener('abort', abort));

    if (webRequest.body === null) {
      outgoing.end();
      return;
    }
    const body = Readable.fromWeb(
      webRequest.body as unknown as NodeReadableStream<Uint8Array>,
    );
    body.once('error', () => outgoing.destroy(requestError()));
    body.pipe(outgoing);
  });
}

export async function fetchIngestionWorker(
  path: IngestionWorkerPath,
  init: RequestInit,
  env: TransportEnvironment = process.env,
): Promise<Response> {
  if (!(ingestionWorkerPaths as readonly string[]).includes(path)) {
    throw configurationError();
  }
  const adapter = createWorkerIdentityAdapter(env);
  const base =
    adapter.profile === 'private-gateway-mtls'
      ? privateGatewayUrl(env)
      : new URL(env.INGESTION_WORKER_URL ?? 'http://127.0.0.1:8000');
  const url = new URL(path.slice(1), `${base.toString().replace(/\/+$/u, '')}/`);
  if (url.origin !== base.origin) throw configurationError();
  const headers = boundedHeaders(init, env);
  if (adapter.profile === 'loopback-dev') {
    return fetch(url.toString(), { ...init, headers });
  }
  return privateGatewayFetch(url, init, env, headers);
}
