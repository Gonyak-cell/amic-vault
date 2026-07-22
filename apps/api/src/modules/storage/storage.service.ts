import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { sha256Stream } from '../document/integrity/sha256.util';
import type {
  StorageAdapter,
  StorageBody,
  StorageGetObjectResult,
  StorageReadUrlResult,
  StorageObjectVersion,
  VersionedStorageAdapter,
} from './storage-adapter.interface';
import {
  StorageUnavailableError,
  StorageVersionFingerprintUnavailableError,
  StorageVersioningUnsupportedError,
} from './storage-adapter.interface';
import { ENCRYPTION_HOOK, type EncryptionHook } from './encryption-hook.interface';
import { StoragePathResolver, StorageTenantIsolationViolationError } from './storage-path.resolver';

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

declare const sealedStorageVersionBrand: unique symbol;

/** Opaque worker-only reference; neither key nor provider version escapes StorageService. */
export interface SealedStorageVersion {
  readonly [sealedStorageVersionBrand]: true;
}

export interface SealedStorageVersionInspection {
  version: SealedStorageVersion;
  present: boolean;
  objectLockProtected: boolean;
}

export interface PutTenantObjectInput {
  tenantId: string;
  matterId: string;
  documentId: string;
  fileObjectId: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
}

export interface PutEmailRawObjectInput {
  tenantId: string;
  emailId: string;
  fileObjectId: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
}

export interface PutAuditAnchorObjectInput {
  tenantId: string;
  anchorDate: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
}

export interface PutQuarantineObjectInput {
  tenantId: string;
  quarantineRef: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
}

export interface PutTenantObjectResult {
  key: string;
  storageUri: string;
  encryptionKeyId: string | null;
}

function tenantIsolationDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'TENANT_ISOLATION_VIOLATION' });
}

