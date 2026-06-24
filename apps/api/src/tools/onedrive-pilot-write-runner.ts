import 'reflect-metadata';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import {
  uploadDocumentFieldsSchema,
  type TenantId,
  type UploadDocumentFieldsDto,
} from '@amic-vault/shared';
import { AppModule } from '../app.module';
import { StructuredLogger } from '../common/logging/logger';
import { DocumentUploadService, type UploadedDiskFile } from '../modules/document/document-upload.service';
import { TenantContextService } from '../modules/tenant/tenant-context';

const supportedExtensions = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.eml',
  '.hwp',
  '.hwpx',
  '.jpeg',
  '.jpg',
  '.msg',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.txt',
  '.xls',
  '.xlsx',
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^[0-9a-f]{64}$/i;

export interface PilotWriteCliArgs {
  runId: string;
  candidateId: string;
  scopePath: string;
  mappingPath: string;
  targetPath: string;
  sourceManifestPath: string;
  sanitizedOut: string;
  localReceiptOut: string;
  statePath: string;
  awsProfile?: string | undefined;
  excludeSourceSegments: string[];
  dryRun: boolean;
  execute: boolean;
  limit?: number | undefined;
  maxFailures: number;
}

interface PilotMapping {
  candidate_id?: unknown;
  status?: unknown;
  scope_kind?: unknown;
  single_matter_scope?: unknown;
  duplicate_policy?: unknown;
  unsupported_type_policy?: unknown;
  zero_byte_policy?: unknown;
  large_object_policy?: unknown;
  cutover_policy?: unknown;
}

interface PilotTarget {
  candidate_id?: unknown;
  tenant_id?: unknown;
  tenant_slug?: unknown;
  matter_id?: unknown;
  actor_user_id?: unknown;
  upload_preflight_ref?: unknown;
  target_approval_ref?: unknown;
  scope_kind?: unknown;
  single_matter_scope?: unknown;
  document_defaults?: {
    document_type?: unknown;
    confidentiality_level?: unknown;
    privilege_status?: unknown;
    ai_allowed?: unknown;
  };
}

interface ScopeRow {
  candidate_id?: unknown;
  source_object_hash?: unknown;
  source_object_key?: unknown;
  extension?: unknown;
  size_bytes?: unknown;
  size?: unknown;
  readable?: unknown;
}

interface SourceManifestRow {
  bucket?: unknown;
  key?: unknown;
  size?: unknown;
  size_bytes?: unknown;
}

interface ReadyItem {
  itemId: string;
  sourceHash: string;
  extension: string;
  sizeBytes: number;
  raw: {
    bucket: string;
    key: string;
    sizeBytes: number;
    excluded: boolean;
  };
}

interface UploadInput {
  target: ValidatedTarget;
  file: UploadedDiskFile;
  fields: UploadDocumentFieldsDto;
}

interface UploadResult {
  documentId: string;
  matterId: string;
  fileObjectId: string;
}

interface PilotWriteDependencies {
  now?: () => Date;
  downloadSourceObject?: (input: {
    bucket: string;
    key: string;
    destinationPath: string;
    awsProfile?: string | undefined;
  }) => Promise<void>;
  uploadOne?: (input: UploadInput) => Promise<UploadResult>;
  createUploader?: () => Promise<{ uploadOne: (input: UploadInput) => Promise<UploadResult>; close: () => Promise<void> }>;
}

interface ValidatedTarget {
  candidateId: string;
  tenantId: TenantId;
  tenantSlug: string;
  matterId: string;
  actorUserId: string;
  uploadPreflightRef: string;
  targetApprovalRef: string;
  documentDefaults: {
    documentType: string;
    confidentialityLevel: string;
    privilegeStatus: string;
    aiAllowed: boolean;
  };
}

interface RunnerState {
  imported: Record<string, UploadResult>;
}

interface SanitizedItem {
  item_id: string;
  status: 'ready' | 'imported' | 'already_imported' | 'skipped' | 'blocked' | 'failed';
  reasons: string[];
  warnings: string[];
  extension: string;
  size_bytes: number;
}

export function usage(): string {
  return [
    'usage: pnpm onedrive:pilot-write -- --dry-run|--execute --run-id <id> --candidate-id <id> --scope <scope.ndjson[.gz]> --mapping <mapping.json> --target <local-target.json> --source-manifest <raw.ndjson[.gz]> --sanitized-out <out.json> --local-receipt-out <receipt.ndjson> [--state <state.json>] [--aws-profile <profile>] [--exclude-source-segment <folder-name>] [--limit <n>]',
    '',
    'OneDrive pilot-write runner for exactly one approved pilot Matter.',
    'It refuses customer-wide import, source-of-truth cutover, and Gemma indexing execution.',
  ].join('\n');
}

