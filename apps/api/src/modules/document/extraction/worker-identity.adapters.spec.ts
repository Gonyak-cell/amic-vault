import { describe, expect, it } from 'vitest';
import {
  createWorkerIdentityAdapter,
  DevelopmentLoopbackWorkerIdentityAdapter,
  PrivateGatewayMtlsWorkerIdentityAdapter,
} from './worker-identity.adapters';

const requestId = '11111111-1111-4111-8111-111111111111';
const gatewayEnvironment = {
  NODE_ENV: 'production',
  INGESTION_WORKER_IDENTITY_PROFILE: 'private-gateway-mtls',
  INGESTION_GATEWAY_MTLS_ENABLED: 'true',
  INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS: 'true',
  INGESTION_GATEWAY_DIRECT_WORKER_ACCESS: 'blocked',
  INGESTION_GATEWAY_WORKLOAD_SUBJECT: 'amic-vault-api',
  INGESTION_GATEWAY_AUDIENCE: 'amic-vault-ingestion',
  INGESTION_WORKER_URL: 'https://ingestion-gateway.internal',
} as const;

describe('worker identity adapters', () => {
  it('creates a short-lived request binding for the configured private mTLS gateway', () => {
    const adapter = new PrivateGatewayMtlsWorkerIdentityAdapter(gatewayEnvironment);

    expect(adapter.createRequestIdentity(requestId, new Date('2030-01-01T00:00:00Z'))).toEqual({
      audience: 'amic-vault-ingestion',
      requestId,
      nonce: expect.stringMatching(/^[0-9a-f-]{36}$/),
      expiresAt: '2030-01-01T00:05:00Z',
    });
  });

  it('rejects missing gateway mTLS, identity-header sanitation, subject, audience, or direct-worker block', () => {
    for (const [key, value] of [
      ['INGESTION_GATEWAY_MTLS_ENABLED', 'false'],
      ['INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS', 'false'],
      ['INGESTION_GATEWAY_DIRECT_WORKER_ACCESS', 'allowed'],
      ['INGESTION_GATEWAY_WORKLOAD_SUBJECT', 'other-api'],
      ['INGESTION_GATEWAY_AUDIENCE', 'other-worker'],
      ['INGESTION_WORKER_URL', 'http://ingestion-gateway.internal'],
      ['INGESTION_WORKER_URL', 'https://127.0.0.1:8000'],
    ] as const) {
      expect(
        () =>
          new PrivateGatewayMtlsWorkerIdentityAdapter({
            ...gatewayEnvironment,
            [key]: value,
          }),
      ).toThrow('WORKER_IDENTITY_CONFIGURATION_INVALID');
    }
  });

  it('rejects a loopback identity profile in production', () => {
    expect(
      () =>
        new DevelopmentLoopbackWorkerIdentityAdapter({
          NODE_ENV: 'production',
          INGESTION_WORKER_IDENTITY_PROFILE: 'loopback-dev',
        }),
    ).toThrow('WORKER_IDENTITY_CONFIGURATION_INVALID');
  });

  it('permits loopback only outside production and rejects malformed request IDs', () => {
    const adapter = createWorkerIdentityAdapter({
      NODE_ENV: 'development',
      INGESTION_WORKER_IDENTITY_PROFILE: 'loopback-dev',
    });
    expect(adapter.profile).toBe('loopback-dev');
    expect(() => adapter.createRequestIdentity('not-a-uuid')).toThrow(
      'WORKER_IDENTITY_CONFIGURATION_INVALID',
    );
  });
});
