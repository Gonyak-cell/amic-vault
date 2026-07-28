import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentDto } from '@amic-vault/shared';
import { commonBulkStatusTargets, DocumentBulkActions } from './document-bulk-actions';

vi.mock('@/lib/api-client', () => ({
  createDocumentBulkActionBatch: vi.fn(),
  getDocumentBulkActionBatch: vi.fn(),
  listDocumentFolders: vi.fn(),
  retryDocumentBulkActionBatch: vi.fn(),
}));

describe('DocumentBulkActions', () => {
  it('renders an honest current-page count and only approved actions', () => {
    const html = renderToStaticMarkup(
      <DocumentBulkActions
        documents={[documentFixture(), documentFixture({ documentId: id(2) })]}
        onClear={() => undefined}
        onCompleted={() => undefined}
      />,
    );

    expect(html).toContain('현재 페이지 2건 선택');
    expect(html).toContain('태그 추가');
    expect(html).toContain('태그 제거');
    expect(html).toContain('폴더 이동');
    expect(html).toContain('상태 변경');
    expect(html).toContain('선택 해제');
    expect(html).not.toContain('전체 검색 결과');
    expect(html).not.toContain('삭제');
    expect(html).not.toContain('공유');
  });

  it('offers only status targets valid for every selected document', () => {
    expect(
      commonBulkStatusTargets([
        documentFixture({ status: 'draft' }),
        documentFixture({ documentId: id(2), status: 'draft' }),
      ]),
    ).toEqual(['internal_review', 'final', 'archived']);
    expect(
      commonBulkStatusTargets([
        documentFixture({ status: 'draft' }),
        documentFixture({ documentId: id(2), status: 'final' }),
      ]),
    ).toEqual([]);
    expect(
      commonBulkStatusTargets([
        documentFixture({ status: 'draft' }),
        documentFixture({ documentId: id(2), legalHold: true }),
      ]),
    ).toEqual([]);
  });

  it('keeps explicit confirmation, live progress, partial receipt, and retry contracts', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('일부 항목이 실패하면 성공 항목과 실패 항목을 영수증에 함께 표시');
    expect(source).toContain('실패 항목 재시도');
    expect(source).toContain('crypto.randomUUID()');
    expect(source).toContain('window.setTimeout');
    expect(source).toMatch(
      /querySelectorAll<HTMLButtonElement>\(\s*'button:not\(\[disabled\]\)'/,
    );
  });
});

function id(index: number): string {
  return `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
}

function documentFixture(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    aiAllowed: false,
    canViewSensitiveRef: false,
    confidentialityLevel: 'standard',
    createdAt: '2026-07-28T00:00:00.000Z',
    createdBy: id(4),
    displayName: '계약서',
    documentFamilyId: id(5),
    documentId: id(1),
    documentType: 'contract',
    folderId: null,
    folderPath: null,
    legalHold: false,
    matterDisplayCode: 'SC-001',
    matterDisplayName: '테스트 Matter',
    matterId: id(3),
    privilegeStatus: 'none',
    safeLabel: '계약서',
    source: 'internal_work_product',
    status: 'draft',
    subtype: null,
    tags: [],
    tenantId: id(6),
    title: '계약서',
    updatedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  };
}
