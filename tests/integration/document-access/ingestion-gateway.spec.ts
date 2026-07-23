import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface CertificatePair {
  certificate: string;
  key: string;
}

interface ProbeResult {
  kind: 'response' | 'tls-error' | 'transport-error';
  status?: number;
  body?: string;
}

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'amic-vault-ingestion-gateway-e2e-'));
const certificateRoot = join(tempRoot, 'certs');
const overridePath = join(tempRoot, 'compose.override.json');
const projectName = `amic-vault-sf20-gateway-${process.pid}`;
const baseCompose = resolve(repoRoot, 'infra/production/compose.yml');
const gatewayDnsName = 'ingestion-gateway';
let composeEnvironment: NodeJS.ProcessEnv;
let ca: CertificatePair;
let oldClient: CertificatePair;
let newClient: CertificatePair;
let wrongSubjectClient: CertificatePair;
let untrustedClient: CertificatePair;
let expiredClient: CertificatePair;
let composeAttempted = false;

const transportProbeSource = `
const { fetchIngestionWorker } = require('/app/apps/api/dist/modules/document/extraction/private-gateway.transport.js');
const headers = JSON.parse(process.env.PROBE_HEADERS || '{}');
fetchIngestionWorker('/extract', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: '{}'
}).then(async (response) => {
  process.stdout.write(JSON.stringify({
    kind: 'response',
    status: response.status,
    body: (await response.text()).slice(0, 512)
  }) + '\\n');
}).catch(() => {
  process.stdout.write(JSON.stringify({ kind: 'transport-error' }) + '\\n');
  process.exitCode = 2;
});
`;

const rawTlsProbeSource = `
const https = require('node:https');
const fs = require('node:fs');
const headers = JSON.parse(process.env.PROBE_HEADERS || '{}');
const options = {
  hostname: 'ingestion-gateway',
  port: 8443,
  path: '/extract',
  method: 'POST',
  servername: 'ingestion-gateway',
  ca: fs.readFileSync('/test-certs/ca.crt'),
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2',
  headers: { 'content-type': 'application/json', ...headers }
};
if (process.env.PROBE_CERT) options.cert = fs.readFileSync(process.env.PROBE_CERT);
if (process.env.PROBE_KEY) options.key = fs.readFileSync(process.env.PROBE_KEY);
const request = https.request(options, (response) => {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => {
    process.stdout.write(JSON.stringify({
      kind: 'response',
      status: response.statusCode,
      body: Buffer.concat(chunks).toString('utf8').slice(0, 512)
    }) + '\\n');
  });
});
request.on('error', () => {
  process.stdout.write(JSON.stringify({ kind: 'tls-error' }) + '\\n');
});
request.end('{}');
`;

function openssl(args: readonly string[]): void {
  execFileSync('openssl', [...args], { cwd: certificateRoot, stdio: 'ignore' });
}

function createCa(name: string): CertificatePair {
  const key = join(certificateRoot, `${name}.key`);
  const certificate = join(certificateRoot, `${name}.crt`);
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
  usage: 'clientAuth' | 'serverAuth';
  signer: CertificatePair;
  dnsName?: string;
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
    input.signer.certificate,
    '-CAkey',
    input.signer.key,
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

function issueExpiredClient(signer: CertificatePair): CertificatePair {
  const key = join(certificateRoot, 'expired-client.key');
  const request = join(certificateRoot, 'expired-client.csr');
  const certificate = join(certificateRoot, 'expired-client.crt');
  const database = join(certificateRoot, 'expired-ca-index.txt');
  const newCertificates = join(certificateRoot, 'expired-ca-newcerts');
  const serial = join(certificateRoot, 'expired-ca-serial');
  const config = join(certificateRoot, 'expired-ca.cnf');
  mkdirSync(newCertificates);
  writeFileSync(database, '');
  writeFileSync(`${database}.attr`, 'unique_subject = no\n');
  writeFileSync(serial, '1000\n');
  writeFileSync(
    config,
    `
[ ca ]
default_ca = CA_default
[ CA_default ]
database = ${database}
new_certs_dir = ${newCertificates}
certificate = ${signer.certificate}
private_key = ${signer.key}
serial = ${serial}
default_md = sha256
policy = policy_any
unique_subject = no
[ policy_any ]
commonName = supplied
[ client_ext ]
extendedKeyUsage = clientAuth
`,
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
    '/CN=amic-vault-api',
  ]);
  openssl([
    'ca',
    '-batch',
    '-notext',
    '-config',
    config,
    '-in',
    request,
    '-out',
    certificate,
    '-startdate',
    '20010101000000Z',
    '-enddate',
    '20020101000000Z',
    '-extensions',
    'client_ext',
  ]);
  return { certificate, key };
}

