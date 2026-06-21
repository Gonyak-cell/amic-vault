import { describe, expect, it } from 'vitest';
import {
  documentAuditQueryEventTypeSchema,
  documentAuditQuerySchema,
  documentTimelineAuditActions,
} from './audit-query.dto';

describe('audit query DTOs', () => {
  it('allows document-target Records lifecycle actions in document timelines', () => {
    expect(documentTimelineAuditActions).toEqual(
      expect.arrayContaining([
        'DOCUMENT_VIEWED',
        'DOCUMENT_DOWNLOADED',
        'DOCUMENT_METADATA_CHANGED',
        'DOCUMENT_VERSION_ADDED',
        'LEGAL_HOLD_APPLIED',
        'LEGAL_HOLD_RELEASED',
        'RECORD_ARCHIVED',
        'DISPOSAL_REQUESTED',
        'DISPOSAL_EXECUTED',
      ]),
    );
    expect(documentAuditQueryEventTypeSchema.parse('RECORD_ARCHIVED')).toBe('RECORD_ARCHIVED');
    expect(documentAuditQuerySchema.parse({ eventType: 'DISPOSAL_REQUESTED' })).toMatchObject({
      eventType: 'DISPOSAL_REQUESTED',
      limit: 50,
    });
  });
});
