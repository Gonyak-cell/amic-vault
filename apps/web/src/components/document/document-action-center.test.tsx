import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  DocumentAuditEventDto,
  DocumentDto,
  DocumentVersionDto,
  EmailMatterFilingDto,
} from '@amic-vault/shared';
import {
  DocumentActionCenter,
  relatedMatterEmails,
  relatedMatterDocuments,
  searchHitContextFromParams,
  versionUploadStatusMessage,
} from './document-action-center';

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

const relatedDocuments = [
  document,
  {
    ...document,
    documentId: '11111111-1111-4111-8111-111111111202',
    documentFamilyId: '11111111-1111-4111-8111-111111111302',
    title: 'Side Letter',
    status: 'final',
    documentType: 'correspondence',
    subtype: 'closing',
    updatedAt: '2026-06-18T03:00:00.000Z',
  },
  {
    ...document,
    documentId: '11111111-1111-4111-8111-111111111203',
    documentFamilyId: '11111111-1111-4111-8111-111111111303',
    title: 'Due Diligence Memo',
    status: 'internal_review',
    documentType: 'memo',
    subtype: 'diligence',
    updatedAt: '2026-06-18T02:30:00.000Z',
  },
] satisfies DocumentDto[];

const relatedEmails = [
  {
    filingId: '11111111-1111-4111-8111-111111112001',
    tenantId: document.tenantId,
    emailId: '11111111-1111-4111-8111-111111112101',
    matterId: document.matterId,
    subject: 'Closing checklist follow-up',
    sentAt: '2026-06-18T02:10:00.000Z',
    hasOutsideParticipants: true,
    warningCodes: ['outside_participant'],
    privilegeTagSuggestion: {
      tag: 'attorney_client_privilege',
      reasonCodes: ['subject_keyword'],
      requiresUserConfirmation: true,
    },
    thread: {
      rootMessageHash: 'root-message-hash',
      directReferenceCount: 1,
      relatedEmailCount: 3,
      referenceHashes: ['reference-message-hash'],
    },
    documentIds: [document.documentId, '11111111-1111-4111-8111-111111111202'],
    filedBy: '11111111-1111-4111-8111-111111112201',
    filedAt: '2026-06-18T02:20:00.000Z',
  },
  {
    filingId: '11111111-1111-4111-8111-111111112002',
    tenantId: document.tenantId,
    emailId: '11111111-1111-4111-8111-111111112102',
    matterId: document.matterId,
    subject: 'Unrelated matter filing',
    sentAt: '2026-06-18T02:30:00.000Z',
    hasOutsideParticipants: false,
    warningCodes: [],
    privilegeTagSuggestion: null,
    thread: {
      rootMessageHash: 'other-root-message-hash',
      directReferenceCount: 0,
      relatedEmailCount: 1,
      referenceHashes: [],
    },
    documentIds: ['11111111-1111-4111-8111-111111111299'],
    filedBy: '11111111-1111-4111-8111-111111112202',
    filedAt: '2026-06-18T02:40:00.000Z',
  },
] satisfies EmailMatterFilingDto[];

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
    const currentRelatedEmail = relatedEmails[0];
    if (!currentRelatedEmail) throw new Error('missing related email fixture');
    const html = renderToStaticMarkup(
      <DocumentActionCenter
        disableInitialLoad
        documentId={document.documentId}
        initialAuditEvents={auditEvents}
        initialDocument={document}
        initialTaxonomyCatalog={[
          {
            documentTypeCode: 'CONTRACT',
            canonicalDocumentType: 'contract',
            displayName: 'Tenant Contract',
            description: null,
            subtypes: [{ subtypeCode: 'MSA', displayName: 'Tenant MSA', status: 'active' }],
            metadataFields: [],
            versionNo: 4,
            updatedAt: '2026-06-20T00:00:00.000Z',
          },
        ]}
        initialRelatedEmails={relatedEmails}
        initialRelatedDocuments={relatedDocuments}
        initialVersions={versions}
      />,
    );

    expect(html).toContain('계약 검토 자료');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('PETRA Bridge Closing');
    expect(html).toContain('작업 우선순위');
    expect(html).toContain('읽기/다운로드 전용');
    expect(html).toContain('검토');
    expect(html).toContain('감사 다운로드');
    expect(html).toContain('사유 필수');
    expect(html).toContain('프로필 메타데이터');
    expect(html).toContain('버전 및 Records');
    expect(html).toContain('원본 파일을 직접 수정하는 작업은 별도 승인된 편집 계약 전까지 노출하지 않습니다.');
    expect(html).toContain('문서 프로필');
    expect(html).toContain('Tenant Contract');
    expect(html).toContain('미리보기');
    expect(html).toContain('다운로드 사유');
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
    expect(html).toContain('관련 문서');
    expect(html).toContain('2건');
    expect(html).toContain('Side Letter');
    expect(html).toContain('Due Diligence Memo');
    expect(html).toContain('동일 Matter에서 권한이 확인된 문서');
    expect(html).toContain('href="/documents/11111111-1111-4111-8111-111111111202"');
    expect(html).toContain('관련 이메일');
    expect(html).toContain('Closing checklist follow-up');
    expect(html).toContain('문서 2건');
    expect(html).toContain('관련 이메일 3건');
    expect(html).toContain('외부 참여자');
    expect(html).toContain('비밀특권 후보');
    expect(html).not.toContain('Unrelated matter filing');
    expect(html).toContain('보존 검토');
    expect(html).toContain('신청 가능');
    expect(html).toContain('보관 처리');
    expect(html).toContain('보관 준비');
    expect(html).toContain('폐기 검토');
    expect(html).toContain('검토 필요');
    expect(html).toContain('문서함 위치');
    expect(html).toContain('id="document-download"');
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
    expect(html).not.toContain(currentRelatedEmail.filingId);
    expect(html).not.toContain(currentRelatedEmail.emailId);
    expect(html).not.toContain(currentRelatedEmail.filedBy);
    expect(html).not.toContain('root-message-hash');
    expect(html).not.toContain('Open in Office');
    expect(html).not.toContain('check-out');
    expect(html).not.toContain('check-in');
  });

  it('renders a bounded empty state before document data is available', () => {
    const html = renderToStaticMarkup(
      <DocumentActionCenter disableInitialLoad documentId={document.documentId} />,
    );

    expect(html).toContain('표시 가능한 제목 없음');
    expect(html).not.toContain(document.documentId);
    expect(html).not.toContain(document.matterId);
  });

  it('derives related Matter documents without echoing the current document row', () => {
    expect(relatedMatterDocuments(relatedDocuments, document.documentId).map((item) => item.title)).toEqual([
      'Side Letter',
      'Due Diligence Memo',
    ]);
    expect(relatedMatterDocuments(relatedDocuments, document.documentId, 1)).toHaveLength(1);
  });

  it('derives related Matter emails only when the filing includes the current document', () => {
    expect(relatedMatterEmails(relatedEmails, document.documentId).map((item) => item.subject)).toEqual([
      'Closing checklist follow-up',
    ]);
    expect(relatedMatterEmails(relatedEmails, document.documentId, 0)).toHaveLength(0);
  });

  it('renders search hit context without carrying raw snippets into the document route', () => {
    const html = renderToStaticMarkup(
      <DocumentActionCenter
        disableInitialLoad
        documentId={document.documentId}
        initialDocument={document}
        initialVersions={versions}
        searchHitContext={{
          anchorId: 'vph-1-0-18',
          hitCount: 2,
          hitIndex: 1,
          source: 'search',
          target: 'body',
        }}
      />,
    );

    expect(html).toContain('검색 결과 문맥');
    expect(html).toContain('본문');
    expect(html).toContain('1 / 2');
    expect(html).toContain('hit 1/2');
    expect(html).toContain('다음 hit');
    expect(html).toContain(
      'href="/documents/11111111-1111-4111-8111-111111111201?from=search&amp;target=body&amp;hit=2&amp;hitCount=2"',
    );
    expect(html).toContain(
      'src="http://localhost:3001/v1/documents/11111111-1111-4111-8111-111111111201/preview#vault-preview-hit=1&amp;vault-preview-hit-count=2&amp;vault-preview-target=body&amp;vault-preview-anchor=vph-1-0-18"',
    );
    expect(html).toContain(
      '검색 hit 위치는 서버로 검색어 또는 스니펫을 보내지 않는 미리보기 fragment로만 연결됩니다.',
    );
    expect(html).toContain('검색으로 돌아가기');
    expect(html).not.toContain('authorized snippet');
    expect(html).not.toContain('search query');
  });

  it('parses bounded search hit context from route params only', () => {
    const params = new URLSearchParams({
      from: 'search',
      hit: '99',
      anchor: 'vph-1-0-18',
      hitCount: '2',
      q: 'do not carry raw query text',
      snippet: 'do not carry raw snippet',
      target: 'body',
    });

    expect(searchHitContextFromParams(params)).toEqual({
      anchorId: 'vph-1-0-18',
      hitCount: 2,
      hitIndex: 2,
      source: 'search',
      target: 'body',
    });
    params.set('anchor', 'raw query');
    expect(searchHitContextFromParams(params)).toEqual({
      hitCount: 2,
      hitIndex: 2,
      source: 'search',
      target: 'body',
    });
    expect(searchHitContextFromParams(new URLSearchParams())).toBeNull();
  });

  it('summarizes new-version upload receipts without raw refs', () => {
    const message = versionUploadStatusMessage({
      documentId: document.documentId,
      matterId: document.matterId,
      versionId: '11111111-1111-4111-8111-111111111901',
      versionNo: 3,
      versionStatus: 'current',
      fileObjectId: '11111111-1111-4111-8111-111111111902',
      sha256: 'a'.repeat(64),
      metadataSuggestion: {},
      duplicates: [
        {
          documentId: '11111111-1111-4111-8111-111111111903',
          fileObjectId: '11111111-1111-4111-8111-111111111904',
          sha256: 'b'.repeat(64),
        },
      ],
    });

    expect(message).toContain('v3 새 버전이 추가되었습니다.');
    expect(message).toContain('버전 목록, 감사 타임라인, 파일 정리 준비 상태를 갱신했습니다.');
    expect(message).toContain('중복 후보 1건이 감지되었습니다.');
    expect(message).not.toContain(document.documentId);
    expect(message).not.toContain(document.matterId);
    expect(message).not.toContain('11111111-1111-4111-8111-111111111901');
    expect(message).not.toContain('a'.repeat(64));
  });
});
