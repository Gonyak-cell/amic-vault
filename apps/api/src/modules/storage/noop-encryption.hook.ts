import { Injectable } from '@nestjs/common';
import type {
  EncryptionAfterGetInput,
  EncryptionAfterGetResult,
  EncryptionBeforePutInput,
  EncryptionBeforePutResult,
  EncryptionHook,
} from './encryption-hook.interface';

@Injectable()
export class NoopEncryptionHook implements EncryptionHook {
  async beforePut(input: EncryptionBeforePutInput): Promise<EncryptionBeforePutResult> {
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