export function parsePilotWriteArgs(argv: readonly string[]): PilotWriteCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');

  const runId = requiredArg(argv, '--run-id');
  const candidateId = requiredArg(argv, '--candidate-id');
  const scopePath = requiredArg(argv, '--scope');
  const mappingPath = requiredArg(argv, '--mapping');
  const targetPath = requiredArg(argv, '--target');
  const sourceManifestPath = requiredArg(argv, '--source-manifest');
  const sanitizedOut = requiredArg(argv, '--sanitized-out');
  const localReceiptOut = requiredArg(argv, '--local-receipt-out');
  const statePath =
    argValue(argv, '--state') ?? path.join(path.dirname(localReceiptOut), 'pilot-write-state.local.json');
  const limit = parseOptionalPositiveInt(argValue(argv, '--limit'), '--limit', 10_000);
  const maxFailures = parseOptionalPositiveInt(argValue(argv, '--max-failures'), '--max-failures', 25) ?? 3;

  return {
    runId,
    candidateId,
    scopePath,
    mappingPath,
    targetPath,
    sourceManifestPath,
    sanitizedOut,
    localReceiptOut,
    statePath,
    awsProfile: argValue(argv, '--aws-profile'),
    excludeSourceSegments: normalizeSourceSegments(argValues(argv, '--exclude-source-segment')),
    dryRun,
    execute,
    limit,
    maxFailures,
  };
}

