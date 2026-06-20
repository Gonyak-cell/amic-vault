import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  enterpriseBackupSnapshotListResponseSchema,
  enterpriseBackupSnapshotSchema,
  enterpriseComplianceEvidenceListResponseSchema,
  enterpriseComplianceEvidenceSchema,
  enterpriseApprovedDmsTaxonomyCatalogSchema,
  enterpriseApprovedDmsTaxonomySchema,
  enterpriseDmsSearchRefinerListResponseSchema,
  enterpriseDmsSearchRefinerSchema,
  enterpriseDmsTaxonomyListResponseSchema,
  enterpriseDmsTaxonomySchema,
  enterpriseKeyReferenceListResponseSchema,
  enterpriseKeyReferenceSchema,
  enterpriseReadinessSummarySchema,
  enterpriseSiemExportListResponseSchema,
  enterpriseSiemExportSchema,
  enterpriseSsoProviderListResponseSchema,
  enterpriseSsoProviderSchema,
  enterpriseSsoSpMetadataSchema,
  documentTypes,
  type CreateEnterpriseBackupSnapshotRequestDto,
  type CreateEnterpriseComplianceEvidenceRequestDto,
  type CreateEnterpriseKeyReferenceRequestDto,
  type CreateEnterpriseSiemExportRequestDto,
  type CreateEnterpriseSsoProviderRequestDto,
  type DocumentType,
  type EnterpriseBackupSnapshotDto,
  type EnterpriseBackupSnapshotListResponseDto,
  type EnterpriseComplianceEvidenceDto,
  type EnterpriseComplianceEvidenceListResponseDto,
  type EnterpriseApprovedDmsTaxonomyCatalogDto,
  type EnterpriseApprovedDmsTaxonomyDto,
  type EnterpriseDmsSearchRefinerDto,
  type EnterpriseDmsSearchRefinerListResponseDto,
  type EnterpriseDmsTaxonomyDto,
  type EnterpriseDmsTaxonomyListResponseDto,
  type EnterpriseKeyReferenceDto,
  type EnterpriseKeyReferenceListResponseDto,
  type EnterpriseReadinessSummaryDto,
  type EnterpriseSiemExportDto,
  type EnterpriseSiemExportListResponseDto,
  type EnterpriseSsoProviderDto,
  type EnterpriseSsoProviderListResponseDto,
  type EnterpriseSsoSpMetadataDto,
  type PermissionContext,
  type UpsertEnterpriseDmsSearchRefinerRequestDto,
  type UpsertEnterpriseDmsTaxonomyRequestDto,
} from '@amic-vault/shared';
import { AuditService, type AuditLogResult } from '../audit/audit.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface ActorRoleRow {
  role: string;
  status: string;
}

interface SsoProviderRow {
  provider_id: string;
  provider_key: string;
  display_name: string;
  protocol: 'saml2';
  status: 'draft' | 'active' | 'disabled';
  idp_entity_id: string;
  sso_url_hash: string;
  certificate_fingerprint: string;
  metadata_hash: string;
  default_role: string;
  enforcement_mode: 'optional' | 'password_disabled';
  created_at: Date;
  updated_at: Date;
}

