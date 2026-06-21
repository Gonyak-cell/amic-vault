import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MatterSuggestionDto } from '@amic-vault/shared';
import type { OutlookItemSnapshot } from '@/lib/outlook-addin/outlook-item';
import { OutlookAddinClient } from './outlook-addin-client';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

describe('OutlookAddinClient', () => {
  it('renders a compact filing pane without raw Outlook message data', () => {
    const suggestion: MatterSuggestionDto = {
      matterId: '11111111-1111-4111-8111-111111111111',
      matterCode: 'M-2026-001',
      matterName: 'Project Maple',
      clientId: '22222222-2222-4222-8222-222222222222',
      reasonCodes: ['subject_hash'],
      score: 92,
    };
    const html = renderToStaticMarkup(
      <OutlookAddinClient initialSnapshot={snapshot()} initialSuggestions={[suggestion]} />,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('Outlook 파일링');
    expect(html).toContain('메일');
    expect(html).toContain('사건');
    expect(html).toContain('Vault 문서');
    expect(html).toContain('문서 연결');
    expect(html).toContain('Project Maple');
    expect(html).toContain('M-2026-001');
    expect(html).toContain('첨부 1');
    expect(html).toContain('선택 사건 있음');
    expect(html).not.toContain('Privileged acquisition draft');
    expect(html).not.toContain('lawyer@amic.test');
    expect(html).not.toContain('counterparty@example.com');
    expect(html).not.toContain('board-minutes.pdf');
    expect(html).not.toContain('raw-message-id');
    expect(html).not.toContain('내부 참조');
    expect(html).not.toContain(suggestion.matterId);
    expect(html).not.toContain('11111111');
  });
});

function snapshot(): OutlookItemSnapshot {
  return {
    message: {
      mailboxFingerprint: hashA,
      outlookItemIdHash: hashB,
      internetMessageIdHash: hashC,
      conversationIdHash: hashA,
      canonicalMessageSha256: hashB,
      receivedAt: '2026-06-16T01:02:03.000Z',
      hasExternalParticipants: true,
      participantDomainHashes: [hashA, hashC],
    },
    subjectHash: hashC,
    mailboxHashPreview: 'aaaaaaaa.cccc',
    itemHashPreview: 'bbbbbbbb.dddd',
    participantDomainHashCount: 2,
    externalParticipantCount: 1,
    attachmentRefs: [
      {
        attachmentIdHash: hashA,
        ordinal: 0,
        sizeBytes: 24576,
        mimeType: 'application/pdf',
        selectedForFiling: true,
      },
    ],
    attachmentSummary: {
      count: 1,
      selectedCount: 1,
      totalSizeBytes: 24576,
    },
  };
}