@Injectable()
export class StorageService {
  private readonly sealedVersions = new WeakMap<
    SealedStorageVersion,
    { key: string; version: StorageObjectVersion }
  >();
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
    @Inject(StoragePathResolver) private readonly pathResolver: StoragePathResolver,
    @Inject(ENCRYPTION_HOOK) private readonly encryptionHook: EncryptionHook,
  ) {}

  async putTenantObject(input: PutTenantObjectInput): Promise<PutTenantObjectResult> {
    const key = this.pathResolver.buildObjectKey(input);
    const encrypted = await this.encryptionHook.beforePut({
      tenantId: input.tenantId,
      matterId: input.matterId,
      documentId: input.documentId,
      fileObjectId: input.fileObjectId,
      body: input.body,
      contentLength: input.contentLength,
      contentType: input.contentType,
    });
    await this.adapter.putIfAbsent({
      key,
      body: encrypted.body,
      contentLength: encrypted.contentLength,
      contentType: encrypted.contentType,
    });
    return {
      key,
      storageUri: this.pathResolver.storageUriForKey(key),
      encryptionKeyId: encrypted.encryptionKeyId,
    };
  }

  async putEmailRawObject(input: PutEmailRawObjectInput): Promise<PutTenantObjectResult> {
    const key = this.pathResolver.buildEmailRawObjectKey(input);
    const encrypted = await this.encryptionHook.beforePut({
      tenantId: input.tenantId,
      emailId: input.emailId,
      fileObjectId: input.fileObjectId,
      body: input.body,
      contentLength: input.contentLength,
      contentType: input.contentType,
    });
    await this.adapter.putIfAbsent({
      key,
      body: encrypted.body,
      contentLength: encrypted.contentLength,
      contentType: encrypted.contentType,
    });
    return {
      key,
      storageUri: this.pathResolver.storageUriForKey(key),
      encryptionKeyId: encrypted.encryptionKeyId,
    };
  }

  async putAuditAnchorObject(input: PutAuditAnchorObjectInput): Promise<PutTenantObjectResult> {
    const key = this.pathResolver.buildAuditAnchorObjectKey(input);
    const encrypted = await this.encryptionHook.beforePut({
      tenantId: input.tenantId,
      fileObjectId: `audit-anchor:${input.anchorDate}`,
      body: input.body,
      contentLength: input.contentLength,
      contentType: input.contentType,
    });
    await this.adapter.putIfAbsent({
      key,
      body: encrypted.body,
      contentLength: encrypted.contentLength,
      contentType: encrypted.contentType,
    });
    return {
      key,
      storageUri: this.pathResolver.storageUriForKey(key),
      encryptionKeyId: encrypted.encryptionKeyId,
    };
  }

  async putQuarantineObject(input: PutQuarantineObjectInput): Promise<PutTenantObjectResult> {
    const key = this.pathResolver.buildQuarantineObjectKey(input);
    const encrypted = await this.encryptionHook.beforePut({
      tenantId: input.tenantId,
      fileObjectId: `quarantine:${input.quarantineRef}`,
      body: input.body,
      contentLength: input.contentLength,
      contentType: input.contentType,
    });
    await this.adapter.putIfAbsent({
      key,
      body: encrypted.body,
      contentLength: encrypted.contentLength,
      contentType: encrypted.contentType,
    });
    return {
      key,
      storageUri: this.pathResolver.storageUriForKey(key),
      encryptionKeyId: encrypted.encryptionKeyId,
    };
  }

  async headByStorageUri(tenantId: string, storageUri: string) {
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    return this.adapter.head(parsed.key);
  }

  async getByStorageUri(tenantId: string, storageUri: string): Promise<StorageGetObjectResult> {
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    const object = await this.adapter.get(parsed.key);
    const decrypted = await this.encryptionHook.afterGet({
      tenantId,
      key: parsed.key,
      body: object.body,
      contentLength: object.contentLength,
      contentType: object.contentType,
    });
    return { ...object, body: decrypted.body };
  }

  async getRangeByStorageUri(
    tenantId: string,
    storageUri: string,
    start: number,
    end: number,
  ): Promise<StorageGetObjectResult> {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      throw tenantIsolationDenied();
    }
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    const object = await this.adapter.getRange({ key: parsed.key, start, end });
    const decrypted = await this.encryptionHook.afterGet({
      tenantId,
      key: parsed.key,
      body: object.body,
      contentLength: object.contentLength,
      contentType: object.contentType,
    });
    return { ...object, body: decrypted.body };
  }

  async createReadUrlByStorageUri(
    tenantId: string,
    storageUri: string,
    expiresInSeconds?: number,
  ): Promise<StorageReadUrlResult> {
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    return this.adapter.createReadUrl({
      key: parsed.key,
      ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    });
  }

  async sha256ByStorageUri(tenantId: string, storageUri: string): Promise<string> {
    const object = await this.getByStorageUri(tenantId, storageUri);
    return sha256Stream(object.body);
  }

  /**
   * Returns only an adapter-produced version fingerprint after tenant storage
   * URI validation. Provider version IDs and opaque handles never leave this
   * storage boundary.
   */
  async latestVersionFingerprintByStorageUri(tenantId: string, storageUri: string): Promise<string> {
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    const latest = (await this.versionedAdapter().listObjectVersions(parsed.key)).find(
      (entry) => !entry.isDeleteMarker && entry.isLatest,
    );
    if (!latest || !/^[a-f0-9]{64}$/u.test(latest.versionFingerprint)) {
      throw new StorageUnavailableError('storage latest version fingerprint is unavailable');
    }
    return latest.versionFingerprint;
  }

  /**
   * Resolves an inventory fingerprint to a fresh opaque provider version and
   * performs the required exact HEAD. The caller receives only an opaque
   * capability plus bounded presence/Object-Lock facts.
   */
  async inspectSealedVersionByStorageUri(
    tenantId: string,
    storageUri: string,
    storageVersionFingerprint: string,
  ): Promise<SealedStorageVersionInspection> {
    if (!/^[a-f0-9]{64}$/u.test(storageVersionFingerprint)) {
      throw new StorageVersionFingerprintUnavailableError();
    }
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    const found = (await this.versionedAdapter().listObjectVersions(parsed.key)).filter(
      (entry) => !entry.isDeleteMarker && entry.versionFingerprint === storageVersionFingerprint,
    );
    if (found.length !== 1) throw new StorageVersionFingerprintUnavailableError();
    const entry = found[0];
    if (!entry) throw new StorageVersionFingerprintUnavailableError();
    const version = {} as SealedStorageVersion;
    this.sealedVersions.set(version, { key: parsed.key, version: entry.version });
    const metadata = await this.versionedAdapter().headObjectVersion({
      key: parsed.key,
      version: entry.version,
    });
    if (!metadata) return { version, present: false, objectLockProtected: false };
    const objectLock = metadata.objectLock;
    if (!objectLock) throw new StorageUnavailableError('storage object lock state is unavailable');
    return {
      version,
      present: true,
      objectLockProtected:
        objectLock.legalHold ||
        (objectLock.retainUntil !== null && objectLock.retainUntil.getTime() > Date.now()),
    };
  }

  async deleteSealedVersion(version: SealedStorageVersion): Promise<void> {
    await this.versionedAdapter().deleteObjectVersion(this.requireSealedVersion(version));
  }

  async sealedVersionIsPresent(version: SealedStorageVersion): Promise<boolean> {
    return (await this.versionedAdapter().headObjectVersion(this.requireSealedVersion(version))) !== null;
  }

  async deleteByStorageUri(tenantId: string, storageUri: string): Promise<void> {
    const parsed = this.assertTenantStorageUri(tenantId, storageUri);
    await this.adapter.delete(parsed.key);
  }

  private assertTenantStorageUri(tenantId: string, storageUri: string) {
    try {
      return this.pathResolver.assertTenantStorageUri(tenantId, storageUri);
    } catch (error) {
      if (error instanceof StorageTenantIsolationViolationError) throw tenantIsolationDenied();
      throw error;
    }
  }

  private versionedAdapter(): VersionedStorageAdapter {
    const candidate = this.adapter as Partial<VersionedStorageAdapter>;
    if (typeof candidate.listObjectVersions !== 'function') {
      throw new StorageVersioningUnsupportedError();
    }
    return candidate as VersionedStorageAdapter;
  }

  private requireSealedVersion(version: SealedStorageVersion) {
    const reference = this.sealedVersions.get(version);
    if (!reference) throw new StorageUnavailableError('storage sealed version reference is invalid');
    return reference;
  }
}
