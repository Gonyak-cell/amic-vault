import { open } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
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
  extension: 'pdf' | 'docx' | 'hwpx' | 'txt' | 'md' | 'markdown' | 'csv' | 'json';
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
  txt: {
    extension: 'txt',
    mimeType: 'text/plain',
    declaredAliases: ['text/plain'],
  },
  md: {
    extension: 'md',
    mimeType: 'text/markdown',
    declaredAliases: ['text/markdown', 'text/plain'],
  },
  markdown: {
    extension: 'markdown',
    mimeType: 'text/markdown',
    declaredAliases: ['text/markdown', 'text/plain'],
  },
  csv: {
    extension: 'csv',
    mimeType: 'text/csv',
    declaredAliases: ['text/csv', 'text/plain', 'application/csv'],
  },
  json: {
    extension: 'json',
    mimeType: 'application/json',
    declaredAliases: ['application/json', 'text/json', 'text/plain'],
  },
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

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

function assertUtf8Text(buffer: Buffer): string {
  if (buffer.includes(0)) throw unsupportedFileType();
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw unsupportedFileType();
  }
}

function sniffSupportedTextMime(buffer: Buffer, extension: string): SupportedMime | null {
  if (!['txt', 'md', 'markdown', 'csv', 'json'].includes(extension)) return null;
  const text = assertUtf8Text(buffer);
  if (extension === 'json') {
    try {
      JSON.parse(text);
    } catch {
      throw unsupportedFileType();
    }
  }
  return supportedMimes[extension as 'txt' | 'md' | 'markdown' | 'csv' | 'json'];
}

function isDeclaredMimeAllowed(actual: SupportedMime, declaredMimeType?: string | null): boolean {
  const declared = declaredMimeType?.trim().toLowerCase();
  if (!declared || declared === 'application/octet-stream') return true;
  return actual.declaredAliases.includes(declared);
}

export class MimeTypeValidator {
  async validate(input: MimeTypeValidationInput): Promise<MimeTypeValidationResult> {
    const buffer = await readSniffBuffer(input.path, input.sizeBytes);
    const actual = sniffSupportedTextMime(buffer, input.extension) ?? sniffSupportedMime(buffer);
    if (actual.extension !== input.extension) throw unsupportedFileType();
    if (!isDeclaredMimeAllowed(actual, input.declaredMimeType)) throw unsupportedFileType();
    return { mimeType: actual.mimeType };
  }
}
