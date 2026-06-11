import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { errorCodeFromUnknown, mapDocumentUploadError } from './document-error.mapper';

describe('document error mapper', () => {
  it('preserves safe standard permission and validation codes', () => {
    expect(
      mapDocumentUploadError(new ForbiddenException({ code: 'PERMISSION_DENIED' })).getResponse(),
    ).toEqual({ code: 'PERMISSION_DENIED' });
    expect(
      mapDocumentUploadError(new BadRequestException({ code: 'VALIDATION_FAILED' })).getResponse(),
    ).toEqual({ code: 'VALIDATION_FAILED' });
  });

  it('maps non-standard and unknown errors to standard safe responses only', () => {
    const mapped = mapDocumentUploadError(
      new BadRequestException({
        code: 'SQL_DETAIL',
        stack: '/tmp/internal/path SELECT * FROM secrets',
      }),
    );
    expect(mapped.getResponse()).toEqual({ code: 'VALIDATION_FAILED' });
    expect(JSON.stringify(mapped.getResponse())).not.toContain('SELECT');
    expect(JSON.stringify(mapped.getResponse())).not.toContain('/tmp/internal');
    expect(errorCodeFromUnknown(new Error('boom'))).toBe('VALIDATION_FAILED');
  });
});
