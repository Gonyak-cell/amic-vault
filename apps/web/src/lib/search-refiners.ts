import type {
  EnterpriseApprovedDmsSearchRefinerDto,
  EnterpriseDmsSearchRefinerFieldKey,
} from '@amic-vault/shared';

export type SearchRefinerKeySet = ReadonlySet<EnterpriseDmsSearchRefinerFieldKey>;

export const searchRefinerFieldKeys = {
  clientId: 'client',
  clientName: 'client_name',
  confidentialityLevel: 'confidentiality_level',
  dateRange: 'updated_at',
  documentType: 'document_type',
  extractionStatus: 'extraction_status',
  legalHold: 'legal_hold',
  matterCode: 'matter_code',
  matterId: 'matter',
  matterName: 'matter_name',
  privilegeStatus: 'privilege_status',
  recordsStatus: 'records_status',
  title: 'title',
  versionStatus: 'version_status',
} as const satisfies Record<string, EnterpriseDmsSearchRefinerFieldKey>;

export function searchRefinerKeySet(
  catalog: readonly EnterpriseApprovedDmsSearchRefinerDto[],
): SearchRefinerKeySet {
  return new Set(
    catalog
      .filter((refiner) => refiner.filterable || refiner.refinable || refiner.searchable)
      .map((refiner) => refiner.fieldKey),
  );
}

export function hasSearchRefiner(
  approvedRefinerKeys: SearchRefinerKeySet,
  fieldKey: EnterpriseDmsSearchRefinerFieldKey,
): boolean {
  return approvedRefinerKeys.has(fieldKey);
}
