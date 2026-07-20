import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PartyDto } from '@amic-vault/shared';
import {
  buildCreatePartyInput,
  buildUpdatePartyInput,
  MatterPartyPanelView,
} from './matter-party-panel';

const visibleParty = {
  createdAt: '2026-07-02T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111101',
  isRestricted: false,
  matterId: '11111111-1111-4111-8111-111111111122',
  name: 'Hanbit Electronics',
  partyId: '11111111-1111-4111-8111-111111111144',
  partyRole: 'counterparty',
  partyType: 'corporation',
  relatedClientId: null,
  tenantId: '11111111-1111-4111-8111-111111111100',
} satisfies PartyDto;

const restrictedParty = {
  ...visibleParty,
  isRestricted: true,
  name: '서울제약 비공개 상대방',
  partyId: '11111111-1111-4111-8111-111111111155',
  partyRole: 'opposing_counsel',
  partyType: 'individual',
} satisfies PartyDto;

describe('MatterPartyPanelView', () => {
  it('renders parties while masking restricted party names', () => {
    const html = renderToStaticMarkup(
      <MatterPartyPanelView
        form={{ name: '', partyRole: 'counterparty', partyType: 'corporation' }}
        loadStatus="ready"
        matterStatus="active"
        parties={[visibleParty, restrictedParty]}
        submitState="idle"
        onRestrictionChange={() => undefined}
      />,
    );

    expect(html).toContain('당사자');
    expect(html).toContain('Hanbit Electronics');
    expect(html).toContain('상대방');
    expect(html).toContain('제한 당사자');
    expect(html).toContain('이름 비공개');
    expect(html).toContain('상대방 대리인');
    expect(html).toContain('관리');
    expect(html).toContain('수정');
    expect(html).toContain('제한 표시');
    expect(html).toContain('제한 해제');
    expect(html).not.toContain(restrictedParty.name);
  });

  it('renders an edit form for visible parties without exposing restricted party names', () => {
    const html = renderToStaticMarkup(
      <MatterPartyPanelView
        editForm={{
          name: visibleParty.name,
          partyId: visibleParty.partyId,
          partyRole: 'counterparty',
          partyType: 'corporation',
        }}
        form={{ name: '', partyRole: 'counterparty', partyType: 'corporation' }}
        loadStatus="ready"
        matterStatus="active"
        parties={[visibleParty, restrictedParty]}
        submitState="idle"
        onCancelEdit={() => undefined}
        onEditFormChange={() => undefined}
        onEditSubmit={() => undefined}
        onStartEdit={() => undefined}
      />,
    );

    expect(html).toContain('당사자 수정');
    expect(html).toContain('수정 저장');
    expect(html).toContain('취소');
    expect(html).toContain('수정할 당사자 이름');
    expect(html).not.toContain('당사자 추가</h3>');
    expect(html).not.toContain(restrictedParty.name);
  });

  it('disables new party entry and restriction updates for closed matters', () => {
    const html = renderToStaticMarkup(
      <MatterPartyPanelView
        form={{ name: '새 당사자', partyRole: 'counterparty', partyType: 'corporation' }}
        loadStatus="empty"
        matterStatus="closed"
        parties={[visibleParty]}
        submitState="idle"
        onRestrictionChange={() => undefined}
      />,
    );

    expect(html).toContain('종료된 Matter에서는 추가·제한 변경을 할 수 없습니다.');
    expect(html).toContain('제한 표시');
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('renders restriction update feedback for an individual party row', () => {
    const html = renderToStaticMarkup(
      <MatterPartyPanelView
        form={{ name: '', partyRole: 'counterparty', partyType: 'corporation' }}
        loadStatus="ready"
        matterStatus="active"
        parties={[visibleParty, restrictedParty]}
        restrictionState={{
          [visibleParty.partyId]: 'updating',
          [restrictedParty.partyId]: 'error',
        }}
        submitState="idle"
        onRestrictionChange={() => undefined}
      />,
    );

    expect(html).toContain('변경 중');
    expect(html).toContain('변경 실패');
  });

  it('builds trimmed create-party input with the shared schema', () => {
    expect(
      buildCreatePartyInput({
        name: '  Hanbit Electronics  ',
        partyRole: 'counterparty',
        partyType: 'corporation',
      }),
    ).toEqual({
      name: 'Hanbit Electronics',
      partyRole: 'counterparty',
      partyType: 'corporation',
    });

    expect(() =>
      buildCreatePartyInput({
        name: ' ',
        partyRole: 'counterparty',
        partyType: 'corporation',
      }),
    ).toThrow();
  });

  it('builds trimmed update-party input with the shared schema', () => {
    expect(
      buildUpdatePartyInput({
        name: '  Hanbit Holdings  ',
        partyId: visibleParty.partyId,
        partyRole: 'witness',
        partyType: 'individual',
      }),
    ).toEqual({
      name: 'Hanbit Holdings',
      partyRole: 'witness',
      partyType: 'individual',
    });

    expect(() =>
      buildUpdatePartyInput({
        name: ' ',
        partyId: visibleParty.partyId,
        partyRole: 'counterparty',
        partyType: 'corporation',
      }),
    ).toThrow();
  });
});
