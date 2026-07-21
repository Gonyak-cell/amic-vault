import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { DocumentUploadService } from './document-upload.service';
import { ZipChildDocumentService } from './zip-child-document.service';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files: Array<{ name: string; body: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.body.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.body.length, 20);
    central.writeUInt32LE(file.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + file.body.length;
  }
  const centralStart = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

describe('ZipChildDocumentService', () => {
  it('fails closed on traversal entries before child upload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amic-vault-zip-child-'));
    const zipPath = join(dir, 'bundle.zip');
    const uploadService = { uploadBuffer: vi.fn() };
    const service = new ZipChildDocumentService(
      uploadService as unknown as DocumentUploadService,
      {} as never,
    );
    await writeFile(
      zipPath,
      storedZip([{ name: '../escape.pdf', body: Buffer.from('%PDF-1.7\nescape\n') }]),
    );
    try {
      await service.registerChildren({
        tenantId: '22222222-2222-4222-8222-222222222222' as TenantId,
        actorUserId: randomUUID(),
        matterId: randomUUID(),
        batchId: randomUUID(),
        batchItemId: 'zip',
        parentDocumentId: randomUUID(),
        zipFilePath: zipPath,
        originalFilename: 'bundle.zip',
        fields: {},
      });
      throw new Error('expected traversal rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_FAILED',
        reason: 'ZIP_PATH_TRAVERSAL',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    expect(uploadService.uploadBuffer).not.toHaveBeenCalled();
  });
});