export async function runPilotWrite(
  args: PilotWriteCliArgs,
  dependencies: PilotWriteDependencies = {},
) {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const mapping = (await readJson(args.mappingPath)) as PilotMapping;
  const target = (await readJson(args.targetPath)) as PilotTarget;
  const mappingBlockers = validateMapping(mapping, args.candidateId);
  const targetValidation = validateTarget(target, args.candidateId);
  const targetBlockers = targetValidation.blockers;
  const sourceRows = await readSourceManifest(args.sourceManifestPath);
  const scopeRows = await readScopeRows(args.scopePath);
  const state = await loadState(args.statePath);
  const sanitizedItems: SanitizedItem[] = [];
  const localReceipts: unknown[] = [];
  const blockers = [...mappingBlockers, ...targetBlockers];
  const sourceByHash = new Map<string, ReadyItem['raw']>();
  const excludeSourceSegments = normalizeSourceSegments(args.excludeSourceSegments);

  for (const row of sourceRows) {
    const raw = normalizeSourceRow(row, excludeSourceSegments);
    if (raw) sourceByHash.set(sha256Hex(raw.key), raw);
  }

  let uploader: Awaited<ReturnType<NonNullable<PilotWriteDependencies['createUploader']>>> | undefined;
  let repeatedFailures = 0;
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'amic-vault-onedrive-pilot-write-'));

  try {
    if (args.execute && blockers.length === 0) {
      uploader = dependencies.uploadOne
        ? { uploadOne: dependencies.uploadOne, close: async () => undefined }
        : await (dependencies.createUploader ?? createNestUploader)();
    }

    for (const { index, row } of scopeRows) {
      if (args.limit && sanitizedItems.length >= args.limit) break;
      const classified = classifyScopeRow(row, index, args.candidateId, mapping, sourceByHash);
      if (blockers.length > 0) {
        sanitizedItems.push({
          ...classified.item,
          status: 'blocked',
          reasons: [...new Set([...blockers, ...classified.item.reasons])],
        });
        continue;
      }
      if (!classified.ready) {
        sanitizedItems.push(classified.item);
        continue;
      }
      if (args.dryRun) {
        sanitizedItems.push({
          ...classified.item,
          status: 'ready',
          reasons: ['ready_for_pilot_write'],
        });
        continue;
      }

      const key = idempotencyKey({
        runId: args.runId,
        candidateId: args.candidateId,
        tenantId: targetValidation.target?.tenantId ?? '',
        matterId: targetValidation.target?.matterId ?? '',
        sourceHash: classified.ready.sourceHash,
      });
      if (state.imported[key]) {
        sanitizedItems.push({
          ...classified.item,
          status: 'already_imported',
          reasons: ['idempotency_key_already_imported'],
        });
        continue;
      }

      try {
        const downloadedPath = path.join(tempRoot, `${classified.ready.itemId}.payload`);
        await (dependencies.downloadSourceObject ?? downloadWithAwsCli)({
          bucket: classified.ready.raw.bucket,
          key: classified.ready.raw.key,
          destinationPath: downloadedPath,
          awsProfile: args.awsProfile,
        });
        const downloaded = await stat(downloadedPath);
        if (downloaded.size !== classified.ready.sizeBytes) {
          throw new Error('DOWNLOADED_SIZE_MISMATCH');
        }
        if (!targetValidation.target || !uploader) throw new Error('RUNNER_NOT_READY');
        const uploadResult = await uploader.uploadOne({
          target: targetValidation.target,
          file: {
            path: downloadedPath,
            originalname: safeOriginalFilename(classified.ready.raw.key, classified.ready.extension),
            mimetype: mimeTypeForExtension(classified.ready.extension),
            size: classified.ready.sizeBytes,
          },
          fields: uploadFieldsFor(targetValidation.target, mapping),
        });
        state.imported[key] = uploadResult;
        await saveState(args.statePath, state);
        await appendLocalReceipt(args.localReceiptOut, {
          item_id: classified.ready.itemId,
          source_hash: classified.ready.sourceHash,
          status: 'imported',
          document_id: uploadResult.documentId,
          matter_id: uploadResult.matterId,
          file_object_id: uploadResult.fileObjectId,
          idempotency_key: key,
          imported_at: generatedAt,
        });
        localReceipts.push(uploadResult);
        sanitizedItems.push({
          ...classified.item,
          status: 'imported',
          reasons: ['pilot_write_imported'],
        });
        repeatedFailures = 0;
      } catch (error) {
        repeatedFailures += 1;
        sanitizedItems.push({
          ...classified.item,
          status: 'failed',
          reasons: [safeFailureCode(error)],
        });
        if (repeatedFailures >= args.maxFailures) break;
      }
    }
  } finally {
    await uploader?.close();
    await rm(tempRoot, { recursive: true, force: true });
  }

  const summary = summarize(sanitizedItems);
  const report = {
    run_id: args.runId,
    candidate_id: args.candidateId,
    generated_at: generatedAt,
    mode: args.dryRun ? 'pilot-write-dry-run' : 'pilot-write',
    gate_status:
      blockers.length > 0 || (summary.status_counts.failed ?? 0) > 0 ? 'blocked' : 'pass',
    execution_boundary: args.dryRun ? 'dry_run_no_vault_write' : 'one_pilot_matter_write_only',
    mapping_blockers: mappingBlockers,
    target_blockers: targetBlockers,
    source_manifest_rows: sourceRows.length,
    scope_rows: scopeRows.length,
    exclude_source_segment_count: args.excludeSourceSegments.length,
    local_receipt_rows_written: localReceipts.length,
    summary,
    items: sanitizedItems,
    not_executed: [
      'customer-wide import',
      'source-of-truth cutover',
      'Gemma indexing execution',
      'OneDrive connected state',
      'Office open/save/sync',
    ],
    sanitization:
      'No bucket names, object keys, raw source paths, document names, document contents, private tenant identifiers, account IDs, ARNs, cookies, tokens, or secrets are included.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

async function createNestUploader(): Promise<{
  uploadOne: (input: UploadInput) => Promise<UploadResult>;
  close: () => Promise<void>;
}> {
  process.env.AI_PREP_QUEUE_WORKER_ENABLED ??= 'false';
  const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, {
    logger: new StructuredLogger(),
  });
  const uploadService = app.get(DocumentUploadService);
  const tenantContext = app.get(TenantContextService);
  return {
    uploadOne: (input) =>
      tenantContext.run(
        {
          tenantId: input.target.tenantId,
          slug: input.target.tenantSlug,
          status: 'active',
          source: 'session',
        },
        () =>
          uploadService.upload({
            actorUserId: input.target.actorUserId,
            matterId: input.target.matterId,
            fields: input.fields,
            file: input.file,
            sourceSystem: 'migration',
          }),
      ),
    close: () => app.close(),
  };
}

function uploadFieldsFor(target: ValidatedTarget, mapping: PilotMapping): UploadDocumentFieldsDto {
  const duplicateDecision = mapping.duplicate_policy === 'new_document' ? 'new_document' : undefined;
  return uploadDocumentFieldsSchema.parse({
    documentType: target.documentDefaults.documentType,
    confidentialityLevel: target.documentDefaults.confidentialityLevel,
    privilegeStatus: target.documentDefaults.privilegeStatus,
    aiAllowed: target.documentDefaults.aiAllowed,
    uploadPreflightRef: target.uploadPreflightRef,
    ...(duplicateDecision ? { duplicateDecision } : {}),
  });
}

