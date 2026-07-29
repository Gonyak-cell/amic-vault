import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentDto } from '@amic-vault/shared';
import { MatterDocumentPicker } from './matter-document-picker';

vi.mock('@/lib/api-client', () => ({
  listMatterDocuments: vi.fn(),
}));

const documentId = '11111111-1111-4111-8111-111111111114';

describe('MatterDocumentPicker', () => {
  it('renders display-safe document labels without exposing Matter references', () => {
    const html = renderToStaticMarkup(
      <MatterDocumentPicker
        initialDocuments={[documentFixture()]}
        matterId="22222222-2222-4222-8222-222222222222"
        onDocumentSelected={() => undefined}
        selectedDocumentId={documentId}
      />,
    );

    expect(html).toContain('문서명 검색');
    expect(html).toContain('투자계약서.pdf');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain(documentId);
    expect(html).not.toContain('22222222-2222-4222-8222-222222222222');
    expect(html).not.toContain('식별값');
  });
});

function documentFixture(): DocumentDto {
  return {
    aiAllowed: true,
    canViewSensitiveRef: false,
    confidentialityLevel: 'restricted',
    createdAt: '2026-06-18T04:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111101',
    displayName: '투자계약서.pdf',
    documentFamilyId: '11111111-1111-4111-8111-111111111116',
    documentId,
    documentType: 'contract',
    extractionStatus: 'ready',
    legalHold: false,
    matterDisplayCode: 'AMIC-2026-0001',
    matterDisplayName: '투자 자문',
    matterId: '22222222-2222-4222-8222-222222222222',
    privilegeStatus: 'privileged',
    safeLabel: '투자계약서.pdf',
    source: 'internal_work_product',
    status: 'final',
    subtype: null,
    tenantId: '11111111-1111-4111-8111-111111111111',
    title: '투자계약서.pdf',
    updatedAt: '2026-06-18T04:00:00.000Z',
  };
}
