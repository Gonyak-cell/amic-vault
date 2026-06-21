import { describe, expect, it } from 'vitest';
import {
  createEnterpriseKeyReferenceRequestSchema,
  createEnterpriseSsoProviderRequestSchema,
  enterpriseApprovedDmsTaxonomyCatalogSchema,
  enterpriseDmsTaxonomySchema,
  enterpriseReadinessSummarySchema,
  upsertEnterpriseDmsSearchRefinerRequestSchema,
  upsertEnterpriseDmsTaxonomyRequestSchema,
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

  it('validates DMS taxonomy configuration without raw content fields', () => {
    const parsed = upsertEnterpriseDmsTaxonomyRequestSchema.parse({
      documentTypeCode: 'contract',
      displayName: 'Contract',
      description: 'Filing profile for signed commercial agreements',
      subtypes: [{ subtypeCode: 'Msa', displayName: 'Master service agreement' }],
      metadataFields: [
        {
          fieldKey: 'counterparty',
          displayName: 'Counterparty',
          fieldType: 'text',
          required: true,
          searchable: true,
          refinable: true,
        },
      ],
    });

    expect(parsed.documentTypeCode).toBe('CONTRACT');
    expect(parsed.subtypes[0]?.subtypeCode).toBe('MSA');
  });

  it('validates versioned DMS taxonomy responses and approved catalogs', () => {
    const taxonomy = enterpriseDmsTaxonomySchema.parse({
      taxonomyId: '11111111-1111-4111-8111-111111111111',
      documentTypeCode: 'CONTRACT',
      canonicalDocumentType: 'contract',
      displayName: 'Commercial Contract',
      description: 'Commercial agreement filing profile',
      status: 'active',
      subtypes: [{ subtypeCode: 'MSA', displayName: 'Master service agreement' }],
      metadataFields: [
        {
          fieldKey: 'counterparty',
          displayName: 'Counterparty',
          fieldType: 'text',
          required: true,
          searchable: true,
          refinable: true,
        },
      ],
      versionNo: 2,
      lastAuditEventRef: 'audit:abcdef123456',
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T01:00:00.000Z',
    });

    expect(taxonomy.versionNo).toBe(2);
    expect(taxonomy.lastAuditEventRef).toBe('audit:abcdef123456');

    const catalog = enterpriseApprovedDmsTaxonomyCatalogSchema.parse({
      source: 'tenant_admin_taxonomy',
      generatedAt: '2026-06-20T01:00:00.000Z',
      taxonomies: [
        {
          documentTypeCode: taxonomy.documentTypeCode,
          canonicalDocumentType: 'contract',
          displayName: taxonomy.displayName,
          description: taxonomy.description,
          subtypes: taxonomy.subtypes,
          metadataFields: taxonomy.metadataFields,
          versionNo: taxonomy.versionNo,
          updatedAt: taxonomy.updatedAt,
        },
      ],
    });

    expect(catalog.taxonomies[0]?.canonicalDocumentType).toBe('contract');
    expect(JSON.stringify(catalog)).not.toContain(taxonomy.taxonomyId);
  });

  it('rejects unsafe DMS taxonomy descriptions and duplicate metadata keys', () => {
    expect(() =>
      upsertEnterpriseDmsTaxonomyRequestSchema.parse({
        documentTypeCode: 'CONTRACT',
        displayName: 'Contract',
        description: 'Stores raw body snippets',
        metadataFields: [],
        subtypes: [],
      }),
    ).toThrow();

    expect(() =>
      upsertEnterpriseDmsTaxonomyRequestSchema.parse({
        documentTypeCode: 'CONTRACT',
        displayName: 'Contract',
        metadataFields: [
          { fieldKey: 'counterparty', displayName: 'Counterparty', fieldType: 'text' },
          { fieldKey: 'counterparty', displayName: 'Other Counterparty', fieldType: 'text' },
        ],
        subtypes: [],
      }),
    ).toThrow();
  });

  it('validates DMS search refiner configuration', () => {
    const parsed = upsertEnterpriseDmsSearchRefinerRequestSchema.parse({
      fieldKey: 'counterparty',
      displayName: 'Counterparty',
      fieldType: 'text',
      source: 'document_profile',
      sortOrder: 20,
    });

    expect(parsed.searchable).toBe(true);
    expect(parsed.refinable).toBe(true);
    expect(parsed.filterable).toBe(true);
  });
});
