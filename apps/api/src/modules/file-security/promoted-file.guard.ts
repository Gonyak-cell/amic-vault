import type { QueryClient } from '../audit/audit.service';

export interface PromotedDocumentTarget {
  tenantId: string;
  documentId: string;
  versionId?: string;
}

export function promotedDocumentExistsSql(documentAlias: string, versionAlias?: string): string {
  const versionIdSql = versionAlias
    ? `${versionAlias}.version_id`
    : `(SELECT current_version.version_id
        FROM document_versions current_version
        WHERE current_version.tenant_id = ${documentAlias}.tenant_id
          AND current_version.document_id = ${documentAlias}.document_id
          AND current_version.version_status = 'current'
        ORDER BY current_version.version_no DESC
        LIMIT 1)`;
  return `EXISTS (
    SELECT 1
    FROM file_security_promotions promotion
    JOIN file_security_scans scan
      ON scan.tenant_id = promotion.tenant_id
      AND scan.scan_id = promotion.scan_id
      AND scan.state = 'promoted'
    WHERE promotion.tenant_id = ${documentAlias}.tenant_id
      AND promotion.document_id = ${documentAlias}.document_id
      AND promotion.version_id = ${versionIdSql}
  )`;
}

export async function isDocumentPromoted(
  client: QueryClient,
  target: PromotedDocumentTarget,
): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM file_security_promotions promotion
      JOIN file_security_scans scan
        ON scan.tenant_id = promotion.tenant_id
        AND scan.scan_id = promotion.scan_id
        AND scan.state = 'promoted'
      WHERE promotion.tenant_id = $1
        AND promotion.document_id = $2
        AND promotion.version_id = COALESCE(
          $3::uuid,
          (
            SELECT current_version.version_id
            FROM document_versions current_version
            WHERE current_version.tenant_id = $1
              AND current_version.document_id = $2
              AND current_version.version_status = 'current'
            ORDER BY current_version.version_no DESC
            LIMIT 1
          )
        )
      LIMIT 1
    `,
    [target.tenantId, target.documentId, target.versionId ?? null],
  );
  return result.rowCount === 1;
}
