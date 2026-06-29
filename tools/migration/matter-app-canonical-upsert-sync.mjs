#!/usr/bin/env node
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';
import { receiptLeakFindings, sha256Hex } from './matter-app-identity-preflight.mjs';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-execute';
const DEFAULT_RECEIPT = `${DEFAULT_OUTPUT_DIR}/canonical-upsert-sync.sanitized.json`;
const DEFAULT_DETAILS = `${DEFAULT_OUTPUT_DIR}/canonical-upsert-sync.local.ndjson.gz`;
const DEFAULT_PREFLIGHT =
  '.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/identity-preflight.sanitized.json';
const SAFE_SOURCE_REF = 'vault_current_identity';
const MATTER_APP_API_PATHS = Object.freeze({
  status: '/api/matters/vault-bridge/status',
  clientUpsert: '/api/matters/vault-bridge/clients/upsert',
  matterUpsert: '/api/matters/vault-bridge/matters/upsert',
});
const DB_TYPE_TO_MATTER_APP = Object.freeze({
  investigation: 'Criminal',
  litigation: 'Civil',
  advisory: 'Advisory',
  ma: 'M&A',
});
const NOT_EXECUTED = Object.freeze([
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

function shortHash(value) {
  return sha256Hex(value).slice(0, 16);
}

function toNumber(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function parseIntArg(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    databaseUrl: env.DATABASE_URL || defaultDatabaseUrl(),
    tenantId: null,
    operatorUserId: null,
    identityPreflight: DEFAULT_PREFLIGHT,
    matterAppApiBaseUrl: env.MATTER_APP_API_BASE_URL || '',
    matterAppApiToken: env.MATTER_APP_API_TOKEN || '',
    matterAppApiTimeoutMs: parseIntArg(env.MATTER_APP_API_TIMEOUT_MS, 10000),
    approvalRef: env.MATTER_APP_CANONICAL_SYNC_APPROVAL_REF || '',
    migrationRunId: `matter-app-canonical-upsert-sync-${isoStamp()}`,
    receipt: DEFAULT_RECEIPT,
    details: DEFAULT_DETAILS,
    execute: false,
    expectedClients: 80,
    expectedMatters: 123,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--operator-user-id') args.operatorUserId = value;
    else if (key === '--identity-preflight') args.identityPreflight = value;
    else if (key === '--matter-app-api-base-url') args.matterAppApiBaseUrl = value;
    else if (key === '--matter-app-api-token') args.matterAppApiToken = value;
    else if (key === '--matter-app-api-timeout-ms') {
      args.matterAppApiTimeoutMs = parseIntArg(value, 10000);
    } else if (key === '--approval-ref') args.approvalRef = value;
    else if (key === '--migration-run-id') args.migrationRunId = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--details') args.details = value;
    else if (key === '--expected-clients') args.expectedClients = parseIntArg(value, 80);
    else if (key === '--expected-matters') args.expectedMatters = parseIntArg(value, 123);
    else if (key === '--execute') {
      args.execute = true;
      continue;
    } else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  if (!Number.isFinite(args.matterAppApiTimeoutMs) || args.matterAppApiTimeoutMs < 1000) {
    args.matterAppApiTimeoutMs = 10000;
  }
  return args;
}

export function matterAppApiConfigured(args) {
  return Boolean(clean(args.matterAppApiBaseUrl)) && Boolean(clean(args.matterAppApiToken));
}

export function matterTypeToMatterApp(matterType) {
  return DB_TYPE_TO_MATTER_APP[clean(matterType)] ?? null;
}

function detailTypeFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return (
    clean(metadata.matter_detail_type_korean) ||
    clean(metadata.matterDetailTypeKorean) ||
    clean(metadata.matter_detail_type) ||
    null
  );
}

export function validateIdentityPreflightReceipt(receipt, expected = { clients: 80, matters: 123 }) {
  const blockers = [];
  if (!receipt) return ['identity_preflight_receipt_missing'];
  if (receipt.artifact !== 'matter_app_identity_preflight_sanitized') {
    blockers.push('identity_preflight_receipt_invalid');
  }
  if (receipt.status !== 'pass') blockers.push('identity_preflight_not_passed');
  if (receipt.leak_scan?.status !== 'PASS') blockers.push('identity_preflight_leak_scan_not_passed');
  if (receipt.counts?.clients !== expected.clients) {
    blockers.push('identity_preflight_client_count_mismatch');
  }
  if (receipt.counts?.matters !== expected.matters) {
    blockers.push('identity_preflight_matter_count_mismatch');
  }
  if (receipt.counts?.blocked_identity_rows !== 0) blockers.push('identity_preflight_blocked_rows_present');
  if (Array.isArray(receipt.blockers) && receipt.blockers.length > 0) {
    blockers.push('identity_preflight_blockers_present');
  }
  if (receipt.matter_app_bridge?.bridge_ready !== true) {
    blockers.push('identity_preflight_bridge_not_ready');
  }
  if (receipt.matter_app_bridge?.client_upsert_supported !== true) {
    blockers.push('identity_preflight_client_upsert_not_supported');
  }
  if (receipt.matter_app_bridge?.matter_upsert_supported !== true) {
    blockers.push('identity_preflight_matter_upsert_not_supported');
  }
  return blockers;
}

export function buildClientRequest({ args, client }) {
  const approvalRef = `${SAFE_SOURCE_REF}:client:${sha256Hex(client.client_id)}`;
  return {
    tenantRef: args.tenantId,
    idempotencyKeyHash: sha256Hex(`${args.tenantId}:client:${client.client_id}`),
    clientDisplayName: client.name,
    clientShortName: client.name,
    approvalRef,
    migrationApprovalRef: args.approvalRef,
    supportingEvidenceRefs: [`vault-client:${sha256Hex(client.client_id)}`],
    migrationOperatorRef: sha256Hex(args.operatorUserId),
  };
}

export function buildMatterRequest({ args, matter, clientResult }) {
  const matterTypeEnglish = matterTypeToMatterApp(matter.matter_type);
  const matterDetailTypeKorean = detailTypeFromMetadata(matter.metadata_json) ?? '미분류';
  const approvalRef = `${SAFE_SOURCE_REF}:matter:${sha256Hex(matter.matter_id)}`;
  return {
    tenantRef: args.tenantId,
    idempotencyKeyHash: sha256Hex(`${args.tenantId}:matter:${matter.matter_id}`),
    clientId: clientResult.clientId,
    clientDisplayName: matter.client_name,
    clientShortName: matter.client_name,
    matterCode: matter.matter_code,
    matterName: matter.matter_name || matter.matter_code,
    matterTypeEnglish,
    matterDetailTypeKorean,
    approvalRef,
    migrationApprovalRef: args.approvalRef,
    supportingEvidenceRefs: [`vault-matter:${sha256Hex(matter.matter_id)}`],
    migrationOperatorRef: sha256Hex(args.operatorUserId),
    status: 'opening',
  };
}

export function validateMatterAppResults({ matter, clientResult, matterResult }) {
  const blockers = [];
  if (!clientResult?.clientId) blockers.push('matter_app_client_id_missing');
  if (!clientResult?.sourceRevision) blockers.push('matter_app_client_source_revision_missing');
  if (!matterResult?.matterAppMatterId) blockers.push('matter_app_matter_id_missing');
  if (!matterResult?.sourceRevision) blockers.push('matter_app_matter_source_revision_missing');
  if (matterResult?.matterCode !== matter.matter_code) blockers.push('matter_app_matter_code_mismatch');
  if (clientResult?.clientId && matterResult?.clientId !== clientResult.clientId) {
    blockers.push('matter_app_client_id_mismatch');
  }
  return blockers;
}

function matterAppUrl(args, apiPath) {
  const baseUrl = clean(args.matterAppApiBaseUrl);
  if (!baseUrl) throw new Error('matter_app_api_base_url_missing');
  return new URL(apiPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function matterAppRequest(args, apiPath, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.matterAppApiTimeoutMs);
  try {
    const response = await fetch(matterAppUrl(args, apiPath), {
      method,
      headers: {
        authorization: `Bearer ${args.matterAppApiToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`matter_app_api_http_${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkMatterAppApi(args) {
  if (!matterAppApiConfigured(args)) return ['matter_app_api_config_missing'];
  try {
    const status = await matterAppRequest(args, MATTER_APP_API_PATHS.status);
    if (status?.outcome !== 'passed' || status?.item?.source_mode !== 'matter_app_api') {
      return ['matter_app_api_health_not_ready'];
    }
    return [];
  } catch {
    return ['matter_app_api_health_unreachable'];
  }
}

async function loadVaultIdentity(client, tenantId) {
  const clients = await client.query(
    `
      SELECT client_id, name, status, metadata_json
      FROM clients
      WHERE tenant_id = $1
      ORDER BY client_id
    `,
    [tenantId],
  );
  const matters = await client.query(
    `
      SELECT
        m.matter_id,
        m.client_id,
        c.name AS client_name,
        m.matter_code,
        m.matter_name,
        m.matter_type,
        m.status,
        m.metadata_json
      FROM matters m
      JOIN clients c
        ON c.tenant_id = m.tenant_id
        AND c.client_id = m.client_id
      WHERE m.tenant_id = $1
      ORDER BY m.matter_code, m.matter_id
    `,
    [tenantId],
  );
  return { clients: clients.rows, matters: matters.rows };
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

function projectionMetadata({ args, matter, clientResult, matterResult }) {
  return {
    matterAppClientId: clientResult.clientId,
    matterAppMatterId: matterResult.matterAppMatterId,
    matterAppSourceRevision: matterResult.sourceRevision,
    sourceRevision: matterResult.sourceRevision,
    matterAppClientSourceRevision: clientResult.sourceRevision,
    migration_run_id: args.migrationRunId,
    source_ref: SAFE_SOURCE_REF,
    mapping_candidate_hash: sha256Hex(matter.matter_id),
  };
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

async function syncClientProjection(db, { args, clientId, clientResult }) {
  const metadata = {
    matterAppClientId: clientResult.clientId,
    matterAppClientSourceRevision: clientResult.sourceRevision,
    migration_run_id: args.migrationRunId,
    source_ref: SAFE_SOURCE_REF,
    mapping_candidate_hash: sha256Hex(clientId),
  };
  await db.query(
    `
      UPDATE clients
      SET metadata_json = coalesce(metadata_json, '{}'::jsonb) || $3::jsonb,
          updated_at = now()
      WHERE tenant_id = $1
        AND client_id = $2
    `,
    [args.tenantId, clientId, JSON.stringify(metadata)],
  );
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'CLIENT_UPDATED',
    targetType: 'client',
    targetId: clientId,
    metadata: {
      migration_run_id: args.migrationRunId,
      source_ref: SAFE_SOURCE_REF,
      mapping_candidate_hash: sha256Hex(clientId),
      matter_app_client_ref_hash: sha256Hex(clientResult.clientId),
      matter_app_client_source_revision_hash: sha256Hex(clientResult.sourceRevision),
    },
  });
}

async function syncMatterProjection(db, { args, matter, clientResult, matterResult }) {
  const metadata = projectionMetadata({ args, matter, clientResult, matterResult });
  await db.query(
    `
      UPDATE matters
      SET metadata_json = coalesce(metadata_json, '{}'::jsonb) || $3::jsonb,
          updated_at = now()
      WHERE tenant_id = $1
        AND matter_id = $2
    `,
    [args.tenantId, matter.matter_id, JSON.stringify(metadata)],
  );
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'MATTER_UPDATED',
    targetType: 'matter',
    targetId: matter.matter_id,
    matterId: matter.matter_id,
    metadata: {
      migration_run_id: args.migrationRunId,
      source_ref: SAFE_SOURCE_REF,
      mapping_candidate_hash: sha256Hex(matter.matter_id),
      matter_app_client_ref_hash: sha256Hex(clientResult.clientId),
      matter_app_matter_ref_hash: sha256Hex(matterResult.matterAppMatterId),
      matter_app_source_revision_hash: sha256Hex(matterResult.sourceRevision),
    },
  });
}

export function validateVaultIdentityRows(rows, args) {
  const blockers = [];
  if (rows.clients.length !== args.expectedClients) blockers.push('vault_client_count_mismatch');
  if (rows.matters.length !== args.expectedMatters) blockers.push('vault_matter_count_mismatch');
  const clientIds = new Set(rows.clients.map((client) => client.client_id));
  const matterCodes = new Set();
  for (const matter of rows.matters) {
    if (!clientIds.has(matter.client_id)) blockers.push('matter_client_missing');
    if (!clean(matter.matter_code)) blockers.push('matter_code_missing');
    const codeKey = clean(matter.matter_code).toLocaleLowerCase('ko-KR');
    if (matterCodes.has(codeKey)) blockers.push('matter_code_duplicate');
    matterCodes.add(codeKey);
    if (!matterTypeToMatterApp(matter.matter_type)) blockers.push('matter_type_unsupported');
    if (!detailTypeFromMetadata(matter.metadata_json)) blockers.push('matter_detail_type_missing');
  }
  return [...new Set(blockers)];
}

export function summarizeDetails(details) {
  const states = {};
  const actions = {};
  const clientRefs = new Set();
  const matterRefs = new Set();
  const sourceRevisions = new Set();
  let blocked = 0;
  for (const detail of details) {
    states[detail.state] = (states[detail.state] ?? 0) + 1;
    actions[detail.action] = (actions[detail.action] ?? 0) + 1;
    if (detail.blockers.length > 0) blocked += 1;
    if (detail.matter_app_client_ref_hash) clientRefs.add(detail.matter_app_client_ref_hash);
    if (detail.matter_app_matter_ref_hash) matterRefs.add(detail.matter_app_matter_ref_hash);
    if (detail.matter_app_source_revision_hash) sourceRevisions.add(detail.matter_app_source_revision_hash);
  }
  return {
    states,
    actions,
    blocked,
    matterAppResolvedCounts: {
      clients: clientRefs.size,
      matters: matterRefs.size,
      source_revisions: sourceRevisions.size,
    },
  };
}

function sanitizedClientDetail(client, action, blockers, clientResult = null) {
  return {
    target: 'client',
    client_ref_hash: sha256Hex(client.client_id),
    client_name_hash: sha256Hex(client.name),
    state: blockers.length > 0 ? 'blocked' : clientResult ? 'matter_app_client_resolved' : 'planned',
    action,
    blockers,
    matter_app_client_ref_hash: clientResult?.clientId ? sha256Hex(clientResult.clientId) : null,
    matter_app_client_source_revision_hash: clientResult?.sourceRevision
      ? sha256Hex(clientResult.sourceRevision)
      : null,
  };
}

function sanitizedMatterDetail(matter, action, blockers, clientResult = null, matterResult = null) {
  return {
    target: 'matter',
    matter_ref_hash: sha256Hex(matter.matter_id),
    client_ref_hash: sha256Hex(matter.client_id),
    matter_code_hash: sha256Hex(matter.matter_code),
    state: blockers.length > 0 ? 'blocked' : matterResult ? 'vault_projection_synced' : 'planned',
    action,
    blockers,
    matter_app_client_ref_hash: clientResult?.clientId ? sha256Hex(clientResult.clientId) : null,
    matter_app_matter_ref_hash: matterResult?.matterAppMatterId
      ? sha256Hex(matterResult.matterAppMatterId)
      : null,
    matter_app_source_revision_hash: matterResult?.sourceRevision
      ? sha256Hex(matterResult.sourceRevision)
      : null,
  };
}

async function processExecute({ db, args, rows }) {
  const details = [];
  const clientResults = new Map();
  for (const client of rows.clients) {
    const clientRequest = buildClientRequest({ args, client });
    const clientResult = await matterAppRequest(args, MATTER_APP_API_PATHS.clientUpsert, {
      method: 'POST',
      body: clientRequest,
    });
    const blockers = [];
    if (!clientResult?.clientId) blockers.push('matter_app_client_id_missing');
    if (!clientResult?.sourceRevision) blockers.push('matter_app_client_source_revision_missing');
    if (blockers.length === 0) {
      clientResults.set(client.client_id, clientResult);
      await syncClientProjection(db, { args, clientId: client.client_id, clientResult });
    }
    details.push(sanitizedClientDetail(client, 'matter_app_client_upsert_and_projection_sync', blockers, clientResult));
  }

  for (const matter of rows.matters) {
    const clientResult = clientResults.get(matter.client_id);
    if (!clientResult) {
      details.push(sanitizedMatterDetail(matter, 'none', ['matter_client_result_missing']));
      continue;
    }
    const matterRequest = buildMatterRequest({ args, matter, clientResult });
    const matterResult = await matterAppRequest(args, MATTER_APP_API_PATHS.matterUpsert, {
      method: 'POST',
      body: matterRequest,
    });
    const blockers = validateMatterAppResults({ matter, clientResult, matterResult });
    if (blockers.length === 0) {
      await syncMatterProjection(db, { args, matter, clientResult, matterResult });
    }
    details.push(sanitizedMatterDetail(matter, 'matter_app_matter_upsert_and_projection_sync', blockers, clientResult, matterResult));
  }
  return details;
}

function processDryRun({ rows }) {
  return [
    ...rows.clients.map((client) =>
      sanitizedClientDetail(client, 'would_upsert_client_and_sync_projection', []),
    ),
    ...rows.matters.map((matter) =>
      sanitizedMatterDetail(matter, 'would_upsert_matter_and_sync_projection', []),
    ),
  ];
}

export function buildReceipt({ args, preflightBlockers, environmentBlockers, identityBlockers, details }) {
  const summary = summarizeDetails(details);
  const allBlockers = [...preflightBlockers, ...environmentBlockers, ...identityBlockers];
  if (summary.blocked > 0) allBlockers.push('target_rows_blocked');
  const status = allBlockers.length === 0 ? (args.execute ? 'pass' : 'ready_for_execute') : 'blocked';
  const receipt = {
    artifact: 'matter_app_canonical_upsert_sync_sanitized',
    generated_at: new Date().toISOString(),
    status,
    execute: args.execute,
    run_id_hash: sha256Hex(args.migrationRunId),
    approval_ref_hash: args.approvalRef ? sha256Hex(args.approvalRef) : null,
    tenant_ref_hash: args.tenantId ? sha256Hex(args.tenantId) : null,
    operator_ref_hash: args.operatorUserId ? sha256Hex(args.operatorUserId) : null,
    identity_preflight_ref: args.identityPreflight ? path.basename(args.identityPreflight) : null,
    target_rows: details.length,
    result_counts: summary.states,
    action_counts: summary.actions,
    matter_app_resolved_counts: summary.matterAppResolvedCounts,
    blocked_target_count: summary.blocked,
    environment_blockers: [...new Set(environmentBlockers)],
    preflight_blockers: [...new Set(preflightBlockers)],
    identity_blockers: [...new Set(identityBlockers)],
    blockers: [...new Set(allBlockers)],
    details_ref: path.basename(args.details),
    not_executed: args.execute ? NOT_EXECUTED : ['Matter app upsert', 'Vault projection sync', ...NOT_EXECUTED],
    sanitization:
      'Receipt contains counts, hashes, sanitized detail filename, and blocker codes only; no raw path, customer document body, OCR/text excerpt, screenshot, storage reference, credential value, raw UUID, Matter Code, matter name, or client label is persisted.',
  };
  const leakFindings = receiptLeakFindings(receipt);
  receipt.leak_scan = {
    status: leakFindings.length === 0 ? 'PASS' : 'FAIL',
    findings: leakFindings,
  };
  if (leakFindings.length > 0) receipt.status = 'blocked';
  return receipt;
}

async function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function writeNdjsonGz(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(filePath, zlib.gzipSync(payload ? `${payload}\n` : ''), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.error(
      'usage: node tools/migration/matter-app-canonical-upsert-sync.mjs --tenant-id <uuid> --operator-user-id <uuid> --identity-preflight <receipt.json> [--execute] [--approval-ref <ref>]',
    );
    process.exit(0);
    return;
  }
  if (!args.tenantId || !args.operatorUserId) {
    console.error('tenant-id and operator-user-id are required');
    process.exit(2);
    return;
  }

  const identityPreflight = await readJsonIfPresent(args.identityPreflight);
  const preflightBlockers = validateIdentityPreflightReceipt(identityPreflight, {
    clients: args.expectedClients,
    matters: args.expectedMatters,
  });
  const db = new Client({ connectionString: args.databaseUrl });
  await db.connect();
  let details = [];
  try {
    await db.query(args.execute ? 'BEGIN' : 'BEGIN READ ONLY');
    await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', args.tenantId]);
    const rows = await loadVaultIdentity(db, args.tenantId);
    const operator = await loadOperator(db, args);
    const identityBlockers = validateVaultIdentityRows(rows, args);
    const environmentBlockers = [];
    if (!operator) environmentBlockers.push('active_operator_missing_or_unauthorized');
    if (!clean(args.approvalRef)) environmentBlockers.push('approval_ref_missing');
    if (args.execute) environmentBlockers.push(...(await checkMatterAppApi(args)));
    else if (!matterAppApiConfigured(args)) environmentBlockers.push('matter_app_api_config_missing');

    if (preflightBlockers.length === 0 && environmentBlockers.length === 0 && identityBlockers.length === 0) {
      details = args.execute
        ? await processExecute({ db, args, rows })
        : processDryRun({ rows });
    }

    const receipt = buildReceipt({
      args,
      preflightBlockers,
      environmentBlockers,
      identityBlockers,
      details,
    });
    if (args.execute && receipt.status === 'pass') await db.query('COMMIT');
    else await db.query('ROLLBACK');
    await writeNdjsonGz(args.details, details);
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
