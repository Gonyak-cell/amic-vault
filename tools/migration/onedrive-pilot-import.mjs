#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import zlib from 'node:zlib';

const MIB = 1024 ** 2;

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

const requiredWriteRefs = [
  'approval_ref',
  'dryrun_pass_ref',
  'write_window_ref',
  'db_snapshot_ref',
  'storage_containment_ref',
  'rollback_owner_ref',
];

const requiredMappingFields = [
  'candidate_id',
  'tenant_ref',
  'client_ref',
  'matter_ref',
  'status',
  'scope_kind',
  'single_matter_scope',
  'duplicate_policy',
  'unsupported_type_policy',
  'zero_byte_policy',
  'large_object_policy',
  'cutover_policy',
];

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'help') {
      args.help = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`missing value for --${key}`);
    index += 1;
    if (key === 'mode') args.mode = next;
    else if (key === 'scope') args.scope = next;
    else if (key === 'mapping') args.mapping = next;
    else if (key === 'fixture-store') args.fixtureStore = next;
    else if (key === 'sanitized-out') args.sanitizedOut = next;
    else if (key === 'local-receipt-out') args.localReceiptOut = next;
    else if (key === 'run-id') args.runId = next;
    else if (key === 'candidate-id') args.candidateId = next;
    else throw new Error(`unknown option: --${key}`);
  }
  return args;
}

export function usage() {
  return [
    'usage: node tools/migration/onedrive-pilot-import.mjs --mode synthetic-write --scope <scope.ndjson[.gz]> --mapping <mapping.json> --fixture-store <dir> --sanitized-out <out.json> --local-receipt-out <receipt.ndjson> [--run-id <id>] [--candidate-id <id>]',
    '',
    'Synthetic write-mode only. Real pilot write execution uses: pnpm onedrive:pilot-write -- --dry-run|--execute ...',
  ].join('\n');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function syntheticUuid(seed) {
  const hex = sha256Hex(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function extensionOfRow(row) {
  const value = String(row.extension ?? '').trim().toLowerCase();
  if (value.startsWith('.') && value.length <= 13 && !/[\\/\s:]/.test(value)) return value;
  return '[no_ext]';
}

function sourceHashOfRow(row) {
  if (typeof row.source_object_hash === 'string' && /^[a-f0-9]{64}$/i.test(row.source_object_hash)) {
    return row.source_object_hash.toLowerCase();
  }
  if (typeof row.source_object_key === 'string' && row.source_object_key.length > 0) {
    return sha256Hex(row.source_object_key);
  }
  return null;
}

function isTruthyBoolean(value) {
  return value === true || value === 'true';
}

function isPlaceholderRef(value) {
  if (typeof value !== 'string') return false;
  return (
    value === 'PENDING_EXTERNAL_REF' ||
    /^<[^>]+>$/.test(value) ||
    /^ONEDRIVE-[A-Z0-9-]+-REF$/.test(value)
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function* readScopeRows(filePath) {
  const source = fs.createReadStream(filePath);
  const input = filePath.endsWith('.gz') ? source.pipe(zlib.createGunzip()) : source;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let index = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    index += 1;
    yield { index, row: JSON.parse(line) };
  }
}

export function validateWriteMapping(mapping, expectedCandidateId) {
  const blockers = [];
  for (const field of requiredMappingFields) {
    if (mapping[field] === undefined || mapping[field] === null || mapping[field] === '') {
      blockers.push(`missing_mapping_${field}`);
    } else if (isPlaceholderRef(mapping[field])) {
      blockers.push(`placeholder_mapping_${field}`);
    }
  }
  for (const field of requiredWriteRefs) {
    if (mapping[field] === undefined || mapping[field] === null || mapping[field] === '') {
      blockers.push(`missing_write_ref_${field}`);
    } else if (isPlaceholderRef(mapping[field])) {
      blockers.push(`placeholder_write_ref_${field}`);
    }
  }
  if (expectedCandidateId && mapping.candidate_id !== expectedCandidateId) blockers.push('candidate_id_mismatch');
  if (mapping.status !== 'ready_for_write_mode') blockers.push('mapping_status_not_ready_for_write_mode');
  if (mapping.scope_kind !== 'pilot_matter') blockers.push('scope_kind_not_pilot_matter');
  if (!isTruthyBoolean(mapping.single_matter_scope)) blockers.push('scope_not_single_matter');
  if (mapping.cutover_policy !== 'not_requested') blockers.push('cutover_policy_must_not_be_requested');
  return blockers;
}

function classifyForWrite(row, index, mapping, expectedCandidateId) {
  const candidateId = String(row.candidate_id ?? expectedCandidateId ?? mapping.candidate_id ?? '');
  const sourceHash = sourceHashOfRow(row);
  const extension = extensionOfRow(row);
  const sizeBytes = Number(row.size_bytes ?? row.size ?? 0);
  const reasons = [];
  const warnings = [];

  if (candidateId !== mapping.candidate_id) reasons.push('item_candidate_id_mismatch');
  if (!sourceHash) reasons.push('missing_source_object_hash');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) reasons.push('invalid_size');
  if (row.readable === false || row.readable === 'false') reasons.push('staging_read_not_confirmed');

  if (sizeBytes === 0) {
    if (mapping.zero_byte_policy === 'skip_with_receipt') return itemResult(row, index, 'skipped', ['zero_byte_skip_with_receipt'], warnings);
    reasons.push('zero_byte_blocked_by_policy');
  }

  if (!supportedExtensions.has(extension)) {
    if (mapping.unsupported_type_policy === 'skip_with_receipt') {
      return itemResult(row, index, 'skipped', [`unsupported_extension_${extension}`], warnings);
    }
    reasons.push(`unsupported_extension_${extension}`);
  }

  if (sizeBytes > 200 * MIB) {
    warnings.push('over_browser_upload_default');
    if (mapping.large_object_policy !== 'worker_stream_only') reasons.push('large_object_policy_not_worker_stream');
  }

  if (reasons.includes('staging_read_not_confirmed')) return itemResult(row, index, 'retryable', reasons, warnings);
  if (reasons.length > 0) return itemResult(row, index, 'blocked', reasons, warnings);
  return itemResult(row, index, 'ready', ['ready_for_synthetic_write'], warnings);
}

function itemResult(row, index, status, reasons, warnings) {
  const sourceHash = sourceHashOfRow(row);
  return {
    item_id: (sourceHash ?? sha256Hex(`row:${index}`)).slice(0, 16),
    source_hash: sourceHash,
    status,
    reasons,
    warnings,
    extension: extensionOfRow(row),
    size_bytes: Number(row.size_bytes ?? row.size ?? 0),
  };
}

function idempotencyKey(input) {
  return sha256Hex(
    [
      input.runId,
      input.candidateId,
      input.tenantRef,
      input.matterRef,
      input.sourceHash,
      'policy:v1',
    ].join('|'),
  );
}

async function loadState(storeDir) {
  const file = path.join(storeDir, 'state.json');
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { imported: {} };
    }
    throw error;
  }
}

async function saveState(storeDir, state) {
  await writeJson(path.join(storeDir, 'state.json'), state);
}

async function appendNdjson(filePath, row) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
}

