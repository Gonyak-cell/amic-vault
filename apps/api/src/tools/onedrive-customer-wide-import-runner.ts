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
import {
  DocumentUploadService,
  type UploadedDiskFile,
} from '../modules/document/document-upload.service';
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
  '.json',
  '.md',
  '.markdown',
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

export interface CustomerWideImportCliArgs {
  runId: string;
  manifestPath: string;
  scopePath: string;
  tenantSlug: string;
  actorUserId: string;
  uploadPreflightRef?: string | undefined;
  importApprovalRef: string;
  sanitizedOut: string;
  localReceiptOut: string;
  statePath: string;
  awsProfile?: string | undefined;
  dryRun: boolean;
  execute: boolean;
  limit?: number | undefined;
  offset: number;
  maxFailures: number;
  cutoverPolicy: string;
  documentDefaults: {
    documentType: string;
    confidentialityLevel: string;
    privilegeStatus: string;
    aiAllowed: boolean;
  };
}

interface ResolvedManifestRow {
  migration_run_id?: unknown;
  source_row_hash?: unknown;
  tenant_id?: unknown;
  client_id?: unknown;
  matter_id?: unknown;
  matter_code?: unknown;
  matter_code_hash?: unknown;
  mapping_candidate_hash?: unknown;
  approval_ref?: unknown;
  source_lane?: unknown;
  planned_action?: unknown;
  idempotency_key?: unknown;
}

interface ApprovedScopeRow {
  source_object_hash?: unknown;
  extension?: unknown;
  size_bytes?: unknown;
  size?: unknown;
  raw?: {
    bucket?: unknown;
    key?: unknown;
  };
}

interface RawSource {
  bucket: string;
  key: string;
  sizeBytes: number;
  extension: string;
}

interface ReadyImportItem {
  itemId: string;
  sourceHash: string;
  tenantId: TenantId;
  clientId: string;
  matterId: string;
  idempotencyKey: string;
  raw: RawSource;
}

interface UploadInput {
  target: ReadyImportItem;
  tenantSlug: string;
  actorUserId: string;
  uploadPreflightRef?: string | undefined;
  file: UploadedDiskFile;
  fields: UploadDocumentFieldsDto;
}

interface UploadResult {
  documentId: string;
  matterId: string;
  fileObjectId: string;
}

interface SkippedImportResult {
  itemId: string;
  reason: string;
  skippedAt: string;
}

interface CustomerWideImportDependencies {
  now?: () => Date;
  downloadSourceObject?: (input: {
    bucket: string;
    key: string;
    destinationPath: string;
    awsProfile?: string | undefined;
  }) => Promise<void>;
  uploadOne?: (input: UploadInput) => Promise<UploadResult>;
  createUploader?: () => Promise<{
    uploadOne: (input: UploadInput) => Promise<UploadResult>;
    close: () => Promise<void>;
  }>;
}

interface RunnerState {
  imported: Record<string, UploadResult>;
  skipped: Record<string, SkippedImportResult>;
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
    'usage: pnpm onedrive:customer-wide-import -- --dry-run|--execute --run-id <id> --manifest <resolved.ndjson[.gz]> --scope <approved-scope.ndjson[.gz]> --tenant-slug <slug> --actor-user-id <uuid> --import-approval-ref <ref> --sanitized-out <out.json> --local-receipt-out <receipt.ndjson> [--state <state.json>] [--aws-profile <profile>] [--limit <n>] [--offset <n>] [--max-failures <n>] [--cutover-policy not_requested]',
    '',
    'Customer-wide OneDrive import runner for already resolved Vault targets.',
    'It writes only through DocumentUploadService and refuses source-of-truth cutover.',
  ].join('\n');
}