interface KeyReferenceRow {
  key_reference_id: string;
  key_label: string;
  key_provider: 'local_kms' | 'cloud_kms' | 'hsm';
  key_ref_hash: string;
  key_fingerprint: string;
  status: 'pending' | 'active' | 'rotating' | 'disabled';
  rotation_due_at: Date | null;
  last_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SiemExportRow {
  siem_export_id: string;
  sink_type: 'syslog' | 'webhook' | 's3';
  endpoint_hash: string;
  seq_start: string;
  seq_end: string;
  event_count: number;
  manifest_hash: string;
  status: 'recorded';
  created_at: Date;
}

interface BackupSnapshotRow {
  backup_snapshot_id: string;
  scope: 'tenant' | 'audit' | 'configuration';
  status: 'recorded' | 'verified' | 'failed';
  manifest_hash: string;
  row_counts_hash: string;
  table_count: number;
  reason_code: string;
  created_at: Date;
}

interface ComplianceEvidenceRow {
  compliance_evidence_id: string;
  framework: 'soc2' | 'iso27001';
  control_id: string;
  status: 'ready' | 'gap' | 'accepted';
  evidence_ref: string;
  evidence_hash: string;
  owner_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DmsTaxonomyRow {
  taxonomy_id: string;
  document_type_code: string;
  display_name: string;
  description: string | null;
  status: 'active' | 'disabled';
  subtypes_json: unknown;
  metadata_fields_json: unknown;
  version_no: number;
  last_audit_event_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DmsSearchRefinerRow {
  refiner_id: string;
  field_key: string;
  display_name: string;
  field_type: 'text' | 'date' | 'user' | 'matter' | 'boolean' | 'number' | 'select';
  source: 'document_profile' | 'matter_profile' | 'records' | 'system';
  searchable: boolean;
  refinable: boolean;
  filterable: boolean;
  status: 'active' | 'disabled';
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

const backupTables = [
  'users',
  'clients',
  'matters',
  'documents',
  'document_versions',
  'audit_events',
  'external_secure_links',
  'retention_policies',
  'disposal_requests',
  'enterprise_sso_providers',
  'enterprise_key_references',
  'enterprise_compliance_evidence',
] as const;

@Injectable()
export class EnterpriseService {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async createSsoProvider(
    ctx: PermissionContext,
    input: CreateEnterpriseSsoProviderRequestDto,
  ): Promise<EnterpriseSsoProviderDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<SsoProviderRow>(
        `
          INSERT INTO enterprise_sso_providers (
            tenant_id, provider_key, display_name, idp_entity_id, sso_url_hash,
            certificate_fingerprint, metadata_hash, default_role, enforcement_mode,
            created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
          RETURNING provider_id, provider_key, display_name, protocol, status,
            idp_entity_id, sso_url_hash, certificate_fingerprint, metadata_hash,
            default_role, enforcement_mode, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.providerKey,
          input.displayName,
          input.idpEntityId,
          input.ssoUrlHash,
          input.certificateFingerprint,
          input.metadataHash,
          input.defaultRole,
          input.enforcementMode,
          ctx.userId,
        ],
      );
      const provider = mapSsoProvider(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'SSO_PROVIDER_CHANGED',
          targetType: 'enterprise_sso_provider',
          targetId: provider.providerId,
          metadata: {
            provider_id: provider.providerId,
            provider_key: provider.providerKey,
            metadata_hash: provider.metadataHash,
            certificate_fingerprint: provider.certificateFingerprint,
            status_after: provider.status,
          },
        },
        client,
      );
      return provider;
    });
  }

  async listSsoProviders(ctx: PermissionContext): Promise<EnterpriseSsoProviderListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<SsoProviderRow>(
      `
        SELECT provider_id, provider_key, display_name, protocol, status,
          idp_entity_id, sso_url_hash, certificate_fingerprint, metadata_hash,
          default_role, enforcement_mode, created_at, updated_at
        FROM enterprise_sso_providers
        WHERE tenant_id = $1
        ORDER BY provider_key
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return enterpriseSsoProviderListResponseSchema.parse({
      providers: result.rows.map(mapSsoProvider),
    });
  }

  async activateSsoProvider(
    ctx: PermissionContext,
    providerId: string,
  ): Promise<EnterpriseSsoProviderDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<SsoProviderRow>(
        `
          UPDATE enterprise_sso_providers
          SET status = 'active',
              updated_by = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND provider_id = $2
            AND status <> 'disabled'
          RETURNING provider_id, provider_key, display_name, protocol, status,
            idp_entity_id, sso_url_hash, certificate_fingerprint, metadata_hash,
            default_role, enforcement_mode, created_at, updated_at
        `,
        [ctx.tenantId, providerId, ctx.userId],
      );
      const provider = mapSsoProvider(requiredRow(result.rows[0]));
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'SSO_PROVIDER_CHANGED',
          targetType: 'enterprise_sso_provider',
          targetId: provider.providerId,
          metadata: {
            provider_id: provider.providerId,
            provider_key: provider.providerKey,
            status_after: provider.status,
            metadata_hash: provider.metadataHash,
          },
        },
        client,
      );
      return provider;
    });
  }

  async spMetadata(ctx: PermissionContext): Promise<EnterpriseSsoSpMetadataDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM enterprise_sso_providers
          WHERE tenant_id = $1
            AND status = 'active'
        `,
        [ctx.tenantId],
      );
      const activeProviderCount = Number(result.rows[0]?.count ?? '0');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'SSO_METADATA_VIEWED',
          targetType: 'enterprise_sso_metadata',
          targetId: null,
          metadata: {
            provider_key: 'sp',
            result_count: activeProviderCount,
          },
        },
        client,
      );
      return enterpriseSsoSpMetadataSchema.parse({
        tenantId: ctx.tenantId,
        entityId: `urn:amic-vault:saml:${ctx.tenantId}`,
        acsPath: '/v1/auth/saml/acs',
        protocol: 'saml2',
        activeProviderCount,
      });
    });
  }

  async createKeyReference(
    ctx: PermissionContext,
    input: CreateEnterpriseKeyReferenceRequestDto,
  ): Promise<EnterpriseKeyReferenceDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<KeyReferenceRow>(
        `
          INSERT INTO enterprise_key_references (
            tenant_id, key_label, key_provider, key_ref_hash, key_fingerprint,
            rotation_due_at, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $7)
          RETURNING key_reference_id, key_label, key_provider, key_ref_hash,
            key_fingerprint, status, rotation_due_at, last_verified_at, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.keyLabel,
          input.keyProvider,
          input.keyRefHash,
          input.keyFingerprint,
          input.rotationDueAt ?? null,
          ctx.userId,
        ],
      );
      const key = mapKeyReference(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'BYOK_KEY_REFERENCE_CHANGED',
          targetType: 'enterprise_key_reference',
          targetId: key.keyReferenceId,
          metadata: {
            key_reference_id: key.keyReferenceId,
            key_ref_hash: key.keyRefHash,
            key_fingerprint: key.keyFingerprint,
            status_after: key.status,
          },
        },
        client,
      );
      return key;
    });
  }

  async listKeyReferences(ctx: PermissionContext): Promise<EnterpriseKeyReferenceListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<KeyReferenceRow>(
      `
        SELECT key_reference_id, key_label, key_provider, key_ref_hash,
          key_fingerprint, status, rotation_due_at, last_verified_at, created_at, updated_at
        FROM enterprise_key_references
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return enterpriseKeyReferenceListResponseSchema.parse({
      keys: result.rows.map(mapKeyReference),
    });
  }

  async verifyKeyReference(
    ctx: PermissionContext,
    keyReferenceId: string,
  ): Promise<EnterpriseKeyReferenceDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<KeyReferenceRow>(
        `
          UPDATE enterprise_key_references
          SET status = 'active',
              last_verified_at = now(),
              updated_by = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND key_reference_id = $2
            AND status <> 'disabled'
          RETURNING key_reference_id, key_label, key_provider, key_ref_hash,
            key_fingerprint, status, rotation_due_at, last_verified_at, created_at, updated_at
        `,
        [ctx.tenantId, keyReferenceId, ctx.userId],
      );
      const key = mapKeyReference(requiredRow(result.rows[0]));
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'BYOK_KEY_REFERENCE_CHANGED',
          targetType: 'enterprise_key_reference',
          targetId: key.keyReferenceId,
          metadata: {
            key_reference_id: key.keyReferenceId,
            key_ref_hash: key.keyRefHash,
            key_fingerprint: key.keyFingerprint,
            status_after: key.status,
          },
        },
        client,
      );
      return key;
    });
  }

  async createSiemExport(
    ctx: PermissionContext,
    input: CreateEnterpriseSiemExportRequestDto,
  ): Promise<EnterpriseSiemExportDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const bounds = await auditBounds(client, ctx.tenantId, input.fromSeq ?? null, input.toSeq ?? null);
      const manifestHash = hashJson({
        tenantId: ctx.tenantId,
        sinkType: input.sinkType,
        endpointHash: input.endpointHash,
        ...bounds,
      });
      const result = await client.query<SiemExportRow>(
        `
          INSERT INTO enterprise_siem_exports (
            tenant_id, sink_type, endpoint_hash, seq_start, seq_end,
            event_count, manifest_hash, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING siem_export_id, sink_type, endpoint_hash, seq_start, seq_end,
            event_count, manifest_hash, status, created_at
        `,
        [
          ctx.tenantId,
          input.sinkType,
          input.endpointHash,
          bounds.seqStart,
          bounds.seqEnd,
          bounds.eventCount,
          manifestHash,
          ctx.userId,
        ],
      );
      const exportRow = mapSiemExport(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'SIEM_EXPORT_RECORDED',
          targetType: 'enterprise_siem_export',
          targetId: exportRow.siemExportId,
          metadata: {
            siem_export_id: exportRow.siemExportId,
            sink_type: exportRow.sinkType,
            endpoint_hash: exportRow.endpointHash,
            seq_start: exportRow.seqStart,
            seq_end: exportRow.seqEnd,
            event_count: exportRow.eventCount,
            hash: exportRow.manifestHash,
          },
        },
        client,
      );
      return exportRow;
    });
  }

  async listSiemExports(ctx: PermissionContext): Promise<EnterpriseSiemExportListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<SiemExportRow>(
      `
        SELECT siem_export_id, sink_type, endpoint_hash, seq_start, seq_end,
          event_count, manifest_hash, status, created_at
        FROM enterprise_siem_exports
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return enterpriseSiemExportListResponseSchema.parse({
      exports: result.rows.map(mapSiemExport),
    });
  }

  async createBackupSnapshot(
    ctx: PermissionContext,
    input: CreateEnterpriseBackupSnapshotRequestDto,
  ): Promise<EnterpriseBackupSnapshotDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rowCounts = await tenantRowCounts(client, ctx.tenantId);
      const rowCountsHash = hashJson(rowCounts);
      const tableCount = Object.keys(rowCounts).length;
      const manifestHash = hashJson({
        tenantId: ctx.tenantId,
        scope: input.scope,
        reasonCode: input.reasonCode,
        rowCountsHash,
        tableCount,
      });
      const result = await client.query<BackupSnapshotRow>(
        `
          INSERT INTO enterprise_backup_snapshots (
            tenant_id, scope, manifest_hash, row_counts_hash, row_counts_json,
            table_count, reason_code, created_by
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
          RETURNING backup_snapshot_id, scope, status, manifest_hash,
            row_counts_hash, table_count, reason_code, created_at
        `,
        [
          ctx.tenantId,
          input.scope,
          manifestHash,
          rowCountsHash,
          JSON.stringify(rowCounts),
          tableCount,
          input.reasonCode,
          ctx.userId,
        ],
      );
      const snapshot = mapBackupSnapshot(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'BACKUP_SNAPSHOT_RECORDED',
          targetType: 'enterprise_backup_snapshot',
          targetId: snapshot.backupSnapshotId,
          metadata: {
            backup_snapshot_id: snapshot.backupSnapshotId,
            scope_type: snapshot.scope,
            hash: snapshot.manifestHash,
            row_counts_hash: snapshot.rowCountsHash,
            table_count: snapshot.tableCount,
            reason_code: snapshot.reasonCode,
          },
        },
        client,
      );
      return snapshot;
    });
  }

  async listBackupSnapshots(
    ctx: PermissionContext,
  ): Promise<EnterpriseBackupSnapshotListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<BackupSnapshotRow>(
      `
        SELECT backup_snapshot_id, scope, status, manifest_hash,
          row_counts_hash, table_count, reason_code, created_at
        FROM enterprise_backup_snapshots
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [ctx.tenantId],
    );
    return enterpriseBackupSnapshotListResponseSchema.parse({
      snapshots: result.rows.map(mapBackupSnapshot),
    });
  }

  async createComplianceEvidence(
    ctx: PermissionContext,
    input: CreateEnterpriseComplianceEvidenceRequestDto,
  ): Promise<EnterpriseComplianceEvidenceDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<ComplianceEvidenceRow>(
        `
          INSERT INTO enterprise_compliance_evidence (
            tenant_id, framework, control_id, status, evidence_ref, evidence_hash,
            owner_user_id, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          RETURNING compliance_evidence_id, framework, control_id, status,
            evidence_ref, evidence_hash, owner_user_id, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.framework,
          input.controlId,
          input.status,
          input.evidenceRef,
          input.evidenceHash,
          input.ownerUserId ?? null,
          ctx.userId,
        ],
      );
      const evidence = mapComplianceEvidence(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'COMPLIANCE_EVIDENCE_RECORDED',
          targetType: 'enterprise_compliance_evidence',
          targetId: evidence.complianceEvidenceId,
          metadata: {
            evidence_id: evidence.complianceEvidenceId,
            framework: evidence.framework,
            control_id: evidence.controlId,
            evidence_ref: evidence.evidenceRef,
            evidence_hash: evidence.evidenceHash,
            status_after: evidence.status,
          },
        },
        client,
      );
      return evidence;
    });
  }

  async listComplianceEvidence(
    ctx: PermissionContext,
  ): Promise<EnterpriseComplianceEvidenceListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<ComplianceEvidenceRow>(
      `
        SELECT compliance_evidence_id, framework, control_id, status,
          evidence_ref, evidence_hash, owner_user_id, created_at, updated_at
        FROM enterprise_compliance_evidence
        WHERE tenant_id = $1
        ORDER BY framework, control_id, created_at DESC
        LIMIT 100
      `,
      [ctx.tenantId],
    );
    return enterpriseComplianceEvidenceListResponseSchema.parse({
      evidence: result.rows.map(mapComplianceEvidence),
    });
  }

  async readiness(ctx: PermissionContext): Promise<EnterpriseReadinessSummaryDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const summary = await readinessSummary(client, ctx.tenantId);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'ENTERPRISE_READINESS_VIEWED',
          targetType: 'enterprise_readiness',
          targetId: null,
          metadata: {
            readiness_status: summary.technicalPass ? 'technical_pass' : 'gap',
            result_count:
              summary.activeSsoProviderCount +
              summary.activeKeyReferenceCount +
              summary.siemExportCount +
              summary.backupSnapshotCount +
              summary.complianceReadyCount,
          },
        },
        client,
      );
      return summary;
    });
  }

  async upsertDmsTaxonomy(
    ctx: PermissionContext,
    input: UpsertEnterpriseDmsTaxonomyRequestDto,
  ): Promise<EnterpriseDmsTaxonomyDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<DmsTaxonomyRow>(
        `
          INSERT INTO enterprise_dms_taxonomies (
            tenant_id, document_type_code, display_name, description, status,
            subtypes_json, metadata_fields_json, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, 'active', $5::jsonb, $6::jsonb, $7, $7)
          ON CONFLICT (tenant_id, document_type_code)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            status = 'active',
            subtypes_json = EXCLUDED.subtypes_json,
            metadata_fields_json = EXCLUDED.metadata_fields_json,
            updated_by = EXCLUDED.updated_by,
            version_no = enterprise_dms_taxonomies.version_no + 1,
            updated_at = now()
          RETURNING taxonomy_id, document_type_code, display_name, description,
            status, subtypes_json, metadata_fields_json, version_no,
            last_audit_event_id, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.documentTypeCode,
          input.displayName,
          input.description ?? null,
          JSON.stringify(input.subtypes),
          JSON.stringify(input.metadataFields),
          ctx.userId,
        ],
      );
      const row = requiredRow(result.rows[0]);
      const taxonomy = mapDmsTaxonomy(row);
      const audit = await this.logDmsConfigurationChange(client, ctx, 'enterprise_dms_taxonomy', taxonomy.taxonomyId, {
        taxonomy_id: taxonomy.taxonomyId,
        document_type_code: taxonomy.documentTypeCode,
        subtype_count: taxonomy.subtypes.length,
        metadata_field_count: taxonomy.metadataFields.length,
        status_after: taxonomy.status,
        version_no: taxonomy.versionNo,
      });
      const auditedRow = await this.setDmsTaxonomyAuditEvent(client, ctx, row, audit.eventId);
      await this.recordDmsTaxonomyVersion(client, ctx, auditedRow, 'upsert', audit.eventId);
      return mapDmsTaxonomy(auditedRow);
    });
  }

  async listDmsTaxonomies(
    ctx: PermissionContext,
  ): Promise<EnterpriseDmsTaxonomyListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<DmsTaxonomyRow>(
      `
        SELECT taxonomy_id, document_type_code, display_name, description,
          status, subtypes_json, metadata_fields_json, version_no,
          last_audit_event_id, created_at, updated_at
        FROM enterprise_dms_taxonomies
        WHERE tenant_id = $1
        ORDER BY status, document_type_code
        LIMIT 100
      `,
      [ctx.tenantId],
    );
    return enterpriseDmsTaxonomyListResponseSchema.parse({
      taxonomies: result.rows.map(mapDmsTaxonomy),
    });
  }

  async listApprovedDmsTaxonomies(
    ctx: PermissionContext,
  ): Promise<EnterpriseApprovedDmsTaxonomyCatalogDto> {
    await this.assertActiveInternalUser(ctx);
    const result = await getPool().query<DmsTaxonomyRow>(
      `
        SELECT taxonomy_id, document_type_code, display_name, description,
          status, subtypes_json, metadata_fields_json, version_no,
          last_audit_event_id, created_at, updated_at
        FROM enterprise_dms_taxonomies
        WHERE tenant_id = $1
          AND status = 'active'
          AND lower(document_type_code) = ANY($2::text[])
        ORDER BY document_type_code
        LIMIT 100
      `,
      [ctx.tenantId, documentTypes],
    );
    return enterpriseApprovedDmsTaxonomyCatalogSchema.parse({
      source: 'tenant_admin_taxonomy',
      generatedAt: new Date().toISOString(),
      taxonomies: result.rows.map(mapApprovedDmsTaxonomy),
    });
  }

  async disableDmsTaxonomy(
    ctx: PermissionContext,
    taxonomyId: string,
  ): Promise<EnterpriseDmsTaxonomyDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<DmsTaxonomyRow>(
        `
          UPDATE enterprise_dms_taxonomies
          SET status = 'disabled',
              updated_by = $3,
              version_no = version_no + 1,
              updated_at = now()
          WHERE tenant_id = $1
            AND taxonomy_id = $2
          RETURNING taxonomy_id, document_type_code, display_name, description,
            status, subtypes_json, metadata_fields_json, version_no,
            last_audit_event_id, created_at, updated_at
        `,
        [ctx.tenantId, taxonomyId, ctx.userId],
      );
      const row = requiredRow(result.rows[0]);
      const taxonomy = mapDmsTaxonomy(row);
      const audit = await this.logDmsConfigurationChange(client, ctx, 'enterprise_dms_taxonomy', taxonomy.taxonomyId, {
        taxonomy_id: taxonomy.taxonomyId,
        document_type_code: taxonomy.documentTypeCode,
        subtype_count: taxonomy.subtypes.length,
        metadata_field_count: taxonomy.metadataFields.length,
        status_after: taxonomy.status,
        version_no: taxonomy.versionNo,
      });
      const auditedRow = await this.setDmsTaxonomyAuditEvent(client, ctx, row, audit.eventId);
      await this.recordDmsTaxonomyVersion(client, ctx, auditedRow, 'disable', audit.eventId);
      return mapDmsTaxonomy(auditedRow);
    });
  }

  async upsertDmsSearchRefiner(
    ctx: PermissionContext,
    input: UpsertEnterpriseDmsSearchRefinerRequestDto,
  ): Promise<EnterpriseDmsSearchRefinerDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<DmsSearchRefinerRow>(
        `
          INSERT INTO enterprise_dms_search_refiners (
            tenant_id, field_key, display_name, field_type, source, searchable,
            refinable, filterable, status, sort_order, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $10)
          ON CONFLICT (tenant_id, field_key)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            field_type = EXCLUDED.field_type,
            source = EXCLUDED.source,
            searchable = EXCLUDED.searchable,
            refinable = EXCLUDED.refinable,
            filterable = EXCLUDED.filterable,
            status = 'active',
            sort_order = EXCLUDED.sort_order,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
          RETURNING refiner_id, field_key, display_name, field_type, source,
            searchable, refinable, filterable, status, sort_order, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.fieldKey,
          input.displayName,
          input.fieldType,
          input.source,
          input.searchable,
          input.refinable,
          input.filterable,
          input.sortOrder,
          ctx.userId,
        ],
      );
      const refiner = mapDmsSearchRefiner(result.rows[0]);
      await this.logDmsConfigurationChange(client, ctx, 'enterprise_dms_search_refiner', refiner.refinerId, {
        refiner_id: refiner.refinerId,
        field_key: refiner.fieldKey,
        status_after: refiner.status,
      });
      return refiner;
    });
  }

  async listDmsSearchRefiners(
    ctx: PermissionContext,
  ): Promise<EnterpriseDmsSearchRefinerListResponseDto> {
    await this.assertEnterpriseAdmin(ctx);
    const result = await getPool().query<DmsSearchRefinerRow>(
      `
        SELECT refiner_id, field_key, display_name, field_type, source,
          searchable, refinable, filterable, status, sort_order, created_at, updated_at
        FROM enterprise_dms_search_refiners
        WHERE tenant_id = $1
        ORDER BY status, sort_order, field_key
        LIMIT 100
      `,
      [ctx.tenantId],
    );
    return enterpriseDmsSearchRefinerListResponseSchema.parse({
      refiners: result.rows.map(mapDmsSearchRefiner),
    });
  }

  async disableDmsSearchRefiner(
    ctx: PermissionContext,
    refinerId: string,
  ): Promise<EnterpriseDmsSearchRefinerDto> {
    await this.assertEnterpriseAdmin(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<DmsSearchRefinerRow>(
        `
          UPDATE enterprise_dms_search_refiners
          SET status = 'disabled',
              updated_by = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND refiner_id = $2
          RETURNING refiner_id, field_key, display_name, field_type, source,
            searchable, refinable, filterable, status, sort_order, created_at, updated_at
        `,
        [ctx.tenantId, refinerId, ctx.userId],
      );
      const refiner = mapDmsSearchRefiner(requiredRow(result.rows[0]));
      await this.logDmsConfigurationChange(client, ctx, 'enterprise_dms_search_refiner', refiner.refinerId, {
        refiner_id: refiner.refinerId,
        field_key: refiner.fieldKey,
        status_after: refiner.status,
      });
      return refiner;
    });
  }

  private async logDmsConfigurationChange(
    client: PoolClient,
    ctx: PermissionContext,
    targetType: string,
    targetId: string,
    metadata: {
      taxonomy_id?: string;
      document_type_code?: string;
      subtype_count?: number;
      metadata_field_count?: number;
      refiner_id?: string;
      field_key?: string;
      version_no?: number;
      status_after: string;
    },
  ): Promise<AuditLogResult> {
    return this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'ENTERPRISE_DMS_CONFIGURATION_CHANGED',
        targetType,
        targetId,
        metadata,
      },
      client,
    );
  }

  private async setDmsTaxonomyAuditEvent(
    client: PoolClient,
    ctx: PermissionContext,
    row: DmsTaxonomyRow,
    auditEventId: string,
  ): Promise<DmsTaxonomyRow> {
    const result = await client.query<DmsTaxonomyRow>(
      `
        UPDATE enterprise_dms_taxonomies
        SET last_audit_event_id = $3
        WHERE tenant_id = $1
          AND taxonomy_id = $2
        RETURNING taxonomy_id, document_type_code, display_name, description,
          status, subtypes_json, metadata_fields_json, version_no,
          last_audit_event_id, created_at, updated_at
      `,
      [ctx.tenantId, row.taxonomy_id, auditEventId],
    );
    return requiredRow(result.rows[0]);
  }

  private async recordDmsTaxonomyVersion(
    client: PoolClient,
    ctx: PermissionContext,
    row: DmsTaxonomyRow,
    changeReason: 'upsert' | 'disable',
    auditEventId: string,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO enterprise_dms_taxonomy_versions (
          tenant_id, taxonomy_id, version_no, document_type_code, display_name,
          description, status, subtypes_json, metadata_fields_json, change_reason,
          changed_by, audit_event_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
      `,
      [
        ctx.tenantId,
        row.taxonomy_id,
        row.version_no,
        row.document_type_code,
        row.display_name,
        row.description,
        row.status,
        JSON.stringify(row.subtypes_json),
        JSON.stringify(row.metadata_fields_json),
        changeReason,
        ctx.userId,
        auditEventId,
      ],
    );
  }

  private async assertEnterpriseAdmin(ctx: PermissionContext): Promise<void> {
    const result = await getPool().query<ActorRoleRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active' || !['firm_admin', 'security_admin'].includes(row.role)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async assertActiveInternalUser(ctx: PermissionContext): Promise<void> {
    const result = await getPool().query<ActorRoleRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active' || row.role === 'external_user') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }
}

function requiredRow<T>(row: T | undefined): T {
  if (!row) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
  return row;
}

function mapSsoProvider(row: SsoProviderRow | undefined): EnterpriseSsoProviderDto {
  const value = requiredRow(row);
  return enterpriseSsoProviderSchema.parse({
    providerId: value.provider_id,
    providerKey: value.provider_key,
    displayName: value.display_name,
    protocol: value.protocol,
    status: value.status,
    idpEntityId: value.idp_entity_id,
    ssoUrlHash: value.sso_url_hash,
    certificateFingerprint: value.certificate_fingerprint,
    metadataHash: value.metadata_hash,
    defaultRole: value.default_role,
    enforcementMode: value.enforcement_mode,
    createdAt: value.created_at.toISOString(),
    updatedAt: value.updated_at.toISOString(),
  });
}

function mapKeyReference(row: KeyReferenceRow | undefined): EnterpriseKeyReferenceDto {
  const value = requiredRow(row);
  return enterpriseKeyReferenceSchema.parse({
    keyReferenceId: value.key_reference_id,
    keyLabel: value.key_label,
    keyProvider: value.key_provider,
    keyRefHash: value.key_ref_hash,
    keyFingerprint: value.key_fingerprint,
    status: value.status,
    rotationDueAt: value.rotation_due_at?.toISOString() ?? null,
    lastVerifiedAt: value.last_verified_at?.toISOString() ?? null,
    createdAt: value.created_at.toISOString(),
    updatedAt: value.updated_at.toISOString(),
  });
}

function mapSiemExport(row: SiemExportRow | undefined): EnterpriseSiemExportDto {
  const value = requiredRow(row);
  return enterpriseSiemExportSchema.parse({
    siemExportId: value.siem_export_id,
    sinkType: value.sink_type,
    endpointHash: value.endpoint_hash,
    seqStart: Number(value.seq_start),
    seqEnd: Number(value.seq_end),
    eventCount: value.event_count,
    manifestHash: value.manifest_hash,
    status: value.status,
    createdAt: value.created_at.toISOString(),
  });
}

function mapBackupSnapshot(row: BackupSnapshotRow | undefined): EnterpriseBackupSnapshotDto {
  const value = requiredRow(row);
  return enterpriseBackupSnapshotSchema.parse({
    backupSnapshotId: value.backup_snapshot_id,
    scope: value.scope,
    status: value.status,
    manifestHash: value.manifest_hash,
    rowCountsHash: value.row_counts_hash,
    tableCount: value.table_count,
    reasonCode: value.reason_code,
    createdAt: value.created_at.toISOString(),
  });
}

function mapComplianceEvidence(
  row: ComplianceEvidenceRow | undefined,
): EnterpriseComplianceEvidenceDto {
  const value = requiredRow(row);
  return enterpriseComplianceEvidenceSchema.parse({
    complianceEvidenceId: value.compliance_evidence_id,
    framework: value.framework,
    controlId: value.control_id,
    status: value.status,
    evidenceRef: value.evidence_ref,
    evidenceHash: value.evidence_hash,
    ownerUserId: value.owner_user_id,
    createdAt: value.created_at.toISOString(),
    updatedAt: value.updated_at.toISOString(),
  });
}

function mapDmsTaxonomy(row: DmsTaxonomyRow | undefined): EnterpriseDmsTaxonomyDto {
  const value = requiredRow(row);
  const canonicalDocumentType = canonicalDocumentTypeForCode(value.document_type_code);
  return enterpriseDmsTaxonomySchema.parse({
    taxonomyId: value.taxonomy_id,
    documentTypeCode: value.document_type_code,
    ...(canonicalDocumentType ? { canonicalDocumentType } : {}),
    displayName: value.display_name,
    description: value.description,
    status: value.status,
    subtypes: value.subtypes_json,
    metadataFields: value.metadata_fields_json,
    versionNo: value.version_no,
    lastAuditEventRef: auditRef(value.last_audit_event_id),
    createdAt: value.created_at.toISOString(),
    updatedAt: value.updated_at.toISOString(),
  });
}

function mapApprovedDmsTaxonomy(
  row: DmsTaxonomyRow | undefined,
): EnterpriseApprovedDmsTaxonomyDto {
  const value = requiredRow(row);
  const canonicalDocumentType = canonicalDocumentTypeForCode(value.document_type_code);
  if (!canonicalDocumentType) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
  return enterpriseApprovedDmsTaxonomySchema.parse({
    documentTypeCode: value.document_type_code,
    canonicalDocumentType,
    displayName: value.display_name,
    description: value.description,
    subtypes: value.subtypes_json,
    metadataFields: value.metadata_fields_json,
    versionNo: value.version_no,
    updatedAt: value.updated_at.toISOString(),
  });
}

function canonicalDocumentTypeForCode(code: string): DocumentType | undefined {
  const normalized = code.toLowerCase();
  return (documentTypes as readonly string[]).includes(normalized)
    ? (normalized as DocumentType)
    : undefined;
}

function auditRef(eventId: string | null | undefined): string | null {
  if (!eventId) return null;
  return `audit:${createHash('sha256').update(eventId).digest('hex').slice(0, 12)}`;
}

function mapDmsSearchRefiner(
  row: DmsSearchRefinerRow | undefined,
): EnterpriseDmsSearchRefinerDto {
  const value = requiredRow(row);
  return enterpriseDmsSearchRefinerSchema.parse({
    refinerId: value.refiner_id,
    fieldKey: value.field_key,
    displayName: value.display_name,
    fieldType: value.field_type,
    source: value.source,
    searchable: value.searchable,
    refinable: value.refinable,
    filterable: value.filterable,
    status: value.status,
    sortOrder: value.sort_order,
    createdAt: value.created_at.toISOString(),
    updatedAt: value.updated_at.toISOString(),
  });
}

async function auditBounds(
  client: PoolClient,
  tenantId: string,
  fromSeq: number | null,
  toSeq: number | null,
): Promise<{ seqStart: number; seqEnd: number; eventCount: number }> {
  const result = await client.query<{ seq_start: string | null; seq_end: string | null; event_count: string }>(
    `
      SELECT
        COALESCE(min(seq), 0)::text AS seq_start,
        COALESCE(max(seq), 0)::text AS seq_end,
        count(*)::text AS event_count
      FROM audit_events
      WHERE tenant_id = $1
        AND ($2::bigint IS NULL OR seq >= $2::bigint)
        AND ($3::bigint IS NULL OR seq <= $3::bigint)
    `,
    [tenantId, fromSeq, toSeq],
  );
  const row = result.rows[0];
  return {
    seqStart: Number(row?.seq_start ?? 0),
    seqEnd: Number(row?.seq_end ?? 0),
    eventCount: Number(row?.event_count ?? 0),
  };
}

async function tenantRowCounts(
  client: PoolClient,
  tenantId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of backupTables) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
      [tenantId],
    );
    counts[table] = Number(result.rows[0]?.count ?? '0');
  }
  return counts;
}

async function readinessSummary(
  client: PoolClient,
  tenantId: string,
): Promise<EnterpriseReadinessSummaryDto> {
  const result = await client.query<{
    active_sso_provider_count: string;
    active_key_reference_count: string;
    siem_export_count: string;
    backup_snapshot_count: string;
    compliance_ready_count: string;
    compliance_gap_count: string;
  }>(
    `
      SELECT
        (SELECT count(*) FROM enterprise_sso_providers WHERE tenant_id = $1 AND status = 'active')::text AS active_sso_provider_count,
        (SELECT count(*) FROM enterprise_key_references WHERE tenant_id = $1 AND status = 'active')::text AS active_key_reference_count,
        (SELECT count(*) FROM enterprise_siem_exports WHERE tenant_id = $1)::text AS siem_export_count,
        (SELECT count(*) FROM enterprise_backup_snapshots WHERE tenant_id = $1 AND status IN ('recorded', 'verified'))::text AS backup_snapshot_count,
        (SELECT count(*) FROM enterprise_compliance_evidence WHERE tenant_id = $1 AND status IN ('ready', 'accepted'))::text AS compliance_ready_count,
        (SELECT count(*) FROM enterprise_compliance_evidence WHERE tenant_id = $1 AND status = 'gap')::text AS compliance_gap_count
    `,
    [tenantId],
  );
  const row = result.rows[0];
  const summary = {
    activeSsoProviderCount: Number(row?.active_sso_provider_count ?? '0'),
    activeKeyReferenceCount: Number(row?.active_key_reference_count ?? '0'),
    siemExportCount: Number(row?.siem_export_count ?? '0'),
    backupSnapshotCount: Number(row?.backup_snapshot_count ?? '0'),
    complianceReadyCount: Number(row?.compliance_ready_count ?? '0'),
    complianceGapCount: Number(row?.compliance_gap_count ?? '0'),
  };
  return enterpriseReadinessSummarySchema.parse({
    ...summary,
    technicalPass:
      summary.activeSsoProviderCount > 0 &&
      summary.activeKeyReferenceCount > 0 &&
      summary.siemExportCount > 0 &&
      summary.backupSnapshotCount > 0 &&
      summary.complianceReadyCount > 0 &&
      summary.complianceGapCount === 0,
  });
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
