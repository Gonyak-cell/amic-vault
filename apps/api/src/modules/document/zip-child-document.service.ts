import { inflateRawSync } from 'node:zlib';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { TenantId, UploadDocumentFieldsDto } from '@amic-vault/shared';
import { DocumentUploadService } from './document-upload.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const localFileHeaderSignature = 0x04034b50;
const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const maxZipItems = 5000;
const maxZipUncompressedBytes = 2_000_000_000;
const maxCompressionRatio = 100;

let pool: Pool | undefined;

interface ZipChildInput {
  tenantId: TenantId;
  actorUserId: string;
  matterId: string;
  batchId: string | null;
  batchItemId: string | null;
  parentDocumentId: string;
  zipFilePath: string;
  originalFilename: string;
  fields: UploadDocumentFieldsDto;
}

interface SafeZipEntry {
  path: string;
  body: Buffer;
}

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

function validationFailed(reason: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason });
}

function isZipFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip');
}

function safeEntryPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw validationFailed('ZIP_PATH_TRAVERSAL');
  }
  return normalized;
}

function assertReadableRange(buffer: Buffer, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw validationFailed('ZIP_TRUNCATED_ENTRY');
  }
}

function mimeTypeForEntry(entryPath: string): string {
  const lower = entryPath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function titleFromEntryPath(entryPath: string): string {
  const leaf = basename(entryPath);
  const dotIndex = leaf.lastIndexOf('.');
  const title = dotIndex > 0 ? leaf.slice(0, dotIndex) : leaf;
  return title.trim() || leaf;
}

function childUploadFields(parentFields: UploadDocumentFieldsDto, entryPath: string): UploadDocumentFieldsDto {
  return {
    title: titleFromEntryPath(entryPath),
    documentType: parentFields.documentType,
    subtype: parentFields.subtype,
    confidentialityLevel: parentFields.confidentialityLevel,
    privilegeStatus: parentFields.privilegeStatus,
    source: parentFields.source,
    versionSignificance: parentFields.versionSignificance,
    renditionType: parentFields.renditionType,
    aiAllowed: parentFields.aiAllowed,
    uploadPreflightRef: parentFields.uploadPreflightRef,
  };
}

function inflateEntry(method: number, compressed: Buffer): Buffer {
  if (method === 0) return compressed;
  if (method === 8) return inflateRawSync(compressed);
  throw validationFailed('ZIP_UNSUPPORTED_COMPRESSION');
}

function parseSafeZip(buffer: Buffer): SafeZipEntry[] {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== localFileHeaderSignature) {
    throw validationFailed('ZIP_INVALID_SIGNATURE');
  }
  const entries: SafeZipEntry[] = [];
  let totalUncompressedBytes = 0;
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === centralDirectorySignature || signature === endOfCentralDirectorySignature) {
      break;
    }
    if (signature !== localFileHeaderSignature) throw validationFailed('ZIP_INVALID_SIGNATURE');
    assertReadableRange(buffer, offset, 30);
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if ((flags & 0x1) !== 0) throw validationFailed('ZIP_ENCRYPTED_ENTRY');
    if ((flags & 0x8) !== 0) throw validationFailed('ZIP_DATA_DESCRIPTOR_UNSUPPORTED');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    assertReadableRange(buffer, nameStart, nameLength + extraLength);
    assertReadableRange(buffer, dataStart, compressedSize);
    const rawPath = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    offset = dataStart + compressedSize;
    if (rawPath.endsWith('/')) continue;
    if (entries.length >= maxZipItems) throw validationFailed('ZIP_TOO_MANY_ITEMS');
    if (compressedSize > 0 && uncompressedSize / compressedSize > maxCompressionRatio) {
      throw validationFailed('ZIP_COMPRESSION_RATIO_EXCEEDED');
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > maxZipUncompressedBytes) {
      throw validationFailed('ZIP_UNCOMPRESSED_SIZE_EXCEEDED');
    }
    const body = inflateEntry(method, buffer.subarray(dataStart, dataStart + compressedSize));
    if (body.length !== uncompressedSize) throw validationFailed('ZIP_SIZE_MISMATCH');
    entries.push({ path: safeEntryPath(rawPath), body });
  }
  if (entries.length === 0) throw validationFailed('ZIP_EMPTY_ARCHIVE');
  return entries;
}

@Injectable()
export class ZipChildDocumentService {
  constructor(@Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService) {}

  async registerChildren(input: ZipChildInput): Promise<number> {
    if (!isZipFilename(input.originalFilename)) return 0;
    const entries = parseSafeZip(await readFile(input.zipFilePath));
    let count = 0;
    for (const entry of entries) {
      const child = await this.uploadService.uploadBuffer({
        actorUserId: input.actorUserId,
        matterId: input.matterId,
        fields: childUploadFields(input.fields, entry.path),
        originalFilename: basename(entry.path),
        mimeType: mimeTypeForEntry(entry.path),
        body: entry.body,
      });
      await this.recordLink({
        tenantId: input.tenantId,
        parentDocumentId: input.parentDocumentId,
        childDocumentId: child.documentId,
        batchId: input.batchId,
        batchItemId: input.batchItemId,
        zipEntryPath: entry.path,
        createdBy: input.actorUserId,
      });
      count += 1;
    }
    return count;
  }

  private async recordLink(input: {
    tenantId: TenantId;
    parentDocumentId: string;
    childDocumentId: string;
    batchId: string | null;
    batchItemId: string | null;
    zipEntryPath: string;
    createdBy: string;
  }): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', input.tenantId]);
      await client.query(
        `
          INSERT INTO document_zip_children (
            tenant_id, parent_document_id, child_document_id, batch_id,
            batch_item_id, zip_entry_path, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          input.tenantId,
          input.parentDocumentId,
          input.childDocumentId,
          input.batchId,
          input.batchItemId,
          input.zipEntryPath,
          input.createdBy,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
