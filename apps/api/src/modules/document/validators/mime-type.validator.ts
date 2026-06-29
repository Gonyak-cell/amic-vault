import { open } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { UnsupportedMediaTypeException } from '@nestjs/common';

const MAX_SNIFF_BYTES = 1024 * 1024;

export interface MimeTypeValidationInput {
  path: string;
  sizeBytes: number;
  extension: string;
  declaredMimeType?: string | null;
  allowImageExtensionMismatch?: boolean | undefined;
}

export interface MimeTypeValidationResult {
  mimeType: string;
}

const supportedMimeExtensions = [
  'csv',
  'doc',
  'docx',
  'eml',
  'hwp',
  'hwpx',
  'jpeg',
  'jpg',
  'json',
  'markdown',
  'md',
  'msg',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'txt',
  'xls',
  'xlsx',
] as const;

type SupportedMimeExtension = (typeof supportedMimeExtensions)[number];

interface SupportedMime {
  extension: SupportedMimeExtension;
  mimeType: string;
  declaredAliases: readonly string[];
}

const supportedMimes: Record<SupportedMimeExtension, SupportedMime> = {
  csv: {
    extension: 'csv',
    mimeType: 'text/csv',
    declaredAliases: ['text/csv', 'text/plain', 'application/csv'],
  },
  doc: {
    extension: 'doc',
    mimeType: 'application/msword',
    declaredAliases: ['application/msword', 'application/vnd.ms-word', 'application/octet-stream'],
  },
  docx: {
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    declaredAliases: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ],
  },
  eml: {
    extension: 'eml',
    mimeType: 'message/rfc822',
    declaredAliases: ['message/rfc822', 'text/plain', 'application/octet-stream'],
  },
  hwp: {
    extension: 'hwp',
    mimeType: 'application/x-hwp',
    declaredAliases: ['application/x-hwp', 'application/haansofthwp', 'application/octet-stream'],
  },
  hwpx: {
    extension: 'hwpx',
    mimeType: 'application/vnd.hancom.hwpx',
    declaredAliases: [
      'application/vnd.hancom.hwpx',
      'application/hwp+zip',
      'application/x-hwp+zip',
      'application/zip',
    ],
  },
  jpeg: {
    extension: 'jpeg',
    mimeType: 'image/jpeg',
    declaredAliases: ['image/jpeg', 'image/pjpeg'],
  },
  jpg: {
    extension: 'jpg',
    mimeType: 'image/jpeg',
    declaredAliases: ['image/jpeg', 'image/pjpeg'],
  },
  json: {
    extension: 'json',
    mimeType: 'application/json',
    declaredAliases: ['application/json', 'text/json', 'text/plain'],
  },
  markdown: {
    extension: 'markdown',
    mimeType: 'text/markdown',
    declaredAliases: ['text/markdown', 'text/plain'],
  },
  md: {
    extension: 'md',
    mimeType: 'text/markdown',
    declaredAliases: ['text/markdown', 'text/plain'],
  },
  msg: {
    extension: 'msg',
    mimeType: 'application/vnd.ms-outlook',
    declaredAliases: ['application/vnd.ms-outlook', 'application/octet-stream'],
  },
  pdf: {
    extension: 'pdf',
    mimeType: 'application/pdf',
    declaredAliases: ['application/pdf'],
  },
  png: {
    extension: 'png',
    mimeType: 'image/png',
    declaredAliases: ['image/png'],
  },
  ppt: {
    extension: 'ppt',
    mimeType: 'application/vnd.ms-powerpoint',
    declaredAliases: ['application/vnd.ms-powerpoint', 'application/octet-stream'],
  },
  pptx: {
    extension: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    declaredAliases: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
    ],
  },
  txt: {
    extension: 'txt',
    mimeType: 'text/plain',
    declaredAliases: ['text/plain'],
  },
  xls: {
    extension: 'xls',
    mimeType: 'application/vnd.ms-excel',
    declaredAliases: ['application/vnd.ms-excel', 'application/msexcel', 'application/octet-stream'],
  },
  xlsx: {
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    declaredAliases: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
    ],
  },
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const utf16BeDecoder = new TextDecoder('utf-16be', { fatal: true });
const utf16LeDecoder = new TextDecoder('utf-16le', { fatal: true });

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

function isSupportedMimeExtension(extension: string): extension is SupportedMimeExtension {
  return supportedMimeExtensions.includes(extension as SupportedMimeExtension);
}

