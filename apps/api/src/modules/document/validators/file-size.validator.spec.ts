import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES,
  DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES,
  documentMigrationUploadMaxBytes,
  documentUploadMaxBytes,
  FileSizeValidator,
} from './file-size.validator';

describe('FileSizeValidator', () => {
  it('uses a 200MB default and accepts exact-limit uploads', () => {
    expect(documentUploadMaxBytes(undefined)).toBe(DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES);
    expect(() => new FileSizeValidator(3).validate(3)).not.toThrow();
  });

  it('rejects empty, malformed, and limit+1 sizes', () => {
    const validator = new FileSizeValidator(3);

    expect(() => validator.validate(0)).toThrow(BadRequestException);
    expect(() => validator.validate(4)).toThrow(BadRequestException);
    expect(() => validator.validate(Number.NaN)).toThrow(BadRequestException);
  });

  it('uses a separate migration upload max without changing browser upload default', () => {
    expect(documentMigrationUploadMaxBytes(undefined)).toBe(
      DEFAULT_DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES,
    );
    const validator = new FileSizeValidator(3, 5);

    expect(() => validator.validate(4)).toThrow(BadRequestException);
    expect(() => validator.validate(4, { sourceSystem: 'migration' })).not.toThrow();
    expect(() => validator.validate(6, { sourceSystem: 'migration' })).toThrow(
      BadRequestException,
    );
  });

  it('fails closed for invalid env configuration', () => {
    expect(() => documentUploadMaxBytes('not-a-number')).toThrow(
      'DOCUMENT_UPLOAD_MAX_BYTES must be a positive integer',
    );
    expect(() => documentMigrationUploadMaxBytes('not-a-number')).toThrow(
      'DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES must be a positive integer',
    );
  });
});
