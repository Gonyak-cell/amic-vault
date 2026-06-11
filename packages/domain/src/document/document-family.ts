export interface DocumentFamilySeed {
  documentId: string;
  documentFamilyId?: string | null;
}

export function initialDocumentFamilyId(input: DocumentFamilySeed): string {
  return input.documentFamilyId ?? input.documentId;
}

export function assertDocumentFamilyInherited(
  expectedFamilyId: string,
  candidateFamilyId: string,
): void {
  if (candidateFamilyId !== expectedFamilyId) {
    throw new Error('DOCUMENT_FAMILY_MISMATCH');
  }
}
