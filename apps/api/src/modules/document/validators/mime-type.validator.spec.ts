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
    ).resolves.toEqual({ mimeType: 'application/hwp+zip' });
  });

  it('rejects extension, declared MIME, and magic-byte mismatches', async () => {
    const validator = new MimeTypeValidator();
    const zipAsPdf = await fixtureFile('zip.pdf', docxBytes);
    const pdfAsDocx = await fixtureFile('pdf.docx', '%PDF-1.7 test');

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
  });
});
