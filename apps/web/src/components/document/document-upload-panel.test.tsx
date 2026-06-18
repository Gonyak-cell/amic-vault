import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DocumentUploadPanel } from './document-upload-panel';
import type { MatterCodeOption } from '@/lib/matter-app';

vi.mock('@/lib/api-client', () => ({
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

const selectedMatter: MatterCodeOption = {
  matterReference: '11111111-1111-4111-8111-111111111122',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
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
    expect(html).toContain('업로드');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('파일 정리 준비');
    expect(html).not.toContain(selectedMatter.matterReference);
  });
});
