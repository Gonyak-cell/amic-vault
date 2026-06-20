import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DocumentUploadPanel,
  UploadQueueReceipt,
  bulkUploadStatusMessage,
  uploadStatusMessage,
  versionUploadStatusMessage,
} from './document-upload-panel';
import {
  defaultUploadMetadataProfile,
  uploadMetadataProfileFields,
} from './upload-metadata-profile';
import type { MatterCodeOption } from '@/lib/matter-app';

vi.mock('@/lib/api-client', () => ({
  addDocumentVersion: vi.fn(),
  createUploadPreflight: vi.fn(),
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

    expect(html).toContain('Matter Code를 먼저 선택해 주세요.');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('Matter ID');
  });

  it('blocks upload when the source is only a local projection fallback', () => {
    const html = renderToStaticMarkup(
      <DocumentUploadPanel selectedMatter={selectedMatter} sourceMode="vault_projection_only" />,
    );

    expect(html).toContain('업로드 source 확인 필요');
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
    expect(html).toContain('업로드 분류 프로필');
    expect(html).toContain('문서 유형');
    expect(html).toContain('세부 유형');
    expect(html).toContain('보안 등급');
    expect(html).toContain('특권 상태');
    expect(html).toContain('보존/hold');
    expect(html).toContain('Matter/Records 정책 적용');
    expect(html).toContain('업로드');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('파일 정리 준비');
    expect(html).not.toContain(selectedMatter.matterReference);
    expect(html).not.toContain('법률 분석');
    expect(html).not.toContain('요약');
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
      subtype: '투자계약',
    });
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
        aiAllowed: true,
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
        aiAllowed: true,
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

    expect(html).toContain('업로드 큐');
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
