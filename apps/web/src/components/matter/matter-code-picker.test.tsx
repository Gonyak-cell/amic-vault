import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { findMatterCodeOption, MatterCodePicker, mattersToOptions } from './matter-code-picker';

vi.mock('@/lib/api-client', () => ({
  lookupMatterAppMatters: vi.fn(),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const matter = {
  matterId: '11111111-1111-4111-8111-111111111122',
  tenantId: '11111111-1111-4111-8111-111111111111',
  clientId: '11111111-1111-4111-8111-111111111133',
  confidentialityLevel: 'standard',
  conflictsStatus: 'cleared',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  matterType: 'advisory',
  status: 'active',
  openedAt: null,
  closedAt: null,
  ethicalWallActive: false,
  leadAssociateId: null,
  leadLawyerId: null,
  leadPartnerId: null,
  practiceGroup: 'Finance',
  metadata: { clientDisplayName: 'AMIC Client' },
  legalHold: false,
  createdBy: '11111111-1111-4111-8111-111111111101',
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  displayName: 'Investment Advisory',
  safeLabel: 'Investment Advisory',
  canViewSensitiveRef: false,
} satisfies MatterDto;

describe('MatterCodePicker', () => {
  it('fails closed when the Matter app source is not configured', () => {
    const html = renderToStaticMarkup(
      <MatterCodePicker
        selectedMatter={null}
        onMatterSelected={() => undefined}
        sourceMode="unconfigured"
      />,
    );

    expect(html).toContain('Matter 관리 시스템 연결 필요');
    expect(html).toContain('Matter 코드를 선택한 뒤 작업을 진행합니다.');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(matter.matterId);
  });

  it('renders a Matter Code search surface without direct reference entry', () => {
    const html = renderToStaticMarkup(
      <MatterCodePicker
        initialMatterCode="AMIC-2026-0001"
        selectedMatter={null}
        onMatterSelected={() => undefined}
        sourceMode="vault_projection_only"
      />,
    );

    expect(html).toContain('Matter 코드, Matter 이름 또는 고객 검색');
    expect(html).toContain('value="AMIC-2026-0001"');
    expect(html).toContain('로컬 Matter 목록');
    expect(html).toContain('실제 업로드에는 사용하지 않습니다.');
    expect(html).not.toContain('Vault projection');
    expect(html).not.toContain('Matter ID');
  });

  it('maps matter list responses into picker options', () => {
    expect(
      mattersToOptions({ items: [matter], page: 1, pageSize: 20, totalCount: 1 }, 'matter_app_api'),
    ).toEqual([
      expect.objectContaining({
        matterCode: 'AMIC-2026-0001',
        matterName: 'Investment Advisory',
        clientDisplayName: 'AMIC Client',
        practiceGroup: 'Finance',
        sourceMode: 'matter_app_api',
      }),
    ]);
  });

  it('finds URL-provided Matter Code options without exposing direct refs as labels', () => {
    const options = mattersToOptions(
      { items: [matter], page: 1, pageSize: 20, totalCount: 1 },
      'matter_app_api',
    );
    const option = options[0];
    if (!option) throw new Error('missing matter code option fixture');

    expect(findMatterCodeOption(options, ' amic-2026-0001 ')).toEqual(option);
    expect(findMatterCodeOption(options, matter.matterId)).toBeNull();
  });

  it('rejects URL-provided Vault internal references from the picker UI', () => {
    const html = renderToStaticMarkup(
      <MatterCodePicker
        initialMatterCode={matter.matterId}
        selectedMatter={null}
        onMatterSelected={() => undefined}
        sourceMode="vault_projection_only"
      />,
    );

    expect(html).toContain('Matter 코드 또는 Matter 이름으로 검색해 주세요.');
    expect(html).toContain('일반 문서 작업에서는 Matter 코드 또는 Matter 이름으로만 선택합니다.');
    expect(html).not.toContain(`value="${matter.matterId}"`);
    expect(html).not.toContain(matter.matterId);
  });
});
