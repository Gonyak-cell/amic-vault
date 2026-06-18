import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DocumentDto, DocumentVersionDto } from '@amic-vault/shared';
import { DocumentActionCenter } from './document-action-center';

const document = {
  documentId: '11111111-1111-4111-8111-111111111201',
  tenantId: '11111111-1111-4111-8111-111111111100',
  matterId: '11111111-1111-4111-8111-111111111122',
  matterDisplayCode: 'AMIC-2026-0007',
  matterDisplayName: 'PETRA Bridge Closing',
  documentFamilyId: '11111111-1111-4111-8111-111111111301',
  title: '계약 검토 자료',
  status: 'draft',
  documentType: 'contract',
  subtype: 'closing',
  confidentialityLevel: 'high',
  privilegeStatus: 'privileged',
  aiAllowed: true,
  legalHold: false,
  extractionStatus: 'ready',
  extractionMethod: 'pdf_text',
  extractionConfidence: 0.98,
  createdBy: '11111111-1111-4111-8111-111111111401',
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T01:00:00.000Z',
} satisfies DocumentDto;

const versions = [
  {
    versionId: '11111111-1111-4111-8111-111111111501',
    documentId: document.documentId,
    versionNo: 2,
    versionStatus: 'current',
    fileObjectId: '11111111-1111-4111-8111-111111111601',
    fileHash: 'abc123',
    createdBy: '11111111-1111-4111-8111-111111111401',
    createdAt: '2026-06-18T01:00:00.000Z',
    supersedesVersionId: '11111111-1111-4111-8111-111111111502',
  },
  {
    versionId: '11111111-1111-4111-8111-111111111502',
    documentId: document.documentId,
    versionNo: 1,
    versionStatus: 'superseded',
    fileObjectId: '11111111-1111-4111-8111-111111111602',
    fileHash: 'def456',
    createdBy: '11111111-1111-4111-8111-111111111401',
    createdAt: '2026-06-17T01:00:00.000Z',
    supersedesVersionId: null,
  },
] satisfies DocumentVersionDto[];

describe('DocumentActionCenter', () => {
  it('renders document operations from real document data without user-facing raw refs', () => {
    const currentVersion = versions[0];
    if (!currentVersion) throw new Error('missing current version fixture');
    const html = renderToStaticMarkup(
      <DocumentActionCenter
        disableInitialLoad
        documentId={document.documentId}
        initialDocument={document}
        initialVersions={versions}
      />,
    );

    expect(html).toContain('계약 검토 자료');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('PETRA Bridge Closing');
    expect(html).toContain('문서 프로필');
    expect(html).toContain('미리보기');
    expect(html).toContain('다운로드');
    expect(html).toContain('업무 처리');
    expect(html).toContain('버전');
    expect(html).toContain('v2');
    expect(html).toContain('v1');
    expect(html).toContain('새 버전 추가');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(document.matterId);
    expect(html).not.toContain(currentVersion.versionId);
    expect(html).not.toContain(currentVersion.fileObjectId);
    expect(html).not.toContain(currentVersion.fileHash);
  });

  it('renders a bounded empty state before document data is available', () => {
    const html = renderToStaticMarkup(
      <DocumentActionCenter disableInitialLoad documentId={document.documentId} />,
    );

    expect(html).toContain('표시 가능한 제목 없음');
    expect(html).not.toContain(document.documentId);
    expect(html).not.toContain(document.matterId);
  });
});
