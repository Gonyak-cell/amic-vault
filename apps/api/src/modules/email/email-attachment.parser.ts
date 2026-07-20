import { createHash } from 'node:crypto';
import { decodeQuotedPrintableBytes, parseEmlHeaders } from '@amic-vault/shared';

export interface ParsedEmailAttachment {
  attachmentIndex: number;
  originalFilename: string;
  normalizedFilename: string;
  contentType: string;
  charset: string | null;
  mediaHint: string;
  sizeBytes: number;
  sha256: string;
  body: Buffer;
}

function splitHeaderBody(raw: string): { headers: string; body: string } {
  const crlfIndex = raw.indexOf('\r\n\r\n');
  if (crlfIndex >= 0) {
    return { headers: raw.slice(0, crlfIndex), body: raw.slice(crlfIndex + 4) };
  }
  const lfIndex = raw.indexOf('\n\n');
  if (lfIndex >= 0) {
    return { headers: raw.slice(0, lfIndex), body: raw.slice(lfIndex + 2) };
  }
  return { headers: raw, body: '' };
}

function headerValue(headers: readonly { name: string; value: string }[], name: string): string {
  return headers.find((header) => header.name === name)?.value ?? '';
}

function parameterValue(header: string, key: string): string | null {
  const encodedPattern = new RegExp(`${key}\\*=([^;]+)`, 'i');
  const encoded = header.match(encodedPattern)?.[1]?.trim();
  if (encoded) {
    const value = encoded.replace(/^"|"$/g, '');
    const utf8Prefix = value.match(/^utf-8''(.+)$/i)?.[1];
    try {
      return decodeURIComponent(utf8Prefix ?? value);
    } catch {
      return utf8Prefix ?? value;
    }
  }

  const plainPattern = new RegExp(`${key}=("([^"]+)"|[^;]+)`, 'i');
  const plain = header.match(plainPattern);
  return (plain?.[2] ?? plain?.[1] ?? null)?.trim().replace(/^"|"$/g, '') ?? null;
}

function boundaryFromContentType(contentType: string): string | null {
  const boundary = parameterValue(contentType, 'boundary');
  if (!boundary || boundary.includes('\r') || boundary.includes('\n')) return null;
  return boundary;
}

function mediaType(contentType: string): string {
  const value = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return value || 'application/octet-stream';
}

function dispositionType(disposition: string): string {
  return disposition.split(';')[0]?.trim().toLowerCase() ?? '';
}

function normalizedFilename(value: string | null, index: number): string {
  const base = (value ?? `attachment-${index}`)
    .split('\\')
    .pop()
    ?.split('/')
    .pop()
    ?.normalize('NFC')
    .replace(/[\0\r\n\t]/g, ' ')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = base && base !== '.' && base !== '..' ? base : `attachment-${index}`;
  return safe.slice(0, 255);
}

function decodePartBody(value: string, encoding: string): Buffer {
  const body = value.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  if (encoding === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  }
  if (encoding === 'quoted-printable') {
    return Buffer.from(decodeQuotedPrintableBytes(body));
  }
  return Buffer.from(body, 'latin1');
}

function partSections(raw: string, boundary: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const marker = `--${boundary}`;
  return normalized
    .split(marker)
    .slice(1)
    .map((part) => part.replace(/^\n/, ''))
    .filter((part) => !part.startsWith('--'));
}

function isInlineCidPart(headers: readonly { name: string; value: string }[]): boolean {
  const disposition = dispositionType(headerValue(headers, 'content-disposition'));
  return disposition === 'inline' && Boolean(headerValue(headers, 'content-id'));
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function pushAttachment(
  attachments: ParsedEmailAttachment[],
  input: {
    body: string;
    charset: string | null;
    contentType: string;
    encoding: string;
    filename: string | null;
  },
) {
  const attachmentIndex = attachments.length;
  const decoded = decodePartBody(input.body, input.encoding);
  const safeFilename = normalizedFilename(input.filename, attachmentIndex);
  attachments.push({
    attachmentIndex,
    originalFilename: safeFilename,
    normalizedFilename: safeFilename,
    contentType: input.contentType,
    charset: input.charset,
    mediaHint: input.contentType,
    sizeBytes: decoded.length,
    sha256: sha256Hex(decoded),
    body: decoded,
  });
}

function walkPart(raw: string, attachments: ParsedEmailAttachment[], depth: number): void {
  if (depth > 12) return;
  const { headers: headerText, body } = splitHeaderBody(raw);
  const headers = parseEmlHeaders(headerText);
  const disposition = headerValue(headers, 'content-disposition');
  const contentTypeHeader = headerValue(headers, 'content-type');
  const contentType = mediaType(contentTypeHeader);
  const charset = parameterValue(contentTypeHeader, 'charset');
  const filename =
    parameterValue(disposition, 'filename') ?? parameterValue(contentTypeHeader, 'name');
  const encoding = headerValue(headers, 'content-transfer-encoding').trim().toLowerCase();

  if (contentType.startsWith('multipart/')) {
    const boundary = boundaryFromContentType(contentTypeHeader);
    if (!boundary) return;
    for (const child of partSections(body, boundary)) {
      walkPart(child, attachments, depth + 1);
    }
    return;
  }

  if (contentType === 'message/rfc822') {
    pushAttachment(attachments, {
      body,
      charset,
      contentType,
      encoding,
      filename: filename ?? `embedded-message-${attachments.length}.eml`,
    });
    return;
  }

  if (isInlineCidPart(headers)) return;

  const isAttachment =
    dispositionType(disposition) === 'attachment' || Boolean(filename && contentTypeHeader);
  if (!isAttachment) return;

  pushAttachment(attachments, {
    body,
    charset,
    contentType,
    encoding,
    filename,
  });
}

export function extractEmlAttachments(raw: string): ParsedEmailAttachment[] {
  const top = splitHeaderBody(raw);
  const topHeaders = parseEmlHeaders(top.headers);
  const boundary = boundaryFromContentType(headerValue(topHeaders, 'content-type'));

  const attachments: ParsedEmailAttachment[] = [];
  if (!boundary) {
    walkPart(raw, attachments, 0);
    return attachments;
  }

  for (const part of partSections(top.body, boundary)) {
    walkPart(part, attachments, 1);
  }
  return attachments;
}
