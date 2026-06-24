#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import zlib from 'node:zlib';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

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

const requiredMappingFields = [
  'candidate_id',
  'candidate_risk_class',
  'tenant_ref',
  'client_ref',
  'matter_ref',
  'matter_owner_ref',
  'source_owner_ref',
  'folder_class',
  'retention_class',
  'legal_hold_flag',
  'permission_source_ref',
  'ethical_wall_implication',
  'ai_allowed_default',
  'duplicate_policy',
  'unsupported_type_policy',
  'zero_byte_policy',
  'large_object_policy',
  'rollback_owner_ref',
  'cutover_policy',
  'status',
  'scope_kind',
  'single_matter_scope',
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
    else if (key === 'sanitized-out') args.sanitizedOut = next;
    else if (key === 'run-id') args.runId = next;
    else if (key === 'candidate-id') args.candidateId = next;
    else throw new Error(`unknown option: --${key}`);
  }
  return args;
}

export function usage() {
  return [
    'usage: node tools/migration/onedrive-pilot-dryrun.mjs --mode dry-run --scope <scope.ndjson[.gz]> --mapping <mapping.json> --sanitized-out <out.json> [--run-id <id>] [--candidate-id <id>]',
    '',
    'Validates one pilot Matter scope without Vault DB or storage writes.',
  ].join('\n');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function addCounter(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function extensionOfRow(row) {
  const value = String(row.extension ?? '').trim().toLowerCase();
  if (value.startsWith('.') && value.length <= 13 && !/[\\/\s:]/.test(value)) return value;
  const key = String(row.source_object_key ?? row.name_hint ?? '');
  const leaf = key.split('/').filter(Boolean).at(-1) ?? '';
  if (!leaf.includes('.')) return '[no_ext]';
  const ext = leaf.split('.').at(-1)?.toLowerCase() ?? '';
  if (!ext || ext.length > 12 || /[\\/\s:]/.test(ext)) return '[other_or_long_ext]';
  return `.${ext}`;
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

function safeItemId(row, index) {
  const hash = sourceHashOfRow(row);
  if (hash) return hash.slice(0, 16);
  return sha256Hex(`row:${index}`).slice(0, 16);
}

function isTruthyBoolean(value) {
  return value === true || value === 'true';
}

export function validateMapping(mapping, expectedCandidateId) {
  const blockers = [];
  for (const field of requiredMappingFields) {
    if (mapping[field] === undefined || mapping[field] === null || mapping[field] === '') {
      blockers.push(`missing_mapping_${field}`);
    }
  }
  if (expectedCandidateId && mapping.candidate_id !== expectedCandidateId) {
    blockers.push('candidate_id_mismatch');
  }
  if (mapping.status !== 'ready_for_dryrun') {
    blockers.push('mapping_status_not_ready_for_dryrun');
  }
  if (mapping.scope_kind !== 'pilot_matter') {
    blockers.push('scope_kind_not_pilot_matter');
  }
  if (!isTruthyBoolean(mapping.single_matter_scope)) {
    blockers.push('scope_not_single_matter');
  }
  if (mapping.candidate_risk_class === 'blocked' && !mapping.waiver_ref) {
    blockers.push('blocked_candidate_without_waiver');
  }
  if (mapping.folder_class === 'unknown') blockers.push('unknown_folder_class');
  if (mapping.legal_hold_flag === 'unknown') blockers.push('unknown_legal_hold');
  if (mapping.ethical_wall_implication === 'unknown') blockers.push('unknown_ethical_wall');
  if (mapping.ai_allowed_default === 'unknown') blockers.push('unknown_ai_allowed_default');
  if (mapping.cutover_policy !== 'not_requested') blockers.push('cutover_policy_must_not_be_requested');
  return blockers;
}

async function readJson(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
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

function classifyItem(row, index, mapping, expectedCandidateId) {
  const reasons = [];
  const warnings = [];
  const extension = extensionOfRow(row);
  const sizeBytes = Number(row.size_bytes ?? row.size ?? 0);
  const candidateId = String(row.candidate_id ?? expectedCandidateId ?? mapping.candidate_id ?? '');
  const sourceHash = sourceHashOfRow(row);

  if (candidateId !== mapping.candidate_id) reasons.push('item_candidate_id_mismatch');
  if (!sourceHash) reasons.push('missing_source_object_hash');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) reasons.push('invalid_size');
  if (row.readable === false || row.readable === 'false') reasons.push('staging_read_not_confirmed');

  if (sizeBytes === 0) {
    if (mapping.zero_byte_policy === 'skip_with_receipt') return itemResult(row, index, 'skipped', ['zero_byte_skip_with_receipt'], warnings);
    if (mapping.zero_byte_policy === 'block') reasons.push('zero_byte_blocked_by_policy');
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
  if (sizeBytes >= 5 * GIB) warnings.push('very_large_object_requires_window_review');

  if (reasons.includes('staging_read_not_confirmed')) {
    return itemResult(row, index, 'retryable', reasons, warnings);
  }
  if (reasons.length > 0) return itemResult(row, index, 'blocked', reasons, warnings);
  return itemResult(row, index, 'ready', ['ready_for_import'], warnings);
}

function itemResult(row, index, status, reasons, warnings) {
  return {
    item_id: safeItemId(row, index),
    status,
    reasons,
    warnings,
    extension: extensionOfRow(row),
    size_bytes: Number(row.size_bytes ?? row.size ?? 0),
  };
}

function summarizeItems(items) {
  const statusCounts = new Map();
  const reasonCounts = new Map();
  const extensionCounts = new Map();
  let totalBytes = 0;
  let readyBytes = 0;
  let over200MiB = 0;
  let zeroBytes = 0;
  for (const item of items) {
    addCounter(statusCounts, item.status);
    for (const reason of item.reasons) addCounter(reasonCounts, reason);
    addCounter(extensionCounts, item.extension);
    totalBytes += item.size_bytes;
    if (item.status === 'ready') readyBytes += item.size_bytes;
    if (item.size_bytes > 200 * MIB) over200MiB += 1;
    if (item.size_bytes === 0) zeroBytes += 1;
  }
  return {
    total_items: items.length,
    total_bytes: totalBytes,
    total_gib: Number((totalBytes / GIB).toFixed(3)),
    ready_bytes: readyBytes,
    ready_gib: Number((readyBytes / GIB).toFixed(3)),
    zero_byte_items: zeroBytes,
    over_200_mib_items: over200MiB,
    status_counts: Object.fromEntries([...statusCounts.entries()].sort()),
    reason_counts: Object.fromEntries([...reasonCounts.entries()].sort()),
    extension_counts: Object.fromEntries([...extensionCounts.entries()].sort()),
  };
}

export async function runDryRun(input) {
  const mapping = await readJson(input.mappingPath);
  const expectedCandidateId = input.candidateId ?? mapping.candidate_id;
  const mappingBlockers = validateMapping(mapping, expectedCandidateId);
  const items = [];
  const sourceHashCounts = new Map();

  for await (const { index, row } of readScopeRows(input.scopePath)) {
    const sourceHash = sourceHashOfRow(row);
    if (sourceHash) addCounter(sourceHashCounts, sourceHash);
    items.push(classifyItem(row, index, mapping, expectedCandidateId));
  }

  const duplicateCandidateCount = [...sourceHashCounts.values()].filter((count) => count > 1).length;
  if (duplicateCandidateCount > 0 && mapping.duplicate_policy === 'block_pending_review') {
    for (const item of items) {
      if (item.status === 'ready') {
        item.status = 'blocked';
        item.reasons = ['duplicate_review_required', ...item.reasons.filter((reason) => reason !== 'ready_for_import')];
      }
    }
  }

  const summary = summarizeItems(items);
  const gateStatus = mappingBlockers.length > 0 ? 'blocked' : summary.status_counts.blocked ? 'blocked' : 'pass';

  return {
    run_id: input.runId ?? 'unknown',
    generated_at: new Date().toISOString(),
    mode: 'dry-run',
    gate_status: gateStatus,
    candidate_id: expectedCandidateId,
    mapping_status: mapping.status ?? 'unknown',
    mapping_blockers: mappingBlockers,
    summary: {
      ...summary,
      duplicate_candidate_hash_count: duplicateCandidateCount,
      expected_write_counts:
        gateStatus === 'pass'
          ? {
              documents: summary.status_counts.ready ?? 0,
              file_objects: summary.status_counts.ready ?? 0,
              initial_versions: summary.status_counts.ready ?? 0,
              audit_events: summary.status_counts.ready ?? 0,
            }
          : {
              documents: 0,
              file_objects: 0,
              initial_versions: 0,
              audit_events: 0,
            },
    },
    items: items.map((item) => ({
      item_id: item.item_id,
      status: item.status,
      reasons: item.reasons,
      warnings: item.warnings,
      extension: item.extension,
      size_bytes: item.size_bytes,
    })),
    not_claimed: [
      'Vault import',
      'Vault DB write',
      'Vault storage write',
      'OneDrive connected state',
      'Office open/save/sync',
      'source-of-truth cutover',
      'Gemma indexing',
    ],
    sanitization: 'No raw file names, detailed source labels, source object keys, document contents, tenant identifiers, secrets, cookies, or tokens are included.',
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.mode !== 'dry-run') throw new Error('only --mode dry-run is supported by this validator');
  if (!args.scope || !args.mapping || !args.sanitizedOut) {
    throw new Error('required options: --scope, --mapping, --sanitized-out');
  }
  const report = await runDryRun({
    scopePath: args.scope,
    mappingPath: args.mapping,
    runId: args.runId,
    candidateId: args.candidateId,
  });
  await writeJson(args.sanitizedOut, report);
  console.log(
    JSON.stringify({
      run_id: report.run_id,
      gate_status: report.gate_status,
      total_items: report.summary.total_items,
      ready: report.summary.status_counts.ready ?? 0,
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
