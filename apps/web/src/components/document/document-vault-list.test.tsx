import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentVaultList,
  documentVaultMatterLabel,
  formatVaultDocumentDate,
} from './document-vault-list';
import type { DocumentDto } from '@amic-vault/shared';

vi.mock('@/lib/api-client', () => ({
  listDocuments: vi.fn(),
}));

describe('DocumentVaultList', () => {
  it('renders a permission-scoped loading state before client data loads', () => {
    const html = renderToStaticMarkup(<DocumentVaultList />);

    expect(html).toContain('전체 문서를 확인하는 중입니다.');
    expect(html).not.toContain('문서 ID');
    expect(html).not.toContain('Matter ID');
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
