import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { LaunchControlClient } from './launch-control-client';

describe('LaunchControlClient', () => {
  it('renders a read-only launch control surface with blocked approval gates', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <LaunchControlClient />
      </LanguageProvider>,
    );

    expect(html).toContain('운영 관리');
    expect(html).toContain('시스템 점검 완료');
    expect(html).toContain('승인 필요');
    expect(html).toContain('pnpm launch:execution');
    expect(html).toContain('LRB-001/002/003/004/008');
    expect(html).toContain('프로덕션 배포 승인');
    expect(html).not.toContain('Launch Control');
    expect(html).not.toContain('technical green');
    expect(html).not.toContain('approval blocked');
    expect(html).not.toContain('Deploy now');
    expect(html).not.toContain('Request approval');
  });
});
