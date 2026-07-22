import type { Readable } from 'node:stream';

export type StorageBody = Buffer | Readable;

export interface StoragePutObjectInput {
  key: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
  payloadSha256?: string;
}

export interface StorageGetRangeInput {
  key: string;
  start: number;
  end: number;
}

export interface StorageCreateReadUrlInput {
  key: string;
  expiresInSeconds?: number;
}

export interface StorageReadUrlResult {
  url: string;
  expiresAt: Date;
}

export interface StorageObjectMetadata {
  key: string;
  contentLength: number;
  contentType: string | null;
  etag: string | null;
}

declare const storageObjectVersionBrand: unique symbol;

/**
 * A version identifier returned by a storage adapter inventory operation.
 *
 * The raw provider identifier is intentionally not exposed. A caller must use
 * a value returned by `listObjectVersions`; it cannot derive a version from a
 * key, ETag, filename, or a client supplied value.
 */
export interface StorageObjectVersion {
  readonly [storageObjectVersionBrand]: true;
}

export interface StorageVersionedObjectMetadata extends StorageObjectMetadata {
  version: StorageObjectVersion;
  /**
   * Stable SHA-256 fingerprint of the provider version identifier. It can be
   * sealed in Records inventory and later matched against a fresh adapter
   * inventory without exposing or persisting the raw provider identifier.
   */
  versionFingerprint: string;
  isDeleteMarker: boolean;
  isLatest: boolean;
}

export interface StorageVersionReference {
  key: string;
  version: StorageObjectVersion;
}

/**
 * Optional exact-version capability. It is deliberately separate from the
 * primary StorageAdapter so existing document storage cannot accidentally
 * acquire disposal semantics. Records disposal must use this interface, never
 * the legacy key-only delete method.
 */
export interface VersionedStorageAdapter {
  listObjectVersions(key: string): Promise<readonly StorageVersionedObjectMetadata[]>;
  headObjectVersion(reference: StorageVersionReference): Promise<StorageObjectMetadata | null>;
  deleteObjectVersion(reference: StorageVersionReference): Promise<void>;
}

export interface StorageGetObjectResult extends StorageObjectMetadata {
  body: Readable;
}

export interface StorageAdapter {
  putIfAbsent(input: StoragePutObjectInput): Promise<void>;
  get(key: string): Promise<StorageGetObjectResult>;
  getRange(input: StorageGetRangeInput): Promise<StorageGetObjectResult>;
  createReadUrl(input: StorageCreateReadUrlInput): Promise<StorageReadUrlResult>;
  head(key: string): Promise<StorageObjectMetadata | null>;
  /**
   * Legacy key-only deletion for existing non-Records flows. It is ineligible
   * for Records disposal because it cannot prove an exact object version.
   */
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

export class StorageVersioningUnsupportedError extends StorageUnavailableError {
  constructor() {
    super('storage versioning is unsupported');
    this.name = 'StorageVersioningUnsupportedError';
  }
}
