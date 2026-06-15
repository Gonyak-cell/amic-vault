import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { DocumentPermissionPanel } from './document-permission-panel';

describe('DocumentPermissionPanel', () => {
  it('renders the current confidentiality level without leaking server-only policy details', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <DocumentPermissionPanel
          summary={{
            documentId: '11111111-1111-4111-8111-111111111177',
            title: 'Draft',
            status: 'draft',
            confidentialityLevel: 'high',
            privilegeStatus: 'privileged',
          }}
        />
      </LanguageProvider>,
    );
    expect(html).toContain('접근 권한');
    expect(html).toContain('높음');
    expect(html).not.toContain('Confidentiality');
    expect(html).not.toContain('PermissionService');
  });
});
