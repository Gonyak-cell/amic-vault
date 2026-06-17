import { describe, expect, it } from 'vitest';
import {
  OutlookIntegrationStatusService,
} from './outlook-integration-status.service';
import {
  OutlookOperationalGateService,
  type OutlookOperationalConfigReader,
} from './outlook-operational-gate';

function statusService(env: Record<string, string | undefined>): OutlookIntegrationStatusService {
  const reader: OutlookOperationalConfigReader = {
    get(name: string) {
      return env[name];
    },
  };
  return new OutlookIntegrationStatusService(new OutlookOperationalGateService(reader));
}

describe('OutlookIntegrationStatusService', () => {
  it('returns reference-only admin status without exposing evidence values', () => {
    const status = statusService({
      NODE_ENV: 'production',
      OUTLOOK_ADDIN_ENABLED: 'true',
      OUTLOOK_SEND_FILE_ENABLED: 'true',
      OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
      OUTLOOK_AUDIT_AVAILABLE: 'true',
      OUTLOOK_OPERATOR_APPROVAL_REF: 'APPROVAL-OUTLOOK-OPERATOR-20260616-ABCDEFGH',
      OUTLOOK_MANIFEST_VALIDATION_REF: 'EVREF-OUTLOOK-002-20260616-ABCDEFGH',
      OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF: 'REHEARSAL-OUTLOOK-REMOVE-20260616-ABCDEFGH',
    }).getAdminStatus(new Date('2026-06-17T00:00:00.000Z'));

    expect(status).toMatchObject({
      provider: 'outlook',
      operationalGateEnforced: true,
      rolloutRing: 'R1_PILOT_PRACTICE',
      auditAvailable: true,
      generatedAt: '2026-06-17T00:00:00.000Z',
    });
    expect(status.features).toContainEqual({
      feature: 'SEND_FILE',
      configured: true,
      allowed: true,
    });
    expect(status.features).toContainEqual({
      feature: 'AUTOFILE',
      configured: false,
      allowed: false,
      reasonCode: 'FEATURE_DISABLED',
    });
    expect(status.evidence).toContainEqual({
      kind: 'EV-OUTLOOK-002',
      present: true,
      validFormat: true,
    });
    expect(JSON.stringify(status)).not.toContain('EVREF-OUTLOOK-002-20260616-ABCDEFGH');
    expect(JSON.stringify(status)).not.toContain('APPROVAL-OUTLOOK-OPERATOR-20260616-ABCDEFGH');
  });
});
