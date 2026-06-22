import { UnsupportedMediaTypeException } from '@nestjs/common';

export interface FileExtensionValidationResult {
  extension: string;
  normalizedFilename: string;
}

const defaultAllowedExtensions = ['pdf', 'docx', 'hwpx', 'txt', 'md', 'markdown', 'csv', 'json'] as const;

function unsupportedFileType(): UnsupportedMediaTypeException {
  return new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_FILE_TYPE' });
}

export function allowedDocumentExtensions(
  value = process.env.DOCUMENT_ALLOWED_EXTENSIONS,
): Set<string> {
  const raw = value?.trim()
    ? value.split(',')
    : [...defaultAllowedExtensions];
  return new Set(
    raw
      .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
      .filter((item) => /^[a-z0-9]{1,16}$/.test(item)),
  );
}

export class FileExtensionValidator {
  constructor(private readonly allowed = allowedDocumentExtensions()) {}

  validate(filename: string): FileExtensionValidationResult {
    const normalizedFilename = filename.normalize('NFC').trim();
    if (
      !normalizedFilename ||
      normalizedFilename.includes('/') ||
      normalizedFilename.includes('\\') ||
      normalizedFilename.includes('\0')
    ) {
      throw unsupportedFileType();
    }
    const dotIndex = normalizedFilename.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === normalizedFilename.length - 1) {
      throw unsupportedFileType();
    }
    const extension = normalizedFilename.slice(dotIndex + 1).toLowerCase();
    if (!this.allowed.has(extension)) {
      throw unsupportedFileType();
    }
    return { extension, normalizedFilename };
  }
}
