import { parseEmlEnvelope, parseEmlHeaders } from './eml-parser';

export const emailParticipantRoles = ['from', 'to', 'cc'] as const;
export type EmailParticipantRole = (typeof emailParticipantRoles)[number];

export const emailMetadataWarningCodes = ['MALFORMED_DATE'] as const;
export type EmailMetadataWarningCode = (typeof emailMetadataWarningCodes)[number];

export interface NormalizedEmailParticipant {
  role: EmailParticipantRole;
  normalizedAddress: string;
  domainRef: string;
  displayName: string | null;
  isOutside: boolean;
}

export interface NormalizedEmailMetadata {
  subject: string | null;
  normalizedMessageId: string;
  normalizedReferenceIds: readonly string[];
  sentAt: string | null;
  receivedAt: string | null;
  warningCode: EmailMetadataWarningCode | null;
  participants: readonly NormalizedEmailParticipant[];
  hasOutsideParticipants: boolean;
}

export interface NormalizeEmailMetadataOptions {
  tenantDomains?: readonly string[];
}

function bounded(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function splitAddressList(value: string): string[] {
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;
  let angleDepth = 0;
  for (const char of value) {
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes && char === '<') angleDepth += 1;
    if (!inQuotes && char === '>' && angleDepth > 0) angleDepth -= 1;
    if (!inQuotes && angleDepth === 0 && char === ',') {
      if (current.trim()) entries.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function normalizeAddress(raw: string): {
  normalizedAddress: string;
  domainRef: string;
  displayName: string | null;
} | null {
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.*?)<([^<>\s@]+@[^<>\s@]+)>$/);
  const address = (angle?.[2] ?? trimmed.match(/[^\s<>,;]+@[^\s<>,;]+/)?.[0] ?? '')
    .trim()
    .toLowerCase();
  if (!address || !address.includes('@') || address.length > 320) return null;
  const domainRef = address.slice(address.lastIndexOf('@') + 1);
  if (!domainRef || domainRef.length > 255 || !/^[a-z0-9.-]+$/.test(domainRef)) return null;
  const rawDisplay = angle?.[1]?.trim().replace(/^"|"$/g, '') ?? '';
  return {
    normalizedAddress: address,
    domainRef,
    displayName: rawDisplay ? bounded(rawDisplay, 256) : null,
  };
}

function parseParticipants(
  role: EmailParticipantRole,
  headerValues: readonly string[],
  tenantDomains: ReadonlySet<string>,
): NormalizedEmailParticipant[] {
  const participants: NormalizedEmailParticipant[] = [];
  const seen = new Set<string>();
  for (const value of headerValues) {
    for (const entry of splitAddressList(value)) {
      const normalized = normalizeAddress(entry);
      if (!normalized) continue;
      const dedupeKey = `${role}:${normalized.normalizedAddress}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      participants.push({
        role,
        ...normalized,
        isOutside: tenantDomains.size > 0 && !tenantDomains.has(normalized.domainRef),
      });
    }
  }
  return participants;
}

function parseIsoDate(value: string): string | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function parseReceivedDate(value: string): string | null {
  const delimiter = value.lastIndexOf(';');
  if (delimiter < 0) return null;
  return parseIsoDate(value.slice(delimiter + 1).trim());
}

function referencesFromValue(value: string): string[] {
  return [...value.matchAll(/<([^<>\s]+)>/g)]
    .map((match) => match[1]?.trim().toLowerCase())
    .filter((entry): entry is string => Boolean(entry && entry.length <= 256));
}

export function normalizeEmailMetadata(
  raw: string,
  options: NormalizeEmailMetadataOptions = {},
): NormalizedEmailMetadata {
  const headers = parseEmlHeaders(raw);
  const byName = new Map<string, string[]>();
  for (const header of headers) {
    const values = byName.get(header.name) ?? [];
    values.push(header.value);
    byName.set(header.name, values);
  }

  const tenantDomains = new Set(
    (options.tenantDomains ?? [])
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain.length > 0),
  );
  const subject = byName.get('subject')?.[0];
  const dateHeader = byName.get('date')?.[0];
  const receivedHeader = byName.get('received')?.[0];
  const sentAt = dateHeader ? parseIsoDate(dateHeader) : null;
  const receivedAt = receivedHeader ? parseReceivedDate(receivedHeader) : null;
  const warningCode =
    (dateHeader && sentAt === null) || (receivedHeader && receivedAt === null)
      ? 'MALFORMED_DATE'
      : null;
  const participants = [
    ...parseParticipants('from', byName.get('from') ?? [], tenantDomains),
    ...parseParticipants('to', byName.get('to') ?? [], tenantDomains),
    ...parseParticipants('cc', byName.get('cc') ?? [], tenantDomains),
  ];
  const normalizedReferenceIds = [
    ...(byName.get('references') ?? []).flatMap(referencesFromValue),
    ...(byName.get('in-reply-to') ?? []).flatMap(referencesFromValue),
  ].slice(0, 50);

  return {
    subject: subject ? bounded(subject, 500) : null,
    normalizedMessageId: parseEmlEnvelope(raw).normalizedMessageId,
    normalizedReferenceIds,
    sentAt,
    receivedAt,
    warningCode,
    participants,
    hasOutsideParticipants: participants.some((participant) => participant.isOutside),
  };
}
