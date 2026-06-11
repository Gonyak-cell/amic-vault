export interface FileObjectDto {
  fileObjectId: string;
  tenantId: string;
  storageUri: string;
  originalFilename: string;
  normalizedFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  encryptionKeyId: string | null;
  sourceSystem: 'upload' | 'email_ingest' | 'migration' | 'preview_derived';
  createdBy: string | null;
  createdAt: string;
}