async function writeSyntheticRows(storeDir, mapping, item, key, generatedAt) {
  const documentId = syntheticUuid(`${key}:document`);
  const fileObjectId = syntheticUuid(`${key}:file_object`);
  const versionId = syntheticUuid(`${key}:version`);
  const auditEventId = syntheticUuid(`${key}:audit`);
  const storageObjectId = syntheticUuid(`${key}:storage`);
  const storageUri = `synthetic-vault://${storageObjectId}`;

  await appendNdjson(path.join(storeDir, 'documents.ndjson'), {
    document_id: documentId,
    tenant_ref: mapping.tenant_ref,
    client_ref: mapping.client_ref,
    matter_ref: mapping.matter_ref,
    status: 'draft',
    source: 'synthetic_migration_worker',
    created_at: generatedAt,
  });
  await appendNdjson(path.join(storeDir, 'file_objects.ndjson'), {
    file_object_id: fileObjectId,
    tenant_ref: mapping.tenant_ref,
    storage_uri: storageUri,
    size_bytes: item.size_bytes,
    sha256: item.source_hash,
    source_system: 'migration',
    created_at: generatedAt,
  });
  await appendNdjson(path.join(storeDir, 'document_versions.ndjson'), {
    version_id: versionId,
    document_id: documentId,
    file_object_id: fileObjectId,
    version_number: 1,
    file_hash: item.source_hash,
    created_at: generatedAt,
  });
  await appendNdjson(path.join(storeDir, 'audit_events.ndjson'), {
    audit_event_id: auditEventId,
    action: 'DOCUMENT_IMPORTED',
    tenant_ref: mapping.tenant_ref,
    target_type: 'document',
    target_id: documentId,
    metadata: {
      matter_ref: mapping.matter_ref,
      file_object_id: fileObjectId,
      version_id: versionId,
      hash: item.source_hash,
      source_system: 'migration',
    },
    created_at: generatedAt,
  });
  await appendNdjson(path.join(storeDir, 'storage_objects.ndjson'), {
    storage_object_id: storageObjectId,
    storage_uri: storageUri,
    size_bytes: item.size_bytes,
    sha256: item.source_hash,
    created_at: generatedAt,
  });

  return { documentId, fileObjectId, versionId, auditEventId, storageUri };
}

