import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditEventDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { AuditEventTable } from './audit-event-table';

const event: AuditEventDto = {
  eventId: '11111111-1111-4111-8111-1111111111e1',
  action: 'AUDIT_QUERY_EXECUTED',
  actorType: 'user',
  actorId: '11111111-1111-4111-8111-111111111100',
  actorDisplayName: '조우상',
  actorDisplayEmail: 'jwsuh@amic.kr',
  sessionId: null,
  result: 'success',
  targetType: 'audit_console',
  targetId: null,
  targetDisplayName: '감사 콘솔',
  safeLabel: '감사 콘솔',
  matterId: null,
  metadata: { scope_type: 'tenant_audit', result_count: 1 },
  createdAt: '2026-06-12T00:00:00.000Z',
};

describe('AuditEventTable', () => {
  it('renders server-provided audit rows without raw metadata fields', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AuditEventTable events={[event]} />
      </LanguageProvider>,
    );

    expect(html).toContain('활동');
    expect(html).toContain('활동 기록 표');
    expect(html).toContain('min-w-[760px]');
    expect(html).toContain('Audit Query Executed');
    expect(html).toContain('감사 콘솔');
    expect(html).toContain('조우상');
    expect(html).not.toContain('audit_console');
    expect(html).not.toContain('사용자</td>');
    expect(html).toContain('성공');
    expect(html).not.toContain(event.actorId);
    expect(html).not.toContain(event.eventId);
    expect(html).not.toContain('metadata_json');
    expect(html).not.toContain('tenant_audit');
  });

  it('renders safe error state', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AuditEventTable events={[]} error="Access unavailable" />
      </LanguageProvider>,
    );

    expect(html).toContain('Access unavailable');
    expect(html).not.toContain('PERMISSION_DENIED');
  });
});
