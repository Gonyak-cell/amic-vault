import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../../audit/audit.service';
import { promotedDocumentExistsSql } from '../../file-security/promoted-file.guard';
import { PermissionService } from '../../permission/permission.service';
import { SearchIndexSyncHook } from '../../search/index/index-sync.hook';
import { TenantContextService } from '../../tenant/tenant-context';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';

interface OcrPageRow {
  page_number: number;
  page_text: string;
  confidence: string;
  source_revision: number;
  source_result_sha256: string;
  corrected_text: string | null;
  correction_revision: number;
}

interface SourceRow {
  document_id: string;
  version_id: string;
  matter_id: string;
  source_sha256: string;
  extraction_status: string;
  extraction_method: string;
}

interface Scope {
  accountLedgerId: string;
  documentId: string;
  lawosMatterId: string;
}

export interface OcrCorrectionInput extends Scope {
  pageNumber: number;
  sourceRevision: number;
  sourceResultSha256: string;
  expectedCorrectionRevision: number;
  correctedText: string;
}

function denied(): ForbiddenException {
  return new ForbiddenException({ code: 'DMS_OCR_PERMISSION_DENIED' });
}

function hashPage(row: OcrPageRow): string {
  return createHash('sha256').update(`${Number(row.page_number)}\n${row.page_text}\n${Number(row.confidence).toFixed(3)}`).digest('hex');
}

function validPage(row: OcrPageRow): boolean {
  return hashPage(row) === row.source_result_sha256;
}

