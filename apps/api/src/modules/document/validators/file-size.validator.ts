import { BadRequestException } from '@nestjs/common';

export const DEFAULT_DOCUMENT_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

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

export class FileSizeValidator {
  constructor(private readonly maxBytes = documentUploadMaxBytes()) {}

  validate(sizeBytes: number): void {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw validationFailed();
    if (sizeBytes > this.maxBytes) throw validationFailed();
  }
}
