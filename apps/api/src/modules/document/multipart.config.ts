import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { documentUploadMaxBytes } from './validators/file-size.validator';

export const multipartFieldName = 'file';

export interface MultipartUploadOptions {
  dest: string;
  limits: {
    fieldNameSize: number;
    fieldSize: number;
    files: number;
    fields: number;
    fileSize: number;
    parts: number;
  };
}

export function multipartUploadTempDir(): string {
  const dir = process.env.UPLOAD_TMP_DIR ?? join(tmpdir(), 'amic-vault-uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function multipartUploadOptions(): MultipartUploadOptions {
  return {
    dest: multipartUploadTempDir(),
    limits: {
      fieldNameSize: 100,
      fieldSize: 1024 * 1024,
      files: 1,
      fields: 6,
      fileSize: documentUploadMaxBytes(),
      parts: 8,
    },
  };
}

export function multipartBatchUploadOptions(): MultipartUploadOptions {
  return {
    dest: multipartUploadTempDir(),
    limits: {
      fieldNameSize: 100,
      fieldSize: 1024 * 1024,
      files: 5000,
      fields: 6,
      fileSize: documentUploadMaxBytes(),
      parts: 5007,
    },
  };
}
