import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MatterDocumentList, formatDate } from './matter-document-list';
import type { MatterCodeOption } from '@/lib/matter-app';

vi.mock('@/lib/api-client', () => ({
  listMatterDocuments: vi.fn(),
}));

const selectedMatter: MatterCodeOption = {
  matterReference: '11111111-1111-4111-8111-111111111122',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  practiceGroup: 'Finance',
  sourceMode: 'matter_app_api',
  status: 'active',
};

describe('MatterDocumentList', () => {
  it('waits for a Matter Code before rendering file rows', () => {
    const html = renderToStaticMarkup(<MatterDocumentList selectedMatter={null} />);

    expect(html).toContain('Matter Code를 선택하면 파일 목록이 표시됩니다.');
    expect(html).not.toContain('DOC-');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(selectedMatter.matterReference);
  });

  it('renders a bounded empty state before client-side loading starts', () => {
    const html = renderToStaticMarkup(<MatterDocumentList selectedMatter={selectedMatter} />);

    expect(html).toContain('표시할 파일이 없습니다.');
    expect(html).not.toContain(selectedMatter.matterReference);
  });

  it('formats updated timestamps for file lists', () => {
    expect(formatDate('2026-06-18T04:00:00.000Z')).toContain('2026');
  });
});
