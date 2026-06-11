import { Injectable } from '@nestjs/common';

export const initialDocumentVersionNo = 1;

@Injectable()
export class VersionNumberResolver {
  initial(): number {
    return initialDocumentVersionNo;
  }

  nextAfter(currentVersionNo: number): number {
    if (!Number.isSafeInteger(currentVersionNo) || currentVersionNo < initialDocumentVersionNo) {
      throw new Error('INVALID_DOCUMENT_VERSION_NO');
    }
    return currentVersionNo + 1;
  }
}
