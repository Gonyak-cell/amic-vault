import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocumentPermissionPanel } from './document-permission-panel';

describe('DocumentPermissionPanel', () => {
  it('renders the current confidentiality level without leaking server-only policy details', () => {
    const html = renderToStaticMarkup(
      <DocumentPermissionPanel
        summary={{
          documentId: '11111111-1111-4111-8111-111111111177',
          title: 'Draft',
          status: 'draft',
          confidentialityLevel: 'high',
          privilegeStatus: 'privileged',
        }}
      />,
    );
    expect(html).toContain('Permissions');
    expect(html).toContain('high');
    expect(html).not.toContain('PermissionService');
  });
});
