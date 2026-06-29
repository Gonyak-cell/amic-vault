#!/usr/bin/env node
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';
import { receiptLeakFindings, sha256Hex } from './matter-app-identity-preflight.mjs';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-rollback';
const DEFAULT_RECEIPT = `${DEFAULT_OUTPUT_DIR}/canonical-projection-rollback.sanitized.json`;
const DEFAULT_EXECUTE_RECEIPT =
  '.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-execute/canonical-upsert-sync.sanitized.json';
const SOURCE_REF = 'vault_current_identity';
const PROJECTION_KEYS = Object.freeze([
  'matterAppClientId',
  'matterAppMatterId',
  'matterAppSourceRevision',
  'sourceRevision',
  'matterAppClientSourceRevision',
  'migration_run_id',
  'source_ref',
  'mapping_candidate_hash',
]);
const NOT_EXECUTED = Object.freeze([
  'Matter app canonical registry delete',
  'customer document import',
  'Vault storage write',
  'source-of-truth cutover',
  'OneDrive connected-state claim',
  'Office open/save/sync claim',
  'Gemma indexing execution',
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function isoStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    databaseUrl: env.DATABASE_URL || defaultDatabaseUrl(),
    tenantId: null,
    operatorUserId: null,
    bridgeExecuteReceipt: DEFAULT_EXECUTE_RECEIPT,
    rollbackApprovalRef: env.MATTER_APP_CANONICAL_ROLLBACK_APPROVAL_REF || '',
    migrationRunId: `matter-app-canonical-projection-rollback-${isoStamp()}`,
    receipt: DEFAULT_RECEIPT,
    execute: false,
    expectedClientRefs: 80,
    expectedMatterRefs: 123,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--operator-user-id') args.operatorUserId = value;
    else if (key === '--bridge-execute-receipt') args.bridgeExecuteReceipt = value;
    else if (key === '--rollback-approval-ref') args.rollbackApprovalRef = value;
    else if (key === '--migration-run-id') args.migrationRunId = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--expected-client-refs') args.expectedClientRefs = parseIntArg(value, 80);
    else if (key === '--expected-matter-refs') args.expectedMatterRefs = parseIntArg(value, 123);
    else if (key === '--execute') {
      args.execute = true;
      continue;
    } else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  return args;
}

function parseIntArg(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function validateExecuteReceipt(receipt) {
  const blockers = [];
  if (!receipt) return ['bridge_execute_receipt_missing'];
  if (receipt.artifact !== 'matter_app_canonical_upsert_sync_sanitized') {
    blockers.push('bridge_execute_receipt_invalid');
  }
  if (receipt.status !== 'pass') blockers.push('bridge_execute_not_passed');
  if (receipt.execute !== true) blockers.push('bridge_execute_mode_missing');
  if (receipt.leak_scan?.status !== 'PASS') blockers.push('bridge_execute_leak_scan_not_passed');
  if (receipt.result_counts?.matter_app_client_resolved !== 80) {
    blockers.push('bridge_execute_client_projection_count_mismatch');
  }
  if (receipt.result_counts?.vault_projection_synced !== 123) {
    blockers.push('bridge_execute_matter_projection_count_mismatch');
  }
  if (receipt.blocked_target_count !== 0) blockers.push('bridge_execute_blocked_rows_present');
  return blockers;
}

async function loadOperator(client, args) {
  if (!args.operatorUserId) return null;
  const result = await client.query(
    `
      SELECT user_id, role, status
      FROM users
      WHERE tenant_id = $1
        AND user_id = $2
        AND status = 'active'
        AND role IN ('firm_admin', 'matter_owner')
      LIMIT 1
    `,
    [args.tenantId, args.operatorUserId],
  );
  return result.rows[0] ?? null;
}

async function loadProjectionRows(client, tenantId) {
  const clients = await client.query(
    `
      SELECT client_id
      FROM clients
      WHERE tenant_id = $1
        AND metadata_json ? 'matterAppClientId'
      ORDER BY client_id
    `,
    [tenantId],
  );
  const matters = await client.query(
    `
      SELECT matter_id, client_id
      FROM matters
      WHERE tenant_id = $1
        AND metadata_json ? 'matterAppMatterId'
        AND metadata_json ? 'matterAppClientId'
      ORDER BY matter_id
    `,
    [tenantId],
  );
  return { clients: clients.rows, matters: matters.rows };
}

export function validateProjectionRows(rows, args) {
  const blockers = [];
  if (rows.clients.length !== args.expectedClientRefs) {
    blockers.push('client_projection_ref_count_mismatch');
  }
  if (rows.matters.length !== args.expectedMatterRefs) {
    blockers.push('matter_projection_ref_count_mismatch');
  }
  return blockers;
}

function summarizeRows(rows) {
  return {
    clients_with_projection_refs: rows.clients.length,
    matters_with_projection_refs: rows.matters.length,
  };
}

function removeProjectionExpression(column = 'metadata_json') {
  return PROJECTION_KEYS.reduce((expression, key) => `${expression} - '${key}'`, column);
}

async function insertAudit(client, input) {
  await client.query(
    `
      INSERT INTO audit_events (
        tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
        matter_id, result, metadata_json, correlation_id, retention_label
      )
      VALUES ($1, 'user', $2, NULL, $3, $4, $5, $6, 'success', $7::jsonb, $8, 'PERMANENT')
    `,
    [
      input.tenantId,
      input.actorId,
      input.action,
      input.targetType,
      input.targetId,
      input.matterId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.correlationId ?? null,
    ],
  );
}

async function executeRollback(client, { args, rows }) {
  const clientExpression = removeProjectionExpression('metadata_json');
  const matterExpression = removeProjectionExpression('metadata_json');
  const clientResult = await client.query(
    `
      UPDATE clients
      SET metadata_json = ${clientExpression},
          updated_at = now()
      WHERE tenant_id = $1
        AND metadata_json ? 'matterAppClientId'
    `,
    [args.tenantId],
  );
  const matterResult = await client.query(
    `
      UPDATE matters
      SET metadata_json = ${matterExpression},
          updated_at = now()
      WHERE tenant_id = $1
        AND metadata_json ? 'matterAppMatterId'
    `,
    [args.tenantId],
  );
  await insertAudit(client, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'COMPLIANCE_EVIDENCE_RECORDED',
    targetType: 'matter_app_projection_rollback',
    targetId: args.tenantId,
    metadata: {
      migration_run_id: args.migrationRunId,
      rollback_approval_ref_hash: sha256Hex(args.rollbackApprovalRef),
      source_ref: SOURCE_REF,
      clients_projection_refs_removed: clientResult.rowCount ?? 0,
      matters_projection_refs_removed: matterResult.rowCount ?? 0,
      containment_mode: 'vault_projection_metadata_removed_only',
    },
  });
  for (const clientRow of rows.clients) {
    await insertAudit(client, {
      tenantId: args.tenantId,
      actorId: args.operatorUserId,
      action: 'CLIENT_UPDATED',
      targetType: 'client',
      targetId: clientRow.client_id,
      metadata: {
        migration_run_id: args.migrationRunId,
        rollback_approval_ref_hash: sha256Hex(args.rollbackApprovalRef),
        source_ref: SOURCE_REF,
        containment_mode: 'matter_app_projection_metadata_removed',
        mapping_candidate_hash: sha256Hex(clientRow.client_id),
      },
    });
  }
  for (const matterRow of rows.matters) {
    await insertAudit(client, {
      tenantId: args.tenantId,
      actorId: args.operatorUserId,
      action: 'MATTER_UPDATED',
      targetType: 'matter',
      targetId: matterRow.matter_id,
      matterId: matterRow.matter_id,
      metadata: {
        migration_run_id: args.migrationRunId,
        rollback_approval_ref_hash: sha256Hex(args.rollbackApprovalRef),
        source_ref: SOURCE_REF,
        containment_mode: 'matter_app_projection_metadata_removed',
        mapping_candidate_hash: sha256Hex(matterRow.matter_id),
      },
    });
  }
  return {
    clients_removed: clientResult.rowCount ?? 0,
    matters_removed: matterResult.rowCount ?? 0,
    audit_events_inserted: 1 + rows.clients.length + rows.matters.length,
  };
}

export function buildReceipt({
  args,
  executeReceiptBlockers,
  environmentBlockers,
  projectionBlockers,
  rows,
  executeResult = null,
}) {
  const blockers = [...executeReceiptBlockers, ...environmentBlockers, ...projectionBlockers];
  const status = blockers.length === 0 ? (args.execute ? 'pass' : 'ready_for_execute') : 'blocked';
  const receipt = {
    artifact: 'matter_app_canonical_projection_rollback_sanitized',
    generated_at: new Date().toISOString(),
    status,
    execute: args.execute,
    run_id_hash: sha256Hex(args.migrationRunId),
    rollback_approval_ref_hash: args.rollbackApprovalRef
      ? sha256Hex(args.rollbackApprovalRef)
      : null,
    bridge_execute_receipt_ref: args.bridgeExecuteReceipt
      ? path.basename(args.bridgeExecuteReceipt)
      : null,
    tenant_ref_hash: args.tenantId ? sha256Hex(args.tenantId) : null,
    operator_ref_hash: args.operatorUserId ? sha256Hex(args.operatorUserId) : null,
    projection_counts: summarizeRows(rows),
    execute_result: executeResult,
    execute_receipt_blockers: [...new Set(executeReceiptBlockers)],
    environment_blockers: [...new Set(environmentBlockers)],
    projection_blockers: [...new Set(projectionBlockers)],
    blockers: [...new Set(blockers)],
    rollback_scope:
      'Vault projection metadata containment only. Matter app canonical records are not deleted by this runner.',
    not_executed: NOT_EXECUTED,
    sanitization:
      'Receipt contains counts, hashes, sanitized receipt filenames, and blocker codes only; no raw path, customer document body, OCR/text excerpt, screenshot, object key, token, secret, raw UUID, Matter Code, matter name, or client label is persisted.',
  };
  const leakFindings = receiptLeakFindings(receipt);
  receipt.leak_scan = {
    status: leakFindings.length === 0 ? 'PASS' : 'FAIL',
    findings: leakFindings,
  };
  if (leakFindings.length > 0) receipt.status = 'blocked';
  return receipt;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.error(
      'usage: node tools/migration/matter-app-canonical-projection-rollback.mjs --tenant-id <uuid> --operator-user-id <uuid> --bridge-execute-receipt <receipt.json> --rollback-approval-ref <ref> [--execute]',
    );
    process.exit(0);
    return;
  }
  if (!args.tenantId || !args.operatorUserId) {
    console.error('tenant-id and operator-user-id are required');
    process.exit(2);
    return;
  }

  const executeReceipt = readJsonIfPresent(args.bridgeExecuteReceipt);
  const executeReceiptBlockers = validateExecuteReceipt(executeReceipt);
  const db = new Client({ connectionString: args.databaseUrl });
  await db.connect();
  try {
    await db.query(args.execute ? 'BEGIN' : 'BEGIN READ ONLY');
    await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', args.tenantId]);
    const rows = await loadProjectionRows(db, args.tenantId);
    const operator = await loadOperator(db, args);
    const environmentBlockers = [];
    if (!operator) environmentBlockers.push('active_operator_missing_or_unauthorized');
    if (!clean(args.rollbackApprovalRef)) environmentBlockers.push('rollback_approval_ref_missing');
    const projectionBlockers = validateProjectionRows(rows, args);
    let executeResult = null;
    if (
      args.execute &&
      executeReceiptBlockers.length === 0 &&
      environmentBlockers.length === 0 &&
      projectionBlockers.length === 0
    ) {
      executeResult = await executeRollback(db, { args, rows });
    }
    const receipt = buildReceipt({
      args,
      executeReceiptBlockers,
      environmentBlockers,
      projectionBlockers,
      rows,
      executeResult,
    });
    if (args.execute && receipt.status === 'pass') await db.query('COMMIT');
    else await db.query('ROLLBACK');
    await writeJson(args.receipt, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