function validateMapping(mapping: PilotMapping, candidateId: string): string[] {
  const blockers: string[] = [];
  if (mapping.candidate_id !== candidateId) blockers.push('candidate_id_mismatch');
  if (mapping.status !== 'ready_for_write_mode') blockers.push('mapping_status_not_ready_for_write_mode');
  if (mapping.scope_kind !== 'pilot_matter') blockers.push('scope_kind_not_pilot_matter');
  if (mapping.single_matter_scope !== true) blockers.push('scope_not_single_matter');
  if (mapping.cutover_policy !== 'not_requested') blockers.push('cutover_policy_must_not_be_requested');
  if (mapping.unsupported_type_policy !== 'skip_with_receipt') {
    blockers.push('unsupported_type_policy_must_skip_with_receipt');
  }
  if (mapping.zero_byte_policy !== 'skip_with_receipt') blockers.push('zero_byte_policy_must_skip_with_receipt');
  if (mapping.large_object_policy !== 'worker_stream_only') blockers.push('large_object_policy_must_worker_stream_only');
  if (mapping.duplicate_policy !== 'new_document') blockers.push('duplicate_policy_must_new_document');
  return blockers;
}

function validateTarget(
  target: PilotTarget,
  candidateId: string,
): { blockers: string[]; target?: ValidatedTarget | undefined } {
  const blockers: string[] = [];
  if (target.candidate_id !== candidateId) blockers.push('target_candidate_id_mismatch');
  if (target.scope_kind !== 'pilot_matter') blockers.push('target_scope_kind_not_pilot_matter');
  if (target.single_matter_scope !== true) blockers.push('target_scope_not_single_matter');
  const tenantId = requiredUuid(target.tenant_id, 'target_tenant_id', blockers);
  const matterId = requiredUuid(target.matter_id, 'target_matter_id', blockers);
  const actorUserId = requiredUuid(target.actor_user_id, 'target_actor_user_id', blockers);
  const tenantSlug = requiredString(target.tenant_slug, 'target_tenant_slug', blockers);
  const uploadPreflightRef = requiredString(
    target.upload_preflight_ref,
    'target_upload_preflight_ref',
    blockers,
  );
  const targetApprovalRef = requiredString(
    target.target_approval_ref,
    'target_approval_ref',
    blockers,
  );
  const documentDefaults = {
    documentType: stringDefault(target.document_defaults?.document_type, 'other'),
    confidentialityLevel: stringDefault(target.document_defaults?.confidentiality_level, 'standard'),
    privilegeStatus: stringDefault(target.document_defaults?.privilege_status, 'none'),
    aiAllowed: target.document_defaults?.ai_allowed === true,
  };
  const fields = uploadDocumentFieldsSchema.safeParse({
    documentType: documentDefaults.documentType,
    confidentialityLevel: documentDefaults.confidentialityLevel,
    privilegeStatus: documentDefaults.privilegeStatus,
    aiAllowed: documentDefaults.aiAllowed,
    uploadPreflightRef,
    duplicateDecision: 'new_document',
  });
  if (!fields.success) blockers.push('target_document_defaults_invalid');
  if (blockers.length > 0) return { blockers };
  return {
    blockers,
    target: {
      candidateId,
      tenantId: toTenantId(tenantId),
      tenantSlug,
      matterId,
      actorUserId,
      uploadPreflightRef,
      targetApprovalRef,
      documentDefaults,
    },
  };
}

