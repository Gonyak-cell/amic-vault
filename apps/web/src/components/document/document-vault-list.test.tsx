import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentVaultList,
  documentVaultMatterLabel,
  documentVaultListQueryFromFilters,
  emptyDocumentVaultFilters,
  formatVaultDocumentDate,
} from './document-vault-list';
import type { DocumentDto } from '@amic-vault/shared';

vi.mock('@/lib/api-client', () => ({
  listDocuments: vi.fn(),
}));

describe('DocumentVaultList', () => {
  it('renders a permission-scoped loading state before client data loads', () => {
    const html = renderToStaticMarkup(<DocumentVaultList />);

    expect(html).toContain('문서함 필터');
    expect(html).toContain('Matter Code');
    expect(html).toContain('파일 정리');
    expect(html).toContain('보안 등급');
    expect(html).toContain('추출/OCR');
    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).not.toContain('문서 ID');
    expect(html).not.toContain('Matter ID');
  });

  it('builds a server-side query from document vault filters', () => {
    expect(
      documentVaultListQueryFromFilters(
        {
          ...emptyDocumentVaultFilters,
          aiAllowed: 'true',
          confidentialityLevel: 'restricted',
          documentType: 'contract',
          extractionStatus: 'failed',
          legalHold: 'false',
          matterCode: ' AMIC-2026 ',
          privilegeStatus: 'privileged',
          sortBy: 'matter_asc',
          status: 'final',
          title: ' 계약서 ',
        },
        3,
      ),
    ).toEqual({
      aiAllowed: true,
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      legalHold: false,
      matterCode: 'AMIC-2026',
      page: 3,
      pageSize: 25,
      privilegeStatus: 'privileged',
      sortBy: 'matter_asc',
      status: 'final',
      title: '계약서',
    });
  });

  it('formats matter labels without exposing raw ids', () => {
    expect(documentVaultMatterLabel(documentFixture())).toBe(
      'AMIC-2026-0001 · Investment Advisory',
    );
    expect(documentVaultMatterLabel(documentFixture({ matterDisplayName: null }))).toBe(
      'AMIC-2026-0001',
    );
  });

  it('formats updated timestamps for the document vault', () => {
    expect(formatVaultDocumentDate('2026-06-18T04:00:00.000Z')).toContain('2026');
  });
});

function documentFixture(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    canViewSensitiveRef: false,
    confidentialityLevel: 'standard',
    createdAt: '2026-06-18T04:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111101',
    displayName: '투자계약서.pdf',
    documentFamilyId: '11111111-1111-4111-8111-111111111116',
    documentId: '11111111-1111-4111-8111-111111111114',
    documentType: 'contract',
    legalHold: false,
    matterDisplayCode: 'AMIC-2026-0001',
    matterDisplayName: 'Investment Advisory',
    matterId: '11111111-1111-4111-8111-111111111115',
    privilegeStatus: 'none',
    safeLabel: '투자계약서.pdf',
    status: 'draft',
    subtype: null,
    tenantId: '11111111-1111-4111-8111-111111111111',
    title: '투자계약서.pdf',
    updatedAt: '2026-06-18T04:00:00.000Z',
    aiAllowed: true,
    ...overrides,
  };
}
