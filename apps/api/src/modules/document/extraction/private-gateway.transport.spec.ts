import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchIngestionWorker } from './private-gateway.transport';

interface CertificatePair {
  certificate: string;
  key: string;
}

const tempRoot = mkdtempSync(join(tmpdir(), 'amic-vault-gateway-'));
const gatewayHostname = hostname().toLowerCase();
const requests: Array<{
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  serial: string;
}> = [];
let server: Server;
let gatewayUrl = '';
let caCertificate = '';
let oldClient: CertificatePair;
let newClient: CertificatePair;
let wrongSubjectClient: CertificatePair;
let untrustedCaCertificate = '';

function openssl(args: readonly string[]): void {
  execFileSync('openssl', [...args], { cwd: tempRoot, stdio: 'ignore' });
}

function createCa(name: string): { certificate: string; key: string } {
  const key = join(tempRoot, `${name}.key`);
  const certificate = join(tempRoot, `${name}.crt`);
  openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    key,
    '-out',
    certificate,
    '-days',
    '2',
    '-subj',
    `/CN=${name}`,
  ]);
  return { certificate, key };
}

function issueCertificate(input: {
  name: string;
  subject: string;
  serial: number;
  days?: number;
  usage: 'clientAuth' | 'serverAuth';
  ca: CertificatePair;
  dnsName?: string;
}): CertificatePair {
  const key = join(tempRoot, `${input.name}.key`);
  const request = join(tempRoot, `${input.name}.csr`);
  const certificate = join(tempRoot, `${input.name}.crt`);
  const extensions = join(tempRoot, `${input.name}.ext`);
  writeFileSync(
    extensions,
    [
      `extendedKeyUsage=${input.usage}`,
      ...(input.dnsName ? [`subjectAltName=DNS:${input.dnsName}`] : []),
    ].join('\n'),
  );
  openssl([
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    key,
    '-out',
    request,
    '-subj',
    `/CN=${input.subject}`,
  ]);
  openssl([
    'x509',
    '-req',
    '-in',
    request,
    '-CA',
    input.ca.certificate,
    '-CAkey',
    input.ca.key,
    '-set_serial',
    String(input.serial),
    '-out',
    certificate,
    '-days',
    String(input.days ?? 2),
    '-extfile',
    extensions,
  ]);
  return { certificate, key };
}

function privateEnvironment(
  pair: CertificatePair = oldClient,
  caFile: string = caCertificate,
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    INGESTION_WORKER_IDENTITY_PROFILE: 'private-gateway-mtls',
    INGESTION_GATEWAY_MTLS_ENABLED: 'true',
    INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS: 'true',
    INGESTION_GATEWAY_DIRECT_WORKER_ACCESS: 'blocked',
    INGESTION_GATEWAY_WORKLOAD_SUBJECT: 'amic-vault-api',
    INGESTION_GATEWAY_AUDIENCE: 'amic-vault-ingestion',
    INGESTION_WORKER_URL: gatewayUrl,
    INGESTION_GATEWAY_CA_FILE: caFile,
    INGESTION_GATEWAY_CLIENT_CERT_FILE: pair.certificate,
    INGESTION_GATEWAY_CLIENT_KEY_FILE: pair.key,
    INGESTION_GATEWAY_SERVER_NAME: gatewayHostname,
  };
}

beforeAll(async () => {
  const ca = createCa('amic-vault-test-ca');
  caCertificate = ca.certificate;
  const untrustedCa = createCa('amic-vault-untrusted-ca');
  untrustedCaCertificate = untrustedCa.certificate;
  const serverCertificate = issueCertificate({
    name: 'gateway-server',
    subject: gatewayHostname,
    serial: 10,
    usage: 'serverAuth',
    ca,
    dnsName: gatewayHostname,
  });
  oldClient = issueCertificate({
    name: 'api-client-old',
    subject: 'amic-vault-api',
    serial: 101,
    usage: 'clientAuth',
    ca,
  });
  newClient = issueCertificate({
    name: 'api-client-new',
    subject: 'amic-vault-api',
    serial: 102,
    usage: 'clientAuth',
    ca,
  });
  wrongSubjectClient = issueCertificate({
    name: 'wrong-client',
    subject: 'other-api',
    serial: 103,
    usage: 'clientAuth',
    ca,
  });
  server = createServer(
    {
      key: await import('node:fs/promises').then(({ readFile }) =>
        readFile(serverCertificate.key),
      ),
      cert: await import('node:fs/promises').then(({ readFile }) =>
        readFile(serverCertificate.certificate),
      ),
      ca: await import('node:fs/promises').then(({ readFile }) => readFile(ca.certificate)),
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    async (request, response) => {
      if (request.url === '/extract-clause-tree') return;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const peer = (request.socket as TLSSocket).getPeerCertificate();
      const observed = {
        path: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        serial: peer.serialNumber,
      };
      requests.push(observed);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(observed));
    },
  );
  server.listen(0, '::');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  gatewayUrl = `https://${gatewayHostname}:${port}`;
}, 30_000);

