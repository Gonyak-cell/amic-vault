import { createHash } from 'node:crypto';

export interface AiPrepCanonicalMetadata {
  safeTitle: string;
  documentType: string;
  subtype: string | null;
  confidentialityLevel: string;
  sourceTextHashes: readonly string[];
  metadataHash: string;
}

export function normalizeAiPrepMetadata(input: {
  title: string;
  documentType?: string | null | undefined;
  subtype?: string | null | undefined;
  confidentialityLevel?: string | null | undefined;
  sourceTextHashes?: readonly string[] | undefined;
}): AiPrepCanonicalMetadata {
  const sourceTextHashes = [...new Set(input.sourceTextHashes ?? [])]
    .filter((hash) => /^[0-9a-f]{64}$/u.test(hash))
    .sort()
    .slice(0, 20);
  const metadata = {
    safeTitle: sanitizeMetadataValue(input.title, 'uploaded document'),
    documentType: sanitizeMetadataValue(input.documentType ?? 'other', 'other'),
    subtype: input.subtype ? sanitizeMetadataValue(input.subtype, 'other') : null,
    confidentialityLevel: sanitizeMetadataValue(input.confidentialityLevel ?? 'standard', 'standard'),
    sourceTextHashes,
  };
  return {
    ...metadata,
    metadataHash: sha256Hex(JSON.stringify(metadata)),
  };
}

export function sanitizeMetadataValue(input: string, fallback: string): string {
  const normalized = input
    .replace(/[^\S\r\n]+/gu, ' ')
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED:email]')
    .replace(/\b\d{2,4}[-.]\d{3,4}[-.]\d{4}\b/gu, '[REDACTED:phone]')
    .trim()
    .slice(0, 120);
  return normalized.length > 0 ? normalized : fallback;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
