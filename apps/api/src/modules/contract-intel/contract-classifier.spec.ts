import { describe, expect, it } from 'vitest';
import { classifyContractText } from './contract-classifier';

describe('contract classifier', () => {
  it('classifies NDA text with deterministic signal refs', () => {
    const result = classifyContractText({
      documentId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      matterId: '33333333-3333-4333-8333-333333333333',
      text: 'This Non-Disclosure Agreement governs confidential information.',
    });

    expect(result.contractType).toBe('nda');
    expect(result.unsupported).toBe(false);
    expect(result.signalRefs).toContain('keyword:non-disclosure');
  });

  it('fails closed to unknown for unsupported contracts', () => {
    const result = classifyContractText({
      documentId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      matterId: '33333333-3333-4333-8333-333333333333',
      text: 'Unstructured note without contract signals.',
    });

    expect(result.contractType).toBe('unknown');
    expect(result.unsupported).toBe(true);
    expect(result.confidence).toBe(0);
  });
});
