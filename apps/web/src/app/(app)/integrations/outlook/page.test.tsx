import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import IntegrationsPage from '../page';
import OutlookIntegrationPage from './page';
import { OutlookIntegrationStatusContent } from './outlook-integration-status-client';

describe('integration status routes', () => {
  it('renders only empty operational states before integration APIs are connected', () => {
    const html = [
      renderToStaticMarkup(<IntegrationsPage />),
      renderToStaticMarkup(<OutlookIntegrationPage />),
    ].join('\n');

    expect(html).toContain('통합');
    expect(html).toContain('연결된 통합이 없습니다.');
    expect(html).toContain('Outlook 운영 상태');
    expect(html).toContain('Outlook 운영 상태를 불러오는 중입니다.');
    expect(html).toContain('상태 API 응답 전에는 연결 여부나 배포 상태를 표시하지 않습니다.');
    expect(html).not.toContain('OneDrive 연결됨');
    expect(html).not.toContain('Microsoft 365 연결됨');
    expect(html).not.toMatch(/>0</);
  });

  it('renders admin status from the API without raw evidence references', () => {
    const html = renderToStaticMarkup(
      <OutlookIntegrationStatusContent
        state={{
          status: 'ready',
          data: {
            provider: 'outlook',
            operationalGateEnforced: true,
            rolloutRing: 'R1_PILOT_PRACTICE',
            auditAvailable: true,
            generatedAt: '2026-06-17T00:00:00.000Z',
            evidence: [
              { kind: 'EV-OUTLOOK-002', present: true, validFormat: true },
              { kind: 'OPERATOR-APPROVAL', present: true, validFormat: true },
            ],
            features: [
              { feature: 'SEND_FILE', configured: true, allowed: true },
              {
                feature: 'AUTOFILE',
                configured: false,
                allowed: false,
                reasonCode: 'FEATURE_DISABLED',
              },
            ],
          },
        }}
      />,
    );

    expect(html).toContain('운영 게이트');
    expect(html).toContain('R1_PILOT_PRACTICE');
    expect(html).toContain('Send and file');
    expect(html).toContain('FEATURE_DISABLED');
    expect(html).toContain('참조값 원문 비노출');
    expect(html).not.toContain('EVREF-OUTLOOK-002');
    expect(html).not.toContain('APPROVAL-OUTLOOK-OPERATOR');
  });
});