function summarize(items) {
  const counts = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return {
    total_items: items.length,
    status_counts: counts,
    expected_created_counts: {
      documents: counts.imported ?? 0,
      file_objects: counts.imported ?? 0,
      initial_versions: counts.imported ?? 0,
      audit_events: counts.imported ?? 0,
      storage_objects: counts.imported ?? 0,
    },
  };
}

export async function runImport(input) {
  if (input.mode === 'pilot-write') {
    throw new Error('pilot-write execution is served by pnpm onedrive:pilot-write and is refused by this synthetic worker');
  }
  if (input.mode !== 'synthetic-write') throw new Error('only synthetic-write is supported');
  if (!input.fixtureStore) throw new Error('synthetic-write requires fixtureStore');

  const mapping = await readJson(input.mappingPath);
  const candidateId = input.candidateId ?? mapping.candidate_id;
  const mappingBlockers = validateWriteMapping(mapping, candidateId);
  const generatedAt = new Date().toISOString();
  const items = [];

  await mkdir(input.fixtureStore, { recursive: true });
  const state = await loadState(input.fixtureStore);

  for await (const { index, row } of readScopeRows(input.scopePath)) {
    const classified = classifyForWrite(row, index, mapping, candidateId);
    if (mappingBlockers.length > 0) {
      items.push({ ...classified, status: 'blocked', reasons: [...new Set([...mappingBlockers, ...classified.reasons])] });
      continue;
    }
    if (classified.status !== 'ready') {
      items.push(classified);
      continue;
    }
    const key = idempotencyKey({
      runId: input.runId ?? 'unknown',
      candidateId,
      tenantRef: mapping.tenant_ref,
      matterRef: mapping.matter_ref,
      sourceHash: classified.source_hash,
    });
    if (state.imported[key]) {
      items.push({
        ...classified,
        status: 'already_imported',
        reasons: ['idempotency_key_already_imported'],
        synthetic_refs: state.imported[key],
      });
      continue;
    }
    const syntheticRefs = await writeSyntheticRows(input.fixtureStore, mapping, classified, key, generatedAt);
    state.imported[key] = syntheticRefs;
    items.push({
      ...classified,
      status: 'imported',
      reasons: ['synthetic_write_imported'],
      synthetic_refs: syntheticRefs,
    });
  }

  await saveState(input.fixtureStore, state);

  return {
    run_id: input.runId ?? 'unknown',
    generated_at: generatedAt,
    mode: 'synthetic-write',
    gate_status: mappingBlockers.length > 0 ? 'blocked' : 'pass',
    candidate_id: candidateId,
    mapping_blockers: mappingBlockers,
    fixture_store_kind: 'local_synthetic_only',
    summary: summarize(items),
    items: items.map((item) => ({
      item_id: item.item_id,
      status: item.status,
      reasons: item.reasons,
      warnings: item.warnings,
      size_bytes: item.size_bytes,
      extension: item.extension,
      synthetic_refs: item.synthetic_refs,
    })),
    not_claimed: [
      'real pilot import',
      'customer-wide import',
      'Vault production DB write',
      'Vault production storage write',
      'OneDrive connected state',
      'Office open/save/sync',
      'source-of-truth cutover',
      'Gemma indexing',
    ],
    sanitization: 'No raw file names, detailed source labels, source object keys, document contents, tenant identifiers, secrets, cookies, or tokens are included.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.mode || !args.scope || !args.mapping || !args.sanitizedOut || !args.localReceiptOut) {
    throw new Error('required options: --mode, --scope, --mapping, --sanitized-out, --local-receipt-out');
  }
  const report = await runImport({
    mode: args.mode,
    scopePath: args.scope,
    mappingPath: args.mapping,
    fixtureStore: args.fixtureStore,
    runId: args.runId,
    candidateId: args.candidateId,
  });
  await writeJson(args.sanitizedOut, report);
  await mkdir(path.dirname(args.localReceiptOut), { recursive: true });
  await writeFile(
    args.localReceiptOut,
    report.items.map((item) => `${JSON.stringify(item)}\n`).join(''),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      run_id: report.run_id,
      gate_status: report.gate_status,
      total_items: report.summary.total_items,
      imported: report.summary.status_counts.imported ?? 0,
      already_imported: report.summary.status_counts.already_imported ?? 0,
      blocked: report.summary.status_counts.blocked ?? 0,
      skipped: report.summary.status_counts.skipped ?? 0,
      retryable: report.summary.status_counts.retryable ?? 0,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
