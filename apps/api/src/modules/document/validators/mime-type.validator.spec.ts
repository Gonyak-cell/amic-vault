import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MimeTypeValidator } from './mime-type.validator';

async function fixtureFile(name: string, bytes: Buffer | string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-mime-'));
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

const docxBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml word/document.xml application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'latin1',
);
const hwpxBytes = Buffer.from(
  'PK\x03\x04mimetype application/hwp+zip Contents/section0.xml',
  'latin1',
);
const xlsxBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml xl/workbook.xml application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'latin1',
);
const pptxBytes = Buffer.from(
  'PK\x03\x04[Content_Types].xml ppt/presentation.xml application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'latin1',
);
const oleBytes = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(24),
  Buffer.from('compound document payload', 'latin1'),
]);
const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const pngBytes = Buffer.from('\x89PNG\r\n\x1A\npng payload', 'latin1');

describe('MimeTypeValidator', () => {
  it('sniffs PDF, DOCX, and HWPX supported files', async () => {
    const validator = new MimeTypeValidator();

    await expect(
      validator.validate({
        path: await fixtureFile('a.pdf', '%PDF-1.7 test'),
        sizeBytes: 13,
        extension: 'pdf',
        declaredMimeType: 'application/pdf',
      }),
    ).resolves.toEqual({ mimeType: 'application/pdf' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.docx', docxBytes),
        sizeBytes: docxBytes.length,
        extension: 'docx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).resolves.toEqual({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(
      validator.validate({
        path: await fixtureFile('a.hwpx', hwpxBytes),
        sizeBytes: hwpxBytes.length,
        extension: 'hwpx',
        declaredMimeType: 'application/octet-stream',
      }),
    ).resolves.toEqual({ mimeType: 'application/vnd.hancom.hwpx' });
  });

  it('sniffs OneDrive migration image, spreadsheet, presentation, legacy Office, HWP, and email files', async () => {
    const validator = new MimeTypeValidator();

    await expect(
      validator.validate({
        path: await fixtureFile('a.jpg', jpgBytes),
        sizeBytes: jpgBytes.length,
        extension: 'jpg',
        declaredMimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({ mimeType: 'image/jpeg' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.jpeg', jpgBytes),
        sizeBytes: jpgBytes.length,
        extension: 'jpeg',
        declaredMimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({ mimeType: 'image/jpeg' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.png', pngBytes),
        sizeBytes: pngBytes.length,
        extension: 'png',
        declaredMimeType: 'image/png',
      }),
    ).resolves.toEqual({ mimeType: 'image/png' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.xlsx', xlsxBytes),
        sizeBytes: xlsxBytes.length,
        extension: 'xlsx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).resolves.toEqual({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const xlsxWithLateMarker = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(70 * 1024), xlsxBytes]);
    await expect(
      validator.validate({
        path: await fixtureFile('late-marker.xlsx', xlsxWithLateMarker),
        sizeBytes: xlsxWithLateMarker.length,
        extension: 'xlsx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).resolves.toEqual({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await expect(
      validator.validate({
        path: await fixtureFile('a.pptx', pptxBytes),
        sizeBytes: pptxBytes.length,
        extension: 'pptx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ).resolves.toEqual({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const pptxWithLateContentTypes = Buffer.concat([
      Buffer.from('PK\x03\x04ppt/presentation.xml', 'latin1'),
      Buffer.alloc(1024 * 1024),
      Buffer.from('[Content_Types].xml', 'latin1'),
    ]);
    await expect(
      validator.validate({
        path: await fixtureFile('late-content-types.pptx', pptxWithLateContentTypes),
        sizeBytes: pptxWithLateContentTypes.length,
        extension: 'pptx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ).resolves.toEqual({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const pptxWithEmbeddedSpreadsheetMarker = Buffer.from(
      'PK\x03\x04[Content_Types].xml ppt/presentation.xml xl/embeddings/oleObject1.bin application/vnd.openxmlformats-officedocument.spreadsheetml.sheet application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'latin1',
    );
    await expect(
      validator.validate({
        path: await fixtureFile('embedded-spreadsheet.pptx', pptxWithEmbeddedSpreadsheetMarker),
        sizeBytes: pptxWithEmbeddedSpreadsheetMarker.length,
        extension: 'pptx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ).resolves.toEqual({
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    for (const [extension, declaredMimeType, mimeType] of [
      ['doc', 'application/msword', 'application/msword'],
      ['xls', 'application/vnd.ms-excel', 'application/vnd.ms-excel'],
      ['ppt', 'application/vnd.ms-powerpoint', 'application/vnd.ms-powerpoint'],
      ['hwp', 'application/x-hwp', 'application/x-hwp'],
      ['msg', 'application/vnd.ms-outlook', 'application/vnd.ms-outlook'],
    ] as const) {
      await expect(
        validator.validate({
          path: await fixtureFile(`a.${extension}`, oleBytes),
          sizeBytes: oleBytes.length,
          extension,
          declaredMimeType,
        }),
      ).resolves.toEqual({ mimeType });
    }

    await expect(
      validator.validate({
        path: await fixtureFile('a.eml', 'From: a@example.com\nSubject: Test\n\nBody'),
        sizeBytes: 38,
        extension: 'eml',
        declaredMimeType: 'message/rfc822',
      }),
    ).resolves.toEqual({ mimeType: 'message/rfc822' });
  });

  it('accepts legacy Office HTML workbooks saved with an xls extension', async () => {
    const validator = new MimeTypeValidator();
    const htmlWorkbook = '\n\n\n<html><body><table><tr><td>1</td></tr></table></body></html>';

    await expect(
      validator.validate({
        path: await fixtureFile('a.xls', htmlWorkbook),
        sizeBytes: Buffer.byteLength(htmlWorkbook),
        extension: 'xls',
        declaredMimeType: 'application/vnd.ms-excel',
      }),
    ).resolves.toEqual({ mimeType: 'application/vnd.ms-excel' });
  });

  it('sniffs bounded Vault-native text editing files', async () => {
    const validator = new MimeTypeValidator();

    await expect(
      validator.validate({
        path: await fixtureFile('a.txt', 'plain draft'),
        sizeBytes: 11,
        extension: 'txt',
        declaredMimeType: 'text/plain',
      }),
    ).resolves.toEqual({ mimeType: 'text/plain' });
    const utf16BeText = Buffer.from([
      0xfe, 0xff, 0x00, 0x70, 0x00, 0x6c, 0x00, 0x61, 0x00, 0x69, 0x00, 0x6e,
    ]);
    await expect(
      validator.validate({
        path: await fixtureFile('utf16be.txt', utf16BeText),
        sizeBytes: utf16BeText.length,
        extension: 'txt',
        declaredMimeType: 'text/plain',
      }),
    ).resolves.toEqual({ mimeType: 'text/plain' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.md', '# Draft'),
        sizeBytes: 7,
        extension: 'md',
        declaredMimeType: 'text/markdown',
      }),
    ).resolves.toEqual({ mimeType: 'text/markdown' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.csv', 'clause,status\n1,open\n'),
        sizeBytes: 21,
        extension: 'csv',
        declaredMimeType: 'text/csv',
      }),
    ).resolves.toEqual({ mimeType: 'text/csv' });
    await expect(
      validator.validate({
        path: await fixtureFile('a.json', '{"status":"draft"}'),
        sizeBytes: 18,
        extension: 'json',
        declaredMimeType: 'application/json',
      }),
    ).resolves.toEqual({ mimeType: 'application/json' });
  });

  it('rejects extension, declared MIME, and magic-byte mismatches', async () => {
    const validator = new MimeTypeValidator();
    const zipAsPdf = await fixtureFile('zip.pdf', docxBytes);
    const pdfAsDocx = await fixtureFile('pdf.docx', '%PDF-1.7 test');

    await expect(
      validator.validate({
        path: await fixtureFile('jpeg-named-png.png', jpgBytes),
        sizeBytes: jpgBytes.length,
        extension: 'png',
        declaredMimeType: 'image/png',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(
      validator.validate({
        path: await fixtureFile('legacy-xls-named-xlsx.xlsx', oleBytes),
        sizeBytes: oleBytes.length,
        extension: 'xlsx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(
      validator.validate({
        path: zipAsPdf,
        sizeBytes: docxBytes.length,
        extension: 'pdf',
        declaredMimeType: 'application/pdf',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(
      validator.validate({
        path: pdfAsDocx,
        sizeBytes: 13,
        extension: 'docx',
        declaredMimeType: 'application/pdf',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(
      validator.validate({
        path: await fixtureFile('a.pdf', '%PDF-1.7 test'),
        sizeBytes: 13,
        extension: 'pdf',
        declaredMimeType: 'application/zip',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(
      validator.validate({
        path: await fixtureFile('bad.txt', Buffer.from([0x00, 0x01, 0x02])),
        sizeBytes: 3,
        extension: 'txt',
        declaredMimeType: 'text/plain',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    await expect(
      validator.validate({
        path: await fixtureFile('bad.json', '{not-json}'),
        sizeBytes: 10,
        extension: 'json',
        declaredMimeType: 'application/json',
      }),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('allows migration-only JPEG and PNG extension mismatches for legacy image files', async () => {
    const validator = new MimeTypeValidator();

    await expect(
      validator.validate({
        path: await fixtureFile('jpeg-named-png.png', jpgBytes),
        sizeBytes: jpgBytes.length,
        extension: 'png',
        declaredMimeType: 'image/png',
        allowImageExtensionMismatch: true,
      }),
    ).resolves.toEqual({ mimeType: 'image/jpeg' });
    await expect(
      validator.validate({
        path: await fixtureFile('legacy-xls-named-xlsx.xlsx', oleBytes),
        sizeBytes: oleBytes.length,
        extension: 'xlsx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        allowImageExtensionMismatch: true,
      }),
    ).resolves.toEqual({ mimeType: 'application/vnd.ms-excel' });
  });
});
