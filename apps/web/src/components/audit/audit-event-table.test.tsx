import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditEventDto } from '@amic-vault/shared';
import { AuditEventTable } from './audit-event-table';

const event: AuditEventDto = {
  eventId: '11111111-1111-4111-8111-1111111111e1',
  action: 'AUDIT_QUERY_EXECUTED',
  actorType: 'user',
  actorId: '11111111-1111-4111-8111-111111111100',
  sessionId: null,
  result: 'success',
  targetType: 'audit_console',
  targetId: null,
  matterId: null,
  metadata: { scope_type: 'tenant_audit', result_count: 1 },
  createdAt: '2026-06-12T00:00:00.000Z',
};

describe('AuditEventTable', () => {
  it('renders server-provided audit rows without raw metadata fields', () => {
    const html = renderToStaticMarkup(<AuditEventTable events={[event]} />);

    expect(html).toContain('AUDIT_QUERY_EXECUTED');
    expect(html).toContain('audit_console');
    expect(html).not.toContain('metadata_json');
    expect(html).not.toContain('tenant_audit');
  });

  it('renders safe error state', () => {
    const html = renderToStaticMarkup(<AuditEventTable events={[]} error="Access unavailable" />);

    expect(html).toContain('Access unavailable');
    expect(html).not.toContain('PERMISSION_DENIED');
  });
});
