import { Inject, Injectable, Optional } from '@nestjs/common';

export const outlookOperationalFeatures = [
  'ADDIN_BOOTSTRAP',
  'AUTH_EXCHANGE',
  'GRAPH_ATTACHMENT_ACQUISITION',
  'SMART_ALERTS',
  'SEND_FILE',
  'DOCUMENT_INSERTION',
  'FOLDER_MAPPING',
  'AUTOFILE',
] as const;

export type OutlookOperationalFeature = (typeof outlookOperationalFeatures)[number];

export const outlookRolloutRings = [
  'R0_ADMIN_ONLY',
  'R1_PILOT_PRACTICE',
  'R2_BROADER_PILOT',
  'R3_PRODUCTION',
] as const;

export type OutlookRolloutRing = (typeof outlookRolloutRings)[number];

export type OutlookEvidenceKind =
  | 'EV-OUTLOOK-002'
  | 'EV-OUTLOOK-003'
  | 'OPERATOR-APPROVAL'
  | 'DISABLE-REMOVE-REHEARSAL';

export type OutlookGateDenyReasonCode =
  | 'AUDIT_UNAVAILABLE'
  | 'GLOBAL_DISABLED'
  | 'FEATURE_DISABLED'
  | 'RING_NOT_ALLOWED'
  | 'MISSING_EVIDENCE_REF'
  | 'MALFORMED_EVIDENCE_REF'
  | 'MISSING_GRAPH_CONSENT_REF'
  | 'MISSING_MANIFEST_VALIDATION_REF'
  | 'MISSING_OPERATOR_APPROVAL_REF'
  | 'MISSING_ROLLBACK_REHEARSAL_REF'
  | 'UNKNOWN_FEATURE'
  | 'UNKNOWN_RING';

export type OutlookGateDecision =
  | {
      allow: true;
      feature: OutlookOperationalFeature;
      ring: OutlookRolloutRing | null;
      auditRequired: true;
    }
  | {
      allow: false;
      feature: OutlookOperationalFeature | 'UNKNOWN';
      ring: OutlookRolloutRing | null;
      reasonCode: OutlookGateDenyReasonCode;
      safeMessageKey: 'outlook_gate_denied';
    };

export interface OutlookEvidenceRefDecision {
  kind: OutlookEvidenceKind;
  present: boolean;
  validFormat: boolean;
}

export interface OutlookOperationalConfigSnapshot {
  enforceOperationalGate: boolean;
  rolloutRing: string | undefined;
  auditAvailable: boolean;
  featureFlags: Record<OutlookOperationalFeature, boolean>;
  evidence: Record<OutlookEvidenceKind, OutlookEvidenceRefDecision>;
}

export const OUTLOOK_OPERATIONAL_CONFIG_PROVIDER = Symbol('OUTLOOK_OPERATIONAL_CONFIG_PROVIDER');

export interface OutlookOperationalConfigReader {
  get(name: string): string | undefined;
}

const featureEnvNames: Record<OutlookOperationalFeature, string> = {
  ADDIN_BOOTSTRAP: 'OUTLOOK_ADDIN_ENABLED',
  AUTH_EXCHANGE: 'OUTLOOK_AUTH_EXCHANGE_ENABLED',
  GRAPH_ATTACHMENT_ACQUISITION: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED',
  SMART_ALERTS: 'OUTLOOK_SMART_ALERTS_ENABLED',
  SEND_FILE: 'OUTLOOK_SEND_FILE_ENABLED',
  DOCUMENT_INSERTION: 'OUTLOOK_DOCUMENT_INSERTION_ENABLED',
  FOLDER_MAPPING: 'OUTLOOK_FOLDER_MAPPING_ENABLED',
  AUTOFILE: 'OUTLOOK_AUTOFILE_ENABLED',
};

const evidenceEnvNames: Record<OutlookEvidenceKind, string> = {
  'EV-OUTLOOK-002': 'OUTLOOK_MANIFEST_VALIDATION_REF',
  'EV-OUTLOOK-003': 'OUTLOOK_GRAPH_CONSENT_REF',
  'OPERATOR-APPROVAL': 'OUTLOOK_OPERATOR_APPROVAL_REF',
  'DISABLE-REMOVE-REHEARSAL': 'OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF',
};

