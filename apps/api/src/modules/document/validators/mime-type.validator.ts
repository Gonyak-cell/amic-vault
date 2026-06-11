import { open } from 'node:fs/promises';
import { UnsupportedMediaTypeException } from '@nestjs/common';

const MAX_SNIFF_BYTES = 64 * 1024;

export interface MimeTypeValidationInput {
  path: string;
  sizeBytes: number;
  extension: string;
  declaredMimeType?: string | null;
}

export interface MimeTypeValidationResult {
  mimeType: string;
}

interface SupportedMime {
  extension: 'pdf' | 'docx' | 'hwpx';
  mimeType: string;
  declaredAliases: readonly string[];
}

const supportedMimes: Record<SupportedMime['extension'], SupportedMime> = {
  pdf: {
    extension: 'pdf',
    mimeType: 'application/pdf',
    declaredAliases: ['application/pdf'],
  },
  docx: {
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    declaredAliases: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ],
  },
  hwpx: {
    extension: 'hwpx',
    mimeType: 'application/hwp+zip',
    declaredAliases: ['application/hwp+zip', 'application/x-hwp+zip', 'application/zip'],
  },
};

function unsupportedFileType(): UnsupportedMediaTypeException {
  return new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_FILE_TYPE' });
}

function startsWith(buffer: Buffer, signature: string): boolean {
  return buffer.subarray(0, signature.length).toString('latin1') === signature;
}

async function readSniffBuffer(path: string, sizeBytes: number): Promise<Buffer> {
  const file = await open(path, 'r');
  try {
    const length = Math.min(MAX_SNIFF_BYTES, Math.max(0, sizeBytes));
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function sniffSupportedMime(buffer: Buffer): SupportedMime {
  if (startsWith(buffer, '%PDF')) return supportedMimes.pdf;
  if (!startsWith(buffer, 'PK\x03\x04') && !startsWith(buffer, 'PK\x05\x06')) {
    throw unsupportedFileType();
  }

  const text = buffer.toString('utf8');
  if (
    text.includes('application/hwp+zip') ||
    (text.includes('mimetype') && text.includes('Contents/')) ||
    text.includes('Contents/section')
  ) {
    return supportedMimes.hwpx;
  }
  if (
    text.includes('[Content_Types].xml') &&
    (text.includes('word/') ||
      text.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  ) {
    return supportedMimes.docx;
  }
  throw unsupportedFileType();
}

function isDeclaredMimeAllowed(actual: SupportedMime, declaredMimeType?: string | null): boolean {
  const declared = declaredMimeType?.trim().toLowerCase();
  if (!declared || declared === 'application/octet-stream') return true;
  return actual.declaredAliases.includes(declared);
}

export class MimeTypeValidator {
  async validate(input: MimeTypeValidationInput): Promise<MimeTypeValidationResult> {
    const buffer = await readSniffBuffer(input.path, input.sizeBytes);
    const actual = sniffSupportedMime(buffer);
    if (actual.extension !== input.extension) throw unsupportedFileType();
    if (!isDeclaredMimeAllowed(actual, input.declaredMimeType)) throw unsupportedFileType();
    return { mimeType: actual.mimeType };
  }
}
