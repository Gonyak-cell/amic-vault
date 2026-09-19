import { describe, expect, it } from 'vitest';
import { FileExtensionValidator, allowedDocumentExtensions } from './file-extension.validator';

describe('FileExtensionValidator', () => {
  it('allows configured document extensions case-insensitively', () => {
    const validator = new FileExtensionValidator(allowedDocumentExtensions('pdf,docx,hwpx'));

    expect(validator.validate('의견서.PDF')).toEqual({
      extension: 'pdf',
      normalizedFilename: '의견서.PDF',
    });
  });

  it('includes Vault-native text editing extensions in the default allow-list', () => {
    const allowed = allowedDocumentExtensions();

    for (const extension of ['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'zip']) {
      expect(allowed.has(extension)).toBe(true);
    }
  });

  it('preserves GIF and WebP source files without widening a configured allow-list', () => {
    const validator = new FileExtensionValidator(allowedDocumentExtensions(''));
    expect(validator.validate('사본.GIF').extension).toBe('gif');
    expect(validator.validate('사본.webp').extension).toBe('webp');
    expect(() => new FileExtensionValidator(allowedDocumentExtensions('pdf')).validate('사본.gif'))
      .toThrow(expect.objectContaining({ response: { code: 'UNSUPPORTED_FILE_TYPE' } }));
  });

  it('includes OneDrive migration source extensions in the default allow-list', () => {
    const allowed = allowedDocumentExtensions();

    for (const extension of [
      'pdf',
      'docx',
      'jpg',
      'xlsx',
      'png',
      'txt',
      'eml',
      'doc',
      'xls',
      'hwp',
      'pptx',
      'jpeg',
      'csv',
      'msg',
      'hwpx',
      'ppt',
      'zip',
    ]) {
      expect(allowed.has(extension)).toBe(true);
    }
  });

  it('rejects executable, missing, path-like, and double-extension uploads by final suffix', () => {
    const validator = new FileExtensionValidator(allowedDocumentExtensions('pdf,docx,hwpx'));

    for (const filename of ['payload.exe', 'payload', 'contract.pdf.exe', '../contract.pdf']) {
      expect(() => validator.validate(filename)).toThrow(
        expect.objectContaining({ response: { code: 'UNSUPPORTED_FILE_TYPE' } }),
      );
    }
  });
});
