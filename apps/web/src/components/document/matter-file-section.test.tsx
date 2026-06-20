import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { MatterFileSection } from './matter-file-section';

vi.mock('@/lib/api-client', () => ({
  addDocumentVersion: vi.fn(),
  createUploadPreflight: vi.fn(),
  listMatterDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
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

describe('MatterFileSection', () => {
  it('renders matter filing context, browse, and upload without raw reference labels', () => {
    const html = renderToStaticMarkup(
      <MatterFileSection matter={matter} sourceMode="matter_app_api" />,
    );

    expect(html).toContain('파일링 기준');
    expect(html).toContain('Matter 메타데이터');
    expect(html).toContain('업무 그룹');
    expect(html).toContain('Finance');
    expect(html).toContain('Matter 원장');
    expect(html).toContain('Matter app 확인됨');
    expect(html).toContain('파일링 모델');
    expect(html).toContain('Matter 메타데이터 기준');
    expect(html).toContain('폴더 모델');
    expect(html).toContain('미적용');
    expect(html).toContain('파일');
    expect(html).toContain('Matter 범위 목록');
    expect(html).toContain('파일 업로드');
    expect(html).toContain('Matter Code 확인 후 업로드');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('Investment Advisory');
    expect(html).toContain('type="file"');
    expect(html).not.toContain('Matter app API');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(matter.matterId);
  });
});
