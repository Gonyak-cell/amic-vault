import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  multipartBatchUploadOptions,
  multipartFieldName,
  multipartUploadOptions,
  multipartUploadTempDir,
} from './multipart.config';

describe('multipart upload config', () => {
  it('uses a single file field and disk-backed temp directory', () => {
    const options = multipartUploadOptions();

    expect(multipartFieldName).toBe('file');
    expect(options.limits.files).toBe(1);
    expect(options.limits.fields).toBe(6);
    expect(options.limits.parts).toBe(8);
    expect(options.limits.fieldNameSize).toBe(100);
    expect(options.limits.fieldSize).toBe(1024 * 1024);
    expect(options.dest).toBe(multipartUploadTempDir());
    expect(existsSync(options.dest)).toBe(true);
  });

  it('bounds aggregate batch parser work without changing the file-size policy', () => {
    const options = multipartBatchUploadOptions();

    expect(options.limits.files).toBe(5000);
    expect(options.limits.fields).toBe(6);
    expect(options.limits.parts).toBe(5007);
    expect(options.limits.fieldNameSize).toBe(100);
    expect(options.limits.fieldSize).toBe(1024 * 1024);
  });
});
