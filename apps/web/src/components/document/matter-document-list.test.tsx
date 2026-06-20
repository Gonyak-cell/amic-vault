import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  MatterDocumentList,
  MatterDocumentTable,
  emptyMatterDocumentFilters,
  formatDate,
  matterDocumentListQueryFromFilters,
} from './matter-document-list';
import type { MatterCodeOption } from '@/lib/matter-app';
import type { DocumentDto } from '@amic-vault/shared';

vi.mock('@/lib/api-client', () => ({
  listMatterDocuments: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const selectedMatter: MatterCodeOption = {
  matterReference: '11111111-1111-4111-8111-111111111122',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  clientDisplayName: null,
  practiceGroup: 'Finance',
  sourceMode: 'matter_app_api',
  status: 'active',
};

describe('MatterDocumentList', () => {
  it('waits for a Matter Code before rendering file rows', () => {
    const html = renderToStaticMarkup(<MatterDocumentList selectedMatter={null} />);

    expect(html).toContain('Matter Code를 선택하면 파일 목록이 표시됩니다.');
    expect(html).not.toContain('DOC-');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(selectedMatter.matterReference);
  });

  it('renders a bounded empty state before client-side loading starts', () => {
    const html = renderToStaticMarkup(<MatterDocumentList selectedMatter={selectedMatter} />);

    expect(html).toContain('Matter 문서함 필터');
    expect(html).toContain('문서명');
    expect(html).toContain('유형');
    expect(html).toContain('상태');
    expect(html).toContain('보안 등급');
    expect(html).toContain('특권 상태');
    expect(html).toContain('파일 정리');
    expect(html).toContain('추출/OCR');
    expect(html).toContain('Legal Hold');
    expect(html).toContain('정렬');
    expect(html).toContain('표시할 파일이 없습니다.');
    expect(html).not.toContain(selectedMatter.matterReference);
    expect(html).not.toContain('폴더');
  });

  it('accepts upload refresh keys without exposing Matter references', () => {
    const html = renderToStaticMarkup(
      <MatterDocumentList refreshKey={2} selectedMatter={selectedMatter} />,
    );

    expect(html).toContain('표시할 파일이 없습니다.');
    expect(html).not.toContain(selectedMatter.matterReference);
  });

  it('builds a Matter-scoped cabinet query from allowed document filters', () => {
    const query = matterDocumentListQueryFromFilters({
      ...emptyMatterDocumentFilters,
      aiAllowed: 'true',
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      legalHold: 'false',
      privilegeStatus: 'privileged',
      sortBy: 'type_asc',
      status: 'final',
      title: ' 계약서 ',
    });

    expect(query).toEqual({
      aiAllowed: true,
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      legalHold: false,
      pageSize: 25,
      privilegeStatus: 'privileged',
      sortBy: 'type_asc',
      status: 'final',
      title: '계약서',
    });
    expect(query).not.toHaveProperty('matterCode');
    expect(query).not.toHaveProperty('matterName');
  });

  it('renders cabinet parity columns and statuses for Matter documents', () => {
    const html = renderToStaticMarkup(<MatterDocumentTable documents={[documentFixture()]} />);

    expect(html).toContain('문서');
    expect(html).toContain('유형');
    expect(html).toContain('상태');
    expect(html).toContain('보안');
    expect(html).toContain('특권');
    expect(html).toContain('파일 정리');
    expect(html).toContain('추출/OCR');
    expect(html).toContain('Legal Hold');
    expect(html).toContain('업데이트');
    expect(html).toContain('투자계약서.pdf');
    expect(html).toContain('계약');
    expect(html).toContain('최종');
    expect(html).toContain('제한');
    expect(html).toContain('특권');
    expect(html).toContain('정리 준비');
    expect(html).toContain('추출 실패');
    expect(html).toContain('보존 적용');
    expect(html).not.toContain(selectedMatter.matterReference);
    expect(html).not.toContain(documentFixture().matterId);
  });

  it('formats updated timestamps for file lists', () => {
    expect(formatDate('2026-06-18T04:00:00.000Z')).toContain('2026');
  });

  it('keeps refreshes on the Matter-scoped API and filter query', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toMatch(
      /listMatterDocuments\(selectedMatter\.matterReference, matterDocumentListQueryFromFilters\(filters\)\)/,
    );
    expect(source).toMatch(/\[filters, refreshKey, selectedMatter\]/);
    expect(source).not.toMatch(/matterCode:\s*selectedMatter/);
  });
});

function documentFixture(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    aiAllowed: true,
    canViewSensitiveRef: false,
    confidentialityLevel: 'restricted',
    createdAt: '2026-06-18T04:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111101',
    displayName: '투자계약서.pdf',
    documentFamilyId: '11111111-1111-4111-8111-111111111116',
    documentId: '11111111-1111-4111-8111-111111111114',
    documentType: 'contract',
    extractionStatus: 'failed',
    legalHold: true,
    matterDisplayCode: 'AMIC-2026-0001',
    matterDisplayName: 'Investment Advisory',
    matterId: '22222222-2222-4222-8222-222222222222',
    privilegeStatus: 'privileged',
    safeLabel: '투자계약서.pdf',
    status: 'final',
    subtype: null,
    tenantId: '11111111-1111-4111-8111-111111111111',
    title: '투자계약서.pdf',
    updatedAt: '2026-06-18T04:00:00.000Z',
    ...overrides,
  };
}
