import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { PermissionService } from '../../permission/permission.service';
import { SearchIndexSyncHook } from '../../search/index/index-sync.hook';
import { TenantContextService } from '../../tenant/tenant-context';
import { AmicOsVaultProviderConfig, type AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';

interface MetadataRow {
  document_id: string;
  matter_id: string;
  created_by: string;
  effective_creator_user_id: string;
  effective_creator_account_ledger_id: string | null;
  effective_creator_name: string | null;
  actor_role: string | null;
  actor_status: string | null;
  filename: string;
  mime_type: string;
  metadata_code: string | null;
  business_info: { description: string | null; document_type: string | null; tags: string[] };
  metadata_revision: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MetadataInput {
  accountLedgerId: string;
  documentId: string;
}

export interface VaultMetadataUpdateInput extends MetadataInput {
  expectedRevision: number;
  filename: string;
  metadataCode: string | null;
  businessInfo: { description: string | null; document_type: string | null; tags: string[] };
}

function denied(): ForbiddenException {
  return new ForbiddenException({ code: 'DMS_METADATA_PERMISSION_DENIED' });
}

function instant(value: Date | string): string {
  return new Date(value).toISOString();
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '40001';
}

@Injectable()
export class AmicOsVaultMetadataService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PermissionService) private readonly permissions: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig) private readonly config: AmicOsVaultProviderConfig,
    @Inject(SearchIndexSyncHook) private readonly searchIndexSync: SearchIndexSyncHook,
  ) {}

  async read(principal: AmicOsVaultProviderPrincipal, input: MetadataInput) {
    this.assertPrincipal(principal, input);
    try {
      return await this.audit.transaction(principal.tenantId, async (tx: PoolClient) => {
        const row = await this.select(tx, principal, input.documentId);
        await this.lockAuthority(tx, principal, row);
        await this.assertReadable(principal, row);
        if (!Number.isSafeInteger(Number(row.metadata_revision))) throw denied();
        return this.project(principal, row);
      }, { isolationLevel: 'serializable' });
    } catch (error) {
      if (isSerializationFailure(error)) throw denied();
      throw error;
    }
  }

  async update(principal: AmicOsVaultProviderPrincipal, input: VaultMetadataUpdateInput) {
    this.assertPrincipal(principal, input);
    try {
      return await this.audit.transaction(principal.tenantId, async (tx: PoolClient) => {
        const row = await this.select(tx, principal, input.documentId);
        await this.lockAuthority(tx, principal, row);
        await this.assertReadable(principal, row);
        if (!this.editable(principal, row)) throw denied();
        if (!Number.isSafeInteger(Number(row.metadata_revision))) throw denied();
        if (Number(row.metadata_revision) !== input.expectedRevision) {
          throw new ConflictException({ code: 'DMS_METADATA_VERSION_CONFLICT' });
        }
        // The persisted EML and its file object are immutable; update only
        // document display metadata and keep every version/source hash intact.
        if (row.mime_type === 'message/rfc822' && input.filename !== row.filename) throw denied();
        const changed = await tx.query(
          `UPDATE documents
           SET amic_os_filename = $3, amic_os_metadata_code = $4,
               amic_os_business_info = $5::jsonb,
               amic_os_metadata_revision = amic_os_metadata_revision + 1,
               updated_at = GREATEST(clock_timestamp(), created_at)
           WHERE tenant_id = $1::uuid AND document_id = $2::uuid
             AND amic_os_metadata_revision = $6
           RETURNING amic_os_metadata_revision::text AS metadata_revision, updated_at`,
          [principal.tenantId, input.documentId, input.filename, input.metadataCode,
            JSON.stringify(input.businessInfo), input.expectedRevision],
        );
        if (changed.rowCount !== 1) throw new ConflictException({ code: 'DMS_METADATA_VERSION_CONFLICT' });
        await this.audit.log({
          tenantId: principal.tenantId,
          actorId: principal.actorUserId,
          action: 'DOCUMENT_METADATA_CHANGED',
          targetType: 'document',
          targetId: input.documentId,
          matterId: row.matter_id,
          metadata: {
            document_id: input.documentId,
            matter_id: row.matter_id,
            diff_keys: ['filename', 'metadata_code', 'business_info'],
          },
        }, tx);
        await this.searchIndexSync.enqueueCurrentVersionForDocument(
          { tenantId: principal.tenantId, documentId: input.documentId }, tx,
        );
        const updated = changed.rows[0] as { metadata_revision: string; updated_at: Date | string };
        return this.project(principal, {
          ...row, filename: input.filename, metadata_code: input.metadataCode,
          business_info: input.businessInfo, metadata_revision: updated.metadata_revision,
          updated_at: updated.updated_at,
        });
      }, { isolationLevel: 'serializable' });
    } catch (error) {
      if (isSerializationFailure(error)) throw denied();
      throw error;
    }
  }

  private assertPrincipal(principal: AmicOsVaultProviderPrincipal, input: MetadataInput): void {
    const context = this.tenantContext.require();
    if (context.source !== 'amic-os-provider' || context.tenantId !== principal.tenantId
        || principal.accountLedgerId !== input.accountLedgerId) throw denied();
  }

  private async select(tx: QueryClient, principal: AmicOsVaultProviderPrincipal,
    documentId: string): Promise<MetadataRow> {
    const selected = await tx.query(
      `SELECT d.document_id, d.matter_id, d.created_by,
              coalesce(email.filer_user_id, attachment_filing.filer_user_id, d.created_by)
                AS effective_creator_user_id,
              effective_identity.identity_value_normalized AS effective_creator_account_ledger_id,
              effective_creator.name AS effective_creator_name,
              actor.role AS actor_role, actor.status AS actor_status,
              coalesce(d.amic_os_filename, file.normalized_filename) AS filename,
              file.mime_type, d.amic_os_metadata_code AS metadata_code,
              d.amic_os_business_info AS business_info,
              d.amic_os_metadata_revision::text AS metadata_revision,
              d.created_at, d.updated_at
       FROM documents d
       JOIN document_versions version
         ON version.tenant_id = d.tenant_id AND version.document_id = d.document_id
        AND version.version_status = 'current'
       JOIN file_objects file
         ON file.tenant_id = version.tenant_id AND file.file_object_id = version.file_object_id
       JOIN file_security_promotions promotion
         ON promotion.tenant_id = version.tenant_id
        AND promotion.document_id = version.document_id
        AND promotion.version_id = version.version_id
        AND promotion.file_object_id = version.file_object_id
        AND promotion.primary_sha256 = version.file_hash
       JOIN file_security_scans scan
         ON scan.tenant_id = promotion.tenant_id AND scan.scan_id = promotion.scan_id
        AND scan.state = 'promoted'
       JOIN users actor
         ON actor.tenant_id = d.tenant_id AND actor.user_id = $3::uuid
       LEFT JOIN LATERAL (
         SELECT filing.created_by AS filer_user_id
         FROM email_matter_filings filing
         WHERE filing.tenant_id = d.tenant_id AND filing.matter_id = d.matter_id
           AND filing.body_document_id = d.document_id
         ORDER BY filing.created_at ASC, filing.filing_id ASC LIMIT 1
       ) email ON true
       LEFT JOIN LATERAL (
         SELECT filing.created_by AS filer_user_id
         FROM email_document_links link
         JOIN email_matter_filings filing
           ON filing.tenant_id = link.tenant_id AND filing.email_id = link.email_id
          AND filing.matter_id = d.matter_id
         WHERE link.tenant_id = d.tenant_id AND link.document_id = d.document_id
         ORDER BY filing.created_at ASC, filing.filing_id ASC LIMIT 1
       ) attachment_filing ON true
       LEFT JOIN users effective_creator
         ON effective_creator.tenant_id = d.tenant_id
        AND effective_creator.user_id = coalesce(email.filer_user_id, attachment_filing.filer_user_id, d.created_by)
       LEFT JOIN user_login_identities effective_identity
         ON effective_identity.tenant_id = d.tenant_id
        AND effective_identity.user_id = effective_creator.user_id
        AND effective_identity.identity_type = 'account_ledger_id'
        AND effective_identity.status = 'active'
       WHERE d.tenant_id = $1::uuid AND d.document_id = $2::uuid
         AND d.status <> 'deleted'
         AND NOT EXISTS (
           SELECT 1 FROM amic_os_office_copies copy
           WHERE copy.tenant_id = d.tenant_id
             AND copy.working_document_id = d.document_id AND copy.state <> 'saved'
         )
       `,
      [principal.tenantId, documentId, principal.actorUserId],
    );
    if (selected.rowCount !== 1 || !selected.rows[0]) throw denied();
    return selected.rows[0] as MetadataRow;
  }

  private async lockAuthority(tx: QueryClient, principal: AmicOsVaultProviderPrincipal,
    row: MetadataRow): Promise<void> {
    const result = await tx.query(
      `SELECT app_lock_internal_latest_authority(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid
       ) AS locked`,
      [principal.tenantId, principal.actorUserId, row.document_id, row.matter_id],
    );
    if (result.rows.length !== 1 || (result.rows[0] as { locked?: boolean } | undefined)?.locked !== true) {
      throw denied();
    }
  }

  private async assertReadable(principal: AmicOsVaultProviderPrincipal, row: MetadataRow): Promise<void> {
    if (row.actor_status !== 'active') throw denied();
    const context = { tenantId: principal.tenantId, userId: principal.actorUserId };
    const [matter, document] = await Promise.all([
      this.permissions.canReadMatter(context, row.matter_id),
      this.permissions.canReadDocument(context, row.document_id),
    ]);
    if (matter.effect !== 'ALLOW' || document.effect !== 'ALLOW') throw denied();
  }

  private editable(principal: AmicOsVaultProviderPrincipal, row: MetadataRow): boolean {
    return (row.effective_creator_account_ledger_id === principal.accountLedgerId
      && row.effective_creator_user_id === principal.actorUserId)
      || row.actor_role === 'firm_admin';
  }

  private project(principal: AmicOsVaultProviderPrincipal, row: MetadataRow) {
    const filename = row.filename.normalize('NFC');
    if (!filename || filename !== filename.trim() || filename.length > 240
        || /[\\/\u0000-\u001f\u007f]/u.test(filename)) throw denied();
    const creatorName = row.effective_creator_name?.normalize('NFC').trim() || null;
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      document_id: row.document_id,
      filename,
      metadata_code: row.metadata_code,
      business_info: row.business_info,
      creator_user_id: row.effective_creator_account_ledger_id,
      creator_name: creatorName && creatorName.length <= 200 ? creatorName : null,
      metadata_revision: Number(row.metadata_revision),
      created_at: instant(row.created_at),
      updated_at: instant(row.updated_at),
      editable: this.editable(principal, row),
    };
  }
}
