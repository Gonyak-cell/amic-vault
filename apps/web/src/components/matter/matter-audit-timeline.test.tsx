import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AuditEventDto } from '@amic-vault/shared';
import { MatterAuditTimeline } from './matter-audit-timeline';

const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111201';
const actorId = '11111111-1111-4111-8111-111111111101';

const event = {
  eventId: '11111111-1111-4111-8111-111111111701',
  action: 'DOCUMENT_UPLOADED',
  actorType: 'user',
  actorId,
  actorDisplayName: '서지원',
  actorDisplayEmail: 'jwsuh@amic.kr',
  sessionId: '11111111-1111-4111-8111-111111111901',
  result: 'success',
  targetType: 'document',
  targetId: documentId,
  targetDisplayName: '계약 검토 자료',
  targetDisplayCode: null,
  matterId,
  matterDisplayName: 'PETRA Bridge Closing',
  matterDisplayCode: 'AMIC-2026-0007',
  displayName: '계약 검토 자료',
  displayCode: null,
  safeLabel: '계약 검토 자료',
  canViewSensitiveRef: false,
  metadata: { document_id: documentId, matter_id: matterId },
  createdAt: '2026-06-18T02:00:00.000Z',
} satisfies AuditEventDto;

describe('MatterAuditTimeline', () => {
  it('renders matter audit activity without displaying internal refs', () => {
    const html = renderToStaticMarkup(
      <MatterAuditTimeline
        disableInitialLoad
        initialEvents={[event]}
        matterId={matterId}
      />,
    );

    expect(html).toContain('사건 감사 타임라인');
    expect(html).toContain('Matter 단위 기록');
    expect(html).toContain('계약 검토 자료');
    expect(html).toContain('문서 업로드');
    expect(html).toContain('서지원');
    expect(html).toContain('성공');
    expect(html).not.toContain(event.eventId);
    expect(html).not.toContain(actorId);
    expect(html).not.toContain(documentId);
    expect(html).not.toContain(matterId);
  });

  it('renders an empty state when no matter audit events are available', () => {
    const html = renderToStaticMarkup(
      <MatterAuditTimeline disableInitialLoad matterId={matterId} />,
    );

    expect(html).toContain('표시할 감사 기록이 없습니다.');
  });

  it('clears previous matter audit rows while loading and after denied or failed reloads', () => {
    const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8');

    expect(source).toMatch(/setLoading\(true\);\s*setError\(null\);\s*setEvents\(\[\]\);/);
    expect(source).toMatch(/catch\(\(caught\) => \{\s*if \(active\) \{\s*setEvents\(\[\]\);/);
  });
});
