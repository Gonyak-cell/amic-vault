export type EmlParseFailureReason =
  | 'MISSING_MESSAGE_ID'
  | 'MALFORMED_MESSAGE_ID'
  | 'MALFORMED_HEADERS';

export class EmlParseError extends Error {
  constructor(readonly reasonCode: EmlParseFailureReason) {
    super(reasonCode);
    this.name = 'EmlParseError';
  }
}

export interface ParsedEmlEnvelope {
  normalizedMessageId: string;
}

export interface ParsedEmlHeader {
  name: string;
  value: string;
}

function bytesFromBinaryString(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function binaryStringFromBytes(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return output;
}

function normalizedCharsetLabel(charset: string | null | undefined): string {
  const label = (charset ?? 'utf-8').trim().replace(/^"|"$/g, '').toLowerCase();
  if (!label || label === 'utf8') return 'utf-8';
  if (
    label === 'cp949' ||
    label === 'windows-949' ||
    label === 'ks_c_5601-1987' ||
    label === 'ks-c-5601-1987' ||
    label === 'euckr'
  ) {
    return 'euc-kr';
  }
  return label;
}

export function decodeMimeTextBytes(bytes: Uint8Array, charset?: string | null): string {
  const preferred = normalizedCharsetLabel(charset);
  try {
    return new TextDecoder(preferred).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function base64Bytes(value: string): Uint8Array | null {
  try {
    return bytesFromBinaryString(atob(value.replace(/\s+/g, '')));
  } catch {
    return null;
  }
}

function qEncodedBytes(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '_') {
      bytes.push(0x20);
      continue;
    }
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(value.charCodeAt(index) & 0xff);
  }
  return Uint8Array.from(bytes);
}

function decodeEncodedWord(charset: string, encoding: string, payload: string): string | null {
  const bytes = encoding.toLowerCase() === 'b' ? base64Bytes(payload) : qEncodedBytes(payload);
  if (!bytes) return null;
  return decodeMimeTextBytes(bytes, charset);
}

export function decodeRfc2047Words(value: string): string {
  const pattern = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g;
  let output = '';
  let cursor = 0;
  let previousEncoded = false;
  for (const match of value.matchAll(pattern)) {
    const encodedWord = match[0];
    const start = match.index ?? 0;
    const between = value.slice(cursor, start);
    if (!(previousEncoded && /^\s*$/.test(between))) output += between;
    const decoded =
      match[1] && match[2] && match[3] !== undefined
        ? decodeEncodedWord(match[1], match[2], match[3])
        : null;
    output += decoded ?? encodedWord;
    previousEncoded = decoded !== null;
    cursor = start + encodedWord.length;
  }
  return output + value.slice(cursor);
}

export function decodeQuotedPrintableBytes(value: string): Uint8Array {
  const withoutSoftBreaks = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < withoutSoftBreaks.length; index += 1) {
    const char = withoutSoftBreaks[index];
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(withoutSoftBreaks.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(withoutSoftBreaks.charCodeAt(index) & 0xff);
  }
  return Uint8Array.from(bytes);
}

function splitRawMessage(raw: string): { body: string; headers: string; separator: string } {
  const crlfIndex = raw.indexOf('\r\n\r\n');
  if (crlfIndex >= 0) {
    return {
      headers: raw.slice(0, crlfIndex),
      separator: '\r\n\r\n',
      body: raw.slice(crlfIndex + 4),
    };
  }
  const lfIndex = raw.indexOf('\n\n');
  if (lfIndex >= 0) {
    return {
      headers: raw.slice(0, lfIndex),
      separator: '\n\n',
      body: raw.slice(lfIndex + 2),
    };
  }
  return { headers: raw, separator: '', body: '' };
}

function headerValue(headers: readonly ParsedEmlHeader[], name: string): string {
  return headers.find((header) => header.name === name)?.value ?? '';
}

function parameterValue(header: string, key: string): string | null {
  const plainPattern = new RegExp(`${key}=("([^"]+)"|[^;]+)`, 'i');
  const plain = header.match(plainPattern);
  return (plain?.[2] ?? plain?.[1] ?? null)?.trim().replace(/^"|"$/g, '') ?? null;
}

function mediaType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

function boundaryFromContentType(contentType: string): string | null {
  const boundary = parameterValue(contentType, 'boundary');
  if (!boundary || boundary.includes('\r') || boundary.includes('\n')) return null;
  return boundary;
}

function dispositionType(disposition: string): string {
  return disposition.split(';')[0]?.trim().toLowerCase() ?? '';
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

export function decodeTransferEncodedTextBody(
  value: string,
  encoding: string | null | undefined,
  charset?: string | null,
): string {
  const normalizedEncoding = (encoding ?? '').trim().toLowerCase();
  const bytes =
    normalizedEncoding === 'base64'
      ? (base64Bytes(value) ?? bytesFromBinaryString(value))
      : normalizedEncoding === 'quoted-printable'
        ? decodeQuotedPrintableBytes(value)
        : bytesFromBinaryString(value);
  return decodeMimeTextBytes(bytes, charset);
}

export function decodeEmlRawContent(payload: Uint8Array): string {
  const raw = binaryStringFromBytes(payload);
  const { headers, separator, body } = splitRawMessage(raw);
  if (!separator) return raw;
  const parsedHeaders = parseEmlHeaders(headers);
  const contentType = headerValue(parsedHeaders, 'content-type');
  if (mediaType(contentType).startsWith('multipart/')) return raw;
  const decodedBody = decodeTransferEncodedTextBody(
    body,
    headerValue(parsedHeaders, 'content-transfer-encoding'),
    parameterValue(contentType, 'charset'),
  );
  return `${headers}${separator}${decodedBody}`;
}

function decodeTextPart(
  body: string,
  headers: readonly ParsedEmlHeader[],
  contentType: string,
): string {
  return decodeTransferEncodedTextBody(
    body,
    headerValue(headers, 'content-transfer-encoding'),
    parameterValue(contentType, 'charset'),
  ).replaceAll(String.fromCharCode(0), '');
}

function stripHtmlBody(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function collectTextParts(
  raw: string,
  output: { html: string[]; plain: string[] },
  depth: number,
): void {
  if (depth > 12) return;
  const { headers: headerText, body } = splitRawMessage(raw);
  const headers = parseEmlHeaders(headerText);
  const contentTypeHeader = headerValue(headers, 'content-type');
  const normalizedMediaType = mediaType(contentTypeHeader) || 'text/plain';
  const disposition = dispositionType(headerValue(headers, 'content-disposition'));
  if (disposition === 'attachment') return;

  if (normalizedMediaType.startsWith('multipart/')) {
    const boundary = boundaryFromContentType(contentTypeHeader);
    if (!boundary) return;
    for (const part of partSections(body, boundary)) {
      collectTextParts(part, output, depth + 1);
    }
    return;
  }

  if (normalizedMediaType === 'text/plain') {
    const text = decodeTextPart(body, headers, contentTypeHeader).trim();
    if (text) output.plain.push(text);
    return;
  }

  if (normalizedMediaType === 'text/html') {
    const text = stripHtmlBody(decodeTextPart(body, headers, contentTypeHeader));
    if (text) output.html.push(text);
  }
}

export function extractEmlTextBody(raw: string): string {
  const output = { html: [] as string[], plain: [] as string[] };
  collectTextParts(raw, output, 0);
  return (output.plain.length > 0 ? output.plain : output.html).join('\n\n').trim();
}

function splitHeaderSection(raw: string): string {
  const crlfIndex = raw.indexOf('\r\n\r\n');
  if (crlfIndex >= 0) return raw.slice(0, crlfIndex);
  const lfIndex = raw.indexOf('\n\n');
  if (lfIndex >= 0) return raw.slice(0, lfIndex);
  return raw;
}

function unfoldHeaderLines(headerSection: string): string[] {
  const lines = headerSection.replace(/\r\n/g, '\n').split('\n');
  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[\t ]/.test(line)) {
      if (unfolded.length === 0) throw new EmlParseError('MALFORMED_HEADERS');
      unfolded[unfolded.length - 1] = `${unfolded[unfolded.length - 1]} ${line.trim()}`;
      continue;
    }
    unfolded.push(line);
  }
  return unfolded;
}

export function parseEmlHeaders(raw: string): ParsedEmlHeader[] {
  return unfoldHeaderLines(splitHeaderSection(raw))
    .map((line) => {
      const delimiter = line.indexOf(':');
      if (delimiter <= 0) return null;
      return {
        name: line.slice(0, delimiter).trim().toLowerCase(),
        value: decodeRfc2047Words(line.slice(delimiter + 1).trim()),
      };
    })
    .filter((header): header is ParsedEmlHeader => header !== null);
}

function normalizeMessageId(value: string): string {
  const trimmed = value.trim().replace(/^<|>$/g, '').trim().toLowerCase();
  if (!trimmed || trimmed.length > 256 || /[\s<>]/.test(trimmed)) {
    throw new EmlParseError('MALFORMED_MESSAGE_ID');
  }
  return trimmed;
}

export function parseEmlEnvelope(raw: string): ParsedEmlEnvelope {
  for (const header of parseEmlHeaders(raw)) {
    if (header.name !== 'message-id') continue;
    return { normalizedMessageId: normalizeMessageId(header.value) };
  }
  throw new EmlParseError('MISSING_MESSAGE_ID');
}