afterAll(async () => {
  if (server?.listening) {
    server.close();
    await once(server, 'close');
  }
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('private gateway transport', () => {
  it('uses real mTLS, adds one-use binding headers, streams JSON, and avoids global fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await fetchIngestionWorker(
      '/extract',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-amic-gateway-mtls-verified': 'spoofed',
        },
        body: JSON.stringify({ synthetic: true }),
      },
      privateEnvironment(),
    );
    const observed = (await response.json()) as (typeof requests)[number];

    expect(response.status).toBe(200);
    expect(observed.path).toBe('/extract');
    expect(observed.body).toBe('{"synthetic":true}');
    expect(observed.headers['x-amic-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(observed.headers['x-amic-ingestion-nonce']).toMatch(/^[0-9a-f-]{36}$/);
    expect(observed.headers['x-amic-ingestion-expires-at']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
    expect(observed.headers['x-amic-gateway-mtls-verified']).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('preserves native multipart encoding over the same mTLS boundary', async () => {
    const form = new FormData();
    form.append('tenant_id', 'synthetic-tenant');
    form.append('file', new Blob([Buffer.from('synthetic-body')]), 'sample.eml');
    const response = await fetchIngestionWorker(
      '/email/parse',
      { method: 'POST', body: form },
      privateEnvironment(),
    );
    const observed = (await response.json()) as (typeof requests)[number];

    expect(observed.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(observed.body).toContain('name="tenant_id"');
    expect(observed.body).toContain('synthetic-tenant');
    expect(observed.body).toContain('synthetic-body');
  });

  it('reloads a rotated client certificate and key from the same mounted paths', async () => {
    const active = {
      certificate: join(tempRoot, 'active-client.crt'),
      key: join(tempRoot, 'active-client.key'),
    };
    copyFileSync(oldClient.certificate, active.certificate);
    copyFileSync(oldClient.key, active.key);
    const first = (await (
      await fetchIngestionWorker('/extract', { method: 'POST' }, privateEnvironment(active))
    ).json()) as (typeof requests)[number];

    copyFileSync(newClient.certificate, active.certificate);
    copyFileSync(newClient.key, active.key);
    const second = (await (
      await fetchIngestionWorker('/extract', { method: 'POST' }, privateEnvironment(active))
    ).json()) as (typeof requests)[number];

    expect(first.serial).not.toBe(second.serial);
  });

  it.each([
    ['wrong client subject', () => privateEnvironment(wrongSubjectClient)],
    [
      'mismatched client key',
      () => privateEnvironment({ certificate: oldClient.certificate, key: newClient.key }),
    ],
    ['untrusted server CA', () => privateEnvironment(oldClient, untrustedCaCertificate)],
  ])('fails closed for %s without leaking credential details', async (_label, environment) => {
    await expect(
      fetchIngestionWorker('/extract', { method: 'POST' }, environment()),
    ).rejects.toThrow(/^INGESTION_GATEWAY_(?:CONFIGURATION_INVALID|REQUEST_FAILED)$/);
  });

  it('rejects an expired client certificate before network I/O', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    try {
      await expect(
        fetchIngestionWorker('/extract', { method: 'POST' }, privateEnvironment()),
      ).rejects.toThrow('INGESTION_GATEWAY_CONFIGURATION_INVALID');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects missing, malformed, and oversized credential files with a stable safe error', async () => {
    const malformed = join(tempRoot, 'sensitive-path-canary.pem');
    const oversized = join(tempRoot, 'oversized-path-canary.pem');
    writeFileSync(malformed, 'private-body-canary');
    writeFileSync(oversized, 'x'.repeat(70 * 1024));
    for (const path of ['/missing/key-path-canary.pem', malformed, oversized]) {
      const env = privateEnvironment({
        certificate: oldClient.certificate,
        key: path,
      });
      let thrown: unknown;
      try {
        await fetchIngestionWorker('/extract', { method: 'POST' }, env);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('INGESTION_GATEWAY_CONFIGURATION_INVALID');
      expect((thrown as Error).message).not.toMatch(/canary|private-body|missing/u);
    }
  });

  it('propagates AbortSignal without retry or plaintext fallback', async () => {
    const controller = new AbortController();
    const pending = fetchIngestionWorker(
      '/extract-clause-tree',
      { method: 'POST', signal: controller.signal },
      privateEnvironment(),
    );
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toThrow('INGESTION_GATEWAY_REQUEST_FAILED');
  });
});
