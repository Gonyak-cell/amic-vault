import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  EnterpriseBackupSnapshotDto,
  EnterpriseComplianceEvidenceDto,
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
            AND column_name ~* '(secret|token|password|private_key|key_material|endpoint_url|metadata_xml|assertion_xml)'
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
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: adminCookie },
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

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
