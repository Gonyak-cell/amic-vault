import { createHash } from 'node:crypto';

export const disposalOutboxStates = [
  'pending',
  'processing',
  'completed',
  'dead_letter',
  'blocked',
] as const;

export const disposalInventoryObjectKinds = ['document_version', 'preview_derivative'] as const;
export const disposalReceiptOutcomes = ['deleted', 'already_absent'] as const;

export type DisposalOutboxState = (typeof disposalOutboxStates)[number];
export type DisposalInventoryObjectKind = (typeof disposalInventoryObjectKinds)[number];
export type DisposalReceiptOutcome = (typeof disposalReceiptOutcomes)[number];

export interface SealedDisposalInventoryEntry {
  documentId: string;
  documentVersionId: string | null;
  fileObjectId: string;
  objectKind: DisposalInventoryObjectKind;
  storageKeyHash: string;
  storageVersionFingerprint: string;
  contentSha256: string;
  canonicalOrdinal: number;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sealedInventoryFields = new Set([
  'documentId',
  'documentVersionId',
  'fileObjectId',
  'objectKind',
  'storageKeyHash',
  'storageVersionFingerprint',
  'contentSha256',
  'canonicalOrdinal',
]);

function assertUuid(value: string, field: string): void {
  if (!uuidPattern.test(value)) throw new Error(`sealed disposal inventory ${field} is invalid`);
}

function assertHash(value: string, field: string): void {
  if (!sha256Pattern.test(value)) throw new Error(`sealed disposal inventory ${field} is invalid`);
}

/**
 * Produces the bounded canonical line shared with migration 0202. It rejects
 * unexpected fields so callers cannot accidentally put a raw storage key or
 * provider version identifier into the sealed inventory input.
 */
export function canonicalSealedDisposalInventoryLine(entry: SealedDisposalInventoryEntry): string {
  for (const field of Object.keys(entry)) {
    if (!sealedInventoryFields.has(field)) {
      throw new Error(`sealed disposal inventory field is not allowed: ${field}`);
    }
  }
  assertUuid(entry.documentId, 'documentId');
  if (entry.documentVersionId !== null) assertUuid(entry.documentVersionId, 'documentVersionId');
  assertUuid(entry.fileObjectId, 'fileObjectId');
  if (!disposalInventoryObjectKinds.includes(entry.objectKind)) {
    throw new Error('sealed disposal inventory objectKind is invalid');
  }
  assertHash(entry.storageKeyHash, 'storageKeyHash');
  assertHash(entry.storageVersionFingerprint, 'storageVersionFingerprint');
  assertHash(entry.contentSha256, 'contentSha256');
  if (!Number.isSafeInteger(entry.canonicalOrdinal) || entry.canonicalOrdinal < 1) {
    throw new Error('sealed disposal inventory canonicalOrdinal is invalid');
  }
  return [
    entry.documentId,
    entry.documentVersionId ?? '',
    entry.fileObjectId,
    entry.objectKind,
    entry.storageKeyHash,
    entry.storageVersionFingerprint,
    entry.contentSha256,
    String(entry.canonicalOrdinal),
  ].join(':');
}

export function sealedDisposalInventoryHash(entries: readonly SealedDisposalInventoryEntry[]): string {
  if (entries.length === 0) throw new Error('sealed disposal inventory cannot be empty');
  const ordered = [...entries]
    .map((entry) => ({ entry, line: canonicalSealedDisposalInventoryLine(entry) }))
    .sort((left, right) => left.entry.canonicalOrdinal - right.entry.canonicalOrdinal);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1]?.entry.canonicalOrdinal === ordered[index]?.entry.canonicalOrdinal) {
      throw new Error('sealed disposal inventory canonicalOrdinal must be unique');
    }
  }
  return createHash('sha256')
    .update(ordered.map(({ line }) => line).join('\n'))
    .digest('hex');
}