@Injectable()
export class AmicOsVaultOcrService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PermissionService) private readonly permission: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(SearchIndexSyncHook) private readonly searchIndex: SearchIndexSyncHook,
  ) {}

  async read(principal: AmicOsVaultProviderPrincipal, input: Scope & { pageOffset: number }) {
    return this.authorized(principal, input, 'read', async (tx, source) => {
      const rows = await tx.query(
        `SELECT page_number, page_text, confidence::text, source_revision,
                source_result_sha256, corrected_text, correction_revision
         FROM amic_os_vault_ocr_pages
         WHERE tenant_id = $1::uuid AND document_id = $2::uuid
           AND version_id = $3::uuid AND source_sha256 = $4
         ORDER BY page_number LIMIT 6 OFFSET $5`,
        [principal.tenantId, input.documentId, source.version_id, source.source_sha256,
          input.pageOffset],
      );
      const pages = rows.rows as OcrPageRow[];
      if (pages.some((page) => !validPage(page))) throw denied();
      const counts = await tx.query(
        `SELECT count(*)::int AS completed_pages
         FROM amic_os_vault_ocr_pages
         WHERE tenant_id = $1::uuid AND version_id = $2::uuid AND source_sha256 = $3`,
        [principal.tenantId, source.version_id, source.source_sha256],
      );
      const completedPages = Number((counts.rows[0] as { completed_pages?: number } | undefined)?.completed_pages ?? 0);
      return {
        document_id: source.document_id,
        version_id: source.version_id,
        source_sha256: source.source_sha256,
        state: source.extraction_status === 'ready' && source.extraction_method === 'ocr'
          && completedPages > 0 ? 'completed' : source.extraction_status,
        completed_pages: completedPages,
        page_offset: input.pageOffset,
        next_offset: pages.length > 5 ? input.pageOffset + 5 : null,
        pages: pages.slice(0, 5).map((page) => ({
          page_number: Number(page.page_number),
          source_revision: Number(page.source_revision),
          source_result_sha256: page.source_result_sha256,
          page_text: page.page_text,
          confidence: Number(page.confidence),
          corrected_text: page.corrected_text,
          correction_revision: Number(page.correction_revision),
        })),
      };
    });
  }

  async correct(principal: AmicOsVaultProviderPrincipal, input: OcrCorrectionInput) {
    return this.authorized(principal, input, 'write', async (tx, source) => {
      if (source.extraction_status !== 'ready' || source.extraction_method !== 'ocr') throw denied();
      const selected = await tx.query(
        `SELECT page_number, page_text, confidence::text, source_revision,
                source_result_sha256, corrected_text, correction_revision
         FROM amic_os_vault_ocr_pages
         WHERE tenant_id = $1::uuid AND document_id = $2::uuid
           AND version_id = $3::uuid AND source_sha256 = $4 AND page_number = $5
         FOR UPDATE`,
        [principal.tenantId, input.documentId, source.version_id, source.source_sha256,
          input.pageNumber],
      );
      const page = selected.rows[0] as OcrPageRow | undefined;
      if (!page || !validPage(page)) throw denied();
      if (Number(page.source_revision) !== input.sourceRevision
          || page.source_result_sha256 !== input.sourceResultSha256
          || Number(page.correction_revision) !== input.expectedCorrectionRevision) {
        throw new ConflictException({ code: 'DMS_OCR_CORRECTION_STALE' });
      }
      const revision = input.expectedCorrectionRevision + 1;
      await tx.query(
        `UPDATE amic_os_vault_ocr_pages
         SET corrected_text = $6, correction_revision = $7,
             corrected_by = $8::uuid, corrected_at = now()
         WHERE tenant_id = $1::uuid AND document_id = $2::uuid
           AND version_id = $3::uuid AND source_sha256 = $4 AND page_number = $5`,
        [principal.tenantId, input.documentId, source.version_id, source.source_sha256,
          input.pageNumber, input.correctedText, revision, principal.actorUserId],
      );
      await this.audit.log({
        tenantId: principal.tenantId,
        actorId: principal.actorUserId,
        action: 'DOCUMENT_METADATA_CHANGED',
        targetType: 'document', targetId: input.documentId, matterId: source.matter_id,
        metadata: { document_id: input.documentId, version_id: source.version_id,
          page_number: input.pageNumber, correction_revision: revision,
          correction_sha256: createHash('sha256').update(input.correctedText).digest('hex') },
      }, tx);
      await this.searchIndex.enqueueVersion({ tenantId: principal.tenantId,
        documentId: input.documentId, versionId: source.version_id }, tx);
      return { document_id: input.documentId, version_id: source.version_id,
        page_number: input.pageNumber, source_result_sha256: page.source_result_sha256,
        correction_revision: revision };
    });
  }

  private async authorized<T>(principal: AmicOsVaultProviderPrincipal, input: Scope,
    action: 'read' | 'write', run: (tx: PoolClient, source: SourceRow) => Promise<T>): Promise<T> {
    const context = this.tenantContext.require();
    if (context.source !== 'amic-os-provider' || context.tenantId !== principal.tenantId
        || principal.accountLedgerId !== input.accountLedgerId) throw denied();
    return this.audit.transaction(principal.tenantId, async (tx) => {
      const selected = await tx.query(
        `SELECT d.document_id, d.matter_id, version.version_id,
                version.file_hash AS source_sha256, cd.extraction_status, cd.extraction_method
         FROM documents d
         JOIN matters m ON m.tenant_id = d.tenant_id AND m.matter_id = d.matter_id
         JOIN document_versions version ON version.tenant_id = d.tenant_id
           AND version.document_id = d.document_id AND version.version_status = 'current'
         JOIN canonical_documents cd ON cd.tenant_id = version.tenant_id
           AND cd.version_id = version.version_id
         WHERE d.tenant_id = $1::uuid AND d.document_id = $2::uuid
           AND d.status <> 'deleted'
           AND (m.metadata_json ->> 'lawosMatterId' = $3
             OR m.metadata_json ->> 'matterAppMatterId' = $3)
           AND ${promotedDocumentExistsSql('d', 'version')}
           AND NOT EXISTS (
             SELECT 1 FROM amic_os_office_copies copy
             WHERE copy.tenant_id = d.tenant_id AND copy.working_document_id = d.document_id
               AND copy.state <> 'saved'
           )
         FOR SHARE OF d, m, version, cd`,
        [principal.tenantId, input.documentId, input.lawosMatterId],
      );
      const source = selected.rows[0] as SourceRow | undefined;
      if (selected.rowCount !== 1 || !source) throw denied();
      const subject = { tenantId: principal.tenantId, userId: principal.actorUserId };
      const matter = await this.permission.canReadMatter(subject, source.matter_id);
      const document = action === 'read'
        ? await this.permission.canReadDocument(subject, input.documentId)
        : await this.permission.canCheckoutDocument(subject, input.documentId);
      if (matter.effect !== 'ALLOW' || document.effect !== 'ALLOW') throw denied();
      return run(tx, source);
    }, { isolationLevel: 'serializable' });
  }
}
