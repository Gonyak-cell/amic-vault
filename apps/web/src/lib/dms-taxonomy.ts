import {
  documentTypes,
  type DocumentType,
  type EnterpriseApprovedDmsTaxonomyDto,
} from '@amic-vault/shared';

export interface ApprovedDocumentTypeOption {
  label: string;
  taxonomy?: EnterpriseApprovedDmsTaxonomyDto;
  value: DocumentType;
}

export function approvedDocumentTypeOptions(
  fallbackLabels: Record<DocumentType, string>,
  taxonomyCatalog: readonly EnterpriseApprovedDmsTaxonomyDto[] = [],
): ApprovedDocumentTypeOption[] {
  const byType = new Map<DocumentType, EnterpriseApprovedDmsTaxonomyDto>();
  for (const taxonomy of taxonomyCatalog) {
    if (!byType.has(taxonomy.canonicalDocumentType)) {
      byType.set(taxonomy.canonicalDocumentType, taxonomy);
    }
  }

  return documentTypes.map((type) => {
    const taxonomy = byType.get(type);
    const base = { label: taxonomy?.displayName ?? fallbackLabels[type], value: type };
    return taxonomy ? { ...base, taxonomy } : base;
  });
}

export function approvedDocumentTypeLabel(
  documentType: DocumentType,
  fallbackLabels: Record<DocumentType, string>,
  taxonomyCatalog: readonly EnterpriseApprovedDmsTaxonomyDto[] = [],
): string {
  return (
    taxonomyCatalog.find((taxonomy) => taxonomy.canonicalDocumentType === documentType)
      ?.displayName ?? fallbackLabels[documentType]
  );
}

export function approvedSubtypeOptions(
  documentType: DocumentType,
  taxonomyCatalog: readonly EnterpriseApprovedDmsTaxonomyDto[] = [],
): string[] {
  const taxonomy = taxonomyCatalog.find(
    (candidate) => candidate.canonicalDocumentType === documentType,
  );
  return (
    taxonomy?.subtypes
      .filter((subtype) => subtype.status === 'active')
      .map((subtype) => subtype.displayName) ?? []
  );
}
