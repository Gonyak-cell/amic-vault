import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  BreakGlassRequestDto,
  DlpBehaviorAlertDto,
  TenantId,
  UserSummary,
} from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { AdminSecurityClient } from './admin-security-client';
import AdminSecurityPage from './page';

const firmAdmin = {
  userId: '11111111-1111-4111-8111-111111111100',
  tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
  email: 'alpha-firm-admin@test.local',
  name: 'Alpha Firm Admin',
  displayName: 'Alpha Firm Admin',
  displayEmail: 'alpha-firm-admin@test.local',
  safeLabel: 'Alpha Firm Admin',
  canViewSensitiveRef: false,
  role: 'firm_admin',
  practiceGroup: null,
  status: 'active',
  mfaEnabled: true,
  lastLoginAt: '2026-07-03T00:00:00.000Z',
} satisfies UserSummary;

const pendingBreakGlass = {
  requestId: '11111111-1111-4111-8111-111111111188',
  tenantId: '11111111-1111-4111-8111-111111111111',
  wallId: '11111111-1111-4111-8111-111111111177',
  matterId: '11111111-1111-4111-8111-111111111199',
  requesterId: '11111111-1111-4111-8111-111111111101',
  reasonCode: 'security_review',
  status: 'pending',
  expiresAt: '2099-07-03T00:00:00.000Z',
  approvalCount: 1,
  approvedAt: null,
  revokedBy: null,
  revokedAt: null,
  createdAt: '2026-07-03T00:00:00.000Z',
} satisfies BreakGlassRequestDto;

const dlpAlert = {
  alertId: '11111111-1111-4111-8111-1111111111dd',
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '11111111-1111-4111-8111-111111111102',
  actorSafeLabel: 'Security Reviewer',
  actorDisplayEmail: 'security-reviewer@test.local',
  matterId: '11111111-1111-4111-8111-111111111199',
  windowStart: '2026-07-03T00:00:00.000Z',
  windowEnd: '2026-07-03T01:00:00.000Z',
  eventCount: 55,
  totalBytes: 560_000_000,
  thresholdCount: 50,
  thresholdBytes: 524_288_000,
  status: 'open',
  createdAt: '2026-07-03T01:00:30.000Z',
} satisfies DlpBehaviorAlertDto;

describe('AdminSecurityPage', () => {
  it('keeps security settings hidden until admin route visibility is confirmed', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AdminSecurityPage />
      </LanguageProvider>,
    );

    expect(html).toContain('접근 상태 확인 중');
    expect(html).toContain('보안 설정');
    expect(html).not.toContain('Corporate IdP');
    expect(html).not.toContain('sampleHash');
  });

  it('renders lifecycle and break-glass operations in the admin security console', () => {
    const html = renderToStaticMarkup(
      <AdminSecurityClient
        initialBreakGlassRequests={[pendingBreakGlass]}
        initialCurrentUser={firmAdmin}
        initialDlpAlerts={[dlpAlert]}
        initialUsers={[firmAdmin]}
      />,
    );

    expect(html).toContain('사용자 접근');
    expect(html).toContain('DLP 대량 다운로드');
    expect(html).toContain('55건');
    expect(html).toContain('Security Reviewer');
    expect(html).toContain('비활성화');
    expect(html).toContain('Break-glass 요청');
    expect(html).toContain('요청 생성');
    expect(html).toContain('승인 대기열');
    expect(html).toContain('승인');
    expect(html).toContain('회수');
  });

  it('renders the MFA enrollment QR, manual key, and recovery codes when enrollment is pending', () => {
    const html = renderToStaticMarkup(
      <AdminSecurityClient
        initialCurrentUser={{ ...firmAdmin, mfaEnabled: false }}
        initialMfaEnrollment={{
          secretId: '11111111-1111-4111-8111-1111111111aa',
          otpauthUri:
            'otpauth://totp/AMIC%20Vault:alpha-firm-admin%40test.local?secret=JBSWY3DPEHPK3PXP&issuer=AMIC%20Vault&algorithm=SHA1&digits=6&period=30',
          manualEntryKey: 'JBSWY3DPEHPK3PXP',
          recoveryCodes: ['R1A2-B3C4', 'R5D6-E7F8'],
        }}
        initialUsers={[{ ...firmAdmin, mfaEnabled: false }]}
      />,
    );

    expect(html).toContain('내 MFA 등록');
    expect(html).toContain('Google Authenticator QR');
    expect(html).toContain('data:image/svg+xml');
    expect(html).toContain('JBSWY3DPEHPK3PXP');
    expect(html).toContain('R1A2-B3C4');
    expect(html).toContain('인증 후 활성화');
  });
});
