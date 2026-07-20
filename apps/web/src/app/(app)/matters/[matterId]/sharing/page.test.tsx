import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  ExternalLinkCreatedResponseDto,
  ExternalLinkDto,
  ExternalManagementWorkspaceDto,
  ExternalQaMessageDto,
  ExternalUserDto,
  ExternalWorkspaceDto,
  MatterDto,
} from '@amic-vault/shared';
import { ApiClientError } from '@/lib/api-client';
import {
  createExternalLinkAfterDlpAcceptance,
  ExternalDlpWarningDialog,
  isExternalDlpWarningRequired,
  externalDlpOverrideReasonCode,
} from '@/components/external/link-issuance-dialog';
import { ExternalSharingClient, type ExternalSharingApi } from './sharing-client';

const matterId = '11111111-1111-4111-8111-111111111122';
const workspaceId = '11111111-1111-4111-8111-111111111123';
const externalUserId = '11111111-1111-4111-8111-111111111124';
const linkId = '11111111-1111-4111-8111-111111111125';
const documentId = '11111111-1111-4111-8111-111111111126';
const messageId = '11111111-1111-4111-8111-111111111127';
const hash = 'a'.repeat(64);

describe('Matter sharing page', () => {
  it('renders workspace, invite, link, revoke, and Q&A inbox surfaces', () => {
    const html = renderToStaticMarkup(
      <ExternalSharingClient
        matterId={matterId}
        disableInitialLoad
        initialMatter={matterFixture()}
        initialWorkspaces={[workspaceFixture()]}
        api={apiFixture()}
      />,
    );

    expect(html).toContain('외부 공유');
    expect(html).toContain('워크스페이스');
    expect(html).toContain('외부 사용자');
    expect(html).toContain('링크');
    expect(html).toContain('Q&amp;A 인박스');
    expect(html).toContain('Clean Room');
    expect(html).toContain('Recipient Ref');
    expect(html).toContain(documentId);
    expect(html).toContain('회수');
    expect(html).not.toContain('x'.repeat(43));
  });

  it('keeps DLP warning acceptance as the only path to a retry', async () => {
    const createLink = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_FAILED',
          reason: 'EXTERNAL_DLP_WARNING_REQUIRED',
        }),
      )
      .mockResolvedValueOnce(linkCreatedFixture());
    const input = {
      workspaceId,
      externalUserId,
      documentId,
      expiresAt: '2026-07-01T00:00:00.000Z',
      ndaVersion: 'NDA-R11-V1',
      watermarkRequired: true,
      dlpWarningAccepted: false,
    };

    let caught: unknown;
    try {
      await createLink(input);
    } catch (error) {
      caught = error;
    }
    expect(isExternalDlpWarningRequired(caught)).toBe(true);
    expect(createLink).toHaveBeenCalledTimes(1);

    const modalHtml = renderToStaticMarkup(
      <ExternalDlpWarningDialog
        message="선택한 문서에 외부 송부 전 확인이 필요한 DLP 결과가 있습니다."
        onAccept={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(modalHtml).toContain('DLP 경고 수용');
    expect(modalHtml).toContain('경고 수용 후 발급');

    await createExternalLinkAfterDlpAcceptance(input, createLink);
    expect(createLink).toHaveBeenLastCalledWith({
      ...input,
      dlpWarningAccepted: true,
      dlpOverrideReasonCode: externalDlpOverrideReasonCode,
    });
  });

  it('supports the mocked workspace to invite to link to revoke flow', async () => {
    const api = apiFixture();

    const workspace = await api.createWorkspace({
      matterId,
      workspaceCode: 'EXT-ROOM',
      displayRef: 'Clean Room',
      expiresAt: '2026-07-01T00:00:00.000Z',
    });
    const user = await api.createUser({
      workspaceId: workspace.workspaceId,
      emailHash: hash,
      displayRef: 'Recipient Ref',
    });
    const link = await api.createLink({
      workspaceId: workspace.workspaceId,
      externalUserId: user.externalUserId,
      documentId,
      expiresAt: '2026-07-01T00:00:00.000Z',
      ndaVersion: 'NDA-R11-V1',
      watermarkRequired: true,
      dlpWarningAccepted: false,
    });
    const revoked = await api.revokeLink(link.link.linkId);

    expect(workspace.workspaceId).toBe(workspaceId);
    expect(user.externalUserId).toBe(externalUserId);
    expect(link.link.documentId).toBe(documentId);
    expect(revoked.status).toBe('revoked');
  });
});

