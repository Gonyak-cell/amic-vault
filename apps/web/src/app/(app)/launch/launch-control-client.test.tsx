import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LaunchControlClient } from './launch-control-client';

describe('LaunchControlClient', () => {
  it('renders a read-only launch control surface with blocked approval gates', () => {
    const html = renderToStaticMarkup(<LaunchControlClient />);

    expect(html).toContain('Launch Control');
    expect(html).toContain('technical green');
    expect(html).toContain('approval blocked');
    expect(html).toContain('pnpm launch:execution');
    expect(html).toContain('LRB-001/002/003/004/008');
    expect(html).toContain('Production release');
    expect(html).not.toContain('Deploy now');
    expect(html).not.toContain('Request approval');
  });
});
