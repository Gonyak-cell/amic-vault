import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { MatterCodePicker, mattersToOptions } from './matter-code-picker';

vi.mock('@/lib/api-client', () => ({
  listMatters: vi.fn(),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const matter = {
  matterId: '11111111-1111-4111-8111-111111111122',
  tenantId: '11111111-1111-4111-8111-111111111111',
  clientId: '11111111-1111-4111-8111-111111111133',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  matterType: 'advisory',
  status: 'active',
  openedAt: null,
  closedAt: null,
  leadLawyerId: null,
  practiceGroup: 'Finance',
  metadata: {},
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
      <MatterCodePicker selectedMatter={null} onMatterSelected={() => undefined} sourceMode="unconfigured" />,
    );

    expect(html).toContain('Matter app 연결 필요');
    expect(html).toContain('Matter Code 선택 후 시작됩니다.');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(matter.matterId);
  });

  it('renders a Matter Code search surface without direct reference entry', () => {
    const html = renderToStaticMarkup(
      <MatterCodePicker
        selectedMatter={null}
        onMatterSelected={() => undefined}
        sourceMode="vault_projection_only"
      />,
    );

    expect(html).toContain('Matter Code 또는 이름 검색');
    expect(html).toContain('로컬 Matter 목록');
    expect(html).toContain('운영 업로드 source로 사용하지 않습니다.');
    expect(html).not.toContain('Vault projection');
    expect(html).not.toContain('Matter ID');
  });

  it('maps matter list responses into picker options', () => {
    expect(mattersToOptions({ items: [matter], page: 1, pageSize: 20, totalCount: 1 }, 'matter_app_api')).toEqual([
      expect.objectContaining({
        matterCode: 'AMIC-2026-0001',
        matterName: 'Investment Advisory',
        practiceGroup: 'Finance',
        sourceMode: 'matter_app_api',
      }),
    ]);
  });
});
