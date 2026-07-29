import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  MatterClosingBinderDto,
  MatterClosingChecklistDto,
  MatterDto,
} from '@amic-vault/shared';
import { MatterClosingChecklistPanelView } from './matter-closing-checklist-panel';

const matter = {
  accessScope: 'restricted',
  matterId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  clientId: '33333333-3333-4333-8333-333333333333',
  clientDisplayName: 'AMIC 고객',
  confidentialityLevel: 'high',
  matterCode: 'AMIC-LIT-001',
  matterName: '종료 체크리스트 테스트',
  matterType: 'litigation',
  status: 'closing',
  conflictsStatus: 'cleared',
  openedAt: '2026-07-01',
  closedAt: null,
  leadLawyerId: null,
  leadPartnerId: null,
  leadAssociateId: null,
  practiceGroup: '송무',
  metadata: {},
  legalHold: false,
  ethicalWallActive: false,
  createdBy: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies MatterDto;

const checklist = {
  matterId: matter.matterId,
  complete: false,
  items: [
    {
      checklistItemId: '55555555-5555-4555-8555-555555555555',
      matterId: matter.matterId,
      itemCode: 'legal_hold_clear',
      status: 'pending',
      reasonCode: 'active_legal_hold',
      evidenceRef: 'legal_hold:active',
      waivedBy: null,
      waivedReason: null,
      evaluatedAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
    {
      checklistItemId: '66666666-6666-4666-8666-666666666666',
      matterId: matter.matterId,
      itemCode: 'official_final_version',
      status: 'passed',
      reasonCode: 'official_final_found',
      evidenceRef: 'document:final_or_execution_copy',
      waivedBy: null,
      waivedReason: null,
      evaluatedAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
  ],
} satisfies MatterClosingChecklistDto;

const binder = {
  closingBinderId: '77777777-7777-4777-8777-777777777777',
  matterId: matter.matterId,
  status: 'finalized',
  manifestSha256: 'a'.repeat(64),
  recordsArchiveCount: 1,
  createdBy: matter.createdBy,
  finalizedBy: matter.createdBy,
  finalizedAt: '2026-07-02T00:00:00.000Z',
  createdAt: '2026-07-02T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
  manifest: {
    schemaVersion: 1,
    matterId: matter.matterId,
    generatedAt: '2026-07-02T00:00:00.000Z',
    items: [
      {
        itemId: '88888888-8888-4888-8888-888888888888',
        itemType: 'execution_copy',
        title: 'Execution Copy Agreement',
        sha256: 'b'.repeat(64),
        documentId: '99999999-9999-4999-8999-999999999999',
        versionId: '88888888-8888-4888-8888-888888888888',
        versionLabel: 'Execution',
        emailId: null,
        sourceRef: 'document_version:88888888-8888-4888-8888-888888888888',
      },
    ],
  },
} satisfies MatterClosingBinderDto;

describe('MatterClosingChecklistPanelView', () => {
  it('shows pending reasons and waiver controls before a Matter can close', () => {
    const html = renderToStaticMarkup(
      <MatterClosingChecklistPanelView
        actionState="idle"
        checklist={checklist}
        loadStatus="ready"
        matter={matter}
        waiverReasons={{ legal_hold_clear: '보존 제한 해제 예정' }}
      />,
    );

    expect(html).toContain('종결 체크리스트');
    expect(html).toContain('활성 보존 제한이 남아 있습니다.');
    expect(html).toContain('근거: 참조 ••••ldactive');
    expect(html).not.toContain('legal_hold:active');
    expect(html).toContain('예외 사유');
    expect(html).toContain('종료 확정');
  });

  it('shows passed and waived checklist completion as close-ready', () => {
    const html = renderToStaticMarkup(
      <MatterClosingChecklistPanelView
        actionState="idle"
        checklist={{
          ...checklist,
          complete: true,
          items: checklist.items.map((item) =>
            item.itemCode === 'legal_hold_clear'
              ? {
                  ...item,
                  status: 'waived',
                  reasonCode: 'waived_by_authorized_user',
                  evidenceRef: 'waiver:legal_hold_clear',
                  waivedReason: '보존 제한 없음 확인 후 예외 처리',
                }
              : item,
          ),
        }}
        loadStatus="ready"
        matter={matter}
        waiverReasons={{}}
      />,
    );

    expect(html).toContain('모든 항목이 통과 또는 예외 처리되었습니다.');
    expect(html).toContain('예외');
    expect(html).toContain('닫기 가능');
  });

  it('shows closing binder contents and manifest downloads', () => {
    const html = renderToStaticMarkup(
      <MatterClosingChecklistPanelView
        actionState="idle"
        binder={binder}
        binderCsvHref="/v1/matters/fixture/closing-binder/manifest?format=csv"
        binderJsonHref="/v1/matters/fixture/closing-binder/manifest?format=json"
        binderLoadStatus="ready"
        checklist={{ ...checklist, complete: true }}
        loadStatus="ready"
        matter={{ ...matter, status: 'closed', closedAt: '2026-07-02T00:00:00.000Z' }}
        waiverReasons={{}}
      />,
    );

    expect(html).toContain('종결 문서철');
    expect(html).toContain('체결본');
    expect(html).toContain('Execution Copy Agreement');
    expect(html).toContain('보관 1건');
    expect(html).toContain('format=json');
    expect(html).toContain('format=csv');
  });
});
