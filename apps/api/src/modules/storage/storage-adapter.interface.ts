import type { Readable } from 'node:stream';

export type StorageBody = Buffer | Readable;

export interface StoragePutObjectInput {
  key: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
  payloadSha256?: string;
}

export interface StorageObjectMetadata {
  key: string;
  contentLength: number;
  contentType: string | null;
  etag: string | null;
}

export interface StorageGetObjectResult extends StorageObjectMetadata {
  body: Readable;
}

export interface StorageAdapter {
  putIfAbsent(input: StoragePutObjectInput): Promise<void>;
  get(key: string): Promise<StorageGetObjectResult>;
  head(key: string): Promise<StorageObjectMetadata | null>;
  delete(key: string): Promise<void>;
}

export class StorageObjectAlreadyExistsError extends Error {
  constructor(key: string) {
    super(`storage object already exists: ${key}`);
    this.name = 'StorageObjectAlreadyExistsError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'storage backend unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}
