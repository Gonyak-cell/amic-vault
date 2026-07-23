export const ingestionWorkerAudience = 'amic-vault-ingestion';
export const ingestionGatewayWorkloadSubject = 'amic-vault-api';
export const ingestionWorkerIdentityTtlSeconds = 300;

export type WorkerIdentityProfile = 'loopback-dev' | 'private-gateway-mtls';

export interface WorkerRequestIdentity {
  audience: typeof ingestionWorkerAudience;
  requestId: string;
  nonce: string;
  expiresAt: string;
}

export interface WorkerIdentityAdapter {
  readonly profile: WorkerIdentityProfile;
  createRequestIdentity(requestId: string, now?: Date): WorkerRequestIdentity;
}
