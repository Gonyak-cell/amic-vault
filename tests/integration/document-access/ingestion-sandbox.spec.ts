import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { classifyComposeFailure } from '../helpers/compose-failure-diagnostic';

interface CertificatePair {
  certificate: string;
  key: string;
}

interface ProbeResult {
  kind: 'response' | 'transport-error';
  status?: number;
  body?: string;
}

interface RequestBinding {
  requestId: string;
  nonce: string;
  expiresAt: string;
}

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'amic-vault-ingestion-sandbox-e2e-'));
const certificateRoot = join(tempRoot, 'certs');
const fixtureRoot = join(tempRoot, 'fixtures');
const overridePath = join(tempRoot, 'compose.override.json');
const bombPath = join(tempRoot, 'bomb.zip');
const projectName = `amic-vault-sf20-sandbox-${process.pid}`;
const baseCompose = resolve(repoRoot, 'infra/production/compose.yml');
const pythonImage =
  'docker.io/library/python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de';
const rawCanary = 'SF20_RAW_CUSTOMER_SECRET_CANARY_7251';
const databaseSecretCanary = 'SF20_DATABASE_SECRET_CANARY_4381';
const apiStorageAccessCanary = 'SF20_API_STORAGE_ACCESS_CANARY_4382';
const apiStorageSecretCanary = 'SF20_API_STORAGE_SECRET_CANARY_4383';
const mfaEncryptionCanary = 'SF20_MFA_ENCRYPTION_CANARY_4384';
const workerStorageAccessCanary = 'SF20_WORKER_STORAGE_ACCESS_CANARY_4385';
const workerStorageSecretCanary = 'SF20_WORKER_STORAGE_SECRET_CANARY_4386';
const cleanBody = Buffer.from(`대한민국 법률 문서\n${rawCanary}`, 'utf8');
const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const fileObjectId = '66666666-6666-4666-8666-666666666666';
const objectKey = `tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
const storageVersion = 'sf20-version-1';
let composeEnvironment: NodeJS.ProcessEnv;
let composeAttempted = false;
let ca: CertificatePair;
let client: CertificatePair;

const storageFixtureSource = String.raw`
import base64
from datetime import datetime, timezone
from html import escape
import http.server
import json
import os
import ssl
from urllib.parse import parse_qs, unquote, urlsplit

OBJECTS = {
    item["key"]: {
        "body": base64.b64decode(item["bodyBase64"]),
        "contentType": item["contentType"],
        "version": item["version"],
    }
    for item in json.loads(os.environ["STORAGE_OBJECTS_JSON"])
}
BUCKET = os.environ["STORAGE_BUCKET"]

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "sf20-storage-fixture"

    def log_message(self, _format, *_args):
        return

    def do_GET(self):
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query, keep_blank_values=True)
        if parsed.path == "/health":
            self.send_response(200)
            self.end_headers()
            return
        if parsed.path == f"/{BUCKET}" and "versions" in query:
            prefix = query.get("prefix", [""])[0]
            item = OBJECTS.get(prefix)
            versions = ""
            if item is not None:
                body = item["body"]
                versions = f"""<Version>
<Key>{escape(prefix)}</Key>
<VersionId>{escape(item["version"])}</VersionId>
<IsLatest>true</IsLatest>
<LastModified>2026-07-23T00:00:00.000Z</LastModified>
<ETag>&quot;{__import__('hashlib').md5(body).hexdigest()}&quot;</ETag>
<Size>{len(body)}</Size>
<StorageClass>STANDARD</StorageClass>
<Owner><ID>fixture</ID><DisplayName>fixture</DisplayName></Owner>
</Version>"""
            payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Name>{BUCKET}</Name><Prefix>{escape(prefix)}</Prefix><KeyMarker></KeyMarker>
