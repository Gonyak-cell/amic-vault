import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const multipartFieldName = 'file';

export interface MultipartUploadOptions {
  dest: string;
  limits: {
    files: number;
    fields: number;
    fileSize: number;
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
      files: 1,
      fields: 4,
      fileSize: Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES ?? String(200 * 1024 * 1024)),
    },
  };
}
