import type { DocumentExtractionMethod, DocumentExtractionStatus } from '@amic-vault/shared';

export const extractionQueueName = 'ingestion.extract';
export const extractionDeadLetterQueueName = 'ingestion.extract.dead';

export interface ExtractionJobPayload {
  tenantId: string;
  documentId: string;
  versionId: string;
  fileObjectId: string;
}

export interface ExtractionResultInput extends ExtractionJobPayload {
  status: DocumentExtractionStatus;
  method: DocumentExtractionMethod;
  bodyText: string;
  confidence: number;
  failureReasonCode: string | null;
}

export interface ExtractionTarget {
  tenantId: string;
  documentId: string;
  matterId: string;
  versionId: string;
  fileObjectId: string;
  storageUri: string;
  normalizedFilename: string;
  mimeType: string;
}

const extractionStatuses = new Set<string>(['pending', 'ready', 'ocr_pending', 'failed']);
const extractionMethods = new Set<string>([
  'pending',
  'pdf_text',
  'docx',
  'hwpx',
  'ocr_required',
  'failed',
]);

export function isExtractionStatus(value: string): value is DocumentExtractionStatus {
  return extractionStatuses.has(value);
}

export function isExtractionMethod(value: string): value is DocumentExtractionMethod {
  return extractionMethods.has(value);
}

export function normalizeFailureReasonCode(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value)) return value;
  return fallback;
}