const evidencePatterns: Record<OutlookEvidenceKind, RegExp> = {
  'EV-OUTLOOK-002': /^EVREF-OUTLOOK-002-[0-9]{8}-[A-Z0-9]{8,26}$/,
  'EV-OUTLOOK-003': /^EVREF-OUTLOOK-003-[0-9]{8}-[A-Z0-9]{8,26}$/,
  'OPERATOR-APPROVAL': /^APPROVAL-OUTLOOK-OPERATOR-[0-9]{8}-[A-Z0-9]{8,26}$/,
  'DISABLE-REMOVE-REHEARSAL': /^REHEARSAL-OUTLOOK-REMOVE-[0-9]{8}-[A-Z0-9]{8,26}$/,
};

const unsafeEvidenceValuePatterns = [
  /https?:\/\//i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /[a-z0-9.-]+\.[a-z]{2,}/i,
  /@/,
  /[/?#:]/,
  /\b(access|refresh|token|cookie|secret|password)\b/i,
];

const graphDependentFeatures = new Set<OutlookOperationalFeature>([
  'GRAPH_ATTACHMENT_ACQUISITION',
]);

const auditRequiredFeatures = new Set<OutlookOperationalFeature>(outlookOperationalFeatures);

const ringAllowedFeatures: Record<OutlookRolloutRing, ReadonlySet<OutlookOperationalFeature>> = {
  R0_ADMIN_ONLY: new Set(['ADDIN_BOOTSTRAP', 'AUTH_EXCHANGE', 'SMART_ALERTS']),
  R1_PILOT_PRACTICE: new Set([
    'ADDIN_BOOTSTRAP',
    'AUTH_EXCHANGE',
    'GRAPH_ATTACHMENT_ACQUISITION',
    'SMART_ALERTS',
    'SEND_FILE',
    'DOCUMENT_INSERTION',
  ]),
  R2_BROADER_PILOT: new Set([
    'ADDIN_BOOTSTRAP',
    'AUTH_EXCHANGE',
    'GRAPH_ATTACHMENT_ACQUISITION',
    'SMART_ALERTS',
    'SEND_FILE',
    'DOCUMENT_INSERTION',
    'FOLDER_MAPPING',
  ]),
  R3_PRODUCTION: new Set(outlookOperationalFeatures),
};

@Injectable()
export class ProcessOutlookOperationalConfigProvider implements OutlookOperationalConfigReader {
  get(name: string): string | undefined {
    return process.env[name];
  }
}

export function parseOutlookEvidenceRef(
  kind: OutlookEvidenceKind,
  value: string | undefined,
): OutlookEvidenceRefDecision {
  if (!value) return { kind, present: false, validFormat: false };
  if (unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value))) {
    return { kind, present: true, validFormat: false };
  }
  return { kind, present: true, validFormat: evidencePatterns[kind].test(value) };
}

export function parseOutlookRolloutRing(value: string | undefined): OutlookRolloutRing | null {
  return outlookRolloutRings.find((ring) => ring === value) ?? null;
}

@Injectable()
export class OutlookOperationalGateService {
  constructor(
    @Optional()
    @Inject(OUTLOOK_OPERATIONAL_CONFIG_PROVIDER)
    private readonly configReader?: OutlookOperationalConfigReader,
  ) {}

