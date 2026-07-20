import { describe, expect, it } from 'vitest';
import {
  createDdDataRoomMappingRequestSchema,
  createDdExportJobRequestSchema,
  createDdIssueRequestSchema,
  createDdNegotiationIssueExportRequestSchema,
  createDdReportExportRequestSchema,
  createDdRfiRequestSchema,
  ddDataRoomMappingQuerySchema,
  ddDataRoomMappingSchema,
  ddIssueSchema,
  ddNegotiationIssueExportResponseSchema,
  ddExportJobResponseSchema,
  ddReportExportResponseSchema,
  ddTraceabilityResponseSchema,
  reviewDdMappingSuggestionRequestSchema,
  updateDdIssueRequestSchema,
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

  it('keeps DD report export requests and responses reference-only', () => {
    expect(createDdReportExportRequestSchema.parse({ matterId })).toEqual({
      matterId,
      exportFormat: 'docx',
    });
    expect(
      ddReportExportResponseSchema.parse({
        matterId,
        documentId,
        fileObjectId: '11111111-1111-4111-8111-111111111133',
        title: 'DD 보고서 초안',
        exportFormat: 'docx',
        issueCount: 1,
        riskCount: 1,
        itemCount: 2,
      }).itemCount,
    ).toBe(2);
    expect(() =>
      ddReportExportResponseSchema.parse({
        matterId,
        documentId,
        fileObjectId: '11111111-1111-4111-8111-111111111133',
        title: 'empty',
        exportFormat: 'docx',
        issueCount: 0,
        riskCount: 0,
        itemCount: 0,
      }),
    ).toThrow();
  });

  it('keeps queued DD exports and negotiation issue exports reference-only', () => {
    expect(
      createDdNegotiationIssueExportRequestSchema.parse({ matterId, documentId }),
    ).toEqual({
      matterId,
      documentId,
      exportFormat: 'docx',
    });
    expect(
      createDdExportJobRequestSchema.parse({
        exportType: 'negotiation_issues',
        matterId,
        documentId,
        status: 'open',
      }),
    ).toEqual({
      exportType: 'negotiation_issues',
      matterId,
      documentId,
      status: 'open',
      exportFormat: 'docx',
    });
    expect(
      ddExportJobResponseSchema.parse({
        jobId: 'dd-export-job-1',
        queueName: 'dd.export',
        exportType: 'dd_report',
        matterId,
      }).queueName,
    ).toBe('dd.export');
    expect(
      ddNegotiationIssueExportResponseSchema.parse({
        matterId,
        sourceDocumentId: documentId,
        documentId: '11111111-1111-4111-8111-111111111144',
        fileObjectId: '11111111-1111-4111-8111-111111111155',
        title: '협상쟁점표',
        exportFormat: 'docx',
        negotiationIssueCount: 1,
        itemCount: 1,
      }).negotiationIssueCount,
    ).toBe(1);
    expect(() =>
      ddNegotiationIssueExportResponseSchema.parse({
        matterId,
        sourceDocumentId: documentId,
        documentId: '11111111-1111-4111-8111-111111111144',
        fileObjectId: '11111111-1111-4111-8111-111111111155',
        title: 'empty',
        exportFormat: 'docx',
        negotiationIssueCount: 0,
        itemCount: 0,
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

  it('keeps suggested DD mappings out of public create while allowing query/review DTOs', () => {
    expect(
      ddDataRoomMappingSchema.parse({
        mappingId: '11111111-1111-4111-8111-111111111123',
        matterId,
        rfiId: null,
        documentId,
        versionId: null,
        internalLabel: 'Suggested corporate evidence',
        sectionPath: '01.Corporate',
        mappingStatus: 'suggested',
        supplementRequestedAt: null,
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
      }).mappingStatus,
    ).toBe('suggested');
    expect(ddDataRoomMappingQuerySchema.parse({ matterId, status: 'suggested' }).status).toBe(
      'suggested',
    );
    expect(reviewDdMappingSuggestionRequestSchema.parse({ decision: 'approve' }).decision).toBe(
      'approve',
    );
    expect(() =>
      createDdDataRoomMappingRequestSchema.parse({
        matterId,
        documentId,
        internalLabel: 'Suggested corporate evidence',
        sectionPath: '01.Corporate',
        mappingStatus: 'suggested',
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

  it('requires citation references before DD issues leave open status', () => {
    expect(() =>
      createDdIssueRequestSchema.parse({
        matterId,
        issueCode: 'DD-ISS-003',
        title: 'Triaged without evidence',
        status: 'triaged',
      }),
    ).toThrow('DD_ISSUE_CITATION_REQUIRED');

    expect(
      createDdIssueRequestSchema.parse({
        matterId,
        issueCode: 'DD-ISS-004',
        title: 'Triaged with evidence',
        status: 'triaged',
        citationRefs: [`document:${documentId}`],
      }).status,
    ).toBe('triaged');

    expect(() =>
      ddIssueSchema.parse({
        issueId: '22222222-2222-4222-8222-222222222222',
        matterId,
        rfiId: null,
        documentId: null,
        issueCode: 'DD-ISS-005',
        title: 'Accepted without evidence',
        severity: 'medium',
        status: 'accepted',
        citationRefs: [],
        reportInclusion: false,
        createdAt: '2026-06-28T00:00:00.000Z',
        updatedAt: '2026-06-28T00:00:00.000Z',
      }),
    ).toThrow('DD_ISSUE_CITATION_REQUIRED');

    expect(() =>
      updateDdIssueRequestSchema.parse({
        status: 'triaged',
        citationRefs: [],
      }),
    ).toThrow('DD_ISSUE_CITATION_REQUIRED');

    expect(
      updateDdIssueRequestSchema.parse({
        status: 'triaged',
        citationRefs: [`document:${documentId}`],
      }).status,
    ).toBe('triaged');
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
