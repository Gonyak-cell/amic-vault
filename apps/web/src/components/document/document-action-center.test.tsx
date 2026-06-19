import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DocumentAuditEventDto, DocumentDto, DocumentVersionDto } from '@amic-vault/shared';
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

const auditEvents = [
  {
    eventId: '11111111-1111-4111-8111-111111111701',
    action: 'DOCUMENT_DOWNLOADED',
    actorType: 'user',
    actorId: '11111111-1111-4111-8111-111111111401',
    actorDisplayName: '서지원',
    actorDisplayEmail: 'jwsuh@amic.kr',
    result: 'success',
    targetType: 'document',
    targetId: document.documentId,
    targetDisplayName: document.title,
    matterId: document.matterId,
    matterDisplayCode: document.matterDisplayCode,
    matterDisplayName: document.matterDisplayName,
    metadata: { reason_code: 'casework' },
    createdAt: '2026-06-18T02:00:00.000Z',
  },
] satisfies DocumentAuditEventDto[];

describe('DocumentActionCenter', () => {
  it('renders document operations from real document data without user-facing raw refs', () => {
    const currentVersion = versions[0];
    if (!currentVersion) throw new Error('missing current version fixture');
    const currentAuditEvent = auditEvents[0];
    if (!currentAuditEvent) throw new Error('missing audit event fixture');
    const html = renderToStaticMarkup(
      <DocumentActionCenter
        disableInitialLoad
        documentId={document.documentId}
        initialAuditEvents={auditEvents}
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
    expect(html).toContain('업로드 및 처리 큐');
    expect(html).toContain('문서 감사 타임라인');
    expect(html).toContain('다운로드');
    expect(html).toContain('서지원');
    expect(html).toContain('v2');
    expect(html).toContain('v1');
    expect(html).toContain('새 버전 추가');
    expect(html).toContain('기록/보존');
    expect(html).toContain('삭제 금지');
    expect(html).toContain('보관 처리');
    expect(html).toContain('삭제 요청');
    expect(html).toContain('문서함 위치');
    expect(html).toContain(
      'href="/records?tab=archive&amp;documentId=11111111-1111-4111-8111-111111111201&amp;matterCode=AMIC-2026-0007&amp;documentTitle=%EA%B3%84%EC%95%BD+%EA%B2%80%ED%86%A0+%EC%9E%90%EB%A3%8C"',
    );
    expect(html).toContain(
      'href="/files?matterCode=AMIC-2026-0007&amp;title=%EA%B3%84%EC%95%BD+%EA%B2%80%ED%86%A0+%EC%9E%90%EB%A3%8C"',
    );
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(document.matterId);
    expect(html).not.toContain(currentVersion.versionId);
    expect(html).not.toContain(currentVersion.fileObjectId);
    expect(html).not.toContain(currentVersion.fileHash);
    expect(html).not.toContain(currentAuditEvent.eventId);
    expect(html).not.toContain(currentAuditEvent.actorId);
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
