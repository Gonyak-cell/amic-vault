import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentVaultList,
  documentVaultFiltersFromParams,
  documentVaultMatterLabel,
  documentVaultListQueryFromFilters,
  documentVaultPageFromParams,
  documentVaultUrlForFilters,
  emptyDocumentVaultFilters,
  formatVaultDocumentDate,
} from './document-vault-list';
import type { DocumentDto } from '@amic-vault/shared';

vi.mock('@/lib/api-client', () => ({
  listDocuments: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('DocumentVaultList', () => {
  it('renders a permission-scoped loading state before client data loads', () => {
    const html = renderToStaticMarkup(<DocumentVaultList />);

    expect(html).toContain('문서함 검색');
    expect(html).toContain('Matter Code');
    expect(html).toContain('상세 검색');
    expect(html).toContain('0개 선택');
    expect(html).toContain('min-w-[220px]');
    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).not.toContain('파일 정리');
    expect(html).not.toContain('보안 등급');
    expect(html).not.toContain('추출/OCR');
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

  it('parses and builds document vault filter URLs', () => {
    const params = new URLSearchParams(
      'page=2&title=%EA%B3%84%EC%95%BD%EC%84%9C&matterCode=AMIC-2026&documentType=contract&status=final&confidentialityLevel=restricted&privilegeStatus=privileged&extractionStatus=failed&aiAllowed=true&legalHold=false&sortBy=matter_asc',
    );
    const filters = documentVaultFiltersFromParams(params);

    expect(documentVaultPageFromParams(params)).toBe(2);
    expect(filters).toMatchObject({
      aiAllowed: 'true',
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      legalHold: 'false',
      matterCode: 'AMIC-2026',
      privilegeStatus: 'privileged',
      sortBy: 'matter_asc',
      status: 'final',
      title: '계약서',
    });
    expect(documentVaultUrlForFilters(filters, 2)).toBe(
      '/files?page=2&title=%EA%B3%84%EC%95%BD%EC%84%9C&matterCode=AMIC-2026&documentType=contract&status=final&confidentialityLevel=restricted&privilegeStatus=privileged&extractionStatus=failed&aiAllowed=true&legalHold=false&sortBy=matter_asc',
    );
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

  it('supports upload-triggered refresh without changing the active filters', () => {
    const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8');

    expect(source).toMatch(/refreshKey = 0/);
    expect(source).toMatch(/listDocuments\(documentVaultListQueryFromFilters\(filters, page\)\)/);
    expect(source).toMatch(/\[filters, page, refreshKey\]/);
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
