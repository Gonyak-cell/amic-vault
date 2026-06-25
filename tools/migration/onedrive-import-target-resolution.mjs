#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';
import {
  normalizedClientKey,
  readNdjsonGz,
  sha256Hex,
} from './onedrive-target-resolution-dry-run.mjs';

const DEFAULT_BASE_DIR = '.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete';
const DEFAULT_INGEST_DIR = `${DEFAULT_BASE_DIR}/ingest`;
const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/document-import-target-resolution`;
const ALLOWED_MATTER_TYPES = new Set(['Criminal', 'Civil', 'Advisory', 'M&A']);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    importScope: `${DEFAULT_INGEST_DIR}/approved-import-scope.local.ndjson.gz`,
    approvalReceipt: `${DEFAULT_BASE_DIR}/approval-ingest.sanitized.json`,
    outputDir: DEFAULT_OUTPUT_DIR,
    receipt: null,
    manifest: null,
    conflicts: null,
    tenantId: null,
    databaseUrl: process.env.DATABASE_URL || defaultDatabaseUrl(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--import-scope') args.importScope = value;
    else if (key === '--approval-receipt') args.approvalReceipt = value;
    else if (key === '--output-dir') args.outputDir = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--manifest') args.manifest = value;
    else if (key === '--conflicts') args.conflicts = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  args.receipt ??= path.join(args.outputDir, 'document-import-target-resolution.sanitized.json');
  args.manifest ??= path.join(args.outputDir, 'resolved-import-manifest.local.ndjson.gz');
  args.conflicts ??= path.join(args.outputDir, 'blocked-import-targets.local.ndjson.gz');
  return args;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function writeNdjsonGz(filePath, rows) {
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(filePath, zlib.gzipSync(payload ? `${payload}\n` : ''), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function archiveLikeSourceRow(row) {
  const key = clean(row.raw?.key).normalize('NFC');
  return /(^|\/|\s)999[_\s-]*이전/.test(key) || /(^|\/)999[_\s-]/.test(key);
}

export function validateImportScopeRow(row) {
  const blockers = [];
  const matterCode = clean(row.matter_code);
  const clientShortName = clean(row.client_short_name);
  const matterTypeEnglish = clean(row.matter_type_english);
  const matterDetailTypeKorean = clean(row.matter_detail_type_korean);
  const sourceObjectHash = clean(row.source_object_hash);
  const groupId = clean(row.group_id);
  const sizeBytes = Number(row.size_bytes);
  const extension = clean(row.extension);

  if (!sourceObjectHash || !/^[0-9a-f]{64}$/i.test(sourceObjectHash)) {
    blockers.push('invalid_source_object_hash');
  }
  if (!groupId) blockers.push('missing_group_id');
  if (!clientShortName) blockers.push('missing_client_short_name');
  if (!matterTypeEnglish) blockers.push('missing_matter_type_english');
  else if (!ALLOWED_MATTER_TYPES.has(matterTypeEnglish))
    blockers.push('unsupported_matter_type_english');
  if (!matterDetailTypeKorean) blockers.push('missing_matter_detail_type_korean');
  if (!matterCode) blockers.push('missing_matter_code');
  if (matterCode && matterCode.length > 120) blockers.push('matter_code_over_120_chars');
  if (matterCode) {
    const parts = matterCode.split('/');
    if (parts.length !== 3 || parts.some((part) => !clean(part))) {
      blockers.push('invalid_matter_code_format');
    } else {
      const [clientPart, matterTypePart, detailPart] = parts.map(clean);
      if (clientPart !== clientShortName) blockers.push('matter_code_client_segment_mismatch');
      if (matterTypePart !== matterTypeEnglish) blockers.push('matter_code_type_segment_mismatch');
      if (detailPart !== matterDetailTypeKorean)
        blockers.push('matter_code_detail_segment_mismatch');
    }
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) blockers.push('invalid_size_bytes');
  if (!extension) blockers.push('missing_extension');

  return blockers;
}

export function resolveImportTargets(importRows, dbSnapshot) {
  const mattersByCode = new Map(dbSnapshot.matters.map((matter) => [matter.matter_code, matter]));
  const clientsById = new Map(dbSnapshot.clients.map((client) => [client.client_id, client]));
  const seenIdempotencyKeys = new Set();
  const results = [];
  const resolvedManifest = [];
  const conflicts = [];

  for (const [index, row] of importRows.entries()) {
    const matterCode = clean(row.matter_code);
    const sourceObjectHash = clean(row.source_object_hash);
    const matterCodeHash = matterCode ? sha256Hex(matterCode) : null;
    const groupIdHash = clean(row.group_id) ? sha256Hex(clean(row.group_id)) : null;
    const base = {
      row_index: index,
      source_object_hash: sourceObjectHash || null,
      matter_code_hash: matterCodeHash,
      group_id_hash: groupIdHash,
      mapping_candidate_hash: hashJson({
        source_object_hash: sourceObjectHash,
        matter_code_hash: matterCodeHash,
        group_id_hash: groupIdHash,
      }),
    };
    const blockers = validateImportScopeRow(row);
    if (archiveLikeSourceRow(row)) {
      const result = { ...base, state: 'archive_only_excluded', action: 'none', blockers: [] };
      results.push(result);
      conflicts.push(result);
      continue;
    }
    if (blockers.length > 0) {
      const result = { ...base, state: 'blocked_schema_invalid', action: 'none', blockers };
      results.push(result);
      conflicts.push(result);
      continue;
    }

    const matter = mattersByCode.get(matterCode);
    if (!matter) {
      const result = {
        ...base,
        state: 'blocked_matter_code_not_found',
        action: 'none',
        blockers: ['matter_code_not_found'],
      };
      results.push(result);
      conflicts.push(result);
      continue;
    }

    const client = clientsById.get(matter.client_id);
    if (!client) {
      const result = {
        ...base,
        state: 'blocked_client_missing',
        action: 'none',
        blockers: ['matter_client_missing'],
      };
      results.push(result);
      conflicts.push(result);
      continue;
    }
    if (normalizedClientKey(client.name) !== normalizedClientKey(row.client_short_name)) {
      const result = {
        ...base,
        state: 'blocked_client_conflict',
        action: 'none',
        blockers: ['matter_client_name_mismatch'],
      };
      results.push(result);
      conflicts.push(result);
      continue;
    }

    const idempotencyKey = sha256Hex(
      `${sourceObjectHash}|${dbSnapshot.tenantId}|${matter.client_id}|${matter.matter_id}`,
    );
    if (seenIdempotencyKeys.has(idempotencyKey)) {
      const result = {
        ...base,
        state: 'blocked_duplicate_import_target',
        action: 'none',
        blockers: ['duplicate_import_idempotency_key'],
      };
      results.push(result);
      conflicts.push(result);
      continue;
    }
    seenIdempotencyKeys.add(idempotencyKey);

    const manifestRow = {
      migration_run_id: dbSnapshot.migrationRunId,
      source_row_hash: sourceObjectHash,
      tenant_id: dbSnapshot.tenantId,
      client_id: matter.client_id,
      matter_id: matter.matter_id,
      matter_code: matterCode,
      matter_code_hash: matterCodeHash,
      mapping_candidate_hash: base.mapping_candidate_hash,
      approval_ref: dbSnapshot.approvalRef,
      source_lane: 'onedrive_approved_import_scope',
      planned_action: 'create_document_version_file_object_audit',
      idempotency_key: idempotencyKey,
    };
    resolvedManifest.push(manifestRow);
    results.push({
      ...base,
      state: 'resolved_existing_matter',
      action: 'plan_document_import',
      blockers: [],
    });
  }

  return { results, resolvedManifest, conflicts };
}

export function summarizeImportTargetResults(results) {
  const stateCounts = {};
  const blockerCounts = {};
  for (const result of results) {
    stateCounts[result.state] = (stateCounts[result.state] ?? 0) + 1;
    for (const blocker of result.blockers) {
      blockerCounts[blocker] = (blockerCounts[blocker] ?? 0) + 1;
    }
  }
  return {
    state_counts: stateCounts,
    blocker_counts: blockerCounts,
    resolved_count: stateCounts.resolved_existing_matter ?? 0,
    archive_only_excluded_count: stateCounts.archive_only_excluded ?? 0,
    blocked_count: results.filter((result) => result.blockers.length > 0).length,
  };
}

async function loadDbSnapshot({ databaseUrl, tenantId }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const clients = await client.query(
      `
        SELECT client_id, name, status
        FROM clients
        WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const matters = await client.query(
      `
        SELECT matter_id, client_id, matter_code, matter_type, status
        FROM matters
        WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const counts = await client.query(
      `
        SELECT 'clients' AS name, count(*)::int AS count FROM clients WHERE tenant_id = $1
        UNION ALL SELECT 'matters', count(*)::int FROM matters WHERE tenant_id = $1
        UNION ALL SELECT 'documents', count(*)::int FROM documents WHERE tenant_id = $1
        UNION ALL SELECT 'document_versions', count(*)::int FROM document_versions WHERE tenant_id = $1
        UNION ALL SELECT 'file_objects', count(*)::int FROM file_objects WHERE tenant_id = $1
        UNION ALL SELECT 'document_search_index', count(*)::int FROM document_search_index WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const duplicateMatterCodeGroups = await client.query(
      `
        SELECT count(*)::int AS count
        FROM (
          SELECT tenant_id, matter_code
          FROM matters
          WHERE tenant_id = $1
          GROUP BY tenant_id, matter_code
          HAVING count(*) > 1
        ) duplicate_codes
      `,
      [tenantId],
    );
    await client.query('ROLLBACK');
    return {
      tenantId,
      clients: clients.rows,
      matters: matters.rows,
      counts: Object.fromEntries(counts.rows.map((row) => [row.name, row.count])),
      duplicateMatterCodeGroups: duplicateMatterCodeGroups.rows[0]?.count ?? 0,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function usage() {
  return [
    'usage: node tools/migration/onedrive-import-target-resolution.mjs --tenant-id <uuid> [--import-scope path] [--output-dir path]',
    '',
    'Dry-run only. Resolves approved OneDrive import scope rows to existing Vault matter targets.',
    'Does not create documents, file objects, versions, audit rows, storage objects, or source-of-truth cutover.',
  ].join('\n');
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.tenantId) {
    console.error(usage());
    process.exit(args.help ? 0 : 2);
  }
  await mkdir(args.outputDir, { recursive: true });
  const approvalReceipt = readJsonIfPresent(args.approvalReceipt);
  let dbSnapshot;
  try {
    dbSnapshot = await loadDbSnapshot({ databaseUrl: args.databaseUrl, tenantId: args.tenantId });
  } catch (error) {
    const receipt = {
      artifact: 'onedrive_document_import_target_resolution_sanitized',
      generated_at: new Date().toISOString(),
      status: 'blocked_db_unavailable',
      dry_run: true,
      tenant_ref_hash: args.tenantId ? sha256Hex(args.tenantId) : null,
      db_connected: false,
      blockers: ['local_db_unavailable'],
      db_error_code: error?.code ?? error?.name ?? 'unknown_error',
      not_executed: [
        'Vault DB write',
        'Vault storage write',
        'customer-wide import',
        'source-of-truth cutover',
      ],
    };
    await writeFile(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(args.receipt, 0o600);
    await writeNdjsonGz(args.manifest, []);
    await writeNdjsonGz(args.conflicts, []);
    console.log(JSON.stringify(receipt, null, 2));
    process.exit(1);
  }

  const importRows = readNdjsonGz(args.importScope);
  dbSnapshot.migrationRunId =
    approvalReceipt.migration_run_id ?? 'onedrive-staging-20260623-155501';
  dbSnapshot.approvalRef = approvalReceipt.approval_ref ?? path.basename(args.approvalReceipt);
  const { results, resolvedManifest, conflicts } = resolveImportTargets(importRows, dbSnapshot);
  const summary = summarizeImportTargetResults(results);
  const environmentBlockers = [];
  if (dbSnapshot.duplicateMatterCodeGroups > 0)
    environmentBlockers.push('duplicate_matter_code_groups_present');
  if ((dbSnapshot.counts.documents ?? 0) !== 0)
    environmentBlockers.push('documents_count_not_zero_before_dry_run');

  await writeNdjsonGz(args.manifest, resolvedManifest);
  await writeNdjsonGz(args.conflicts, conflicts);

  const receipt = {
    artifact: 'onedrive_document_import_target_resolution_sanitized',
    generated_at: new Date().toISOString(),
    status:
      summary.blocked_count === 0 && environmentBlockers.length === 0
        ? 'ready_for_pilot_import_dry_run'
        : 'blocked',
    dry_run: true,
    tenant_ref_hash: sha256Hex(args.tenantId),
    import_scope_ref: path.basename(args.importScope),
    approval_rows: approvalReceipt.approval_rows ?? null,
    approved_source_rows: approvalReceipt.approved_source_rows ?? importRows.length,
    approved_target_matter_code_count: approvalReceipt.approved_target_matter_code_count ?? null,
    db_connected: true,
    db_snapshot_counts: dbSnapshot.counts,
    duplicate_matter_code_groups: dbSnapshot.duplicateMatterCodeGroups,
    import_scope_rows: importRows.length,
    unique_source_object_hashes: new Set(importRows.map((row) => clean(row.source_object_hash)))
      .size,
    result_counts: summary.state_counts,
    blocker_counts: summary.blocker_counts,
    blocked_target_count: summary.blocked_count,
    archive_only_excluded_count: summary.archive_only_excluded_count,
    resolved_import_manifest_rows: resolvedManifest.length,
    conflict_rows: conflicts.length,
    planned_documents: resolvedManifest.length,
    planned_document_versions: resolvedManifest.length,
    planned_file_objects: resolvedManifest.length,
    planned_audit_events_minimum: resolvedManifest.length,
    environment_blockers: environmentBlockers,
    manifest_ref: path.basename(args.manifest),
    conflicts_ref: path.basename(args.conflicts),
    not_executed: [
      'Vault DB write',
      'Vault storage write',
      'customer-wide import',
      'source-of-truth cutover',
    ],
    sanitization:
      'Sanitized receipt contains counts, hashes, states, and blocker codes only; no raw paths, filenames, Matter codes, client names, document contents, tokens, cookies, or secrets.',
  };
  await writeFile(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(args.receipt, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
  if (summary.blocked_count > 0 || environmentBlockers.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
