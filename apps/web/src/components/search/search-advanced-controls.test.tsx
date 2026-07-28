import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { enterpriseDmsSearchRefinerFieldKeys } from '@amic-vault/shared';
import { SearchAdvancedControls } from './search-advanced-controls';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string;
    variant?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('SearchAdvancedControls', () => {
  it('starts collapsed with an active-condition count and no raw id prompts', () => {
    const allRefinerKeys = new Set(enterpriseDmsSearchRefinerFieldKeys);
    const html = renderToStaticMarkup(
      <SearchAdvancedControls
        approvedRefinerKeys={allRefinerKeys}
        busy={false}
        selection={{
          clientName: 'AMIC',
          confidentialityLevel: 'restricted',
          dateRange: 'last_30_days',
          documentType: 'contract',
          extractionStatus: 'ocr_pending',
          groupBy: 'matter',
          legalHold: 'document_hold',
          matterCode: 'AMIC-2026-0007',
          matterName: 'Vault Upgrade',
          privilegeStatus: 'privileged',
          recordsStatus: 'archived',
          sortBy: 'updated_desc',
          target: 'body',
          title: 'closing',
          versionStatus: 'current',
        }}
        taxonomyCatalog={[
          {
            documentTypeCode: 'CONTRACT',
            canonicalDocumentType: 'contract',
            displayName: 'Tenant Contract',
            description: null,
            subtypes: [],
            metadataFields: [],
            versionNo: 3,
            updatedAt: '2026-06-20T00:00:00.000Z',
          },
        ]}
        onApply={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(html).toContain('검색 필터');
    expect(html).toContain('검색 조건');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('15개');
    expect(html).not.toContain('검색 범위');
    expect(html).not.toContain('검색식 도움말');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('Client ID');
    expect(html).not.toContain('Document ID');
  });
});
