import { Inject, Injectable } from '@nestjs/common';
import type {
  OutlookIntegrationAdminEvidenceStatusDto,
  OutlookIntegrationAdminFeatureStatusDto,
  OutlookIntegrationAdminStatusDto,
} from '@amic-vault/shared';
import {
  OutlookOperationalGateService,
  outlookOperationalFeatures,
  parseOutlookRolloutRing,
} from './outlook-operational-gate';

@Injectable()
export class OutlookIntegrationStatusService {
  constructor(
    @Inject(OutlookOperationalGateService)
    private readonly operationalGate: OutlookOperationalGateService,
  ) {}

  getAdminStatus(now = new Date()): OutlookIntegrationAdminStatusDto {
    const snapshot = this.operationalGate.snapshot();
    const features: OutlookIntegrationAdminFeatureStatusDto[] = outlookOperationalFeatures.map(
      (feature) => {
        const decision = this.operationalGate.evaluate(feature);
        return {
          feature,
          configured: snapshot.featureFlags[feature],
          allowed: decision.allow,
          ...(decision.allow ? {} : { reasonCode: decision.reasonCode }),
        };
      },
    );
    const evidence: OutlookIntegrationAdminEvidenceStatusDto[] = Object.values(snapshot.evidence)
      .map(({ kind, present, validFormat }) => ({ kind, present, validFormat }))
      .sort((left, right) => left.kind.localeCompare(right.kind));

    return {
      provider: 'outlook',
      operationalGateEnforced: snapshot.enforceOperationalGate,
      rolloutRing: parseOutlookRolloutRing(snapshot.rolloutRing),
      auditAvailable: snapshot.auditAvailable,
      features,
      evidence,
      generatedAt: now.toISOString(),
    };
  }
}
