#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';

const DEFAULT_BASE_DIR = '.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete';
const DEFAULT_INGEST_DIR = `${DEFAULT_BASE_DIR}/ingest`;
const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/target-resolution-dry-run`;
const ALLOWED_MATTER_TYPES = new Set(['Criminal', 'Civil', 'Advisory', 'M&A']);
const MATTER_TYPE_TO_VAULT = Object.freeze({
  Criminal: 'investigation',
  Civil: 'litigation',
  Advisory: 'advisory',
  'M&A': 'ma',
});
const CLIENT_LEGAL_SUFFIXES = Object.freeze([
  '주식회사',
  '회계법인',
  '법무법인',
  '유한회사',
  '유한책임회사',
  '사단법인',
  '재단법인',
  '(주)',
  '㈜',
  'Inc.',
  'LLC',
  'LLP',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    plan: `${DEFAULT_INGEST_DIR}/approved-target-resolution-plan.local.ndjson.gz`,
    approvedGroups: `${DEFAULT_INGEST_DIR}/approved-groups.local.ndjson.gz`,
    approvalReceipt: `${DEFAULT_BASE_DIR}/approval-ingest.sanitized.json`,
    outputDir: DEFAULT_OUTPUT_DIR,
    receipt: null,
    details: null,
    tenantId: null,
    databaseUrl: process.env.DATABASE_URL || defaultDatabaseUrl(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--plan') args.plan = value;
    else if (key === '--approved-groups') args.approvedGroups = value;
    else if (key === '--approval-receipt') args.approvalReceipt = value;
    else if (key === '--output-dir') args.outputDir = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--details') args.details = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  args.receipt ??= path.join(args.outputDir, 'target-resolution-dry-run.sanitized.json');
  args.details ??= path.join(args.outputDir, 'target-resolution-dry-run.local.ndjson.gz');
  return args;
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function compactLower(value) {
  return clean(value).normalize('NFC').toLocaleLowerCase();
}

export function normalizedClientKey(value) {
  let next = clean(value).normalize('NFC');
  for (let changed = true; changed;) {
    changed = false;
    for (const suffix of CLIENT_LEGAL_SUFFIXES) {
      if (next.startsWith(suffix)) {
        next = next.slice(suffix.length).trim();
        changed = true;
      }
      if (next.endsWith(suffix)) {
        next = next.slice(0, -suffix.length).trim();
        changed = true;
      }
    }
  }
  return compactLower(next);
}

export function readNdjsonGz(filePath) {
  const payload = zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
  return payload
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function writeNdjsonGz(filePath, rows) {
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(filePath, zlib.gzipSync(payload ? `${payload}\n` : ''), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function buildApprovedTargets({ planRows, approvedGroupRows }) {
  const groupsByMatterCodeHash = new Map();
  for (const group of approvedGroupRows) {
    const matterCode = clean(group.matter_code);
    if (!matterCode) continue;
    const matterCodeHash = sha256Hex(matterCode);
    const current = groupsByMatterCodeHash.get(matterCodeHash) ?? {
      matterCode,
      clientShortName: clean(group.client_short_name),
      matterTypeEnglish: clean(group.matter_type_english),
      matterDetailTypeKorean: clean(group.matter_detail_type_korean),
      groupIds: [],
    };
    current.groupIds.push(clean(group.group_id));
    groupsByMatterCodeHash.set(matterCodeHash, current);
  }

  return planRows.map((row) => {
    const matterCodeHash = clean(row.matter_code_hash);
    const group = groupsByMatterCodeHash.get(matterCodeHash);
    return {
      matterCodeHash,
      matterCode: group?.matterCode ?? null,
      clientShortName: clean(row.client_short_name) || group?.clientShortName || '',
      matterTypeEnglish: clean(row.matter_type_english) || group?.matterTypeEnglish || '',
      matterDetailTypeKorean: clean(row.matter_detail_type_korean) || group?.matterDetailTypeKorean || '',
      approvedGroupCount: Number(row.approved_group_count ?? group?.groupIds.length ?? 0),
      approvedGroupIds: Array.isArray(row.approved_group_ids) ? row.approved_group_ids.map(clean) : group?.groupIds ?? [],
      targetResolutionState: clean(row.target_resolution_state),
      blockers: group ? [] : ['approved_group_missing_for_target_hash'],
    };
  });
}

export function validateTarget(target) {
  const blockers = [...(target.blockers ?? [])];
  if (!target.clientShortName) blockers.push('missing_client_short_name');
  if (!target.matterTypeEnglish) blockers.push('missing_matter_type_english');
  else if (!ALLOWED_MATTER_TYPES.has(target.matterTypeEnglish)) blockers.push('unsupported_matter_type_english');
  if (!target.matterDetailTypeKorean) blockers.push('missing_matter_detail_type_korean');
  if (!target.matterCode) blockers.push('missing_matter_code');
  if (target.matterCode && target.matterCode.length > 120) blockers.push('matter_code_over_120_chars');
  if (target.matterCode) {
    const parts = target.matterCode.split('/');
    if (parts.length !== 3 || parts.some((part) => !clean(part))) blockers.push('invalid_matter_code_format');
    const expected = `${target.clientShortName}/${target.matterTypeEnglish}/${target.matterDetailTypeKorean}`;
    if (expected !== target.matterCode) blockers.push('matter_code_does_not_match_approved_segments');
    if (sha256Hex(target.matterCode) !== target.matterCodeHash) blockers.push('matter_code_hash_mismatch');
  }
  return blockers;
}

export function resolveTargets(targets, dbSnapshot) {
  const clientsByNormalizedName = new Map();
  for (const client of dbSnapshot.clients) {
    const key = normalizedClientKey(client.name);
    const list = clientsByNormalizedName.get(key) ?? [];
    list.push(client);
    clientsByNormalizedName.set(key, list);
  }
  const mattersByCode = new Map();
  for (const matter of dbSnapshot.matters) {
    mattersByCode.set(matter.matter_code, matter);
  }
  const clientsById = new Map(dbSnapshot.clients.map((client) => [client.client_id, client]));

  return targets.map((target) => {
    const blockers = validateTarget(target);
    const clientNameHash = target.clientShortName ? sha256Hex(normalizedClientKey(target.clientShortName)) : null;
    const base = {
      matter_code_hash: target.matterCodeHash,
      client_short_name_hash: clientNameHash,
      approved_group_count: target.approvedGroupCount,
      approved_group_id_count: target.approvedGroupIds.length,
    };
    if (blockers.length > 0) {
      return { ...base, state: 'blocked', action: 'none', blockers };
    }

    const existingMatter = mattersByCode.get(target.matterCode);
    if (existingMatter) {
      const expectedVaultType = MATTER_TYPE_TO_VAULT[target.matterTypeEnglish];
      if (expectedVaultType && existingMatter.matter_type !== expectedVaultType) {
        blockers.push('existing_matter_type_mismatch');
      }
      const existingMatterClient = clientsById.get(existingMatter.client_id);
      if (!existingMatterClient) {
        blockers.push('existing_matter_client_missing');
      } else if (normalizedClientKey(existingMatterClient.name) !== normalizedClientKey(target.clientShortName)) {
        blockers.push('existing_matter_client_mismatch');
      }
      return {
        ...base,
        state: blockers.length > 0 ? 'blocked' : 'existing_matter_matched',
        action: blockers.length > 0 ? 'none' : 'reuse_existing_matter',
        blockers,
      };
    }

    const clientMatches = clientsByNormalizedName.get(normalizedClientKey(target.clientShortName)) ?? [];
    if (clientMatches.length > 1) {
      blockers.push('ambiguous_client_match');
      return { ...base, state: 'blocked', action: 'none', blockers };
    }
    if (clientMatches.length === 1) {
      return {
        ...base,
        state: 'planned_create_matter_existing_client',
        action: 'would_create_matter_only',
        blockers,
      };
    }
    return {
      ...base,
      state: 'planned_create_client_and_matter',
      action: 'would_create_client_and_matter',
      blockers,
    };
  });
}

export function summarizeResults(results) {
  const counts = {};
  let blocked = 0;
  for (const result of results) {
    counts[result.state] = (counts[result.state] ?? 0) + 1;
    if (result.blockers.length > 0) blocked += 1;
  }
  return { counts, blocked };
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
    const operator = await client.query(
      `
        SELECT user_id, role, status
        FROM users
        WHERE tenant_id = $1
          AND role = 'firm_admin'
          AND status = 'active'
        ORDER BY user_id
        LIMIT 1
      `,
      [tenantId],
    );
    await client.query('ROLLBACK');
    return { clients: clients.rows, matters: matters.rows, operator: operator.rows[0] ?? null };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function receiptForBlockedDb({ args, approvalReceipt, error }) {
  return {
    artifact: 'onedrive_target_resolution_dry_run_sanitized',
    status: 'blocked_db_unavailable',
    dry_run: true,
    tenant_ref_hash: args.tenantId ? sha256Hex(args.tenantId) : null,
    approval_rows: approvalReceipt.approval_rows ?? null,
    approved_source_rows: approvalReceipt.approved_source_rows ?? null,
    approved_target_matter_code_count: approvalReceipt.approved_target_matter_code_count ?? null,
    db_connected: false,
    blockers: ['local_db_unavailable'],
    db_error_code: error?.code ?? error?.name ?? 'unknown_error',
    not_executed: ['Vault DB write', 'Vault storage write', 'Matter app write', 'customer-wide import', 'source-of-truth cutover'],
  };
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.tenantId) {
    console.error('usage: node tools/migration/onedrive-target-resolution-dry-run.mjs --tenant-id <uuid> [--plan path] [--approved-groups path] [--output-dir path]');
    process.exit(args.help ? 0 : 2);
  }
  await mkdir(args.outputDir, { recursive: true });
  const approvalReceipt = readJsonIfPresent(args.approvalReceipt);
  let dbSnapshot;
  try {
    dbSnapshot = await loadDbSnapshot({ databaseUrl: args.databaseUrl, tenantId: args.tenantId });
  } catch (error) {
    const receipt = receiptForBlockedDb({ args, approvalReceipt, error });
    await writeFile(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(args.receipt, 0o600);
    await writeNdjsonGz(args.details, []);
    console.log(JSON.stringify(receipt, null, 2));
    process.exit(1);
  }

  const planRows = readNdjsonGz(args.plan);
  const approvedGroupRows = readNdjsonGz(args.approvedGroups);
  const targets = buildApprovedTargets({ planRows, approvedGroupRows });
  const results = resolveTargets(targets, dbSnapshot);
  const summary = summarizeResults(results);
  const environmentBlockers = [];
  if (!dbSnapshot.operator) environmentBlockers.push('active_firm_admin_operator_missing');
  const receipt = {
    artifact: 'onedrive_target_resolution_dry_run_sanitized',
    generated_at: new Date().toISOString(),
    status: summary.blocked === 0 && environmentBlockers.length === 0 ? 'pass' : 'blocked',
    dry_run: true,
    tenant_ref_hash: sha256Hex(args.tenantId),
    plan_ref: path.basename(args.plan),
    approved_groups_ref: path.basename(args.approvedGroups),
    approval_rows: approvalReceipt.approval_rows ?? null,
    approved_source_rows: approvalReceipt.approved_source_rows ?? null,
    approved_target_matter_code_count: approvalReceipt.approved_target_matter_code_count ?? null,
    target_rows: targets.length,
    approved_group_rows: approvedGroupRows.length,
    db_connected: true,
    db_snapshot_counts: {
      clients: dbSnapshot.clients.length,
      matters: dbSnapshot.matters.length,
    },
    operator_resolved: Boolean(dbSnapshot.operator),
    result_counts: summary.counts,
    blocked_target_count: summary.blocked,
    environment_blockers: environmentBlockers,
    details_ref: path.basename(args.details),
    not_executed: ['Vault DB write', 'Vault storage write', 'Matter app write', 'customer-wide import', 'source-of-truth cutover'],
    sanitization: 'Receipt and detail output contain hashes, counts, states, and blocker codes only; no raw paths, filenames, Matter codes, client names, document contents, tokens, or secrets.',
  };
  await writeNdjsonGz(args.details, results);
  await writeFile(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(args.receipt, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
  if (summary.blocked > 0 || environmentBlockers.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
