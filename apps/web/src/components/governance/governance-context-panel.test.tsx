import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  AiPrepDocumentStatusDto,
  AiPrepMatterReadinessDto,
  DocumentDto,
  MatterDto,
} from '@amic-vault/shared';
import {
  DocumentGovernanceContextPanel,
  DocumentWorkflowOpsPanel,
  MatterGovernanceContextPanel,
  MatterWorkflowOpsPanel,
} from './governance-context-panel';

const document: DocumentDto = {
  createdAt: '2026-06-17T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111101',
  displayCode: 'DOC-001',
  displayName: 'Board minutes',
  documentFamilyId: '11111111-1111-4111-8111-111111111102',
  documentId: '11111111-1111-4111-8111-111111111103',
  documentType: 'memo',
  aiAllowed: true,
  legalHold: true,
  matterDisplayCode: 'AMIC-2026-001',
  matterDisplayName: 'Governance',
  matterId: '11111111-1111-4111-8111-111111111104',
  privilegeStatus: 'privileged',
  status: 'internal_review',
  subtype: null,
  tenantId: '11111111-1111-4111-8111-111111111105',
  title: 'Board minutes',
  confidentialityLevel: 'restricted',
  extractionMethod: 'ocr_required',
  extractionStatus: 'ocr_pending',
  extractionConfidence: null,
  updatedAt: '2026-06-17T01:00:00.000Z',
};

const prepStatus: AiPrepDocumentStatusDto = {
  artifacts: [],
  documentId: document.documentId,
  readinessStatus: 'pending',
  versionId: null,
};

const matter: MatterDto = {
  clientId: '11111111-1111-4111-8111-111111111106',
  createdAt: '2026-06-17T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111107',
  displayCode: 'AMIC-2026-001',
  displayName: 'Governance',
  legalHold: true,
  leadLawyerDisplayEmail: 'lead@amic.kr',
  leadLawyerDisplayName: 'Lead Lawyer',
  leadLawyerId: '11111111-1111-4111-8111-111111111108',
  matterCode: 'AMIC-2026-001',
  matterId: document.matterId,
  matterName: 'Governance',
  matterType: 'advisory',
  metadata: {},
  openedAt: '2026-06-17',
  closedAt: null,
  practiceGroup: 'AMIC_LAW_GROUP',
  status: 'active',
  tenantId: document.tenantId,
  updatedAt: '2026-06-17T01:00:00.000Z',
};

const readiness: AiPrepMatterReadinessDto = {
  blockedArtifactCount: 0,
  blockedDocumentCount: 0,
  currentVersionCount: 1,
  documentCount: 1,
  documents: [],
  failedDocumentCount: 1,
  fallbackArtifactCount: 0,
  matterId: matter.matterId,
  notReadyDocumentCount: 0,
  partialDocumentCount: 0,
  pendingDocumentCount: 1,
  pendingJobCount: 1,
  readyDocumentCount: 0,
  rejectedArtifactCount: 0,
  rejectedDocumentCount: 0,
  staleArtifactCount: 0,
  staleDocumentCount: 0,
};

describe('governance context panels', () => {
  it('renders document governance and workflow from real status fields only', () => {
    const html = renderToStaticMarkup(
      <>
        <DocumentGovernanceContextPanel document={document} prepStatus={prepStatus} />
        <DocumentWorkflowOpsPanel document={document} prepStatus={prepStatus} />
      </>,
    );

    expect(html).toContain('정책 관리 상태');
    expect(html).toContain('Legal Hold');
    expect(html).toContain('본문 추출 대기');
    expect(html).toContain('파일 정리 준비');
    expect(html).not.toContain('legal analysis');
    expect(html).not.toContain('summary');
    expect(html).not.toContain('raw prompt');
    expect(html).not.toContain('source text');
  });

  it('renders matter governance and queue without fake task counts', () => {
    const html = renderToStaticMarkup(
      <>
        <MatterGovernanceContextPanel matter={matter} readiness={readiness} />
        <MatterWorkflowOpsPanel matter={matter} readiness={readiness} />
      </>,
    );

    expect(html).toContain('Matter 관리 상태');
    expect(html).toContain('AMIC-2026-001');
    expect(html).toContain('파일 정리 준비 실패 확인');
    expect(html).toContain('추가로 확인할 작업이 없습니다.');
    expect(html).not.toContain('가짜 작업');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('김민준');
  });
});