export function parseCustomerWideImportArgs(argv: readonly string[]): CustomerWideImportCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');

  const sanitizedOut = requiredArg(argv, '--sanitized-out');
  const localReceiptOut = requiredArg(argv, '--local-receipt-out');
  const limit = parseOptionalPositiveInt(argValue(argv, '--limit'), '--limit', 100_000);
  const offset = parseOptionalNonNegativeInt(argValue(argv, '--offset'), '--offset', 1_000_000) ?? 0;
  const maxFailures =
    parseOptionalPositiveInt(argValue(argv, '--max-failures'), '--max-failures', 10_000) ?? 3;

  return {
    runId: requiredArg(argv, '--run-id'),
    manifestPath: requiredArg(argv, '--manifest'),
    scopePath: requiredArg(argv, '--scope'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    actorUserId: requiredArg(argv, '--actor-user-id'),
    uploadPreflightRef: argValue(argv, '--upload-preflight-ref'),
    importApprovalRef: requiredArg(argv, '--import-approval-ref'),
    sanitizedOut,
    localReceiptOut,
    statePath:
      argValue(argv, '--state') ??
      path.join(path.dirname(localReceiptOut), 'customer-wide-import-state.local.json'),
    awsProfile: argValue(argv, '--aws-profile'),
    dryRun,
    execute,
    limit,
    offset,
    maxFailures,
    cutoverPolicy: argValue(argv, '--cutover-policy') ?? 'not_requested',
    documentDefaults: {
      documentType: argValue(argv, '--document-type') ?? 'other',
      confidentialityLevel: argValue(argv, '--confidentiality-level') ?? 'standard',
      privilegeStatus: argValue(argv, '--privilege-status') ?? 'none',
      aiAllowed: argValue(argv, '--ai-allowed') === 'true',
    },
  };
}

