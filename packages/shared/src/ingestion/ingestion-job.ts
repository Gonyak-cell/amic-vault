import { z } from 'zod';

export const MAX_INGESTION_OBJECT_BYTES = 500 * 1024 * 1024;
export const MAX_INGESTION_EXPIRY_MS = 15 * 60 * 1000;
export const ingestionJobValidationErrorCode = 'VALIDATION_FAILED' as const;

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256 = /^[a-f0-9]{64}$/;
const canonicalInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const forbiddenUriScheme = /^[a-z][a-z0-9+.-]*:\/\//i;

export const ingestionStorageAliases = ['primary'] as const;
export const ingestionParserProfiles = ['extract', 'ocr', 'convert', 'email', 'zip'] as const;

function isSafeObjectKey(value: string): boolean {
  return (
    !value.includes('\0') &&
    !value.includes('\\') &&
    !value.includes('%2f') &&
    !value.includes('%2e') &&
    !forbiddenUriScheme.test(value) &&
    value.split('/').every((segment) => segment !== '.' && segment !== '..')
  );
}

function isSafeObjectVersion(value: string): boolean {
  return !value.includes('\0') && !forbiddenUriScheme.test(value);
}

function isCanonicalFutureInstant(value: string, now: Date): boolean {
  if (!canonicalInstant.test(value) || Number.isNaN(now.getTime())) return false;
  const expiresAt = new Date(value);
  return (
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.toISOString().replace('.000Z', 'Z') === value &&
    expiresAt.getTime() > now.getTime() &&
    expiresAt.getTime() <= now.getTime() + MAX_INGESTION_EXPIRY_MS
  );
}

export const ingestionJobSchema = z
  .object({
    tenantId: z.string().regex(canonicalUuid),
    documentId: z.string().regex(canonicalUuid),
    versionId: z.string().regex(canonicalUuid),
    fileObjectId: z.string().regex(canonicalUuid),
    storageAlias: z.enum(ingestionStorageAliases),
    objectKey: z.string().min(1).max(1024).refine(isSafeObjectKey),
    objectVersion: z.string().min(1).max(512).refine(isSafeObjectVersion),
    sha256: z.string().regex(sha256),
    sizeBytes: z.number().int().min(1).max(MAX_INGESTION_OBJECT_BYTES).safe(),
    parserProfile: z.enum(ingestionParserProfiles),
    requestId: z.string().regex(canonicalUuid),
    expiresAt: z.string().regex(canonicalInstant),
  })
  .strict();

export type IngestionJob = z.infer<typeof ingestionJobSchema>;

export type IngestionJobValidationResult =
  | { ok: true; value: IngestionJob }
  | { ok: false; code: typeof ingestionJobValidationErrorCode };

export function validateIngestionJob(
  input: unknown,
  now: Date = new Date(),
): IngestionJobValidationResult {
  const parsed = ingestionJobSchema.safeParse(input);
  if (!parsed.success || !isCanonicalFutureInstant(parsed.data.expiresAt, now)) {
    return { ok: false, code: ingestionJobValidationErrorCode };
  }
  return { ok: true, value: parsed.data };
}
