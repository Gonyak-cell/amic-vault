import { describe, expect, it } from 'vitest';
import { dlpBehaviorAlertListResponseSchema } from './dlp-types';

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
});