function apiFixture(): ExternalSharingApi {
  return {
    createAnswer: async () => answerFixture(),
    createLink: async () => linkCreatedFixture(),
    createUser: async () => userFixture(),
    createWorkspace: async () => workspaceFixture(),
    getMatter: async () => matterFixture(),
    listQa: async () => ({ messages: [questionFixture()] }),
    listWorkspaces: async () => ({ workspaces: [workspaceFixture()] }),
    reviewAnswer: async () => ({ ...answerFixture(), status: 'published', reviewedAt: '2026-06-01T00:05:00.000Z' }),
    revokeLink: async () => ({ ...linkFixture(), status: 'revoked' }),
  };
}

function matterFixture(): MatterDto {
  return {
    clientId: '11111111-1111-4111-8111-111111111111',
    confidentialityLevel: 'standard',
    conflictsStatus: 'cleared',
    createdAt: '2026-06-18T00:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111112',
    displayName: '계약 검토',
    ethicalWallActive: false,
    leadAssociateId: null,
    leadLawyerId: null,
    leadPartnerId: null,
    legalHold: false,
    matterCode: 'AMIC-2026-0007',
    matterId,
    matterName: '계약 검토',
    matterType: 'advisory',
    metadata: {},
    openedAt: '2026-06-01T00:00:00.000Z',
    closedAt: null,
    practiceGroup: 'AMIC_LAW_GROUP',
    safeLabel: '계약 검토',
    status: 'open',
    tenantId: '11111111-1111-4111-8111-111111111100',
    updatedAt: '2026-06-18T01:00:00.000Z',
  };
}

function workspaceBase(): ExternalWorkspaceDto {
  return {
    workspaceId,
    matterId,
    workspaceCode: 'EXT-ROOM',
    displayRef: 'Clean Room',
    status: 'active',
    expiresAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function userFixture(): ExternalUserDto {
  return {
    externalUserId,
    emailHash: hash,
    displayRef: 'Recipient Ref',
    status: 'active',
    workspaceId,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function linkFixture(): ExternalLinkDto {
  return {
    linkId,
    workspaceId,
    externalUserId,
    documentId,
    versionId: null,
    status: 'active',
    expiresAt: '2026-07-01T00:00:00.000Z',
    ndaRequired: true,
    watermarkRequired: true,
    dlpWarningStatus: 'not_required',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function linkCreatedFixture(): ExternalLinkCreatedResponseDto {
  return { link: linkFixture(), linkToken: 'x'.repeat(43) };
}

function workspaceFixture(): ExternalManagementWorkspaceDto {
  return {
    ...workspaceBase(),
    users: [userFixture()],
    links: [linkFixture()],
  };
}

function questionFixture(): ExternalQaMessageDto {
  return {
    messageId,
    workspaceId,
    linkId,
    externalUserId,
    parentMessageId: null,
    direction: 'external_question',
    messageText: 'Please clarify item 1.',
    messageHash: hash,
    status: 'published',
    visibilityScope: 'workspace',
    reviewedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

function answerFixture(): ExternalQaMessageDto {
  return {
    ...questionFixture(),
    messageId: '11111111-1111-4111-8111-111111111128',
    parentMessageId: messageId,
    direction: 'internal_answer',
    messageText: 'Bounded answer.',
    status: 'pending_approval',
    visibilityScope: 'asker_only',
  };
}
