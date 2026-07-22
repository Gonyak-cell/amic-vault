import { describe, expect, it } from 'vitest';
import {
  canonicalSealedDisposalInventoryLine,
  sealedDisposalInventoryHash,
  type SealedDisposalInventoryEntry,
} from './disposal-receipt.types';

const firstEntry: SealedDisposalInventoryEntry = {
  documentId: '11111111-1111-4111-8111-111111111111',
  documentVersionId: '22222222-2222-4222-8222-222222222222',
  fileObjectId: '33333333-3333-4333-8333-333333333333',
  objectKind: 'document_version',
  storageKeyHash: 'a'.repeat(64),
  storageVersionFingerprint: 'b'.repeat(64),
  contentSha256: 'c'.repeat(64),
  canonicalOrdinal: 1,
};

const secondEntry: SealedDisposalInventoryEntry = {
  ...firstEntry,
  documentVersionId: null,
  fileObjectId: '44444444-4444-4444-8444-444444444444',
  objectKind: 'preview_derivative',
  storageKeyHash: 'd'.repeat(64),
  storageVersionFingerprint: 'e'.repeat(64),
  contentSha256: 'f'.repeat(64),
  canonicalOrdinal: 2,
};

describe('sealed disposal inventory types', () => {
  it('hashes the bounded inventory in canonical ordinal order', () => {
    expect(sealedDisposalInventoryHash([secondEntry, firstEntry])).toBe(
      sealedDisposalInventoryHash([firstEntry, secondEntry]),
    );
    expect(canonicalSealedDisposalInventoryLine(firstEntry)).not.toContain('storageKey');
  });

  it('rejects duplicate ordering and raw storage fields', () => {
    expect(() => sealedDisposalInventoryHash([{ ...firstEntry }, { ...firstEntry }])).toThrow(
      'canonicalOrdinal must be unique',
    );
    expect(() =>
      canonicalSealedDisposalInventoryLine({
        ...firstEntry,
        storageKey: 'tenants/secret/document.pdf',
      } as unknown as SealedDisposalInventoryEntry),
    ).toThrow('field is not allowed: storageKey');
  });
});
