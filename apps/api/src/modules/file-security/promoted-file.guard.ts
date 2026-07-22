import type { QueryClient } from '../audit/audit.service';

export interface PromotedDocumentTarget {
  tenantId: string;
  documentId: string;
}

export function promotedDocumentExistsSql(documentAlias: string): string {
  return `EXISTS (
    SELECT 1
    FROM file_security_promotions promotion
    JOIN file_security_scans scan
      ON scan.tenant_id = promotion.tenant_id
      AND scan.scan_id = promotion.scan_id
      AND scan.state = 'promoted'
    WHERE promotion.tenant_id = ${documentAlias}.tenant_id
      AND promotion.document_id = ${documentAlias}.document_id
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
      LIMIT 1
    `,
    [target.tenantId, target.documentId],
  );
  return result.rowCount === 1;
}