function classifyScopeRow(
  row: ScopeRow,
  index: number,
  candidateId: string,
  mapping: PilotMapping,
  sourceByHash: Map<string, ReadyItem['raw']>,
): { ready?: ReadyItem | undefined; item: SanitizedItem } {
  const sourceHash = sourceHashOfRow(row);
  const extension = extensionOfRow(row);
  const sizeBytes = Number(row.size_bytes ?? row.size ?? 0);
  const itemId = (sourceHash ?? sha256Hex(`row:${index}`)).slice(0, 16);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (row.candidate_id !== undefined && row.candidate_id !== candidateId) {
    reasons.push('item_candidate_id_mismatch');
  }
  if (!sourceHash) reasons.push('missing_source_object_hash');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) reasons.push('invalid_size');
  if (row.readable === false || row.readable === 'false') reasons.push('staging_read_not_confirmed');
  if (sizeBytes === 0) {
    if (mapping.zero_byte_policy === 'skip_with_receipt') {
      return {
        item: {
          item_id: itemId,
          status: 'skipped',
          reasons: ['zero_byte_skip_with_receipt'],
          warnings,
          extension,
          size_bytes: sizeBytes,
        },
      };
    }
    reasons.push('zero_byte_blocked_by_policy');
  }
  if (!supportedExtensions.has(extension)) {
    if (mapping.unsupported_type_policy === 'skip_with_receipt') {
      return {
        item: {
          item_id: itemId,
          status: 'skipped',
          reasons: [`unsupported_extension_${extension}`],
          warnings,
          extension,
          size_bytes: sizeBytes,
        },
      };
    }
    reasons.push(`unsupported_extension_${extension}`);
  }
  if (sizeBytes > 200 * 1024 ** 2) warnings.push('over_browser_upload_default');
  const raw = sourceHash ? sourceByHash.get(sourceHash) : undefined;
  if (!raw) reasons.push('source_manifest_match_missing');
  if (raw && raw.sizeBytes !== sizeBytes) reasons.push('source_manifest_size_mismatch');
  if (raw?.excluded) {
    return {
      item: {
        item_id: itemId,
        status: 'skipped',
        reasons: ['excluded_source_segment_policy'],
        warnings,
        extension,
        size_bytes: sizeBytes,
      },
    };
  }
  if (reasons.length > 0 || !sourceHash || !raw) {
    return {
      item: {
        item_id: itemId,
        status: reasons.includes('staging_read_not_confirmed') ? 'failed' : 'blocked',
        reasons,
        warnings,
        extension,
        size_bytes: sizeBytes,
      },
    };
  }
  return {
    ready: { itemId, sourceHash, extension, sizeBytes, raw },
    item: {
      item_id: itemId,
      status: 'ready',
      reasons: ['ready_for_pilot_write'],
      warnings,
      extension,
      size_bytes: sizeBytes,
    },
  };
}

async function readScopeRows(filePath: string): Promise<Array<{ index: number; row: ScopeRow }>> {
  const rows: Array<{ index: number; row: ScopeRow }> = [];
  let index = 0;
  for await (const row of readNdjson(filePath)) {
    index += 1;
    rows.push({ index, row: row as ScopeRow });
  }
  return rows;
}

async function readSourceManifest(filePath: string): Promise<SourceManifestRow[]> {
  const rows: SourceManifestRow[] = [];
  for await (const row of readNdjson(filePath)) rows.push(row as SourceManifestRow);
  return rows;
}

async function* readNdjson(filePath: string): AsyncGenerator<unknown> {
  const source = fs.createReadStream(filePath);
  const input = filePath.endsWith('.gz') ? source.pipe(zlib.createGunzip()) : source;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as unknown;
  }
}

function normalizeSourceRow(
  row: SourceManifestRow,
  excludeSourceSegments: readonly string[],
): ReadyItem['raw'] | null {
  if (typeof row.bucket !== 'string' || typeof row.key !== 'string') return null;
  const sizeBytes = Number(row.size ?? row.size_bytes ?? -1);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return null;
  const excludedSegments = new Set(normalizeSourceSegments(excludeSourceSegments));
  return {
    bucket: row.bucket,
    key: row.key,
    sizeBytes,
    excluded: row.key
      .split('/')
      .some((segment) => excludedSegments.has(segment.normalize('NFC'))),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function loadState(filePath: string): Promise<RunnerState> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as RunnerState;
    return parsed.imported && typeof parsed.imported === 'object' ? parsed : { imported: {} };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { imported: {} };
    throw error;
  }
}

async function saveState(filePath: string, value: RunnerState): Promise<void> {
  await writeJson(filePath, value);
}

