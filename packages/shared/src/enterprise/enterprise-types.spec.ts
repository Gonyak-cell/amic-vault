import { describe, expect, it } from 'vitest';
import {
  createEnterpriseKeyReferenceRequestSchema,
  createEnterpriseSsoProviderRequestSchema,
  enterpriseApprovedDmsMatterTemplateCatalogSchema,
  enterpriseApprovedDmsTaxonomyCatalogSchema,
  enterpriseDmsMatterTemplateApplicationSchema,
  enterpriseDmsMatterTemplateSchema,
  enterpriseDmsTaxonomySchema,
  enterpriseReadinessSummarySchema,
  upsertEnterpriseDmsMatterTemplateRequestSchema,
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

  it('validates DMS Matter template contracts and approved catalogs', () => {
    const parsed = upsertEnterpriseDmsMatterTemplateRequestSchema.parse({
      matterType: 'advisory',
      displayName: 'Advisory template',
      description: 'Advisory matter document set contract',
      documentSets: [
        {
          setKey: 'closing',
          displayName: 'Closing set',
          documentTypeCodes: ['contract', 'memo'],
          required: true,
          sortOrder: 10,
        },
      ],
    });
    expect(parsed.documentSets[0]?.documentTypeCodes).toEqual(['contract', 'memo']);

    const template = enterpriseDmsMatterTemplateSchema.parse({
      templateId: '11111111-1111-4111-8111-111111111111',
      matterType: 'advisory',
      displayName: 'Advisory template',
      description: 'Advisory matter document set contract',
      status: 'active',
      documentSets: parsed.documentSets,
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T01:00:00.000Z',
    });

    const catalog = enterpriseApprovedDmsMatterTemplateCatalogSchema.parse({
      source: 'tenant_admin_matter_template',
      generatedAt: '2026-06-20T01:00:00.000Z',
      templates: [
        {
          matterType: template.matterType,
          displayName: template.displayName,
          description: template.description,
          documentSets: template.documentSets,
          updatedAt: template.updatedAt,
        },
      ],
    });
    expect(catalog.templates[0]?.matterType).toBe('advisory');
    expect(JSON.stringify(catalog)).not.toContain(template.templateId);

    const application = enterpriseDmsMatterTemplateApplicationSchema.parse({
      applicationId: '22222222-2222-4222-8222-222222222222',
      templateId: template.templateId,
      matterId: '33333333-3333-4333-8333-333333333333',
      matterType: 'advisory',
      documentSetCount: 1,
      auditEventRef: 'audit:abcdef123456',
      appliedAt: '2026-06-20T01:10:00.000Z',
    });
    expect(application.auditEventRef).toBe('audit:abcdef123456');
  });

  it('rejects duplicate DMS Matter template set keys and pseudo-folder fields', () => {
    expect(() =>
      upsertEnterpriseDmsMatterTemplateRequestSchema.parse({
        matterType: 'advisory',
        displayName: 'Advisory template',
        documentSets: [
          { setKey: 'closing', displayName: 'Closing set', documentTypeCodes: ['contract'] },
          { setKey: 'closing', displayName: 'Other set', documentTypeCodes: ['memo'] },
        ],
      }),
    ).toThrow();

    expect(() =>
      upsertEnterpriseDmsMatterTemplateRequestSchema.parse({
        matterType: 'advisory',
        displayName: 'Advisory template',
        documentSets: [
          {
            setKey: 'closing',
            displayName: 'Closing set',
            documentTypeCodes: ['contract'],
            folderPath: '/Closing',
          },
        ],
      }),
    ).toThrow();
  });
});
