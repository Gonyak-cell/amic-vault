import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { BulkUploadBatchDto } from '@amic-vault/shared';
import {
  DocumentUploadPanel,
  UploadQueueReceipt,
  batchUploadStatusMessage,
  bulkUploadStatusMessage,
  normalizeUploadSourceRelativePath,
  parseUploadTags,
  quarantinedIntakeStatusMessage,
  uploadStatusMessage,
  uploadFileEntriesFromFiles,
  versionUploadStatusMessage,
} from './document-upload-panel';
import {
  defaultUploadMetadataProfile,
  UploadMetadataProfile,
  uploadMetadataProfileFields,
} from './upload-metadata-profile';
import type { MatterCodeOption } from '@/lib/matter-app';

vi.mock('@/lib/api-client', () => ({
  addDocumentVersion: vi.fn(),
  createUploadPreflight: vi.fn(),
  getBulkUploadBatch: vi.fn(),
  retryBulkUploadBatchItem: vi.fn(),
  stageBulkUploadBatch: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    variant?: string;
    size?: string;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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

describe('DocumentUploadPanel', () => {
  it('requires a selected Matter Code before rendering upload controls', () => {
    const html = renderToStaticMarkup(
      <DocumentUploadPanel selectedMatter={null} sourceMode="matter_app_api" />,
    );

    expect(html).toContain('Matter 코드를 먼저 선택해 주세요.');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('Matter ID');
  });

  it('blocks upload when the source is only a local projection fallback', () => {
    const html = renderToStaticMarkup(
      <DocumentUploadPanel selectedMatter={selectedMatter} sourceMode="vault_projection_only" />,
    );

    expect(html).toContain('업로드 가능 여부 확인 필요');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain(selectedMatter.matterReference);
  });

  it('renders upload controls only after an upload-authoritative Matter Code is selected', () => {
    const html = renderToStaticMarkup(
      <DocumentUploadPanel selectedMatter={selectedMatter} sourceMode="matter_app_api" />,
    );

    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('Investment Advisory');
    expect(html).toContain('type="file"');
    expect(html).toContain('multiple=""');
    expect(html).toContain('파일 및 폴더');
    expect(html).toContain('폴더');
    expect(html).toContain('태그');
    expect(html).toContain('업로드 분류 프로필');
    expect(html).toContain('문서 유형');
    expect(html).toContain('세부 유형');
    expect(html).toContain('보안 등급');
    expect(html).toContain('출처');
    expect(html).toContain('특권 상태');
    expect(html).toContain('버전 라벨');
    expect(html).toContain('버전 의미');
    expect(html).toContain('렌디션');
    expect(html).toContain('보존 조치');
    expect(html).toContain('Matter 및 기록 보존 정책 적용');
    expect(html).toContain('업로드');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('파일 정리 준비');
    expect(html).not.toContain(selectedMatter.matterReference);
    expect(html).not.toContain('법률 분석');
    expect(html).not.toContain('요약');
  });

  it('preserves browser folder paths and upload tags for B8 folder upload', () => {
    const file = new File(['signed'], 'draft.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'Deal Room/Signing/draft.pdf',
    });

    expect(normalizeUploadSourceRelativePath(' Deal Room\\Signing\\draft.pdf ')).toBe(
      'Deal Room/Signing/draft.pdf',
    );
    expect(uploadFileEntriesFromFiles([file])).toEqual([
      { file, sourceRelativePath: 'Deal Room/Signing/draft.pdf' },
    ]);
    expect(parseUploadTags(' executed, reviewed\nexecuted ')).toEqual(['executed', 'reviewed']);
  });

  it('keeps folder drag/drop and batch sourceRelativePaths wired in the upload surface', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('webkitdirectory');
    expect(source).toContain('webkitGetAsEntry');
    expect(source).toContain('sourceRelativePaths');
    expect(source).toContain('sourceRelativePath');
  });

  it('serializes upload metadata profile fields for the upload DTO', () => {
    expect(
      uploadMetadataProfileFields({
        ...defaultUploadMetadataProfile,
        confidentialityLevel: 'restricted',
        documentType: 'contract',
        privilegeStatus: 'work_product',
        subtype: ' 투자계약 ',
        aiAllowed: false,
      }),
    ).toEqual({
      aiAllowed: false,
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      privilegeStatus: 'work_product',
      renditionType: 'clean',
      source: 'internal_work_product',
      subtype: '투자계약',
      versionSignificance: 'internal_draft',
    });
  });

  it('renders tenant-approved upload taxonomy labels and subtypes', () => {
    const html = renderToStaticMarkup(
      <UploadMetadataProfile
        profile={{ ...defaultUploadMetadataProfile, documentType: 'contract' }}
        onChange={() => undefined}
        taxonomyCatalog={[
          {
            documentTypeCode: 'CONTRACT',
            canonicalDocumentType: 'contract',
            displayName: 'Tenant Contract',
            description: null,
            subtypes: [{ subtypeCode: 'MSA', displayName: 'Tenant MSA', status: 'active' }],
            metadataFields: [],
            versionNo: 2,
            updatedAt: '2026-06-20T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('Tenant Contract');
    expect(html).toContain('Tenant MSA');
  });

  it('makes post-upload file organization prep visible when the upload opted in', () => {
    expect(
      uploadStatusMessage({
        documentId: '11111111-1111-4111-8111-111111111114',
        matterId: '11111111-1111-4111-8111-111111111115',
        fileObjectId: '11111111-1111-4111-8111-111111111116',
        status: 'draft',
        title: '투자계약서.pdf',
        documentType: 'contract',
        subtype: null,
        confidentialityLevel: 'standard',
        privilegeStatus: 'none',
        source: 'internal_work_product',
        aiAllowed: true,
        versionLabel: null,
        versionSignificance: 'internal_draft',
        renditionType: 'clean',
        metadataSuggestion: {},
        duplicates: [
          {
            documentId: '11111111-1111-4111-8111-111111111117',
            fileObjectId: '11111111-1111-4111-8111-111111111118',
            sha256: 'a'.repeat(64),
          },
        ],
      }),
    ).toContain('파일 정리 준비가 자동으로 시작됩니다.');
    expect(
      uploadStatusMessage({
        documentId: '11111111-1111-4111-8111-111111111114',
        matterId: '11111111-1111-4111-8111-111111111115',
        fileObjectId: '11111111-1111-4111-8111-111111111116',
        status: 'draft',
        title: '투자계약서.pdf',
        documentType: 'contract',
        subtype: null,
        confidentialityLevel: 'standard',
        privilegeStatus: 'none',
        source: 'internal_work_product',
        aiAllowed: true,
        versionLabel: null,
        versionSignificance: 'internal_draft',
        renditionType: 'clean',
        metadataSuggestion: {},
        duplicates: [
          {
            documentId: '11111111-1111-4111-8111-111111111117',
            fileObjectId: '11111111-1111-4111-8111-111111111118',
            sha256: 'a'.repeat(64),
          },
        ],
      }),
    ).toContain('중복 후보 1건이 감지되었습니다.');
  });

  it('summarizes duplicate new-version upload receipts', () => {
    expect(
      versionUploadStatusMessage({
        documentId: '11111111-1111-4111-8111-111111111114',
        matterId: '11111111-1111-4111-8111-111111111115',
        versionId: '11111111-1111-4111-8111-111111111116',
        versionNo: 2,
        versionStatus: 'current',
        fileObjectId: '11111111-1111-4111-8111-111111111117',
        sha256: 'a'.repeat(64),
        versionLabel: 'v2.0',
        versionSignificance: 'client_sent',
        renditionType: 'clean',
        baseCleanVersionId: null,
        metadataSuggestion: {},
        duplicates: [
          {
            documentId: '11111111-1111-4111-8111-111111111118',
            fileObjectId: '11111111-1111-4111-8111-111111111119',
            sha256: 'b'.repeat(64),
          },
        ],
      }),
    ).toContain('v2 새 버전 추가 완료. 중복 후보 1건이 감지되었습니다.');
  });

  it('summarizes bulk upload partial failures without hiding failed files', () => {
    expect(bulkUploadStatusMessage(3, 0)).toBe('3개 업로드 완료.');
    expect(bulkUploadStatusMessage(2, 1)).toBe(
      '2개 업로드 완료, 1개 실패. 실패 항목을 확인해 주세요.',
    );
    expect(bulkUploadStatusMessage(0, 2)).toBe('2개 업로드 실패. 실패 항목을 확인해 주세요.');
    expect(bulkUploadStatusMessage(0, 0, 1)).toBe('1개 보안 검사 대기 중입니다.');
    expect(quarantinedIntakeStatusMessage()).toBe(
      '보안 검사가 완료될 때까지 문서함에 표시되지 않습니다.',
    );
  });

  it('summarizes server batch status and renders retry controls', () => {
    const batch: BulkUploadBatchDto = {
      batchId: '11111111-1111-4111-8111-111111111301',
      matterId: selectedMatter.matterReference,
      status: 'failed',
      totalItems: 3,
      pendingItems: 0,
      uploadedItems: 0,
      failedItems: 1,
      duplicateItems: 1,
      doneItems: 1,
      createdAt: '2026-07-04T00:00:00.000Z',
      updatedAt: '2026-07-04T00:00:00.000Z',
      items: [],
    };

    expect(batchUploadStatusMessage(batch)).toBe('1개 완료, 1개 실패, 1개 중복 확인 필요.');

    const html = renderToStaticMarkup(
      <UploadQueueReceipt
        selectedMatter={selectedMatter}
        queue={[
          {
            fileName: 'duplicate.pdf',
            message: 'DUPLICATE_DECISION_REQUIRED',
            status: 'duplicate',
            title: 'duplicate.pdf',
          },
        ]}
      />,
    );

    expect(html).toContain('중복 확인');
    expect(html).toContain('DUPLICATE_DECISION_REQUIRED');
  });

  it('renders uploaded document receipt actions without exposing Matter references as text', () => {
    const html = renderToStaticMarkup(
      <UploadQueueReceipt
        selectedMatter={selectedMatter}
        queue={[
          {
            documentId: '22222222-2222-4222-8222-222222222222',
            duplicateCount: 2,
            fileName: 'draft.pdf',
            message: '투자계약서.pdf 업로드 완료. 파일 정리 준비가 자동으로 시작됩니다.',
            status: 'uploaded',
            title: '투자계약서.pdf',
          },
        ]}
      />,
    );

    expect(html).toContain('업로드 진행 상태');
    expect(html).toContain('프로필, 버전, 처리 상태');
    expect(html).toContain('완료');
    expect(html).toContain('문서 열기');
    expect(html).toContain('전체 문서함');
    expect(html).toContain('Matter 문서함');
    expect(html).toContain('중복 후보 2건이 감지되었습니다.');
    expect(html).toContain(
      '/files?title=%ED%88%AC%EC%9E%90%EA%B3%84%EC%95%BD%EC%84%9C.pdf&amp;matterCode=AMIC-2026-0001',
    );
    expect(html).toContain('/files?matterCode=AMIC-2026-0001');
    expect(html).not.toContain(selectedMatter.matterReference);
  });
});
