import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { multipartFieldName, multipartUploadOptions, multipartUploadTempDir } from './multipart.config';

describe('multipart upload config', () => {
  it('uses a single file field and disk-backed temp directory', () => {
    const options = multipartUploadOptions();

    expect(multipartFieldName).toBe('file');
    expect(options.limits.files).toBe(1);
    expect(options.dest).toBe(multipartUploadTempDir());
    expect(existsSync(options.dest)).toBe(true);
  });
});
