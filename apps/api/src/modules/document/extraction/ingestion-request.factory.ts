import {
  type IngestionJob,
  type IngestionJobValidationResult,
  validateIngestionJob,
} from '@amic-vault/shared';
import { randomUUID } from 'node:crypto';
import type { StorageService } from '../../storage/storage.service';
import type { StoragePathResolver } from '../../storage/storage-path.resolver';
import { createWorkerIdentityAdapter } from './worker-identity.adapters';
import type { ExtractionTarget } from './extraction.types';

export interface IngestionWorkerRequest {
  job: IngestionJob;
  headers: Readonly<Record<string, string>>;
}

function invalidRequest(): never {
  throw new Error('WORKER_INGESTION_REQUEST_INVALID');
}

function validatedJob(result: IngestionJobValidationResult): IngestionJob {
  if (!result.ok) invalidRequest();
  return result.value;
}

export async function createIngestionWorkerRequest(input: {
  target: ExtractionTarget;
  parserProfile: IngestionJob['parserProfile'];
  storageService: Pick<StorageService, 'latestVersionFingerprintByStorageUri'>;
  storagePathResolver: Pick<StoragePathResolver, 'parseStorageUri'>;
  now?: Date;
}): Promise<IngestionWorkerRequest> {
  const now = input.now ?? new Date();
  const parsed = input.storagePathResolver.parseStorageUri(input.target.storageUri);
  if (
    parsed.objectType !== 'document' ||
    parsed.tenantId !== input.target.tenantId ||
    parsed.matterId !== input.target.matterId ||
    parsed.documentId !== input.target.documentId ||
    parsed.fileObjectId !== input.target.fileObjectId
  ) {
    invalidRequest();
  }
  const identity = createWorkerIdentityAdapter().createRequestIdentity(randomUUID(), now);
  const job = validatedJob(
    validateIngestionJob(
      {
        tenantId: input.target.tenantId,
        documentId: input.target.documentId,
        versionId: input.target.versionId,
        fileObjectId: input.target.fileObjectId,
        storageAlias: 'primary',
        objectKey: parsed.key,
        objectVersion: await input.storageService.latestVersionFingerprintByStorageUri(
          input.target.tenantId,
          input.target.storageUri,
        ),
        sha256: input.target.sha256,
        sizeBytes: input.target.sizeBytes,
        parserProfile: input.parserProfile,
        requestId: identity.requestId,
        expiresAt: identity.expiresAt,
      },
      now,
    ),
  );
  return {
    job,
    headers: {
      'content-type': 'application/json',
      'x-amic-request-id': identity.requestId,
      'x-amic-ingestion-nonce': identity.nonce,
      'x-amic-ingestion-expires-at': identity.expiresAt,
    },
  };
}
