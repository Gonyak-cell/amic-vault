import { describe, expect, it } from 'vitest';
import {
  createLegalHoldRequestSchema,
  createRetentionPolicyRequestSchema,
  disposalCertificateSchema,
} from './records-types';

describe('records governance shared schemas', () => {
  it('defaults retention policies to indefinite and rejects unsafe labels', () => {
    expect(
      createRetentionPolicyRequestSchema.parse({
        policyCode: 'RET-INDEFINITE',
        label: 'Indefinite retention',
      }).retentionDays,
    ).toBeNull();

    expect(() =>
      createRetentionPolicyRequestSchema.parse({
        policyCode: 'RET-RAW',
        label: 'raw body snippet',
      }),
    ).toThrow();
  });

  it('keeps legal hold scope and document id semantics explicit', () => {
    expect(() =>
      createLegalHoldRequestSchema.parse({
        matterId: '11111111-1111-4111-8111-111111111111',
        holdScope: 'document',
        reasonCode: 'CLIENT_RECORDS',
      }),
    ).toThrow();

    expect(() =>
      createLegalHoldRequestSchema.parse({
        matterId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
        holdScope: 'matter',
        reasonCode: 'CLIENT_RECORDS',
      }),
    ).toThrow();
  });

  it('keeps disposal certificates reference-only and strict', () => {
    expect(() =>
      disposalCertificateSchema.parse({
        certificateId: '11111111-1111-4111-8111-111111111111',
        disposalRequestId: '22222222-2222-4222-8222-222222222222',
        matterId: '33333333-3333-4333-8333-333333333333',
        documentId: '44444444-4444-4444-8444-444444444444',
        documentHash: 'a'.repeat(64),
        certificateHash: 'b'.repeat(64),
        approvedBy: '55555555-5555-4555-8555-555555555555',
        executedBy: '66666666-6666-4666-8666-666666666666',
        executedAt: new Date().toISOString(),
        filename: 'forbidden.pdf',
      }),
    ).toThrow();
  });
});
