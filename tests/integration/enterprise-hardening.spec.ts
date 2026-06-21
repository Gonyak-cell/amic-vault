import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  EnterpriseBackupSnapshotDto,
  EnterpriseApprovedDmsMatterTemplateCatalogDto,
  EnterpriseApprovedDmsTaxonomyCatalogDto,
  EnterpriseComplianceEvidenceDto,
  EnterpriseDmsMatterTemplateApplicationDto,
  EnterpriseDmsMatterTemplateDto,
  EnterpriseDmsSearchRefinerDto,
  EnterpriseDmsTaxonomyDto,
  EnterpriseKeyReferenceDto,
  EnterpriseReadinessSummaryDto,
  EnterpriseSiemExportDto,
  EnterpriseSsoProviderDto,
  EnterpriseSsoSpMetadataDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('Enterprise Hardening integration', () => {
  const marker = randomUUID().slice(0, 8);
  const providerKey = `corp-idp-${marker}`;
  const keyHash = hashText(`key-${marker}`);
  const endpointHash = hashText(`endpoint-${marker}`);
  const evidenceHash = hashText(`evidence-${marker}`);
  let app: INestApplication;
  let baseUrl: string;
  let adminCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('records SSO, BYOK, SIEM, backup, and compliance readiness without raw secrets', async () => {
    const provider = await postJson<EnterpriseSsoProviderDto>('/v1/enterprise/sso-providers', {
      providerKey,
      displayName: `Corporate IdP ${marker}`,
      idpEntityId: `corp-idp-${marker}`,
      ssoUrlHash: hashText(`https://idp.example/${marker}`),
      certificateFingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD',
      metadataHash: hashText(`<xml>${marker}</xml>`),
      defaultRole: 'matter_member',
      enforcementMode: 'password_disabled',
    });
    expect(provider.status).toBe('draft');

    const activeProvider = await postJson<EnterpriseSsoProviderDto>(
      `/v1/enterprise/sso-providers/${provider.providerId}/activate`,
      {},
    );
    expect(activeProvider.status).toBe('active');

    const metadata = await getJson<EnterpriseSsoSpMetadataDto>('/v1/enterprise/sso/metadata');
    expect(metadata.activeProviderCount).toBeGreaterThanOrEqual(1);
    expect(metadata.acsPath).toBe('/v1/auth/saml/acs');

    const key = await postJson<EnterpriseKeyReferenceDto>('/v1/enterprise/key-references', {
      keyLabel: `Tenant HSM ${marker}`,
      keyProvider: 'hsm',
      keyRefHash: keyHash,
      keyFingerprint: hashText(`fingerprint-${marker}`),
    });
    const verifiedKey = await postJson<EnterpriseKeyReferenceDto>(
      `/v1/enterprise/key-references/${key.keyReferenceId}/verify`,
      {},
    );
    expect(verifiedKey.status).toBe('active');

    const siemExport = await postJson<EnterpriseSiemExportDto>('/v1/enterprise/siem/exports', {
      sinkType: 'syslog',
      endpointHash,
    });
    expect(siemExport.eventCount).toBeGreaterThan(0);

    const snapshot = await postJson<EnterpriseBackupSnapshotDto>(
      '/v1/enterprise/backups/snapshots',
      { scope: 'tenant', reasonCode: 'R13_GATE' },
    );
    expect(snapshot.tableCount).toBeGreaterThan(5);

    const evidence = await postJson<EnterpriseComplianceEvidenceDto>(
      '/v1/enterprise/compliance/evidence',
      {
        framework: 'soc2',
        controlId: `CC6.${marker.length}`,
        status: 'ready',
        evidenceRef: `soc2-access-${marker}`,
        evidenceHash,
      },
    );
    expect(evidence.status).toBe('ready');

    const readiness = await getJson<EnterpriseReadinessSummaryDto>('/v1/enterprise/readiness');
    expect(readiness.technicalPass).toBe(true);

    const audits = await enterpriseAudits();
    const auditText = JSON.stringify(audits.map((row) => row.metadata_json));
    expect(auditText).toContain(provider.providerId);
    expect(auditText).toContain(key.keyReferenceId);
    expect(auditText).toContain(siemExport.siemExportId);
    expect(auditText).toContain(snapshot.backupSnapshotId);
    expect(auditText).toContain(evidence.complianceEvidenceId);
    expect(auditText).not.toContain('https://idp.example');
    expect(auditText).not.toContain('<xml>');
    expect(auditText).not.toContain('Tenant HSM');
  });

  it('manages DMS taxonomy and search refiners with reference-only audit', async () => {
    const taxonomy = await postJson<EnterpriseDmsTaxonomyDto>('/v1/enterprise/dms/taxonomies', {
      documentTypeCode: `CONTRACT_${marker.toUpperCase()}`,
      displayName: `Contract ${marker}`,
      description: 'Commercial agreement filing profile',
      subtypes: [{ subtypeCode: 'MSA', displayName: 'Master service agreement' }],
      metadataFields: [
        {
          fieldKey: `counterparty_${marker}`,
          displayName: `Counterparty ${marker}`,
          fieldType: 'text',
          required: true,
          searchable: true,
          refinable: true,
        },
      ],
    });
    expect(taxonomy.status).toBe('active');
    expect(taxonomy.versionNo).toBe(1);
    expect(taxonomy.lastAuditEventRef).toMatch(/^audit:[0-9a-f]{12}$/);
    expect(taxonomy.subtypes).toHaveLength(1);
    expect(taxonomy.metadataFields).toHaveLength(1);

    const updatedTaxonomy = await postJson<EnterpriseDmsTaxonomyDto>('/v1/enterprise/dms/taxonomies', {
      documentTypeCode: taxonomy.documentTypeCode,
      displayName: `Contract ${marker} updated`,
      description: 'Commercial agreement filing profile',
      subtypes: [
        { subtypeCode: 'MSA', displayName: 'Master service agreement' },
        { subtypeCode: 'NDA', displayName: 'Nondisclosure agreement' },
      ],
      metadataFields: taxonomy.metadataFields,
    });
    expect(updatedTaxonomy.versionNo).toBe(taxonomy.versionNo + 1);
    expect(updatedTaxonomy.lastAuditEventRef).toMatch(/^audit:[0-9a-f]{12}$/);

    const approvedTaxonomy = await postJson<EnterpriseDmsTaxonomyDto>('/v1/enterprise/dms/taxonomies', {
      documentTypeCode: 'CONTRACT',
      displayName: `Approved Contract ${marker}`,
      description: 'Commercial agreement filing profile',
      subtypes: [{ subtypeCode: 'MSA', displayName: `Approved MSA ${marker}` }],
      metadataFields: [
        {
          fieldKey: `approved_counterparty_${marker}`,
          displayName: `Approved Counterparty ${marker}`,
          fieldType: 'text',
          required: true,
          searchable: true,
          refinable: true,
        },
      ],
    });
    expect(approvedTaxonomy.canonicalDocumentType).toBe('contract');

    const approvedCatalog = await getJsonWithCookie<EnterpriseApprovedDmsTaxonomyCatalogDto>(
      '/v1/enterprise/dms/taxonomies/approved',
      memberCookie,
    );
    const approvedContract = approvedCatalog.taxonomies.find(
      (item) => item.canonicalDocumentType === 'contract',
    );
    expect(approvedCatalog.source).toBe('tenant_admin_taxonomy');
    expect(approvedContract?.displayName).toBe(`Approved Contract ${marker}`);
    expect(approvedContract?.subtypes[0]?.displayName).toBe(`Approved MSA ${marker}`);
    expect(JSON.stringify(approvedCatalog)).not.toContain(approvedTaxonomy.taxonomyId);

    const refiner = await postJson<EnterpriseDmsSearchRefinerDto>(
      '/v1/enterprise/dms/search-refiners',
      {
        fieldKey: `counterparty_${marker}`,
        displayName: `Counterparty ${marker}`,
        fieldType: 'text',
        source: 'document_profile',
        sortOrder: 20,
      },
    );
    expect(refiner.status).toBe('active');
    expect(refiner.refinable).toBe(true);

    const template = await postJson<EnterpriseDmsMatterTemplateDto>(
      '/v1/enterprise/dms/matter-templates',
      {
        matterType: 'advisory',
        displayName: `Advisory Template ${marker}`,
        description: 'Advisory matter document set contract',
        documentSets: [
          {
            setKey: `closing_${marker}`,
            displayName: `Closing Set ${marker}`,
            documentTypeCodes: ['contract', 'memo'],
            required: true,
            sortOrder: 10,
          },
        ],
      },
    );
    expect(template.status).toBe('active');
    expect(template.documentSets[0]?.documentTypeCodes).toEqual(['contract', 'memo']);

    const approvedTemplateCatalog =
      await getJsonWithCookie<EnterpriseApprovedDmsMatterTemplateCatalogDto>(
        '/v1/enterprise/dms/matter-templates/approved?matterType=advisory',
        memberCookie,
      );
    expect(approvedTemplateCatalog.source).toBe('tenant_admin_matter_template');
    expect(approvedTemplateCatalog.templates[0]?.matterType).toBe('advisory');
    expect(JSON.stringify(approvedTemplateCatalog)).not.toContain(template.templateId);

    const client = await postJson<{ clientId: string }>('/v1/clients', {
      name: `Template Client ${marker}`,
    });
    const matter = await postJson<{ matterId: string }>('/v1/matters', {
      clientId: client.clientId,
      matterCode: `TPL-${marker}`,
      matterName: `Template Matter ${marker}`,
      matterType: 'advisory',
    });
    const application = await postJson<EnterpriseDmsMatterTemplateApplicationDto>(
      `/v1/enterprise/dms/matter-templates/${template.templateId}/apply`,
      { matterId: matter.matterId },
    );
    expect(application.matterType).toBe('advisory');
    expect(application.documentSetCount).toBe(1);
    expect(application.auditEventRef).toMatch(/^audit:[0-9a-f]{12}$/);

    const disabledTaxonomy = await postJson<EnterpriseDmsTaxonomyDto>(
      `/v1/enterprise/dms/taxonomies/${taxonomy.taxonomyId}/disable`,
      {},
    );
    expect(disabledTaxonomy.status).toBe('disabled');
    expect(disabledTaxonomy.versionNo).toBe(updatedTaxonomy.versionNo + 1);

    const disabledRefiner = await postJson<EnterpriseDmsSearchRefinerDto>(
      `/v1/enterprise/dms/search-refiners/${refiner.refinerId}/disable`,
      {},
    );
    expect(disabledRefiner.status).toBe('disabled');

    const disabledTemplate = await postJson<EnterpriseDmsMatterTemplateDto>(
      `/v1/enterprise/dms/matter-templates/${template.templateId}/disable`,
      {},
    );
    expect(disabledTemplate.status).toBe('disabled');

    const taxonomies = await getJson<{ taxonomies: EnterpriseDmsTaxonomyDto[] }>(
      '/v1/enterprise/dms/taxonomies',
    );
    expect(taxonomies.taxonomies.some((item) => item.taxonomyId === taxonomy.taxonomyId)).toBe(
      true,
    );

    const refiners = await getJson<{ refiners: EnterpriseDmsSearchRefinerDto[] }>(
      '/v1/enterprise/dms/search-refiners',
    );
    expect(refiners.refiners.some((item) => item.refinerId === refiner.refinerId)).toBe(true);

    const templates = await getJson<{ templates: EnterpriseDmsMatterTemplateDto[] }>(
      '/v1/enterprise/dms/matter-templates',
    );
    expect(templates.templates.some((item) => item.templateId === template.templateId)).toBe(true);

    const audits = await enterpriseDmsConfigurationAudits();
    const auditText = JSON.stringify(audits.map((row) => row.metadata_json));
    expect(auditText).toContain(taxonomy.taxonomyId);
    expect(auditText).toContain(refiner.refinerId);
    expect(auditText).toContain(template.templateId);
    expect(auditText).toContain(matter.matterId);
    expect(auditText).toContain(`CONTRACT_${marker.toUpperCase()}`);
    expect(auditText).toContain(`counterparty_${marker}`);
    expect(auditText).toContain('document_set_count');
    expect(auditText).toContain('version_no');
    expect(auditText).not.toContain('Commercial agreement filing profile');
    expect(auditText).not.toContain(`Contract ${marker}`);
    expect(auditText).not.toContain(`Counterparty ${marker}`);
    expect(auditText).not.toContain(`Advisory Template ${marker}`);
    expect(auditText).not.toContain(`Closing Set ${marker}`);

    const taxonomyVersions = await dmsTaxonomyVersions(taxonomy.taxonomyId);
    expect(taxonomyVersions.map((row) => row.version_no)).toEqual([1, 2, 3]);
    expect(taxonomyVersions.map((row) => row.change_reason)).toEqual([
      'upsert',
      'upsert',
      'disable',
    ]);
  });

  it('blocks non-admin enterprise configuration', async () => {
    const response = await fetch(`${baseUrl}/v1/enterprise/sso-providers`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        providerKey: `blocked-${marker}`,
        displayName: 'Blocked IdP',
        idpEntityId: `blocked-${marker}`,
        ssoUrlHash: hashText('blocked-url'),
        certificateFingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD',
        metadataHash: hashText('blocked-metadata'),
        defaultRole: 'matter_member',
        enforcementMode: 'optional',
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(`blocked-${marker}`);

    const taxonomyResponse = await fetch(`${baseUrl}/v1/enterprise/dms/taxonomies`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentTypeCode: `BLOCKED_${marker.toUpperCase()}`,
        displayName: 'Blocked Taxonomy',
        subtypes: [],
        metadataFields: [],
      }),
    });
    const taxonomyText = await taxonomyResponse.text();
    expect(taxonomyResponse.status, taxonomyText).toBe(403);
    expect(taxonomyText).not.toContain(`BLOCKED_${marker.toUpperCase()}`);

    const templateResponse = await fetch(`${baseUrl}/v1/enterprise/dms/matter-templates`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterType: 'advisory',
        displayName: 'Blocked Template',
        documentSets: [
          { setKey: 'blocked_set', displayName: 'Blocked Set', documentTypeCodes: ['contract'] },
        ],
      }),
    });
    const templateText = await templateResponse.text();
    expect(templateResponse.status, templateText).toBe(403);
    expect(templateText).not.toContain('Blocked Template');
  });

  it('keeps R13 tables RLS-protected and free of raw secret columns', async () => {
    const rows = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{
        table_name: string;
        rls: boolean;
        force_rls: boolean;
      }>(
        `
          SELECT relname AS table_name, relrowsecurity AS rls, relforcerowsecurity AS force_rls
          FROM pg_class
          WHERE relname IN (
            'enterprise_dms_search_refiners',
            'enterprise_dms_matter_template_applications',
            'enterprise_dms_matter_templates',
            'enterprise_dms_taxonomies',
            'enterprise_dms_taxonomy_versions',
            'enterprise_sso_providers',
            'enterprise_key_references',
            'enterprise_siem_exports',
            'enterprise_backup_snapshots',
            'enterprise_compliance_evidence'
          )
          ORDER BY relname
        `,
      );
      return result.rows;
    });

    expect(rows).toEqual([
      { table_name: 'enterprise_backup_snapshots', rls: true, force_rls: true },
      { table_name: 'enterprise_compliance_evidence', rls: true, force_rls: true },
      { table_name: 'enterprise_dms_matter_template_applications', rls: true, force_rls: true },
      { table_name: 'enterprise_dms_matter_templates', rls: true, force_rls: true },
      { table_name: 'enterprise_dms_search_refiners', rls: true, force_rls: true },
      { table_name: 'enterprise_dms_taxonomies', rls: true, force_rls: true },
      { table_name: 'enterprise_dms_taxonomy_versions', rls: true, force_rls: true },
      { table_name: 'enterprise_key_references', rls: true, force_rls: true },
      { table_name: 'enterprise_siem_exports', rls: true, force_rls: true },
      { table_name: 'enterprise_sso_providers', rls: true, force_rls: true },
    ]);

    const grantsAndColumns = await withClient(createOwnerClient(), async (client) => {
      const grants = await client.query<{ table_name: string; privilege_type: string }>(
        `
          SELECT table_name, privilege_type
          FROM information_schema.table_privileges
          WHERE grantee = 'vault_app'
            AND privilege_type IN ('DELETE', 'TRUNCATE')
            AND table_schema = 'public'
            AND table_name LIKE 'enterprise_%'
          ORDER BY table_name, privilege_type
        `,
      );
      const columns = await client.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name LIKE 'enterprise_%'
            AND column_name ~* '(secret|token|password|private_key|key_material|endpoint_url|metadata_xml|assertion_xml|body_text|snippet_text|prompt_text|response_text)'
          ORDER BY table_name, column_name
        `,
      );
      return { grants: grants.rows, columns: columns.rows };
    });

    expect(grantsAndColumns.grants).toEqual([]);
    expect(grantsAndColumns.columns).toEqual([]);
  });

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.ok, text).toBe(true);
    return JSON.parse(text) as T;
  }

  async function getJson<T>(path: string): Promise<T> {
    return getJsonWithCookie<T>(path, adminCookie);
  }

  async function getJsonWithCookie<T>(path: string, cookie: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.ok, text).toBe(true);
    return JSON.parse(text) as T;
  }
});

async function enterpriseAudits(): Promise<Array<{ action: string; metadata_json: unknown }>> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; metadata_json: unknown }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action IN (
            'SSO_PROVIDER_CHANGED',
            'SSO_METADATA_VIEWED',
            'BYOK_KEY_REFERENCE_CHANGED',
            'SIEM_EXPORT_RECORDED',
            'BACKUP_SNAPSHOT_RECORDED',
            'COMPLIANCE_EVIDENCE_RECORDED',
            'ENTERPRISE_DMS_CONFIGURATION_CHANGED',
            'ENTERPRISE_READINESS_VIEWED'
          )
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [tenantAlphaId],
    );
    return result.rows;
  });
}

async function dmsTaxonomyVersions(
  taxonomyId: string,
): Promise<Array<{ change_reason: string; version_no: number }>> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ change_reason: string; version_no: number }>(
      `
        SELECT change_reason, version_no
        FROM enterprise_dms_taxonomy_versions
        WHERE tenant_id = $1
          AND taxonomy_id = $2
        ORDER BY version_no ASC
      `,
      [tenantAlphaId, taxonomyId],
    );
    return result.rows;
  });
}

async function enterpriseDmsConfigurationAudits(): Promise<
  Array<{ action: string; metadata_json: unknown }>
> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; metadata_json: unknown }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'ENTERPRISE_DMS_CONFIGURATION_CHANGED'
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [tenantAlphaId],
    );
    return result.rows;
  });
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
