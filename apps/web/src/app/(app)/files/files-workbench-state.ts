import type { DocumentDto } from '@amic-vault/shared';
import type { MatterCodeOption } from '@/lib/matter-app';

export function matterReferenceForSelection(matter: MatterCodeOption | null): string | null {
  return matter?.matterReference ?? null;
}

export function nextUploadRevision(current: number): number {
  return current + 1;
}

export function previewDocumentIdForSelection(
  document: Pick<DocumentDto, 'documentId'> | null,
  open: boolean,
): string | null {
  return open ? (document?.documentId ?? null) : null;
}
