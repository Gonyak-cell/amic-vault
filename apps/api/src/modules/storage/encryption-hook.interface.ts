import type { Readable } from 'node:stream';
import type { StorageBody } from './storage-adapter.interface';

export interface EncryptionBeforePutInput {
  tenantId: string;
  matterId?: string;
  documentId?: string;
  emailId?: string;
  fileObjectId: string;
  body: StorageBody;
  contentLength: number;
  contentType: string;
}

export interface EncryptionBeforePutResult {
  body: StorageBody;
  contentLength: number;
  contentType: string;
  encryptionKeyId: string | null;
}

export interface EncryptionAfterGetInput {
  tenantId: string;
  key: string;
  body: Readable;
  contentLength: number;
  contentType: string | null;
}

export interface EncryptionAfterGetResult {
  body: Readable;
}

export interface EncryptionHook {
  beforePut(input: EncryptionBeforePutInput): Promise<EncryptionBeforePutResult>;
  afterGet(input: EncryptionAfterGetInput): Promise<EncryptionAfterGetResult>;
}

export const ENCRYPTION_HOOK = Symbol('ENCRYPTION_HOOK');
