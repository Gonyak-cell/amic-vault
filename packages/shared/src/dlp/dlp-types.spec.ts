import { describe, expect, it } from 'vitest';
import {
  createDlpReviewRequestSchema,
  dlpBehaviorAlertListResponseSchema,
} from './dlp-types';

describe('DLP behavior alert DTOs', () => {
  it('accepts safe bulk-download alert summaries without document content', () => {
    const parsed = dlpBehaviorAlertListResponseSchema.parse({
      items: [
        {
          alertId: '11111111-1111-4111-8111-1111111111dd',
          tenantId: '11111111-1111-4111-8111-111111111111',
          actorUserId: '11111111-1111-4111-8111-111111111102',
          actorSafeLabel: 'Security Reviewer',
          actorDisplayEmail: 'security-reviewer@test.local',
          matterId: '11111111-1111-4111-8111-111111111199',
          windowStart: '2026-07-04T00:00:00.000Z',
          windowEnd: '2026-07-04T01:00:00.000Z',
          eventCount: 55,
          totalBytes: 560_000_000,
          thresholdCount: 50,
          thresholdBytes: 524_288_000,
          status: 'open',
          createdAt: '2026-07-04T01:00:30.000Z',
        },
      ],
    });

    expect(parsed.items[0]).toMatchObject({
      actorSafeLabel: 'Security Reviewer',
      eventCount: 55,
      thresholdCount: 50,
    });
    expect(JSON.stringify(parsed)).not.toMatch(/documentBody|rawText|content/i);
  });

  it('accepts only bounded decision and reason combinations for manual review', () => {
    expect(
      createDlpReviewRequestSchema.parse({
        decision: 'allow',
        reasonCode: 'verified_safe',
        expiresAt: '2026-07-24T00:00:00.000Z',
      }),
    ).toMatchObject({ decision: 'allow', reasonCode: 'verified_safe' });
    expect(() =>
      createDlpReviewRequestSchema.parse({
        decision: 'allow',
        reasonCode: 'sensitive_content_denied',
        expiresAt: '2026-07-24T00:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      createDlpReviewRequestSchema.parse({
        decision: 'deny',
        reasonCode: 'business_justified',
        expiresAt: '2026-07-24T00:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      createDlpReviewRequestSchema.parse({
        decision: 'deny',
        reasonCode: 'sensitive_content_denied',
        expiresAt: '2026-07-24T00:00:00.000Z',
        note: 'raw free-form content is forbidden',
      }),
    ).toThrow();
  });
});
