import { describe, expect, it } from 'vitest';
import {
  OutlookOperationalGateService,
  parseOutlookEvidenceRef,
  type OutlookOperationalConfigReader,
} from './outlook-operational-gate';

function gate(env: Record<string, string | undefined>) {
  const reader: OutlookOperationalConfigReader = {
    get(name: string) {
      return env[name];
    },
  };
  return new OutlookOperationalGateService(reader);
}

const validRefs = {
  OUTLOOK_OPERATOR_APPROVAL_REF: 'APPROVAL-OUTLOOK-OPERATOR-20260616-ABCDEFGH',
  OUTLOOK_MANIFEST_VALIDATION_REF: 'EVREF-OUTLOOK-002-20260616-ABCDEFGH',
  OUTLOOK_GRAPH_CONSENT_REF: 'EVREF-OUTLOOK-003-20260616-ABCDEFGH',
  OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF: 'REHEARSAL-OUTLOOK-REMOVE-20260616-ABCDEFGH',
};

const allFeatureFlags = {
  OUTLOOK_ADDIN_ENABLED: 'true',
  OUTLOOK_AUTH_EXCHANGE_ENABLED: 'true',
  OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED: 'true',
  OUTLOOK_SMART_ALERTS_ENABLED: 'true',
  OUTLOOK_SEND_FILE_ENABLED: 'true',
  OUTLOOK_DOCUMENT_INSERTION_ENABLED: 'true',
  OUTLOOK_FOLDER_MAPPING_ENABLED: 'true',
  OUTLOOK_AUTOFILE_ENABLED: 'true',
};

describe('OutlookOperationalGateService', () => {
  it('fails closed when the feature flag is missing', () => {
    expect(gate({}).evaluate('ADDIN_BOOTSTRAP')).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'FEATURE_DISABLED',
      }),
    );
  });

  it('allows local non-enforced development when only the feature flag is enabled', () => {
    expect(gate({ OUTLOOK_SEND_FILE_ENABLED: 'true' }).evaluate('SEND_FILE')).toEqual(
      expect.objectContaining({ allow: true }),
    );
  });

  it('requires production evidence refs while operational enforcement is on', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
      }).evaluate('SEND_FILE'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'MISSING_OPERATOR_APPROVAL_REF',
      }),
    );
  });

  it('enforces operational evidence automatically in production runtime', () => {
    expect(
      gate({
        NODE_ENV: 'production',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
      }).evaluate('SEND_FILE'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'MISSING_OPERATOR_APPROVAL_REF',
      }),
    );
  });

  it('rejects higher-ring features in lower rings', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_AUTOFILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R0_ADMIN_ONLY',
        ...validRefs,
      }).evaluate('AUTOFILE'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'RING_NOT_ALLOWED',
      }),
    );
  });

  it('requires Graph consent for Graph-dependent features', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        OUTLOOK_OPERATOR_APPROVAL_REF: validRefs.OUTLOOK_OPERATOR_APPROVAL_REF,
        OUTLOOK_MANIFEST_VALIDATION_REF: validRefs.OUTLOOK_MANIFEST_VALIDATION_REF,
        OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF: validRefs.OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF,
      }).evaluate('GRAPH_ATTACHMENT_ACQUISITION'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'MISSING_GRAPH_CONSENT_REF',
      }),
    );
  });

  it('allows Graph acquisition in the R1 pilot ring when all Outlook evidence refs are recorded', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        OUTLOOK_AUDIT_AVAILABLE: 'true',
        ...validRefs,
      }).evaluate('GRAPH_ATTACHMENT_ACQUISITION'),
    ).toEqual(
      expect.objectContaining({
        allow: true,
        feature: 'GRAPH_ATTACHMENT_ACQUISITION',
        ring: 'R1_PILOT_PRACTICE',
      }),
    );
  });

  it('keeps Graph acquisition blocked in the R0 admin ring even with recorded evidence refs', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R0_ADMIN_ONLY',
        OUTLOOK_AUDIT_AVAILABLE: 'true',
        ...validRefs,
      }).evaluate('GRAPH_ATTACHMENT_ACQUISITION'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'RING_NOT_ALLOWED',
      }),
    );
  });

  it('denies mutating Outlook features when audit is explicitly unavailable', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        OUTLOOK_AUDIT_AVAILABLE: 'false',
        ...validRefs,
      }).evaluate('SEND_FILE'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'AUDIT_UNAVAILABLE',
      }),
    );
  });

  it('requires explicit audit availability while operational enforcement is on', () => {
    expect(
      gate({
        OUTLOOK_OPERATIONAL_ENFORCE: 'true',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        ...validRefs,
      }).evaluate('SEND_FILE'),
    ).toEqual(
      expect.objectContaining({
        allow: false,
        reasonCode: 'AUDIT_UNAVAILABLE',
      }),
    );
  });

  it('allows enforced production features only with explicit audit availability', () => {
    expect(
      gate({
        NODE_ENV: 'production',
        OUTLOOK_ADDIN_ENABLED: 'true',
        OUTLOOK_SEND_FILE_ENABLED: 'true',
        OUTLOOK_ROLLOUT_RING: 'R1_PILOT_PRACTICE',
        OUTLOOK_AUDIT_AVAILABLE: 'true',
        ...validRefs,
      }).evaluate('SEND_FILE'),
    ).toEqual(expect.objectContaining({ allow: true }));
  });

  it('allows every Outlook feature in the R3 production ring with full rollout evidence', () => {
    const service = gate({
      OUTLOOK_OPERATIONAL_ENFORCE: 'true',
      OUTLOOK_ROLLOUT_RING: 'R3_PRODUCTION',
      OUTLOOK_AUDIT_AVAILABLE: 'true',
      ...allFeatureFlags,
      ...validRefs,
    });

    for (const feature of [
      'ADDIN_BOOTSTRAP',
      'AUTH_EXCHANGE',
      'GRAPH_ATTACHMENT_ACQUISITION',
      'SMART_ALERTS',
      'SEND_FILE',
      'DOCUMENT_INSERTION',
      'FOLDER_MAPPING',
      'AUTOFILE',
    ] as const) {
      expect(service.evaluate(feature)).toEqual(
        expect.objectContaining({
          allow: true,
          feature,
          ring: 'R3_PRODUCTION',
        }),
      );
    }
  });

  it('accepts only opaque reference-only evidence values', () => {
    expect(
      parseOutlookEvidenceRef(
        'EV-OUTLOOK-002',
        'EVREF-OUTLOOK-002-20260616-ABCDEFGH',
      ).validFormat,
    ).toBe(true);
    expect(
      parseOutlookEvidenceRef(
        'EV-OUTLOOK-002',
        'https://admin.microsoft.com/example',
      ).validFormat,
    ).toBe(false);
    expect(parseOutlookEvidenceRef('EV-OUTLOOK-003', 'tenant.onmicrosoft.com').validFormat).toBe(
      false,
    );
  });
});
