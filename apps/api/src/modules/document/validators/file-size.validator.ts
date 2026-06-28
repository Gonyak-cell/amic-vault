import { BadRequestException } from '@nestjs/common';

export const DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
export const DEFAULT_DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;

export interface FileSizeValidationOptions {
  sourceSystem?: 'upload' | 'email_ingest' | 'migration' | undefined;
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

export function documentUploadMaxBytes(value = process.env.DOCUMENT_UPLOAD_MAX_BYTES): number {
  if (value === undefined || value.trim() === '') return DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('DOCUMENT_UPLOAD_MAX_BYTES must be a positive integer');
  }
  return parsed;
}

export function documentMigrationUploadMaxBytes(
  value = process.env.DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES,
): number {
  if (value === undefined || value.trim() === '') return DEFAULT_DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('DOCUMENT_MIGRATION_UPLOAD_MAX_BYTES must be a positive integer');
  }
  return parsed;
}

export class FileSizeValidator {
  constructor(
    private readonly maxBytes = documentUploadMaxBytes(),
    private readonly migrationMaxBytes = documentMigrationUploadMaxBytes(),
  ) {}

  validate(sizeBytes: number, options: FileSizeValidationOptions = {}): void {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw validationFailed();
    const maxBytes = options.sourceSystem === 'migration' ? this.migrationMaxBytes : this.maxBytes;
    if (sizeBytes > maxBytes) throw validationFailed();
  }
}
