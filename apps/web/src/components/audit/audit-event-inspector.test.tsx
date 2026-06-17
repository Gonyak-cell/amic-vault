import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditEventDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { AuditEventInspector } from './audit-event-inspector';

const event: AuditEventDto = {
  eventId: '11111111-1111-4111-8111-1111111111e1',
  action: 'AUDIT_QUERY_EXECUTED',
  actorType: 'user',
  actorId: '11111111-1111-4111-8111-111111111100',
  actorDisplayName: '조우상',
  actorDisplayEmail: 'jwsuh@amic.kr',
  sessionId: '11111111-1111-4111-8111-1111111111aa',
  result: 'denied',
  targetType: 'audit_console',
  targetId: '11111111-1111-4111-8111-1111111111bb',
  targetDisplayName: '감사 콘솔',
  safeLabel: '감사 콘솔',
  matterId: '11111111-1111-4111-8111-1111111111cc',
  metadata: { scope_type: 'tenant_audit', result_count: 0 },
  createdAt: '2026-06-12T00:00:00.000Z',
};

describe('AuditEventInspector', () => {
  it('renders selected event details without raw refs until explicitly revealed', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AuditEventInspector event={event} />
      </LanguageProvider>,
    );

    expect(html).toContain('상세 정보');
    expect(html).toContain('Audit Query Executed');
    expect(html).toContain('감사 콘솔');
    expect(html).toContain('조우상');
    expect(html).not.toContain('audit_console');
    expect(html).toContain('접근 제한');
    expect(html).toContain('내부 참조 표시');
    expect(html).not.toContain(event.eventId);
    expect(html).not.toContain(event.actorId);
    expect(html).not.toContain(event.sessionId as string);
    expect(html).not.toContain(event.targetId as string);
    expect(html).not.toContain(event.matterId as string);
    expect(html).not.toContain('tenant_audit');
  });

  it('renders an empty inspector state', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AuditEventInspector event={null} />
      </LanguageProvider>,
    );

    expect(html).toContain('선택한 활동이 없습니다.');
  });
});
