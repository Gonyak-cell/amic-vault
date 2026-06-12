import { describe, expect, it } from 'vitest';
import {
  createDdDataRoomMappingRequestSchema,
  createDdIssueRequestSchema,
  createDdRfiRequestSchema,
  ddTraceabilityResponseSchema,
} from './dd-types';

const matterId = '11111111-1111-4111-8111-111111111111';
const documentId = '11111111-1111-4111-8111-111111111122';

describe('DD Vault shared schemas', () => {
  it('accepts bounded RFI inputs and rejects secret-like text', () => {
    expect(
      createDdRfiRequestSchema.parse({
        matterId,
        rfiCode: 'RFI-001',
        title: 'Corporate charter documents',
      }).status,
    ).toBe('requested');

    expect(() =>
      createDdRfiRequestSchema.parse({
        matterId,
        rfiCode: 'RFI-002',
        title: 'password inventory',
      }),
    ).toThrow();
  });

  it('keeps data room mappings internal and status consistent', () => {
    expect(
      createDdDataRoomMappingRequestSchema.parse({
        matterId,
        documentId,
        internalLabel: 'Corporate registry',
        sectionPath: '01.Corporate',
        mappingStatus: 'mapped',
      }).documentId,
    ).toBe(documentId);

    expect(() =>
      createDdDataRoomMappingRequestSchema.parse({
        matterId,
        documentId,
        internalLabel: 'Missing tax schedules',
        sectionPath: '02.Tax',
        mappingStatus: 'missing',
      }),
    ).toThrow();
  });

  it('allows reference-only issue citations and rejects raw-content refs', () => {
    expect(
      createDdIssueRequestSchema.parse({
        matterId,
        documentId,
        issueCode: 'DD-ISS-001',
        title: 'Missing board approval',
        citationRefs: [`document:${documentId}`],
      }).citationRefs,
    ).toEqual([`document:${documentId}`]);

    expect(() =>
      createDdIssueRequestSchema.parse({
        matterId,
        issueCode: 'DD-ISS-002',
        title: 'Raw leak',
        citationRefs: ['snippet:confidential-body'],
      }),
    ).toThrow();
  });

  it('bounds traceability output to reference identifiers', () => {
    const trace = ddTraceabilityResponseSchema.parse({
      matterId,
      rfiCount: 1,
      mappingCount: 1,
      issueCount: 1,
      riskCount: 1,
      traces: [
        {
          rfiId: null,
          mappingId: null,
          documentId,
          issueId: null,
          riskId: null,
          statusRefs: ['mapping:mapped'],
          citationRefs: [`document:${documentId}`],
        },
      ],
    });
    expect(JSON.stringify(trace)).not.toContain('content');
  });
});