<VersionIdMarker></VersionIdMarker><MaxKeys>2</MaxKeys>
<IsTruncated>false</IsTruncated>{versions}</ListVersionsResult>""".encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/xml")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        prefix = f"/{BUCKET}/"
        if parsed.path.startswith(prefix):
            key = unquote(parsed.path[len(prefix):])
            item = OBJECTS.get(key)
            requested_version = query.get("versionId", [""])[0]
            if item is not None and requested_version == item["version"]:
                payload = item["body"]
                self.send_response(200)
                self.send_header("Content-Type", item["contentType"])
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("x-amz-version-id", item["version"])
                self.end_headers()
                self.wfile.write(payload)
                return
        self.send_response(404)
        self.end_headers()

server = http.server.ThreadingHTTPServer(("0.0.0.0", 4443), Handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.minimum_version = ssl.TLSVersion.TLSv1_2
context.load_cert_chain("/test-certs/storage.crt", "/test-certs/storage.key")
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
`;

const clamAvFixtureSource = String.raw`
from datetime import datetime, timezone
import socket

listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listener.bind(("0.0.0.0", 3310))
listener.listen(16)

while True:
    connection, _ = listener.accept()
    with connection:
        command = connection.recv(10)
        if command == b"zVERSION\x00":
            stamp = datetime.now(timezone.utc).strftime("%a %b %d %H:%M:%S %Y")
            connection.sendall(f"ClamAV 1.4.3/12345/{stamp}".encode() + b"\x00")
            continue
        if command != b"zINSTREAM\x00":
            connection.sendall(b"stream: ERROR\x00")
            continue
        body = bytearray()
        while True:
            size_raw = connection.recv(4)
            if len(size_raw) != 4:
                break
            size = int.from_bytes(size_raw, "big")
            if size == 0:
                break
            while size:
                chunk = connection.recv(size)
                if not chunk:
                    break
                body.extend(chunk)
                size -= len(chunk)
        if b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE" in body:
            connection.sendall(b"stream: Eicar-Test-Signature FOUND\x00")
        else:
            connection.sendall(b"stream: OK\x00")
`;

const probeSource = String.raw`
const { fetchIngestionWorker } = require(
  '/app/apps/api/dist/modules/document/extraction/private-gateway.transport.js'
);
const path = process.env.PROBE_PATH;
const headers = JSON.parse(process.env.PROBE_HEADERS || '{}');
const body = Buffer.from(process.env.PROBE_BODY_BASE64 || '', 'base64');
fetchIngestionWorker(path, { method: 'POST', headers, body })
  .then(async (response) => {
    process.stdout.write(JSON.stringify({
      kind: 'response',
      status: response.status,
      body: (await response.text()).slice(0, 1024)
    }) + '\n');
  })
  .catch(() => {
    process.stdout.write(JSON.stringify({ kind: 'transport-error' }) + '\n');
    process.exitCode = 2;
  });
`;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function openssl(args: readonly string[]): void {
  execFileSync('openssl', [...args], { cwd: certificateRoot, stdio: 'ignore' });
}

function hostFixtureUser(): string {
  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') {
    throw new Error('INGESTION_SANDBOX_HOST_IDENTITY_UNAVAILABLE');
  }
  return `${process.getuid()}:${process.getgid()}`;
}

function runtimeSecret(name: string, value: string): string {
  const path = join(certificateRoot, name);
  writeFileSync(path, `${value}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function createCa(): CertificatePair {
  const key = join(certificateRoot, 'ca.key');
  const certificate = join(certificateRoot, 'ca.crt');
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
    '/CN=amic-vault-sf20-test-ca',
  ]);
  return { certificate, key };
}

function issueCertificate(input: {
  name: string;
  subject: string;
  usage: 'clientAuth' | 'serverAuth';
  dnsName?: string;
  serial: number;
}): CertificatePair {
  const key = join(certificateRoot, `${input.name}.key`);
  const request = join(certificateRoot, `${input.name}.csr`);
  const certificate = join(certificateRoot, `${input.name}.crt`);
  const extensions = join(certificateRoot, `${input.name}.ext`);
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
    ca.certificate,
    '-CAkey',
    ca.key,
    '-set_serial',
    String(input.serial),
    '-out',
    certificate,
    '-days',
    '2',
    '-extfile',
    extensions,
  ]);
  return { certificate, key };
}

function composeArgs(args: readonly string[]): string[] {
  return ['compose', '-f', baseCompose, '-f', overridePath, '-p', projectName, ...args];
}

function runCompose(args: readonly string[], timeout = 120_000): string {
  const result = spawnSync('docker', composeArgs(args), {
    cwd: repoRoot,
    env: composeEnvironment,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const logs = spawnSync(
      'docker',
      composeArgs([
        'logs',
        '--no-color',
        '--tail',
        '80',
        'storage-fixture',
        'clamav-fixture',
        'unapproved-fixture',
        'ingestion',
        'ingestion-gateway',
        'api-probe',
      ]),
      {
        cwd: repoRoot,
        env: composeEnvironment,
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const state = spawnSync('docker', composeArgs(['ps', '--all', '--format', 'json']), {
      cwd: repoRoot,
      env: composeEnvironment,
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 512 * 1024,
    });
    const rawDiagnostic = `${state.stdout}\n${state.stderr}\n${logs.stdout}\n${logs.stderr}\n${result.stderr}`;
    const reason = classifyComposeFailure(rawDiagnostic);
    throw new Error(`INGESTION_SANDBOX_COMPOSE_FAILED:${args[0] ?? 'unknown'}:${reason}`);
  }
  return result.stdout;
}

function binding(): RequestBinding {
  const now = Math.floor(Date.now() / 1000) * 1000;
  return {
    requestId: randomUUID(),
    nonce: randomUUID(),
    expiresAt: new Date(now + 3 * 60 * 1000).toISOString().replace('.000Z', 'Z'),
  };
}

function identityHeaders(value: RequestBinding): Record<string, string> {
  return {
    'x-amic-request-id': value.requestId,
    'x-amic-ingestion-nonce': value.nonce,
    'x-amic-ingestion-expires-at': value.expiresAt,
  };
}

function envelope(value: RequestBinding, selectedTenant = tenantId): Record<string, unknown> {
  return {
    tenantId: selectedTenant,
    documentId,
    versionId,
    fileObjectId,
    storageAlias: 'primary',
    objectKey,
    objectVersion: sha256(storageVersion),
    sha256: sha256(cleanBody),
    sizeBytes: cleanBody.length,
    parserProfile: 'extract',
    requestId: value.requestId,
    expiresAt: value.expiresAt,
  };
}

function multipart(
  fields: Record<string, string>,
  filename: string,
  payload: Buffer,
): { body: Buffer; contentType: string } {
  const boundary = `amic-vault-${randomUUID()}`;
  const parts = Object.entries(fields).flatMap(([name, value]) => [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ),
  ]);
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    payload,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function probe(input: {
  path: string;
  body: Buffer;
  headers: Record<string, string>;
}): ProbeResult {
  const output = runCompose(
    [
      'exec',
      '-T',
      '-e',
      `PROBE_PATH=${input.path}`,
      '-e',
      `PROBE_HEADERS=${JSON.stringify(input.headers)}`,
      '-e',
      `PROBE_BODY_BASE64=${input.body.toString('base64')}`,
      'api-probe',
      'node',
      '-e',
      probeSource,
    ],
    30_000,
  );
  const line = output
    .trim()
    .split(/\r?\n/u)
    .findLast((value) => value.startsWith('{'));
  if (!line) throw new Error('INGESTION_SANDBOX_PROBE_OUTPUT_INVALID');
  return JSON.parse(line) as ProbeResult;
}

function extractProbe(
  value: RequestBinding,
  body: Record<string, unknown> = envelope(value),
): ProbeResult {
  return probe({
    path: '/extract',
    body: Buffer.from(JSON.stringify(body)),
    headers: {
      ...identityHeaders(value),
      'content-type': 'application/json',
    },
  });
}

function createBomb(): Buffer {
  execFileSync(
    'python3',
    [
      '-c',
      [
        'from pathlib import Path',
        'from zipfile import ZIP_DEFLATED, ZipFile',
        `target = Path(${JSON.stringify(bombPath)})`,
        "with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:",
        "    archive.writestr('bomb.txt', b'A' * (2 * 1024 * 1024))",
      ].join('\n'),
    ],
    { stdio: 'ignore' },
  );
  return readFileSync(bombPath);
}

beforeAll(() => {
  mkdirSync(certificateRoot);
  mkdirSync(fixtureRoot);
  const fixtureUser = hostFixtureUser();
  ca = createCa();
  const gatewayServer = issueCertificate({
    name: 'gateway-server',
    subject: 'ingestion-gateway',
    dnsName: 'ingestion-gateway',
    usage: 'serverAuth',
    serial: 10,
  });
  issueCertificate({
    name: 'storage',
    subject: 'storage-fixture',
    dnsName: 'storage-fixture',
    usage: 'serverAuth',
    serial: 11,
  });
  client = issueCertificate({
    name: 'api-client',
    subject: 'amic-vault-api',
    usage: 'clientAuth',
    serial: 12,
  });
  const activeClient = {
    certificate: join(certificateRoot, 'active-client.crt'),
    key: join(certificateRoot, 'active-client.key'),
  };
  copyFileSync(client.certificate, activeClient.certificate);
  copyFileSync(client.key, activeClient.key);
  writeFileSync(join(fixtureRoot, 'storage_fixture.py'), storageFixtureSource);
  writeFileSync(join(fixtureRoot, 'clamav_fixture.py'), clamAvFixtureSource);
  chmodSync(ca.certificate, 0o644);
  chmodSync(gatewayServer.certificate, 0o644);
  chmodSync(gatewayServer.key, 0o600);
  chmodSync(join(certificateRoot, 'storage.crt'), 0o644);
  chmodSync(activeClient.certificate, 0o644);
  chmodSync(activeClient.key, 0o600);
  const databaseRuntimeUrlFile = runtimeSecret(
    'database-runtime-url',
    `postgres://vault_app:${databaseSecretCanary}@database.internal/amic_vault`,
  );
  const apiStorageAccessKey = runtimeSecret('api-storage-access-key', apiStorageAccessCanary);
  const apiStorageSecretKey = runtimeSecret('api-storage-secret-key', apiStorageSecretCanary);
  const mfaEncryptionKey = runtimeSecret('mfa-encryption-key', mfaEncryptionCanary);
  const workerStorageAccessKey = runtimeSecret(
    'worker-storage-access-key',
    workerStorageAccessCanary,
  );
  const workerStorageSecretKey = runtimeSecret(
    'worker-storage-secret-key',
    workerStorageSecretCanary,
  );

  const storageObjects = JSON.stringify([
    {
      key: objectKey,
      version: storageVersion,
      contentType: 'text/plain',
      bodyBase64: cleanBody.toString('base64'),
    },
  ]);
  writeFileSync(
    overridePath,
    JSON.stringify({
      services: {
        ingestion: {
          environment: {
            AWS_CA_BUNDLE: '/test-certs/ca.crt',
            INGESTION_EGRESS_ENFORCEMENT: 'required',
            INGESTION_EGRESS_STORAGE_AUTHORITY: 'storage-fixture:4443',
            INGESTION_EGRESS_CLAMAV_AUTHORITY: 'clamav-fixture:3310',
            INGESTION_EGRESS_ALLOWED_CIDRS: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
            INGESTION_STORAGE_ENDPOINT: 'https://storage-fixture:4443',
            INGESTION_STORAGE_BUCKET: 'sf20-ingestion',
            INGESTION_STORAGE_REGION: 'us-east-1',
            INGESTION_CLAMAV_HOST: 'clamav-fixture',
            INGESTION_CLAMAV_PORT: '3310',
          },
          volumes: [`${certificateRoot}:/test-certs:ro`],
          depends_on: {
            'storage-fixture': { condition: 'service_healthy' },
            'clamav-fixture': { condition: 'service_healthy' },
          },
        },
        'storage-fixture': {
          image: pythonImage,
          user: fixtureUser,
          command: ['python', '/fixtures/storage_fixture.py'],
          environment: {
            STORAGE_BUCKET: 'sf20-ingestion',
            STORAGE_OBJECTS_JSON: storageObjects,
          },
          read_only: true,
          cap_drop: ['ALL'],
          security_opt: ['no-new-privileges:true'],
          volumes: [`${fixtureRoot}:/fixtures:ro`, `${certificateRoot}:/test-certs:ro`],
          networks: ['ingestion-egress'],
          healthcheck: {
            test: [
              'CMD',
              'python',
              '-c',
              "import socket; socket.create_connection(('127.0.0.1', 4443), 2).close()",
            ],
            interval: '1s',
            timeout: '3s',
            retries: 30,
          },
        },
        'clamav-fixture': {
          image: pythonImage,
          command: ['python', '/fixtures/clamav_fixture.py'],
          read_only: true,
          cap_drop: ['ALL'],
          security_opt: ['no-new-privileges:true'],
          volumes: [`${fixtureRoot}:/fixtures:ro`],
          networks: ['ingestion-egress'],
          healthcheck: {
            test: [
              'CMD',
              'python',
              '-c',
              "import socket; socket.create_connection(('127.0.0.1', 3310), 2).close()",
            ],
            interval: '1s',
            timeout: '3s',
            retries: 30,
          },
        },
        'unapproved-fixture': {
          image: pythonImage,
          command: ['python', '-m', 'http.server', '4555'],
          read_only: true,
          cap_drop: ['ALL'],
          security_opt: ['no-new-privileges:true'],
          networks: ['sandbox-denied'],
          healthcheck: {
            test: [
              'CMD',
              'python',
              '-c',
              "import socket; socket.create_connection(('127.0.0.1', 4555), 2).close()",
            ],
            interval: '1s',
            timeout: '3s',
            retries: 30,
          },
        },
        'api-probe': {
          build: {
            context: repoRoot,
            dockerfile: 'apps/api/Dockerfile',
            target: 'api',
          },
          command: ['sh', '-lc', 'sleep infinity'],
          user: fixtureUser,
          environment: {
            NODE_ENV: 'production',
            INGESTION_WORKER_IDENTITY_PROFILE: 'private-gateway-mtls',
            INGESTION_GATEWAY_MTLS_ENABLED: 'true',
            INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS: 'true',
            INGESTION_GATEWAY_DIRECT_WORKER_ACCESS: 'blocked',
            INGESTION_GATEWAY_WORKLOAD_SUBJECT: 'amic-vault-api',
            INGESTION_GATEWAY_AUDIENCE: 'amic-vault-ingestion',
            INGESTION_WORKER_URL: 'https://ingestion-gateway:8443',
            INGESTION_GATEWAY_CA_FILE: '/run/secrets/ca.crt',
            INGESTION_GATEWAY_CLIENT_CERT_FILE: '/run/secrets/active-client.crt',
            INGESTION_GATEWAY_CLIENT_KEY_FILE: '/run/secrets/active-client.key',
            INGESTION_GATEWAY_SERVER_NAME: 'ingestion-gateway',
          },
          volumes: [`${certificateRoot}:/run/secrets:ro`, `${certificateRoot}:/test-certs:ro`],
          networks: ['ingestion-client'],
          depends_on: {
            'ingestion-gateway': { condition: 'service_healthy' },
          },
        },
      },
      networks: {
        'sandbox-denied': { internal: true },
      },
    }),
  );
  composeEnvironment = {
    ...process.env,
    INGESTION_GATEWAY_CA_FILE: ca.certificate,
    INGESTION_GATEWAY_SERVER_CERT_FILE: gatewayServer.certificate,
    INGESTION_GATEWAY_SERVER_KEY_FILE: gatewayServer.key,
    INGESTION_GATEWAY_CLIENT_CERT_FILE: activeClient.certificate,
    INGESTION_GATEWAY_CLIENT_KEY_FILE: activeClient.key,
    DATABASE_RUNTIME_URL_SECRET_FILE: databaseRuntimeUrlFile,
    S3_API_ACCESS_KEY_ID_SECRET_FILE: apiStorageAccessKey,
    S3_API_SECRET_ACCESS_KEY_SECRET_FILE: apiStorageSecretKey,
    MFA_SECRET_ENCRYPTION_KEY_SECRET_FILE: mfaEncryptionKey,
    S3_INGESTION_ACCESS_KEY_ID_SECRET_FILE: workerStorageAccessKey,
    S3_INGESTION_SECRET_ACCESS_KEY_SECRET_FILE: workerStorageSecretKey,
    S3_ENDPOINT: 'https://storage-fixture:4443',
    S3_BUCKET: 'sf20-api',
    S3_REGION: 'us-east-1',
    S3_SERVER_SIDE_ENCRYPTION: 'AES256',
    INGESTION_EGRESS_STORAGE_AUTHORITY: 'storage-fixture:4443',
    INGESTION_EGRESS_CLAMAV_AUTHORITY: 'clamav-fixture:3310',
    INGESTION_EGRESS_ALLOWED_CIDRS: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
    INGESTION_STORAGE_ENDPOINT: 'https://storage-fixture:4443',
    INGESTION_STORAGE_BUCKET: 'sf20-ingestion',
    INGESTION_STORAGE_REGION: 'us-east-1',
    INGESTION_CLAMAV_HOST: 'clamav-fixture',
    INGESTION_CLAMAV_PORT: '3310',
  };
  composeAttempted = true;
  runCompose(
    [
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      '60',
      'storage-fixture',
      'clamav-fixture',
      'unapproved-fixture',
    ],
    120_000,
  );
  runCompose(['build', 'ingestion'], 420_000);
  runCompose(['build', 'api-probe'], 420_000);
  runCompose(
    [
      'up',
      '-d',
      '--no-build',
      '--wait',
      '--wait-timeout',
      '240',
      'storage-fixture',
      'clamav-fixture',
      'unapproved-fixture',
      'ingestion',
      'ingestion-gateway',
      'api-probe',
    ],
    420_000,
  );
}, 450_000);

afterAll(() => {
  if (composeAttempted) {
    const result = spawnSync('docker', composeArgs(['down', '-v', '--remove-orphans']), {
      cwd: repoRoot,
      env: composeEnvironment,
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(result.status).toBe(0);
  }
  rmSync(tempRoot, { recursive: true, force: true });
}, 150_000);

describe.sequential('hostile document containment on the production ingestion topology', () => {
  it('reads the exact versioned object through mTLS and fixed TLS storage', () => {
    const result = extractProbe(binding());
    expect(result).toMatchObject({ kind: 'response', status: 200 });
    expect(result.body).toContain('"status":"ready"');
    expect(result.body).toContain('대한민국 법률 문서');
  });

  it('denies tenant/key mismatch and request-controlled destination fields before storage I/O', () => {
    const crossTenant = binding();
    expect(extractProbe(crossTenant, envelope(crossTenant, otherTenantId))).toMatchObject({
      kind: 'response',
      status: 403,
    });
    const injected = binding();
    expect(
      extractProbe(injected, {
        ...envelope(injected),
        endpoint: 'https://169.254.169.254/latest/meta-data',
      }),
    ).toMatchObject({ kind: 'response', status: 400 });
  });

  it('routes clean and infected payloads only to the fixed ClamAV fixture', () => {
    for (const [payload, expected] of [
      [Buffer.from('synthetic clean bytes'), '"outcome":"clean"'],
      [
        Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
        '"outcome":"infected"',
      ],
    ] as const) {
      const form = multipart(
        {
          quarantine_ref: randomUUID(),
          expected_sha256: sha256(payload),
        },
        'synthetic.bin',
        payload,
      );
      const result = probe({
        path: '/security/scan',
        body: form.body,
        headers: {
          ...identityHeaders(binding()),
          'content-type': form.contentType,
          'x-amic-tenant-id': tenantId,
        },
      });
      expect(result).toMatchObject({ kind: 'response', status: 200 });
      expect(result.body).toContain(expected);
    }
  });

  it('rejects a compression bomb with a bounded reason and accepts a later clean job', () => {
    const bomb = multipart(
      { tenant_id: tenantId, batch_id: randomUUID() },
      'bomb.zip',
      createBomb(),
    );
    const result = probe({
      path: '/zip/inspect',
      body: bomb.body,
      headers: {
        ...identityHeaders(binding()),
        'content-type': bomb.contentType,
        'x-amic-tenant-id': tenantId,
      },
    });
    expect(result).toMatchObject({ kind: 'response', status: 400 });
    expect(result.body).toContain('ZIP_COMPRESSION_RATIO_EXCEEDED');
    expect(extractProbe(binding())).toMatchObject({ kind: 'response', status: 200 });
  });

  it('persists replay denial across worker restart while a fresh request remains healthy', () => {
    const replay = binding();
    expect(extractProbe(replay)).toMatchObject({ kind: 'response', status: 200 });
    expect(extractProbe(replay)).toMatchObject({ kind: 'response', status: 403 });
    runCompose(['restart', 'ingestion'], 90_000);
    runCompose(
      [
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        '120',
        'ingestion',
        'ingestion-gateway',
        'api-probe',
      ],
      150_000,
    );
    expect(extractProbe(replay)).toMatchObject({ kind: 'response', status: 403 });
    expect(extractProbe(binding())).toMatchObject({ kind: 'response', status: 200 });
  });

  it('enforces the declared non-root read-only resource profile at runtime', () => {
    const containerId = runCompose(['ps', '-q', 'ingestion']).trim();
    const inspected = JSON.parse(
      execFileSync('docker', ['inspect', containerId], {
        encoding: 'utf8',
        timeout: 15_000,
      }),
    )[0];
    expect(inspected.Config.User).toBe('10001:10001');
    expect(inspected.HostConfig.ReadonlyRootfs).toBe(true);
    expect(inspected.HostConfig.CapDrop).toEqual(['ALL']);
    expect(inspected.HostConfig.PidsLimit).toBe(96);
    expect(inspected.HostConfig.NanoCpus).toBe(2_000_000_000);
    expect(inspected.HostConfig.Memory).toBe(2 * 1024 * 1024 * 1024);
    expect(inspected.HostConfig.SecurityOpt).toContain('no-new-privileges:true');
    const runtime = runCompose([
      'exec',
      '-T',
      'ingestion',
      'sh',
      '-lc',
      [
        'test "$(id -u)" = 10001',
        'test "$(id -g)" = 10001',
        'test "$(awk \'/CapEff/ {print $2}\' /proc/self/status)" = 0000000000000000',
        '! touch /worker/forbidden',
        '! touch /etc/forbidden',
        'touch /tmp/allowed',
        'touch /var/lib/amic-vault/replay/runtime-allowed',
      ].join(' && '),
    ]);
    expect(runtime).toBeDefined();
  });

  it('allows fixed fixtures but denies API, metadata, public, and isolated private peers', () => {
    const allowed = runCompose([
      'exec',
      '-T',
      'ingestion',
      'python',
      '-c',
      [
        'import socket',
        "socket.create_connection(('storage-fixture', 4443), 2).close()",
        "socket.create_connection(('clamav-fixture', 3310), 2).close()",
      ].join(';'),
    ]);
    expect(allowed).toBeDefined();
    const denied = spawnSync(
      'docker',
      composeArgs([
        'exec',
        '-T',
        'ingestion',
        'python',
        '-c',
        [
          'import socket',
          "targets=[('api',3001),('unapproved-fixture',4555),('169.254.169.254',80),('1.1.1.1',443)]",
          'failures=0',
          'for host,port in targets:',
          '  try: socket.create_connection((host,port),0.5).close(); failures += 1',
          '  except OSError: pass',
          'raise SystemExit(1 if failures else 0)',
        ].join('\n'),
      ]),
      {
        cwd: repoRoot,
        env: composeEnvironment,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(denied.status).toBe(0);
  });

  it('does not leak raw document content or fixed credentials in bounded logs', () => {
    const logs = runCompose([
      'logs',
      '--no-color',
      '--tail',
      '200',
      'ingestion',
      'ingestion-gateway',
    ]);
    expect(logs).not.toContain(rawCanary);
    expect(logs).not.toContain(cleanBody.toString('base64'));

    const runtimeSurfaces = [logs, runCompose(['config', '--format', 'json'])];
    for (const service of ['ingestion', 'api-probe']) {
      const containerId = runCompose(['ps', '-q', service]).trim();
      const inspected = JSON.parse(
        execFileSync('docker', ['inspect', containerId], {
          encoding: 'utf8',
          timeout: 15_000,
        }),
      )[0];
      runtimeSurfaces.push(
        JSON.stringify({
          config: inspected.Config,
          path: inspected.Path,
          args: inspected.Args,
        }),
      );
      runtimeSurfaces.push(
        execFileSync('docker', ['image', 'history', '--no-trunc', inspected.Image], {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
        }),
      );
    }
    runtimeSurfaces.push(
      JSON.stringify({
        schemaVersion: 'amic-vault.sf20-runtime-secret-surface-evidence.v1',
        status: 'PASS',
        values: 0,
      }),
    );
    for (const canary of [
      databaseSecretCanary,
      apiStorageAccessCanary,
      apiStorageSecretCanary,
      mfaEncryptionCanary,
      workerStorageAccessCanary,
      workerStorageSecretCanary,
    ]) {
      for (const surface of runtimeSurfaces) expect(surface).not.toContain(canary);
    }
  });
});
