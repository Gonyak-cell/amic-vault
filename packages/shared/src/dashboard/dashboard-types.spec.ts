import { describe, expect, it } from 'vitest';
import { dashboardOverviewSchema } from './dashboard-types';

describe('dashboard DTOs', () => {
  it('accepts display-only operational overview data', () => {
    const parsed = dashboardOverviewSchema.parse({
      generatedAt: '2026-06-17T00:00:00.000Z',
      recentFiles: [{ title: 'Board minutes', matterLabel: 'M-001 · Governance' }],
      recentActivity: [
        {
          actionLabel: 'Document viewed',
          targetLabel: 'M-001 · Governance',
          resultLabel: 'Success',
          occurredAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      permissionPolicyAlerts: [],
      aiPrepStatus: [{ matterLabel: 'M-001 · Governance', statusLabel: 'Ready' }],
      integrationStatus: [{ integrationLabel: 'Outlook filing', statusLabel: 'No activity' }],
    });

    expect(parsed.recentFiles).toHaveLength(1);
  });

  it('rejects undeclared internal reference fields', () => {
    expect(() =>
      dashboardOverviewSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        recentFiles: [{ title: 'Board minutes', documentId: 'doc-1' }],
        recentActivity: [],
        permissionPolicyAlerts: [],
        aiPrepStatus: [],
        integrationStatus: [],
      }),
    ).toThrow();
  });
});