function sniffSupportedBinaryMime(
  buffer: Buffer,
  extension: SupportedMimeExtension,
  options: { allowLegacyExcelExtensionMismatch?: boolean } = {},
): SupportedMime {
  if (startsWith(buffer, '%PDF')) return supportedMimes.pdf;
  if (startsWith(buffer, '\x89PNG\r\n\x1A\n')) return supportedMimes.png;
  if (startsWith(buffer, '\xFF\xD8\xFF')) {
    if (extension === 'jpg' || extension === 'jpeg') return supportedMimes[extension];
    return supportedMimes.jpg;
  }
  if (startsWith(buffer, '\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1')) {
    if (['doc', 'xls', 'ppt', 'hwp', 'msg'].includes(extension)) return supportedMimes[extension];
    if (options.allowLegacyExcelExtensionMismatch && extension === 'xlsx') {
      return supportedMimes.xls;
    }
    throw unsupportedFileType();
  }
  if (!startsWith(buffer, 'PK\x03\x04') && !startsWith(buffer, 'PK\x05\x06')) {
    throw unsupportedFileType();
  }

  const text = buffer.toString('utf8');
  const hasContentTypes = text.includes('[Content_Types].xml');
  const hasWordMarker =
    text.includes('word/') ||
    text.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const hasSpreadsheetMarker =
    text.includes('xl/') ||
    text.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const hasPresentationMarker =
    text.includes('ppt/') ||
    text.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  if (
    text.includes('application/hwp+zip') ||
    text.includes('application/vnd.hancom.hwpx') ||
    (text.includes('mimetype') && text.includes('Contents/')) ||
    text.includes('Contents/section')
  ) {
    return supportedMimes.hwpx;
  }
  if (hasContentTypes && extension === 'docx' && hasWordMarker) return supportedMimes.docx;
  if (hasContentTypes && extension === 'xlsx' && hasSpreadsheetMarker) return supportedMimes.xlsx;
  if (hasContentTypes && extension === 'pptx' && hasPresentationMarker) return supportedMimes.pptx;
  if (hasContentTypes && hasWordMarker) {
    return supportedMimes.docx;
  }
  if (hasContentTypes && hasSpreadsheetMarker) {
    return supportedMimes.xlsx;
  }
  if (hasContentTypes && hasPresentationMarker) {
    return supportedMimes.pptx;
  }
  if (!hasContentTypes) {
    if (extension === 'docx' && hasWordMarker) return supportedMimes.docx;
    if (extension === 'xlsx' && hasSpreadsheetMarker) return supportedMimes.xlsx;
    if (extension === 'pptx' && hasPresentationMarker) return supportedMimes.pptx;
  }
  throw unsupportedFileType();
}

function assertSupportedText(buffer: Buffer): string {
  if (startsWith(buffer, '\xFE\xFF')) return utf16BeDecoder.decode(buffer);
  if (startsWith(buffer, '\xFF\xFE')) return utf16LeDecoder.decode(buffer);
  if (buffer.includes(0)) throw unsupportedFileType();
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw unsupportedFileType();
  }
}

function sniffSupportedTextMime(
  buffer: Buffer,
  extension: SupportedMimeExtension,
): SupportedMime | null {
  if (!['txt', 'md', 'markdown', 'csv', 'json'].includes(extension)) return null;
  const text = assertSupportedText(buffer);
  if (extension === 'json') {
    try {
      JSON.parse(text);
    } catch {
      throw unsupportedFileType();
    }
  }
  return supportedMimes[extension];
}

function sniffSupportedEmailMime(
  buffer: Buffer,
  extension: SupportedMimeExtension,
): SupportedMime | null {
  if (extension !== 'eml') return null;
  if (buffer.includes(0)) throw unsupportedFileType();
  return supportedMimes.eml;
}

function sniffLegacyOfficeHtmlMime(
  buffer: Buffer,
  extension: SupportedMimeExtension,
): SupportedMime | null {
  if (!['doc', 'xls', 'ppt'].includes(extension)) return null;
  if (buffer.includes(0)) return null;
  const head = buffer.subarray(0, 4096).toString('latin1').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<table')) {
    return supportedMimes[extension];
  }
  return null;
}

function isDeclaredMimeAllowed(actual: SupportedMime, declaredMimeType?: string | null): boolean {
  const declared = declaredMimeType?.trim().toLowerCase();
  if (!declared || declared === 'application/octet-stream') return true;
  return actual.declaredAliases.includes(declared);
}

function isImageExtension(extension: string): boolean {
  return extension === 'jpg' || extension === 'jpeg' || extension === 'png';
}

function isLegacyExcelExtensionMismatch(actual: string, extension: string): boolean {
  return actual === 'xls' && extension === 'xlsx';
}

export class MimeTypeValidator {
  async validate(input: MimeTypeValidationInput): Promise<MimeTypeValidationResult> {
    if (!isSupportedMimeExtension(input.extension)) throw unsupportedFileType();
    const buffer = await readSniffBuffer(input.path, input.sizeBytes);
    const actual =
      sniffSupportedTextMime(buffer, input.extension) ??
      sniffSupportedEmailMime(buffer, input.extension) ??
      sniffLegacyOfficeHtmlMime(buffer, input.extension) ??
      sniffSupportedBinaryMime(buffer, input.extension, {
        allowLegacyExcelExtensionMismatch: input.allowImageExtensionMismatch === true,
      });
    const allowImageMismatch =
      input.allowImageExtensionMismatch === true &&
      isImageExtension(actual.extension) &&
      isImageExtension(input.extension);
    const allowMigrationMismatch =
      allowImageMismatch ||
      (input.allowImageExtensionMismatch === true &&
        isLegacyExcelExtensionMismatch(actual.extension, input.extension));
    if (actual.extension !== input.extension && !allowMigrationMismatch) throw unsupportedFileType();
    if (!isDeclaredMimeAllowed(actual, input.declaredMimeType) && !allowMigrationMismatch) {
      throw unsupportedFileType();
    }
    return { mimeType: actual.mimeType };
  }
}
