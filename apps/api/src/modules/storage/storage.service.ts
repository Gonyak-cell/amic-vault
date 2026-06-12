import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { sha256Stream } from '../document/integrity/sha256.util';
import type {
  StorageAdapter,
  StorageBody,
  StorageGetObjectResult,
} from './storage-adapter.interface';
import { ENCRYPTION_HOOK, type EncryptionHook } from './encryption-hook.interface';
import { StoragePathResolver, StorageTenantIsolationViolationError } from './storage-path.resolver';

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

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

  async sha256ByStorageUri(tenantId: string, storageUri: string): Promise<string> {
    const object = await this.getByStorageUri(tenantId, storageUri);
    return sha256Stream(object.body);
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
}
