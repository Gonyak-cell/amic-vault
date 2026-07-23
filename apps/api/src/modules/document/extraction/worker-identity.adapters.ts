import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';
import {
  ingestionGatewayWorkloadSubject,
  ingestionWorkerAudience,
  ingestionWorkerIdentityTtlSeconds,
  type WorkerIdentityAdapter,
  type WorkerIdentityProfile,
  type WorkerRequestIdentity,
} from './worker-identity.interface';

type WorkerIdentityEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'NODE_ENV'
    | 'INGESTION_WORKER_IDENTITY_PROFILE'
    | 'INGESTION_GATEWAY_MTLS_ENABLED'
    | 'INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS'
    | 'INGESTION_GATEWAY_DIRECT_WORKER_ACCESS'
    | 'INGESTION_GATEWAY_WORKLOAD_SUBJECT'
    | 'INGESTION_GATEWAY_AUDIENCE'
    | 'INGESTION_WORKER_URL'
    | 'INGESTION_GATEWAY_CA_FILE'
    | 'INGESTION_GATEWAY_CLIENT_CERT_FILE'
    | 'INGESTION_GATEWAY_CLIENT_KEY_FILE'
    | 'INGESTION_GATEWAY_SERVER_NAME'
  >
>;

function failConfiguration(): never {
  throw new Error('WORKER_IDENTITY_CONFIGURATION_INVALID');
}

function expiresAt(now: Date): string {
  const roundedNow = Math.floor(now.getTime() / 1000) * 1000;
  return new Date(roundedNow + ingestionWorkerIdentityTtlSeconds * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) {
    failConfiguration();
  }
}

function isAbsoluteCredentialPath(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 1 && !value.includes('\0') && isAbsolute(value);
}

export function privateGatewayUrl(
  env: WorkerIdentityEnvironment = process.env,
): URL {
  let gatewayUrl: URL;
  try {
    gatewayUrl = new URL(env.INGESTION_WORKER_URL ?? '');
  } catch {
    failConfiguration();
  }
  const hostname = gatewayUrl.hostname.toLowerCase().replace(/\.$/u, '');
  if (
    gatewayUrl.protocol !== 'https:' ||
    gatewayUrl.username !== '' ||
    gatewayUrl.password !== '' ||
    gatewayUrl.pathname !== '/' ||
    gatewayUrl.search !== '' ||
    gatewayUrl.hash !== '' ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isIP(hostname) !== 0 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u.test(
      hostname,
    ) ||
    env.INGESTION_GATEWAY_SERVER_NAME !== hostname
  ) {
    failConfiguration();
  }
  return gatewayUrl;
}

abstract class BaseWorkerIdentityAdapter implements WorkerIdentityAdapter {
  abstract readonly profile: WorkerIdentityProfile;

  createRequestIdentity(requestId: string, now: Date = new Date()): WorkerRequestIdentity {
    assertUuid(requestId);
    if (Number.isNaN(now.getTime())) failConfiguration();
    return {
      audience: ingestionWorkerAudience,
      requestId,
      nonce: randomUUID(),
      expiresAt: expiresAt(now),
    };
  }
}

export class DevelopmentLoopbackWorkerIdentityAdapter extends BaseWorkerIdentityAdapter {
  readonly profile = 'loopback-dev' as const;

  constructor(env: WorkerIdentityEnvironment = process.env) {
    super();
    if (
      env.NODE_ENV === 'production' ||
      (env.INGESTION_WORKER_IDENTITY_PROFILE ?? 'loopback-dev') !== 'loopback-dev'
    ) {
      failConfiguration();
    }
  }
}

export class PrivateGatewayMtlsWorkerIdentityAdapter extends BaseWorkerIdentityAdapter {
  readonly profile = 'private-gateway-mtls' as const;

  constructor(env: WorkerIdentityEnvironment = process.env) {
    super();
    privateGatewayUrl(env);
    if (
      env.INGESTION_WORKER_IDENTITY_PROFILE !== 'private-gateway-mtls' ||
      env.INGESTION_GATEWAY_MTLS_ENABLED !== 'true' ||
      env.INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS !== 'true' ||
      env.INGESTION_GATEWAY_DIRECT_WORKER_ACCESS !== 'blocked' ||
      env.INGESTION_GATEWAY_WORKLOAD_SUBJECT !== ingestionGatewayWorkloadSubject ||
      env.INGESTION_GATEWAY_AUDIENCE !== ingestionWorkerAudience ||
      !isAbsoluteCredentialPath(env.INGESTION_GATEWAY_CA_FILE) ||
      !isAbsoluteCredentialPath(env.INGESTION_GATEWAY_CLIENT_CERT_FILE) ||
      !isAbsoluteCredentialPath(env.INGESTION_GATEWAY_CLIENT_KEY_FILE)
    ) {
      failConfiguration();
    }
  }
}

export function createWorkerIdentityAdapter(
  env: WorkerIdentityEnvironment = process.env,
): WorkerIdentityAdapter {
  if (env.INGESTION_WORKER_IDENTITY_PROFILE === 'private-gateway-mtls') {
    return new PrivateGatewayMtlsWorkerIdentityAdapter(env);
  }
  return new DevelopmentLoopbackWorkerIdentityAdapter(env);
}

export function createWorkerIdentityHeaders(
  env: WorkerIdentityEnvironment = process.env,
  now: Date = new Date(),
  requestId: string = randomUUID(),
): Readonly<Record<string, string>> {
  const adapter = createWorkerIdentityAdapter(env);
  const identity = adapter.createRequestIdentity(requestId, now);
  return {
    'x-amic-request-id': identity.requestId,
    'x-amic-ingestion-nonce': identity.nonce,
    'x-amic-ingestion-expires-at': identity.expiresAt,
    ...(adapter.profile === 'loopback-dev'
      ? { 'x-amic-dev-loopback-identity': 'true' }
      : {}),
  };
}
