import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VaultActivityClient } from './vault-activity-client';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

describe('VaultActivityClient', () => {
  it('renders a matter activity console with reference-only security evidence', () => {
    const html = renderToStaticMarkup(<VaultActivityClient />);

    expect(html).toContain('Cobalt M&amp;A Data Room');
    expect(html).toContain('Event Stream');
    expect(html).toContain('DOCUMENT_VIEWED');
    expect(html).toContain('AI_POLICY_BLOCKED');
    expect(html).toContain('body_logged');
    expect(html).toContain('false');
    expect(html).not.toContain('Amplitude');
    expect(html).not.toContain('Request a demo');
  });
});