export async function runCustomerWideImport(
  args: CustomerWideImportCliArgs,
  dependencies: CustomerWideImportDependencies = {},
) {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const manifestRows = await readResolvedManifest(args.manifestPath);
  const scopeRows = await readApprovedScopeRows(args.scopePath);
  const state = await loadState(args.statePath);
  const sourceByHash = buildSourceMap(scopeRows);
  const globalBlockers = validateGlobalArgs(args, manifestRows);
  const sanitizedItems: SanitizedItem[] = [];
  const localReceipts: unknown[] = [];
  let uploader:
    | Awaited<ReturnType<NonNullable<CustomerWideImportDependencies['createUploader']>>>
    | undefined;
  let repeatedFailures = 0;
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'amic-vault-onedrive-customer-wide-import-'));

  try {
    if (args.execute && globalBlockers.length === 0) {
      uploader = dependencies.uploadOne
        ? { uploadOne: dependencies.uploadOne, close: async () => undefined }
        : await (dependencies.createUploader ?? createNestUploader)();
    }

    for (let index = args.offset; index < manifestRows.length; index += 1) {
      if (args.limit && sanitizedItems.length >= args.limit) break;
      const row = manifestRows[index];
      if (!row) continue;
      const classified = classifyManifestRow(row, index + 1, args, sourceByHash);
      if (globalBlockers.length > 0) {
        sanitizedItems.push({
          ...classified.item,
          status: 'blocked',
          reasons: [...new Set([...globalBlockers, ...classified.item.reasons])],
        });
        continue;
      }
      if (!classified.ready) {
        sanitizedItems.push(classified.item);
        continue;
      }
      const key = classified.ready.idempotencyKey;
      if (state.imported[key]) {
        sanitizedItems.push({
          ...classified.item,
          status: 'already_imported',
          reasons: ['idempotency_key_already_imported'],
        });
        continue;
      }
      const skipped = state.skipped[key];
      if (skipped) {
        sanitizedItems.push({
          ...classified.item,
          status: 'skipped',
          reasons: [skipped.reason],
        });
        continue;
      }
      if (args.dryRun) {
        sanitizedItems.push({
          ...classified.item,
          status: 'ready',
          reasons: ['ready_for_customer_wide_import'],
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
        if (downloaded.size !== classified.ready.raw.sizeBytes) throw new Error('DOWNLOADED_SIZE_MISMATCH');
        if (!uploader) throw new Error('RUNNER_NOT_READY');
        const uploadResult = await uploader.uploadOne({
          target: classified.ready,
          tenantSlug: args.tenantSlug,
          actorUserId: args.actorUserId,
          uploadPreflightRef: args.uploadPreflightRef,
          file: {
            path: downloadedPath,
            originalname: safeOriginalFilename(
              classified.ready.raw.key,
              classified.ready.raw.extension,
            ),
            mimetype: mimeTypeForExtension(classified.ready.raw.extension),
            size: classified.ready.raw.sizeBytes,
          },
          fields: uploadFieldsFor(args),
        });
        state.imported[key] = uploadResult;
        await saveState(args.statePath, state);
        await appendLocalReceipt(args.localReceiptOut, {
          item_id: classified.ready.itemId,
          source_hash: classified.ready.sourceHash,
          status: 'imported',
          document_id: uploadResult.documentId,
          tenant_id: classified.ready.tenantId,
          client_id: classified.ready.clientId,
          matter_id: uploadResult.matterId,
          file_object_id: uploadResult.fileObjectId,
          idempotency_key: key,
          imported_at: generatedAt,
        });
        localReceipts.push(uploadResult);
        sanitizedItems.push({
          ...classified.item,
          status: 'imported',
          reasons: ['customer_wide_imported'],
        });
        repeatedFailures = 0;
      } catch (error) {
        const failureCode = safeFailureCode(error);
        const skipReason = skippableUploadFailureReason(failureCode);
        if (skipReason) {
          state.skipped[key] = {
            itemId: classified.ready.itemId,
            reason: skipReason,
            skippedAt: generatedAt,
          };
          await saveState(args.statePath, state);
          sanitizedItems.push({
            ...classified.item,
            status: 'skipped',
            reasons: [skipReason],
          });
          repeatedFailures = 0;
          continue;
        }
        repeatedFailures += 1;
        sanitizedItems.push({
          ...classified.item,
          status: 'failed',
          reasons: [failureCode],
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
    generated_at: generatedAt,
    mode: args.dryRun ? 'customer-wide-import-dry-run' : 'customer-wide-import',
    gate_status:
      globalBlockers.length > 0 || (summary.status_counts.failed ?? 0) > 0
        ? 'blocked'
        : 'pass',
    execution_boundary: args.dryRun
      ? 'dry_run_no_vault_write'
      : 'customer_wide_vault_write_no_cutover',
    manifest_rows: manifestRows.length,
    approved_scope_rows: scopeRows.length,
    offset: args.offset,
    processed_rows: sanitizedItems.length,
    local_receipt_rows_written: localReceipts.length,
    global_blockers: globalBlockers,
    summary,
    items: sanitizedItems,
    not_executed: [
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
          slug: input.tenantSlug,
          status: 'active',
          source: 'session',
        },
        () =>
          uploadService.upload({
            actorUserId: input.actorUserId,
            matterId: input.target.matterId,
            fields: input.fields,
            file: input.file,
            sourceSystem: 'migration',
          }),
      ),
    close: () => app.close(),
  };
}

function uploadFieldsFor(args: CustomerWideImportCliArgs): UploadDocumentFieldsDto {
  return uploadDocumentFieldsSchema.parse({
    documentType: args.documentDefaults.documentType,
    confidentialityLevel: args.documentDefaults.confidentialityLevel,
    privilegeStatus: args.documentDefaults.privilegeStatus,
    aiAllowed: args.documentDefaults.aiAllowed,
    ...(args.uploadPreflightRef ? { uploadPreflightRef: args.uploadPreflightRef } : {}),
    duplicateDecision: 'new_document',
  });
}

function validateGlobalArgs(
  args: CustomerWideImportCliArgs,
  manifestRows: readonly ResolvedManifestRow[],
): string[] {
  const blockers: string[] = [];
  if (args.cutoverPolicy !== 'not_requested') {
    blockers.push('source_of_truth_cutover_must_not_be_requested');
  }
  if (!requiredString(args.importApprovalRef)) blockers.push('import_approval_ref_missing');
  if (!uuidPattern.test(args.actorUserId)) blockers.push('actor_user_id_missing_or_invalid');
  if (manifestRows.length === 0) blockers.push('resolved_manifest_empty');
  const tenantIds = new Set(
    manifestRows
      .map((row) => (typeof row.tenant_id === 'string' ? row.tenant_id : ''))
      .filter((tenantId) => tenantId.length > 0),
  );
  if (tenantIds.size > 1) blockers.push('multiple_tenants_not_supported_by_single_tenant_slug');
  return blockers;
}

function classifyManifestRow(
  row: ResolvedManifestRow,
  rowNumber: number,
  args: CustomerWideImportCliArgs,
  sourceByHash: Map<string, RawSource>,
): { ready?: ReadyImportItem | undefined; item: SanitizedItem } {
  const sourceHash = stringHash(row.source_row_hash);
  const itemId = (sourceHash ?? sha256Hex(`manifest-row:${rowNumber}`)).slice(0, 16);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const tenantId = requiredUuidValue(row.tenant_id, 'tenant_id', reasons);
  const clientId = requiredUuidValue(row.client_id, 'client_id', reasons);
  const matterId = requiredUuidValue(row.matter_id, 'matter_id', reasons);
  const idempotencyKey = stringHash(row.idempotency_key);

  if (!sourceHash) reasons.push('missing_source_row_hash');
  if (!idempotencyKey) reasons.push('missing_idempotency_key');
  if (row.approval_ref !== args.importApprovalRef) reasons.push('approval_ref_mismatch');
  if (row.planned_action !== 'create_document_version_file_object_audit') {
    reasons.push('planned_action_not_importable');
  }

  const source = sourceHash ? sourceByHash.get(sourceHash) : undefined;
  if (!source) reasons.push('approved_scope_source_match_missing');
  if (source && !supportedExtensions.has(source.extension)) {
    return {
      item: {
        item_id: itemId,
        status: 'skipped',
        reasons: [`unsupported_extension_${source.extension}`],
        warnings,
        extension: source.extension,
        size_bytes: source.sizeBytes,
      },
    };
  }
  if (source && source.sizeBytes === 0) {
    return {
      item: {
        item_id: itemId,
        status: 'skipped',
        reasons: ['zero_byte_skip_with_receipt'],
        warnings,
        extension: source.extension,
        size_bytes: source.sizeBytes,
      },
    };
  }
  if (source && source.sizeBytes > 200 * 1024 ** 2) warnings.push('over_browser_upload_default');

  if (reasons.length > 0 || !source || !sourceHash || !tenantId || !clientId || !matterId || !idempotencyKey) {
    return {
      item: {
        item_id: itemId,
        status: 'blocked',
        reasons,
        warnings,
        extension: source?.extension ?? '[unknown]',
        size_bytes: source?.sizeBytes ?? 0,
      },
    };
  }

  return {
    ready: {
      itemId,
      sourceHash,
      tenantId: toTenantId(tenantId),
      clientId,
      matterId,
      idempotencyKey,
      raw: source,
    },
    item: {
      item_id: itemId,
      status: 'ready',
      reasons: ['ready_for_customer_wide_import'],
      warnings,
      extension: source.extension,
      size_bytes: source.sizeBytes,
    },
  };
}

function buildSourceMap(rows: readonly ApprovedScopeRow[]): Map<string, RawSource> {
  const sources = new Map<string, RawSource>();
  for (const row of rows) {
    const sourceHash = stringHash(row.source_object_hash);
    if (!sourceHash) continue;
    const raw = normalizeScopeRaw(row);
    if (raw) sources.set(sourceHash, raw);
  }
  return sources;
}

function normalizeScopeRaw(row: ApprovedScopeRow): RawSource | null {
  if (typeof row.raw?.bucket !== 'string' || typeof row.raw.key !== 'string') return null;
  const sizeBytes = Number(row.size_bytes ?? row.size ?? -1);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return null;
  return {
    bucket: row.raw.bucket,
    key: row.raw.key,
    sizeBytes,
    extension: extensionOfRow(row),
  };
}

async function readResolvedManifest(filePath: string): Promise<ResolvedManifestRow[]> {
  const rows: ResolvedManifestRow[] = [];
  for await (const row of readNdjson(filePath)) rows.push(row as ResolvedManifestRow);
  return rows;
}

async function readApprovedScopeRows(filePath: string): Promise<ApprovedScopeRow[]> {
  const rows: ApprovedScopeRow[] = [];
  for await (const row of readNdjson(filePath)) rows.push(row as ApprovedScopeRow);
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function loadState(filePath: string): Promise<RunnerState> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as RunnerState;
    return {
      imported: parsed.imported && typeof parsed.imported === 'object' ? parsed.imported : {},
      skipped: parsed.skipped && typeof parsed.skipped === 'object' ? parsed.skipped : {},
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { imported: {}, skipped: {} };
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
      documents: statusCounts.imported ?? statusCounts.ready ?? 0,
      file_objects: statusCounts.imported ?? statusCounts.ready ?? 0,
      initial_versions: statusCounts.imported ?? statusCounts.ready ?? 0,
      audit_events: statusCounts.imported ?? statusCounts.ready ?? 0,
    },
  };
}

function extensionOfRow(row: ApprovedScopeRow): string {
  const value = String(row.extension ?? '')
    .trim()
    .toLowerCase();
  if (value.startsWith('.') && value.length <= 13 && !/[\\/\s:]/.test(value)) return value;
  return '[no_ext]';
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
    case '.json':
      return 'application/json';
    case '.md':
    case '.markdown':
      return 'text/markdown';
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

function parseOptionalNonNegativeInt(
  raw: string | undefined,
  label: string,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be an integer between 0 and ${max}`);
  }
  return value;
}

function requiredUuidValue(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== 'string' || !uuidPattern.test(value) || isPlaceholder(value)) {
    blockers.push(`${label}_missing_or_invalid`);
    return '';
  }
  return value;
}

function stringHash(value: unknown): string | null {
  return typeof value === 'string' && hashPattern.test(value) ? value.toLowerCase() : null;
}

function requiredString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && !isPlaceholder(value);
}

function toTenantId(value: string): TenantId {
  return value as TenantId;
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

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const response = errorResponse(error);
  const responseCode = safeToken(response?.code);
  const responseReason = safeToken(response?.reason);
  if (responseCode && responseReason) return `${responseCode}_${responseReason}`;
  if (responseCode) return responseCode;
  if (/^[A-Z0-9_]{3,80}$/.test(message)) return message;
  return 'CUSTOMER_WIDE_IMPORT_ITEM_FAILED';
}

function skippableUploadFailureReason(failureCode: string): string | null {
  return failureCode === 'UNSUPPORTED_FILE_TYPE'
    ? 'unsupported_upload_validation_skip_with_receipt'
    : null;
}

function errorResponse(error: unknown): { code?: unknown; reason?: unknown } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const maybeResponse = error as {
    getResponse?: () => unknown;
    response?: unknown;
  };
  const response =
    typeof maybeResponse.getResponse === 'function'
      ? maybeResponse.getResponse()
      : maybeResponse.response;
  return typeof response === 'object' && response !== null
    ? (response as { code?: unknown; reason?: unknown })
    : undefined;
}

function safeToken(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_]{3,80}$/.test(value) ? value : null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function main(): Promise<void> {
  let args: CustomerWideImportCliArgs;
  try {
    args = parseCustomerWideImportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runCustomerWideImport(args);
    console.log(
      JSON.stringify({
        run_id: report.run_id,
        mode: report.mode,
        gate_status: report.gate_status,
        processed_rows: report.processed_rows,
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
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_CUSTOMER_WIDE_IMPORT_FAILED',
        message: safeFailureCode(error),
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
