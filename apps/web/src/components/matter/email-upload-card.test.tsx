import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/api-client';
import {
  EmailUploadCard,
  emailUploadErrorMessage,
  emailUploadAccept,
} from './email-upload-card';
import {
  EmailUploadReceipt,
  emailFilingMatterOptions,
  emailParseStatusLabel,
  type EmailUploadMatter,
} from './email-upload-receipt';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    fileEmailToMatter: vi.fn(),
    getEmailMatterSuggestions: vi.fn(),
    uploadRawEmailToMatter: vi.fn(),
  };
});

vi.mock('@/components/ui/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    variant?: string;
    size?: string;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const currentMatter: EmailUploadMatter = {
  matterId: '11111111-1111-4111-8111-111111111122',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  clientDisplayName: 'AMIC Client',
};

describe('EmailUploadCard', () => {
  it('renders EML and MSG upload controls for a selected Matter without raw ids', () => {
    const html = renderToStaticMarkup(<EmailUploadCard matter={currentMatter} />);

    expect(html).toContain('이메일 파일');
    expect(html).toContain('이메일 업로드');
    expect(html).toContain('type="file"');
    expect(html).toContain(`accept="${emailUploadAccept}"`);
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('Investment Advisory');
    expect(html).not.toContain(currentMatter.matterId);
  });

  it('renders upload receipt suggestions and the MSG pending badge without exposing raw ids', () => {
    const html = renderToStaticMarkup(
      <EmailUploadReceipt
        busy={false}
        currentMatter={currentMatter}
        onConfirm={vi.fn()}
        onSelectMatter={vi.fn()}
        selectedMatterId={currentMatter.matterId}
        suggestions={[
          {
            matterId: '22222222-2222-4222-8222-222222222222',
            matterCode: 'AMIC-2026-0002',
            matterName: 'Counterparty Review',
            clientId: '22222222-2222-4222-8222-222222222223',
            reasonCodes: ['subject'],
            score: 70,
            confidence: 83,
            confidenceBand: 'confirm',
          },
        ]}
        uploadResult={uploadResponse('msg')}
      />,
    );

    expect(html).toContain('파일링 확인');
    expect(html).toContain('MSG 파싱 대기');
    expect(html).toContain('현재 Matter');
    expect(html).toContain('AMIC-2026-0002');
    expect(html).toContain('확인');
    expect(html).toContain('추천 근거 제목');
    expect(html).toContain('외부 참여자 포함');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111201');
    expect(html).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  it('keeps the current Matter first and removes duplicate suggestion rows', () => {
    expect(
      emailFilingMatterOptions(currentMatter, [
        {
          matterId: currentMatter.matterId,
          matterCode: currentMatter.matterCode,
          matterName: currentMatter.matterName,
          clientId: '11111111-1111-4111-8111-111111111133',
          reasonCodes: ['subject'],
          score: 70,
          confidence: 83,
          confidenceBand: 'confirm',
        },
        {
          matterId: '22222222-2222-4222-8222-222222222222',
          matterCode: 'AMIC-2026-0002',
          matterName: 'Counterparty Review',
          clientId: '22222222-2222-4222-8222-222222222223',
          reasonCodes: ['participant_domain'],
          score: 30,
          confidence: 58,
          confidenceBand: 'candidate',
        },
      ]).map((option) => ({
        currentMatter: option.currentMatter,
        matterCode: option.matterCode,
        reasonCodes: option.reasonCodes,
      })),
    ).toEqual([
      { currentMatter: true, matterCode: 'AMIC-2026-0001', reasonCodes: [] },
      {
        currentMatter: false,
        matterCode: 'AMIC-2026-0002',
        reasonCodes: ['participant_domain'],
      },
    ]);
  });

  it('uses duplicate-safe copy for validation failures and labels MSG as pending', () => {
    expect(
      emailUploadErrorMessage(new ApiClientError(400, { code: 'VALIDATION_FAILED' })),
    ).toContain('이미 보관된 이메일');
    expect(emailParseStatusLabel(uploadResponse('msg'))).toBe('MSG 파싱 대기');
    expect(emailParseStatusLabel(uploadResponse('eml'))).toBeNull();
  });
});

function uploadResponse(parser: 'eml' | 'msg') {
  return {
    email: {
      emailId: '11111111-1111-4111-8111-111111111201',
      tenantId: '11111111-1111-4111-8111-111111111100',
      rawFileObjectId: '11111111-1111-4111-8111-111111111202',
      parser,
      parserVersion: `email-${parser}-test`,
      parseStatus: parser === 'msg' ? 'pending_unsupported' : 'parsed',
      failureReasonCode: parser === 'msg' ? 'UNSUPPORTED_MSG' : null,
      subject: parser === 'msg' ? null : 'Matter filing receipt',
      sentAt: null,
      receivedAt: null,
      metadataWarningCode: null,
      hasOutsideParticipants: true,
      messageIdHash: 'a'.repeat(64),
      references: [],
      rawSha256: 'b'.repeat(64),
      rawSizeBytes: 10,
      createdBy: '11111111-1111-4111-8111-111111111203',
      createdAt: '2026-07-03T00:00:00.000Z',
    },
    filing: {
      filingId: '11111111-1111-4111-8111-111111111221',
      tenantId: '11111111-1111-4111-8111-111111111100',
      emailId: '11111111-1111-4111-8111-111111111201',
      matterId: currentMatter.matterId,
      subject: 'Matter filing receipt',
      sentAt: null,
      hasOutsideParticipants: true,
      warningCodes: ['outside_participant'],
      participantClasses: [{ class: 'other_external', count: 1 }],
      privilegeTagSuggestion: null,
      thread: {
        threadId: '11111111-1111-4111-8111-1111111112ab',
        rootMessageHash: 'c'.repeat(64),
        conversationIdHash: null,
        directReferenceCount: 0,
        relatedEmailCount: 0,
        referenceHashes: [],
      },
      documentIds: [],
      filedBy: '11111111-1111-4111-8111-111111111203',
      filedAt: '2026-07-03T00:00:00.000Z',
    },
  } as const;
}
