import { describe, expect, it } from 'vitest';
import {
  createEnterpriseKeyReferenceRequestSchema,
  createEnterpriseSsoProviderRequestSchema,
  enterpriseReadinessSummarySchema,
} from './enterprise-types';

const hash = 'a'.repeat(64);

describe('enterprise types', () => {
  it('accepts reference-only SSO provider configuration', () => {
    const parsed = createEnterpriseSsoProviderRequestSchema.parse({
      providerKey: 'corp-idp',
      displayName: 'Corporate IdP',
      idpEntityId: 'corp-idp-entity',
      ssoUrlHash: hash,
      certificateFingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD',
      metadataHash: hash,
      defaultRole: 'matter_member',
      enforcementMode: 'password_disabled',
    });

    expect('protocol' in parsed).toBe(false);
    expect(parsed.ssoUrlHash).toBe(hash);
  });

  it('rejects key material shaped labels', () => {
    expect(() =>
      createEnterpriseKeyReferenceRequestSchema.parse({
        keyLabel: 'raw secret material',
        keyProvider: 'hsm',
        keyRefHash: hash,
        keyFingerprint: hash,
      }),
    ).toThrow();
  });

  it('summarizes readiness with a technical pass boolean', () => {
    const parsed = enterpriseReadinessSummarySchema.parse({
      activeSsoProviderCount: 1,
      activeKeyReferenceCount: 1,
      siemExportCount: 1,
      backupSnapshotCount: 1,
      complianceReadyCount: 3,
      complianceGapCount: 0,
      technicalPass: true,
    });

    expect(parsed.technicalPass).toBe(true);
  });
});