async function appendLocalReceipt(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

async function downloadWithAwsCli(input: {
  bucket: string;
  key: string;
  destinationPath: string;
  awsProfile?: string | undefined;
}): Promise<void> {
  await mkdir(path.dirname(input.destinationPath), { recursive: true });
  const args = ['s3api', 'get-object'];
  if (input.awsProfile) args.push('--profile', input.awsProfile);
  args.push('--bucket', input.bucket, '--key', input.key, input.destinationPath);
  const result = await runCommand('aws', args);
  if (result !== 0) throw new Error('AWS_SOURCE_GET_OBJECT_FAILED');
}

function runCommand(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function summarize(items: readonly SanitizedItem[]) {
  const statusCounts: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};
  for (const item of items) {
    statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
    for (const reason of item.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  return {
    total_items: items.length,
    status_counts: statusCounts,
    reason_counts: reasonCounts,
    expected_created_counts: {
      documents: statusCounts.imported ?? 0,
      file_objects: statusCounts.imported ?? 0,
      initial_versions: statusCounts.imported ?? 0,
      audit_events: statusCounts.imported ?? 0,
    },
  };
}

function sourceHashOfRow(row: ScopeRow): string | null {
  if (typeof row.source_object_hash === 'string' && hashPattern.test(row.source_object_hash)) {
    return row.source_object_hash.toLowerCase();
  }
  if (typeof row.source_object_key === 'string' && row.source_object_key.length > 0) {
    return sha256Hex(row.source_object_key);
  }
  return null;
}

function extensionOfRow(row: ScopeRow): string {
  const value = String(row.extension ?? '').trim().toLowerCase();
  if (value.startsWith('.') && value.length <= 13 && !/[\\/\s:]/.test(value)) return value;
  return '[no_ext]';
}

function idempotencyKey(input: {
  runId: string;
  candidateId: string;
  tenantId: string;
  matterId: string;
  sourceHash: string;
}): string {
  return sha256Hex(
    [
      input.runId,
      input.candidateId,
      input.tenantId,
      input.matterId,
      input.sourceHash,
      'pilot-write:v1',
    ].join('|'),
  );
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeOriginalFilename(key: string, extension: string): string {
  const base = path.basename(key);
  if (base && base !== '.' && base !== '..') return base;
  return `migrated-document${extension === '[no_ext]' ? '' : extension}`;
}

function mimeTypeForExtension(extension: string): string {
  switch (extension) {
    case '.csv':
      return 'text/csv';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.eml':
      return 'message/rfc822';
    case '.hwp':
      return 'application/x-hwp';
    case '.hwpx':
      return 'application/vnd.hancom.hwpx';
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    case '.msg':
      return 'application/vnd.ms-outlook';
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.ppt':
      return 'application/vnd.ms-powerpoint';
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.txt':
      return 'text/plain';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return 'application/octet-stream';
  }
}

function requiredArg(argv: readonly string[], name: string): string {
  const value = argValue(argv, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function argValues(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === name && value) values.push(value);
  }
  return values;
}

function normalizeSourceSegments(values: readonly string[]): string[] {
  return values.map((value) => value.trim().normalize('NFC')).filter((value) => value.length > 0);
}

function parseOptionalPositiveInt(
  raw: string | undefined,
  label: string,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requiredUuid(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !uuidPattern.test(value) || isPlaceholder(value)) {
    blockers.push(`${label}_missing_or_invalid`);
    return '';
  }
  return value;
}

function toTenantId(value: string): TenantId {
  return value as TenantId;
}

function requiredString(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || value.trim().length === 0 || isPlaceholder(value)) {
    blockers.push(`${label}_missing_or_invalid`);
    return '';
  }
  return value.trim();
}

function stringDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function isPlaceholder(value: string): boolean {
  return (
    value === 'PENDING_EXTERNAL_REF' ||
    value === 'PENDING_LOCAL_UUID' ||
    value.startsWith('PENDING_LOCAL_') ||
    /^<[^>]+>$/.test(value) ||
    /^ONEDRIVE-[A-Z0-9-]+-REF$/.test(value)
  );
}

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/^[A-Z0-9_]{3,80}$/.test(message)) return message;
  return 'PILOT_WRITE_ITEM_FAILED';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function main(): Promise<void> {
  let args: PilotWriteCliArgs;
  try {
    args = parsePilotWriteArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runPilotWrite(args);
    console.log(
      JSON.stringify({
        run_id: report.run_id,
        mode: report.mode,
        gate_status: report.gate_status,
        total_items: report.summary.total_items,
        imported: report.summary.status_counts.imported ?? 0,
        ready: report.summary.status_counts.ready ?? 0,
        already_imported: report.summary.status_counts.already_imported ?? 0,
        skipped: report.summary.status_counts.skipped ?? 0,
        blocked: report.summary.status_counts.blocked ?? 0,
        failed: report.summary.status_counts.failed ?? 0,
      }),
    );
    if (report.gate_status !== 'pass') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ code: 'ONEDRIVE_PILOT_WRITE_FAILED', message: safeFailureCode(error) }));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
