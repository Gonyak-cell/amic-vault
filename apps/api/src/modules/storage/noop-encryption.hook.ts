import { Injectable } from '@nestjs/common';
import type {
  EncryptionAfterGetInput,
  EncryptionAfterGetResult,
  EncryptionBeforePutInput,
  EncryptionBeforePutResult,
  EncryptionHook,
} from './encryption-hook.interface';

export const MANAGED_AT_REST_ENCRYPTION_MARKER = 'managed-at-rest:S3-SSE/RDS';

@Injectable()
export class NoopEncryptionHook implements EncryptionHook {
  async beforePut(input: EncryptionBeforePutInput): Promise<EncryptionBeforePutResult> {
    // No envelope key is attached here; object/database at-rest encryption is delegated to S3 SSE and RDS.
    return {
      body: input.body,
      contentLength: input.contentLength,
      contentType: input.contentType,
      encryptionKeyId: null,
    };
  }

  async afterGet(input: EncryptionAfterGetInput): Promise<EncryptionAfterGetResult> {
    return { body: input.body };
  }
}