  evaluate(feature: OutlookOperationalFeature): OutlookGateDecision {
    if (!outlookOperationalFeatures.includes(feature)) {
      return this.deny('UNKNOWN', null, 'UNKNOWN_FEATURE');
    }

    const snapshot = this.snapshot();
    if (!snapshot.featureFlags[feature]) {
      return this.deny(feature, parseOutlookRolloutRing(snapshot.rolloutRing), 'FEATURE_DISABLED');
    }

    if (!snapshot.enforceOperationalGate) {
      return {
        allow: true,
        feature,
        ring: parseOutlookRolloutRing(snapshot.rolloutRing),
        auditRequired: true,
      };
    }

    const ring = parseOutlookRolloutRing(snapshot.rolloutRing);
    if (!ring) return this.deny(feature, null, 'UNKNOWN_RING');

    if (feature !== 'ADDIN_BOOTSTRAP' && !snapshot.featureFlags.ADDIN_BOOTSTRAP) {
      return this.deny(feature, ring, 'GLOBAL_DISABLED');
    }

    const operator = snapshot.evidence['OPERATOR-APPROVAL'];
    if (!operator.present) return this.deny(feature, ring, 'MISSING_OPERATOR_APPROVAL_REF');
    if (!operator.validFormat) return this.deny(feature, ring, 'MALFORMED_EVIDENCE_REF');

    const manifest = snapshot.evidence['EV-OUTLOOK-002'];
    if (!manifest.present) return this.deny(feature, ring, 'MISSING_MANIFEST_VALIDATION_REF');
    if (!manifest.validFormat) return this.deny(feature, ring, 'MALFORMED_EVIDENCE_REF');

    const rehearsal = snapshot.evidence['DISABLE-REMOVE-REHEARSAL'];
    if (!rehearsal.present) return this.deny(feature, ring, 'MISSING_ROLLBACK_REHEARSAL_REF');
    if (!rehearsal.validFormat) return this.deny(feature, ring, 'MALFORMED_EVIDENCE_REF');

    if (graphDependentFeatures.has(feature)) {
      const graph = snapshot.evidence['EV-OUTLOOK-003'];
      if (!graph.present) return this.deny(feature, ring, 'MISSING_GRAPH_CONSENT_REF');
      if (!graph.validFormat) return this.deny(feature, ring, 'MALFORMED_EVIDENCE_REF');
    }

    if (!ringAllowedFeatures[ring].has(feature)) {
      return this.deny(feature, ring, 'RING_NOT_ALLOWED');
    }

    if (!snapshot.auditAvailable && auditRequiredFeatures.has(feature)) {
      return this.deny(feature, ring, 'AUDIT_UNAVAILABLE');
    }

    return { allow: true, feature, ring, auditRequired: true };
  }

  isFeatureAllowed(feature: OutlookOperationalFeature): boolean {
    return this.evaluate(feature).allow;
  }

  snapshot(): OutlookOperationalConfigSnapshot {
    const get = (name: string): string | undefined => {
      return this.configReader?.get(name) ?? process.env[name];
    };
    const featureFlags = Object.fromEntries(
      outlookOperationalFeatures.map((feature) => [feature, get(featureEnvNames[feature]) === 'true']),
    ) as Record<OutlookOperationalFeature, boolean>;
    const evidence = Object.fromEntries(
      (Object.keys(evidenceEnvNames) as OutlookEvidenceKind[]).map((kind) => [
        kind,
        parseOutlookEvidenceRef(kind, get(evidenceEnvNames[kind])),
      ]),
    ) as Record<OutlookEvidenceKind, OutlookEvidenceRefDecision>;
    const enforceOperationalGate =
      get('OUTLOOK_OPERATIONAL_ENFORCE') === 'true' || get('NODE_ENV') === 'production';
    const auditAvailable =
      enforceOperationalGate
        ? get('OUTLOOK_AUDIT_AVAILABLE') === 'true'
        : get('OUTLOOK_AUDIT_AVAILABLE') !== 'false';
    return {
      enforceOperationalGate,
      rolloutRing: get('OUTLOOK_ROLLOUT_RING'),
      auditAvailable,
      featureFlags,
      evidence,
    };
  }

  private deny(
    feature: OutlookOperationalFeature | 'UNKNOWN',
    ring: OutlookRolloutRing | null,
    reasonCode: OutlookGateDenyReasonCode,
  ): OutlookGateDecision {
    return {
      allow: false,
      feature,
      ring,
      reasonCode,
      safeMessageKey: 'outlook_gate_denied',
    };
  }
}
