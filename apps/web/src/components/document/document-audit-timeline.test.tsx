import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DocumentAuditEventDto } from '@amic-vault/shared';
import { DocumentAuditTimeline } from './document-audit-timeline';

const event = {
  eventId: '11111111-1111-4111-8111-111111111701',
  action: 'DOCUMENT_VIEWED',
  actorType: 'system',
  actorId: null,
  actorDisplayName: null,
  actorDisplayEmail: null,
  result: 'success',
  targetType: 'document',
  targetId: '11111111-1111-4111-8111-111111111201',
  targetDisplayName: '계약 검토 자료',
  matterId: '11111111-1111-4111-8111-111111111122',
  matterDisplayCode: 'AMIC-2026-0007',
  matterDisplayName: 'PETRA Bridge Closing',
  metadata: { channel: 'detail' },
  createdAt: '2026-06-18T02:00:00.000Z',
} satisfies DocumentAuditEventDto;

describe('DocumentAuditTimeline', () => {
  it('renders document audit activity without displaying internal refs', () => {
    const html = renderToStaticMarkup(
      <DocumentAuditTimeline
        disableInitialLoad
        documentId={event.targetId}
        initialEvents={[event]}
      />,
    );

    expect(html).toContain('문서 감사 타임라인');
    expect(html).toContain('열람');
    expect(html).toContain('시스템');
    expect(html).toContain('성공');
    expect(html).not.toContain(event.eventId);
    expect(html).not.toContain(event.matterId);
  });

  it('renders an empty state when no document audit events are available', () => {
    const html = renderToStaticMarkup(
      <DocumentAuditTimeline
        disableInitialLoad
        documentId="11111111-1111-4111-8111-111111111201"
      />,
    );

    expect(html).toContain('표시할 감사 기록이 없습니다.');
  });

  it('clears previous audit rows while loading and after denied or failed reloads', () => {
    const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8');

    expect(source).toMatch(/setLoading\(true\);\s*setError\(null\);\s*setEvents\(\[\]\);/);
    expect(source).toMatch(/catch\(\(caught\) => \{\s*if \(active\) \{\s*setEvents\(\[\]\);/);
  });
});
