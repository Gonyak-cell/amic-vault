import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EmailMatterFilingDto } from '@amic-vault/shared';
import { MatterEmailTimeline } from './matter-email-timeline';

describe('MatterEmailTimeline', () => {
  it('links permitted filed emails to document detail with safe labels', () => {
    const html = renderToStaticMarkup(<MatterEmailTimeline emails={[emailFiling()]} />);

    expect(html).toContain('보관된 이메일');
    expect(html).toContain('권한이 확인된 이메일만 표시');
    expect(html).toContain('Matter filing receipt');
    expect(html).toContain('문서 2건');
    expect(html).toContain('문서 1 열기');
    expect(html).toContain('문서 2 열기');
    expect(html).toContain('href="/documents/11111111-1111-4111-8111-1111111111d0"');
    expect(html).toContain('href="/documents/11111111-1111-4111-8111-1111111111d1"');
    expect(html).not.toContain('filing-raw-id');
    expect(html).not.toContain('email-raw-id');
    expect(html).not.toContain('11111111-1111-4111-8111-1111111111aa');
  });
});

function emailFiling(): EmailMatterFilingDto {
  return {
    filingId: 'filing-raw-id',
    tenantId: '11111111-1111-4111-8111-111111111100',
    emailId: 'email-raw-id',
    matterId: '11111111-1111-4111-8111-1111111111aa',
    subject: 'Matter filing receipt',
    sentAt: '2026-06-18T02:10:00.000Z',
    hasOutsideParticipants: true,
    warningCodes: ['outside_participant'],
    privilegeTagSuggestion: {
      tag: 'attorney_client_privilege',
      reasonCodes: ['subject_keyword'],
      requiresUserConfirmation: true,
    },
    thread: {
      rootMessageHash: 'c'.repeat(64),
      directReferenceCount: 1,
      relatedEmailCount: 3,
      referenceHashes: ['d'.repeat(64)],
    },
    documentIds: ['11111111-1111-4111-8111-1111111111d0', '11111111-1111-4111-8111-1111111111d1'],
    filedBy: '11111111-1111-4111-8111-1111111111bb',
    filedAt: '2026-06-18T02:20:00.000Z',
  };
}
