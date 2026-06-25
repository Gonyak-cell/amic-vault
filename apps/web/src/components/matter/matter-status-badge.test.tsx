import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { matterStatuses } from '@amic-vault/shared';
import { MatterStatusBadge } from './matter-status-badge';

describe('MatterStatusBadge', () => {
  it('renders every matter status', () => {
    for (const status of matterStatuses) {
      const html = renderToStaticMarkup(<MatterStatusBadge status={status} />);
      expect(html).toContain('rounded-md');
      expect(html).not.toContain('상태 미확인');
    }
  });

  it('falls back for unknown statuses', () => {
    expect(renderToStaticMarkup(<MatterStatusBadge status="unexpected" />)).toContain('상태 미확인');
  });
});