function composeArgs(args: readonly string[]): string[] {
  return [
    'compose',
    '-f',
    baseCompose,
    '-f',
    overridePath,
    '-p',
    projectName,
    ...args,
  ];
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
    throw new Error(`INGESTION_GATEWAY_COMPOSE_FAILED:${args[0] ?? 'unknown'}`);
  }
  return result.stdout;
}

function bindingHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 3 * 60 * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
  return {
    'x-amic-request-id': randomUUID(),
    'x-amic-ingestion-nonce': randomUUID(),
    'x-amic-ingestion-expires-at': expiresAt,
    ...overrides,
  };
}

function parseProbe(output: string): ProbeResult {
  const line = output
    .trim()
    .split(/\r?\n/u)
    .findLast((value) => value.startsWith('{'));
  if (!line) throw new Error('INGESTION_GATEWAY_PROBE_OUTPUT_INVALID');
  return JSON.parse(line) as ProbeResult;
}

function transportProbe(input: {
  headers?: Record<string, string>;
  certificate?: string;
  key?: string;
} = {}): ProbeResult {
  const args = ['exec', '-T'];
  if (input.certificate) {
    args.push(
      '-e',
      `INGESTION_GATEWAY_CLIENT_CERT_FILE=${input.certificate}`,
      '-e',
      `INGESTION_GATEWAY_CLIENT_KEY_FILE=${input.key ?? ''}`,
    );
  }
  args.push(
    '-e',
    `PROBE_HEADERS=${JSON.stringify(input.headers ?? {})}`,
    'api-probe',
    'node',
    '-e',
    transportProbeSource,
  );
  const result = spawnSync('docker', composeArgs(args), {
    cwd: repoRoot,
    env: composeEnvironment,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return parseProbe(result.stdout);
}

function rawTlsProbe(input: {
  headers?: Record<string, string>;
  certificate?: string;
  key?: string;
} = {}): ProbeResult {
  const args = ['exec', '-T', '-e', `PROBE_HEADERS=${JSON.stringify(input.headers ?? {})}`];
  if (input.certificate) {
    args.push(
      '-e',
      `PROBE_CERT=${input.certificate}`,
      '-e',
      `PROBE_KEY=${input.key ?? ''}`,
    );
  }
  args.push('api-probe', 'node', '-e', rawTlsProbeSource);
  return parseProbe(runCompose(args, 30_000));
}

function expectWorkerValidation(result: ProbeResult): void {
  expect(result).toMatchObject({ kind: 'response', status: 400 });
  expect(result.body).toContain('"code":"VALIDATION_FAILED"');
}

beforeAll(() => {
  mkdirSync(certificateRoot);
  ca = createCa('ca');
  const untrustedCa = createCa('amic-vault-untrusted-ca');
  const server = issueCertificate({
    name: 'gateway-server',
    subject: gatewayDnsName,
    serial: 10,
    usage: 'serverAuth',
    signer: ca,
    dnsName: gatewayDnsName,
  });
  oldClient = issueCertificate({
    name: 'api-client-old',
    subject: 'amic-vault-api',
    serial: 101,
    usage: 'clientAuth',
    signer: ca,
  });
  newClient = issueCertificate({
    name: 'api-client-new',
    subject: 'amic-vault-api',
    serial: 102,
    usage: 'clientAuth',
    signer: ca,
  });
  wrongSubjectClient = issueCertificate({
    name: 'wrong-subject-client',
    subject: 'other-api',
    serial: 103,
    usage: 'clientAuth',
    signer: ca,
  });
  untrustedClient = issueCertificate({
    name: 'untrusted-client',
    subject: 'amic-vault-api',
    serial: 104,
    usage: 'clientAuth',
    signer: untrustedCa,
  });
  expiredClient = issueExpiredClient(ca);

  const activeClient = {
    certificate: join(certificateRoot, 'active-client.crt'),
    key: join(certificateRoot, 'active-client.key'),
  };
  copyFileSync(oldClient.certificate, activeClient.certificate);
  copyFileSync(oldClient.key, activeClient.key);
  writeFileSync(
    overridePath,
    JSON.stringify({
      services: {
        'api-probe': {
          build: {
            context: repoRoot,
            dockerfile: 'apps/api/Dockerfile',
            target: 'api',
          },
          command: ['sh', '-lc', 'sleep infinity'],
          environment: {
            NODE_ENV: 'production',
            INGESTION_WORKER_IDENTITY_PROFILE: 'private-gateway-mtls',
            INGESTION_GATEWAY_MTLS_ENABLED: 'true',
            INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS: 'true',
            INGESTION_GATEWAY_DIRECT_WORKER_ACCESS: 'blocked',
            INGESTION_GATEWAY_WORKLOAD_SUBJECT: 'amic-vault-api',
            INGESTION_GATEWAY_AUDIENCE: 'amic-vault-ingestion',
            INGESTION_WORKER_URL: 'https://ingestion-gateway:8443',
            INGESTION_GATEWAY_CA_FILE: '/test-certs/ca.crt',
            INGESTION_GATEWAY_CLIENT_CERT_FILE: '/test-certs/active-client.crt',
            INGESTION_GATEWAY_CLIENT_KEY_FILE: '/test-certs/active-client.key',
            INGESTION_GATEWAY_SERVER_NAME: 'ingestion-gateway',
          },
          volumes: [`${certificateRoot}:/test-certs:ro`],
          networks: ['ingestion-client'],
          depends_on: {
            'ingestion-gateway': {
              condition: 'service_healthy',
            },
          },
        },
      },
    }),
  );
  composeEnvironment = {
    ...process.env,
    INGESTION_GATEWAY_CA_FILE: ca.certificate,
    INGESTION_GATEWAY_SERVER_CERT_FILE: server.certificate,
    INGESTION_GATEWAY_SERVER_KEY_FILE: server.key,
    INGESTION_GATEWAY_CLIENT_CERT_FILE: activeClient.certificate,
    INGESTION_GATEWAY_CLIENT_KEY_FILE: activeClient.key,
  };
  composeAttempted = true;
  runCompose(
    ['up', '-d', '--build', '--wait', '--wait-timeout', '180', 'ingestion', 'ingestion-gateway', 'api-probe'],
    300_000,
  );
}, 330_000);

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

describe.sequential('private ingestion gateway production topology', () => {
  it('valid client identity reaches worker validation through the built API transport', () => {
    expectWorkerValidation(transportProbe());
    expect(runCompose(['exec', '-T', 'ingestion-gateway', 'nginx', '-t'])).toBeDefined();
  });

  it('denies missing, untrusted, expired, and wrong-subject client identities before worker validation', () => {
    for (const probe of [
      rawTlsProbe(),
      rawTlsProbe({
        certificate: '/test-certs/untrusted-client.crt',
        key: '/test-certs/untrusted-client.key',
      }),
      rawTlsProbe({
        certificate: '/test-certs/expired-client.crt',
        key: '/test-certs/expired-client.key',
      }),
      rawTlsProbe({
        certificate: '/test-certs/wrong-subject-client.crt',
        key: '/test-certs/wrong-subject-client.key',
      }),
    ]) {
      expect(probe.body ?? '').not.toContain('"code":"VALIDATION_FAILED"');
      if (probe.kind === 'response') expect(probe.status).not.toBe(200);
      else expect(probe.kind).toBe('tls-error');
    }
  });

  it('overwrites caller gateway identity headers with the fixed subject and audience', () => {
    const headers = bindingHeaders({
      'x-amic-gateway-mtls-verified': 'false',
      'x-amic-gateway-workload-subject': 'spoofed-api',
      'x-amic-gateway-audience': 'wrong-audience',
      'x-amic-dev-loopback-identity': 'true',
    });
    expectWorkerValidation(
      rawTlsProbe({
        headers,
        certificate: '/test-certs/api-client-old.crt',
        key: '/test-certs/api-client-old.key',
      }),
    );
  });

  it('worker rejects wrong gateway subject and audience on the actual gateway network', () => {
    for (const overrides of [
      { 'x-amic-gateway-workload-subject': 'other-api' },
      { 'x-amic-gateway-audience': 'other-audience' },
    ]) {
      const headers = {
        ...bindingHeaders(),
        'x-amic-gateway-mtls-verified': 'true',
        'x-amic-gateway-workload-subject': 'amic-vault-api',
        'x-amic-gateway-audience': 'amic-vault-ingestion',
        ...overrides,
      };
      const args = [
        'exec',
        '-T',
        'ingestion-gateway',
        'wget',
        '-S',
        '-O',
        '-',
        ...Object.entries(headers).flatMap(([name, value]) => ['--header', `${name}: ${value}`]),
        '--post-data',
        '{}',
        'http://ingestion:8000/extract',
      ];
      const result = spawnSync('docker', composeArgs(args), {
        cwd: repoRoot,
        env: composeEnvironment,
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(`${result.stdout}${result.stderr}`).toMatch(/403/u);
    }
  });

  it('rejects replay before and after worker restart while a fresh binding succeeds', () => {
    const headers = bindingHeaders();
    expectWorkerValidation(transportProbe({ headers }));
    expect(transportProbe({ headers })).toMatchObject({ kind: 'response', status: 403 });

    runCompose(['restart', 'ingestion'], 60_000);
    runCompose(['up', '-d', '--wait', '--wait-timeout', '90', 'ingestion', 'ingestion-gateway', 'api-probe'], 120_000);
    expect(transportProbe({ headers })).toMatchObject({ kind: 'response', status: 403 });
    expectWorkerValidation(transportProbe({ headers: bindingHeaders() }));
  });

  it('accepts old and new exact-subject client certificates during rotation overlap', () => {
    expectWorkerValidation(
      transportProbe({
        certificate: '/test-certs/api-client-old.crt',
        key: '/test-certs/api-client-old.key',
      }),
    );
    expectWorkerValidation(
      transportProbe({
        certificate: '/test-certs/api-client-new.crt',
        key: '/test-certs/api-client-new.key',
      }),
    );
  });

  it('has no API-network or host direct worker path and no public gateway port', () => {
    const direct = spawnSync(
      'docker',
      composeArgs([
        'exec',
        '-T',
        'api-probe',
        'node',
        '-e',
        "fetch('http://ingestion:8000/health').then(() => process.exit(1)).catch(() => process.exit(0))",
      ]),
      {
        cwd: repoRoot,
        env: composeEnvironment,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(direct.status).toBe(0);
    for (const service of ['ingestion', 'ingestion-gateway']) {
      const containerId = execFileSync('docker', composeArgs(['ps', '-q', service]), {
        cwd: repoRoot,
        env: composeEnvironment,
        encoding: 'utf8',
        timeout: 10_000,
      }).trim();
      expect(containerId).not.toBe('');
      const rawBindings = execFileSync(
        'docker',
        ['inspect', '--format', '{{json .HostConfig.PortBindings}}', containerId],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          timeout: 10_000,
        },
      ).trim();
      const bindings = JSON.parse(rawBindings) as Record<string, unknown> | null;
      expect(Object.keys(bindings ?? {})).toHaveLength(0);
    }
  });

  it('rejects the development loopback identity profile under production startup rules', () => {
    const result = spawnSync(
      'docker',
      composeArgs([
        'exec',
        '-T',
        '-e',
        'NODE_ENV=production',
        '-e',
        'INGESTION_WORKER_IDENTITY_PROFILE=loopback-dev',
        'ingestion',
        'python',
        '-c',
        "import os; from app.service_identity import assert_service_identity_profile; assert_service_identity_profile(os.environ)",
      ]),
      {
        cwd: repoRoot,
        env: composeEnvironment,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(result.status).not.toBe(0);
  });
});
