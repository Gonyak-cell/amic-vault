import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentVaultList,
  DocumentFolderAndTags,
  documentVaultFiltersFromParams,
  documentVaultMatterLabel,
  documentVaultListQueryFromFilters,
  documentVaultPageFromParams,
  documentVaultUrlForFilters,
  emptyDocumentVaultFilters,
  formatVaultDocumentDate,
} from './document-vault-list';
import type { DocumentDto } from '@amic-vault/shared';
import { documentStatusTransitionTargets } from '@/lib/document-status-transitions';

vi.mock('@/lib/api-client', () => ({
  createDocumentBulkActionBatch: vi.fn(),
  getDocumentBulkActionBatch: vi.fn(),
  listDocumentFolders: vi.fn(),
  listDocuments: vi.fn(),
  retryDocumentBulkActionBatch: vi.fn(),
  updateDocumentStatus: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('DocumentVaultList', () => {
  it('renders a permission-scoped loading state before client data loads', () => {
    const html = renderToStaticMarkup(<DocumentVaultList />);

    expect(html).toContain('문서함 검색');
    expect(html).toContain('태그');
    expect(html).toContain('정렬');
    expect(html).toContain('상세 검색');
    expect(html).toContain('0개 선택');
    expect(html).toContain('min-w-[220px]');
    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).not.toContain('파일 정리');
    expect(html).not.toContain('보안 등급');
    expect(html).not.toContain('추출/OCR');
    expect(html).not.toContain('문서 ID');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('폴더 ID');
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
          folderId: '11111111-1111-4111-8111-111111111141',
          legalHold: 'false',
          matterCode: ' AMIC-2026 ',
          privilegeStatus: 'privileged',
          sortBy: 'matter_asc',
          status: 'final',
          tag: ' executed ',
          title: ' 계약서 ',
        },
        3,
      ),
    ).toEqual({
      aiAllowed: true,
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      folderId: '11111111-1111-4111-8111-111111111141',
      legalHold: false,
      matterCode: 'AMIC-2026',
      page: 3,
      pageSize: 25,
      privilegeStatus: 'privileged',
      sortBy: 'matter_asc',
      status: 'final',
      tag: 'executed',
      title: '계약서',
    });
  });

  it('parses and builds document vault filter URLs', () => {
    const params = new URLSearchParams(
      'page=2&title=%EA%B3%84%EC%95%BD%EC%84%9C&matterCode=AMIC-2026&folderId=11111111-1111-4111-8111-111111111141&tag=executed&documentType=contract&status=final&confidentialityLevel=restricted&privilegeStatus=privileged&extractionStatus=failed&aiAllowed=true&legalHold=false&sortBy=matter_asc',
    );
    const filters = documentVaultFiltersFromParams(params);

    expect(documentVaultPageFromParams(params)).toBe(2);
    expect(filters).toMatchObject({
      aiAllowed: 'true',
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      folderId: '11111111-1111-4111-8111-111111111141',
      legalHold: 'false',
      matterCode: 'AMIC-2026',
      privilegeStatus: 'privileged',
      sortBy: 'matter_asc',
      status: 'final',
      tag: 'executed',
      title: '계약서',
    });
    expect(documentVaultUrlForFilters(filters, 2)).toBe(
      '/files?page=2&title=%EA%B3%84%EC%95%BD%EC%84%9C&matterCode=AMIC-2026&folderId=11111111-1111-4111-8111-111111111141&tag=executed&documentType=contract&status=final&confidentialityLevel=restricted&privilegeStatus=privileged&extractionStatus=failed&aiAllowed=true&legalHold=false&sortBy=matter_asc',
    );
  });

  it('renders folder path and tags without exposing ids', () => {
    const html = renderToStaticMarkup(<DocumentFolderAndTags document={documentFixture()} />);

    expect(html).toContain('Deal Room/Signing');
    expect(html).toContain('executed');
    expect(html).toContain('reviewed');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111141');
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

  it('offers only allowed non-destructive status transitions in the vault UI', () => {
    expect(documentStatusTransitionTargets(documentFixture({ status: 'draft' }))).toEqual([
      'internal_review',
      'final',
      'archived',
    ]);
    expect(documentStatusTransitionTargets(documentFixture({ legalHold: true }))).toEqual([]);
    expect(documentStatusTransitionTargets(documentFixture({ status: 'disposal_locked' }))).toEqual(
      [],
    );
  });

  it('supports upload-triggered refresh without changing the active filters', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toMatch(/refreshKey = 0/);
    expect(source).toMatch(/listDocuments\(documentVaultListQueryFromFilters\(filters, page\)\)/);
    expect(source).toMatch(/\[bulkActionRevision, filters, page, refreshKey\]/);
  });

  it('keeps bulk selection page-scoped and clears it when list ownership changes', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('aria-label="현재 페이지 문서 선택"');
    expect(source).toContain('setSelectedDocumentIds(new Set())');
    expect(source).toContain('new Set(documents.map((document) => document.documentId))');
    expect(source).not.toContain('전체 검색 결과 선택');
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
    folderId: '11111111-1111-4111-8111-111111111141',
    folderPath: 'Deal Room/Signing',
    legalHold: false,
    matterDisplayCode: 'AMIC-2026-0001',
    matterDisplayName: 'Investment Advisory',
    matterId: '11111111-1111-4111-8111-111111111115',
    privilegeStatus: 'none',
    safeLabel: '투자계약서.pdf',
    source: 'internal_work_product',
    status: 'draft',
    subtype: null,
    tenantId: '11111111-1111-4111-8111-111111111111',
    title: '투자계약서.pdf',
    tags: ['executed', 'reviewed'],
    updatedAt: '2026-06-18T04:00:00.000Z',
    aiAllowed: true,
    ...overrides,
  };
}
