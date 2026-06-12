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

function normalizeMessageId(value: string): string {
  const trimmed = value.trim().replace(/^<|>$/g, '').trim().toLowerCase();
  if (!trimmed || trimmed.length > 256 || /[\s<>]/.test(trimmed)) {
    throw new EmlParseError('MALFORMED_MESSAGE_ID');
  }
  return trimmed;
}

export function parseEmlEnvelope(raw: string): ParsedEmlEnvelope {
  const headerSection = splitHeaderSection(raw);
  const lines = unfoldHeaderLines(headerSection);
  for (const line of lines) {
    const delimiter = line.indexOf(':');
    if (delimiter <= 0) continue;
    const name = line.slice(0, delimiter).trim().toLowerCase();
    if (name !== 'message-id') continue;
    return { normalizedMessageId: normalizeMessageId(line.slice(delimiter + 1)) };
  }
  throw new EmlParseError('MISSING_MESSAGE_ID');
}
