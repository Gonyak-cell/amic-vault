#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';
import {
  buildApprovedTargets,
  normalizedClientKey,
  readNdjsonGz,
  sha256Hex,
  validateTarget,
} from './onedrive-target-resolution-dry-run.mjs';

const DEFAULT_BASE_DIR = '.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete';
const DEFAULT_INGEST_DIR = `${DEFAULT_BASE_DIR}/ingest`;
const DEFAULT_TARGET_RECEIPT =
  `${DEFAULT_BASE_DIR}/target-resolution/amic-active/target-resolution-dry-run.sanitized.json`;
const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/client-matter-write`;
const SAFE_SOURCE_REF = 'onedrive_provisional_approval';
const DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME = 'AMIC local file organization prep';
const MATTER_TYPE_TO_DB = Object.freeze({
  Criminal: 'investigation',
  Civil: 'litigation',
  Advisory: 'advisory',
  'M&A': 'ma',
});
const NOT_EXECUTED = Object.freeze([
  'Vault storage write',
  'document/file import',
  'customer-wide import',
  'source-of-truth cutover',
  'Gemma indexing',
]);
const MATTER_APP_API_PATHS = Object.freeze({
  status: '/api/matters/vault-bridge/status',
  clientUpsert: '/api/matters/vault-bridge/clients/upsert',
  matterUpsert: '/api/matters/vault-bridge/matters/upsert',
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isoStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    plan: `${DEFAULT_INGEST_DIR}/approved-target-resolution-plan.local.ndjson.gz`,
    approvedGroups: `${DEFAULT_INGEST_DIR}/approved-groups.local.ndjson.gz`,
    targetReceipt: DEFAULT_TARGET_RECEIPT,
    outputDir: DEFAULT_OUTPUT_DIR,
    receipt: null,
    details: null,
    tenantId: null,
    operatorUserId: null,
    migrationRunId: `onedrive-client-matter-write-${isoStamp()}`,
    databaseUrl: process.env.DATABASE_URL || defaultDatabaseUrl(),
    matterAppApiBaseUrl: process.env.MATTER_APP_API_BASE_URL || '',
    matterAppApiToken: process.env.MATTER_APP_API_TOKEN || '',
    matterAppApiTimeoutMs: Number.parseInt(process.env.MATTER_APP_API_TIMEOUT_MS || '10000', 10),
    execute: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--plan') args.plan = value;
    else if (key === '--approved-groups') args.approvedGroups = value;
    else if (key === '--target-receipt') args.targetReceipt = value;
    else if (key === '--output-dir') args.outputDir = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--details') args.details = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--operator-user-id') args.operatorUserId = value;
    else if (key === '--migration-run-id') args.migrationRunId = value;
    else if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--matter-app-api-base-url') args.matterAppApiBaseUrl = value;
    else if (key === '--matter-app-api-token') args.matterAppApiToken = value;
    else if (key === '--matter-app-api-timeout-ms') args.matterAppApiTimeoutMs = Number.parseInt(value, 10);
    else if (key === '--execute') {
      args.execute = true;
      continue;
    } else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  args.receipt ??= path.join(args.outputDir, 'client-matter-write.sanitized.json');
  args.details ??= path.join(args.outputDir, 'client-matter-write.local.ndjson.gz');
  if (!Number.isFinite(args.matterAppApiTimeoutMs) || args.matterAppApiTimeoutMs < 1000) {
    args.matterAppApiTimeoutMs = 10000;
  }
  return args;
}

export function matterTypeToDb(matterTypeEnglish) {
  return MATTER_TYPE_TO_DB[clean(matterTypeEnglish)] ?? null;
}

export function buildWriteTargets({ planRows, approvedGroupRows }) {
  const byMatterCodeHash = new Map();
  for (const target of buildApprovedTargets({ planRows, approvedGroupRows })) {
    const blockers = validateTarget(target);
    const dbMatterType = matterTypeToDb(target.matterTypeEnglish);
    if (!dbMatterType) blockers.push('unsupported_db_matter_type');
    const next = {
      ...target,
      dbMatterType,
      validationBlockers: blockers,
    };
    if (byMatterCodeHash.has(target.matterCodeHash)) {
      const current = byMatterCodeHash.get(target.matterCodeHash);
      current.validationBlockers.push('duplicate_target_hash');
      next.validationBlockers.push('duplicate_target_hash');
    }
    byMatterCodeHash.set(target.matterCodeHash, next);
  }
  return [...byMatterCodeHash.values()].sort((left, right) =>
    String(left.matterCodeHash).localeCompare(String(right.matterCodeHash)),
  );
}

function sanitizedTarget(target) {
  return {
    matter_code_hash: target.matterCodeHash,
    client_short_name_hash: target.clientShortName
      ? sha256Hex(normalizedClientKey(target.clientShortName))
      : null,
    matter_type_english_hash: target.matterTypeEnglish ? sha256Hex(target.matterTypeEnglish) : null,
    matter_detail_type_korean_hash: target.matterDetailTypeKorean
      ? sha256Hex(target.matterDetailTypeKorean)
      : null,
    approved_group_count: target.approvedGroupCount,
    approved_group_id_count: target.approvedGroupIds.length,
  };
}

async function writeNdjsonGz(filePath, rows) {
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(filePath, zlib.gzipSync(payload ? `${payload}\n` : ''), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

export function matterAppApiConfigured(args) {
  return Boolean(clean(args.matterAppApiBaseUrl)) && Boolean(clean(args.matterAppApiToken));
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
    if (!response.ok) {
      const codes = Array.isArray(payload?.safe_error_codes) ? payload.safe_error_codes : [];
      throw new Error(`matter_app_api_http_${response.status}${codes.length ? `_${codes.join('_')}` : ''}`);
    }
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

function targetApprovalRef(target) {
  return `${SAFE_SOURCE_REF}:${target.matterCodeHash}`;
}

export function buildMatterAppClientRequest({ args, target }) {
  const approvalRef = targetApprovalRef(target);
  return {
    tenantRef: args.tenantId,
    idempotencyKeyHash: sha256Hex(`${args.tenantId}:client:${target.clientShortName}:${approvalRef}`),
    clientDisplayName: target.clientShortName,
    clientShortName: target.clientShortName,
    approvalRef,
    migrationApprovalRef: approvalRef,
    supportingEvidenceRefs: target.approvedGroupIds.map((groupId) =>
      `approved-folder-group:${sha256Hex(groupId)}`,
    ),
    migrationOperatorRef: sha256Hex(args.operatorUserId),
  };
}

export function buildMatterAppMatterRequest({ args, target, clientResult }) {
  const approvalRef = targetApprovalRef(target);
  return {
    tenantRef: args.tenantId,
    idempotencyKeyHash: sha256Hex(`${args.tenantId}:matter:${target.matterCode}:${approvalRef}`),
    clientId: clientResult.clientId,
    clientDisplayName: clientResult.clientDisplayName,
    clientShortName: clientResult.clientShortName ?? target.clientShortName,
    matterCode: target.matterCode,
    matterName: target.matterCode,
    matterTypeEnglish: target.matterTypeEnglish,
    matterDetailTypeKorean: target.matterDetailTypeKorean,
    approvalRef,
    migrationApprovalRef: approvalRef,
    supportingEvidenceRefs: target.approvedGroupIds.map((groupId) =>
      `approved-folder-group:${sha256Hex(groupId)}`,
    ),
    migrationOperatorRef: sha256Hex(args.operatorUserId),
    status: 'opening',
  };
}

export function validateMatterAppResults({ target, clientResult, matterResult }) {
  const blockers = [];
  if (!clientResult?.clientId) blockers.push('matter_app_client_id_missing');
  if (!clientResult?.sourceRevision) blockers.push('matter_app_client_source_revision_missing');
  if (!matterResult?.matterAppMatterId) blockers.push('matter_app_matter_id_missing');
  if (!matterResult?.sourceRevision) blockers.push('matter_app_matter_source_revision_missing');
  if (matterResult?.matterCode !== target.matterCode) blockers.push('matter_app_matter_code_mismatch');
  if (clientResult?.clientId && matterResult?.clientId !== clientResult.clientId) {
    blockers.push('matter_app_client_id_mismatch');
  }
  return blockers;
}

async function upsertMatterAppTarget({ args, target }) {
  const clientRequest = buildMatterAppClientRequest({ args, target });
  const clientResult = await matterAppRequest(args, MATTER_APP_API_PATHS.clientUpsert, {
    method: 'POST',
    body: clientRequest,
  });
  const matterRequest = buildMatterAppMatterRequest({ args, target, clientResult });
  const matterResult = await matterAppRequest(args, MATTER_APP_API_PATHS.matterUpsert, {
    method: 'POST',
    body: matterRequest,
  });
  return {
    clientResult,
    matterResult,
    blockers: validateMatterAppResults({ target, clientResult, matterResult }),
  };
}

function matterAppProjectionMetadata({ target, matterAppResult, migrationRunId }) {
  if (!matterAppResult) return {};
  return {
    matterAppClientId: matterAppResult.clientResult.clientId,
    matterAppMatterId: matterAppResult.matterResult.matterAppMatterId,
    matterAppSourceRevision: matterAppResult.matterResult.sourceRevision,
    sourceRevision: matterAppResult.matterResult.sourceRevision,
    migration_run_id: migrationRunId,
    source_ref: SAFE_SOURCE_REF,
    mapping_candidate_hash: target.matterCodeHash,
  };
}

async function loadDbSnapshot(client, { tenantId, operatorUserId }) {
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
  const members = await client.query(
    `
      SELECT matter_id, user_id, matter_role, access_level
      FROM matter_members
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const operator = await client.query(
    `
      SELECT user_id, role, status
      FROM users
      WHERE tenant_id = $1
        AND user_id = $2
        AND role = 'firm_admin'
        AND status = 'active'
      LIMIT 1
    `,
    [tenantId, operatorUserId],
  );
  const aiPolicy = await client.query(
    `
      SELECT policy_id
      FROM ai_policies
      WHERE tenant_id = $1
        AND name = $2
        AND allowed_model_tiers = ARRAY['local']::text[]
        AND external_model_allowed = false
        AND default_effect = 'DENY'
      ORDER BY updated_at DESC, created_at DESC, policy_id
      LIMIT 1
    `,
    [tenantId, DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME],
  );
  return {
    clients: clients.rows,
    matters: matters.rows,
    members: members.rows,
    operator: operator.rows[0] ?? null,
    defaultAiPolicyId: aiPolicy.rows[0]?.policy_id ?? null,
  };
}

function indexSnapshot(snapshot) {
  const clientsByKey = new Map();
  const mattersByCode = new Map();
  const mattersById = new Map();
  const membersByMatterAndUser = new Set();
  const clientById = new Map();
  for (const client of snapshot.clients) {
    const key = normalizedClientKey(client.name);
    const list = clientsByKey.get(key) ?? [];
    list.push(client);
    clientsByKey.set(key, list);
    clientById.set(client.client_id, client);
  }
  for (const matter of snapshot.matters) {
    mattersByCode.set(matter.matter_code, matter);
    mattersById.set(matter.matter_id, matter);
  }
  for (const member of snapshot.members) {
    membersByMatterAndUser.add(`${member.matter_id}:${member.user_id}`);
  }
  return { clientsByKey, clientById, mattersByCode, mattersById, membersByMatterAndUser };
}

async function insertAudit(client, input) {
  const result = await client.query(
    `
      INSERT INTO audit_events (
        tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
        matter_id, result, metadata_json, correlation_id, retention_label
      )
      VALUES ($1, 'user', $2, NULL, $3, $4, $5, $6, 'success', $7::jsonb, $8, 'PERMANENT')
      RETURNING event_id
    `,
    [
      input.tenantId,
      input.actorId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.matterId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.correlationId ?? null,
    ],
  );
  if (!result.rows[0]) throw new Error('audit insert returned no row');
}

async function insertClient(client, { tenantId, operatorUserId, target, migrationRunId, matterAppResult }) {
  const metadata = {
    migration_run_id: migrationRunId,
    source_ref: SAFE_SOURCE_REF,
    mapping_candidate_hash: target.matterCodeHash,
    approved_group_count: String(target.approvedGroupCount),
    ...matterAppProjectionMetadata({ target, matterAppResult, migrationRunId }),
  };
  const result = await client.query(
    `
      INSERT INTO clients (
        tenant_id, name, client_type, confidentiality_level, status, metadata_json, created_by
      )
      VALUES ($1, $2, 'other', 'standard', 'active', $3::jsonb, $4)
      RETURNING client_id, name, status
    `,
    [tenantId, target.clientShortName, JSON.stringify(metadata), operatorUserId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('client insert returned no row');
  await insertAudit(client, {
    tenantId,
    actorId: operatorUserId,
    action: 'CLIENT_CREATED',
    targetType: 'client',
    targetId: row.client_id,
    metadata: {
      client_id: row.client_id,
      migration_run_id: migrationRunId,
      source_ref: SAFE_SOURCE_REF,
      mapping_candidate_hash: target.matterCodeHash,
    },
  });
  return row;
}

async function insertMatter(
  client,
  { tenantId, operatorUserId, target, clientId, aiPolicyId, migrationRunId, matterAppResult },
) {
  const matterName = target.matterCode;
  const metadata = {
    matter_detail_type_korean: target.matterDetailTypeKorean,
    matter_type_english: target.matterTypeEnglish,
    migration_run_id: migrationRunId,
    source_ref: SAFE_SOURCE_REF,
    mapping_candidate_hash: target.matterCodeHash,
    approved_group_count: String(target.approvedGroupCount),
    ...matterAppProjectionMetadata({ target, matterAppResult, migrationRunId }),
  };
  const result = await client.query(
    `
      INSERT INTO matters (
        tenant_id, client_id, matter_code, matter_name, matter_type, status,
        opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json, created_by,
        ai_policy_id
      )
      VALUES ($1, $2, $3, $4, $5, 'proposed', NULL, NULL, $6, NULL, $7::jsonb, $8, $9)
      RETURNING matter_id, client_id, matter_code, matter_type, status
    `,
    [
      tenantId,
      clientId,
      target.matterCode,
      matterName,
      target.dbMatterType,
      operatorUserId,
      JSON.stringify(metadata),
      operatorUserId,
      aiPolicyId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('matter insert returned no row');
  return row;
}

async function ensureLeadOwner(client, { tenantId, operatorUserId, matterId, migrationRunId }) {
  const result = await client.query(
    `
      INSERT INTO matter_members (
        tenant_id, matter_id, user_id, matter_role, access_level, added_by
      )
      VALUES ($1, $2, $3, 'owner', 'edit', $3)
      ON CONFLICT (matter_id, user_id) DO NOTHING
      RETURNING matter_id, user_id, matter_role, access_level
    `,
    [tenantId, matterId, operatorUserId],
  );
  if (!result.rows[0]) return { created: false };
  const afterRef = `member:${operatorUserId}:owner:edit`;
  await insertAudit(client, {
    tenantId,
    actorId: operatorUserId,
    action: 'MATTER_MEMBER_ADDED',
    targetType: 'matter',
    targetId: matterId,
    matterId,
    metadata: {
      matter_id: matterId,
      member_user_id: operatorUserId,
      role_after: 'owner',
      migration_run_id: migrationRunId,
      source_ref: SAFE_SOURCE_REF,
    },
  });
  await insertAudit(client, {
    tenantId,
    actorId: operatorUserId,
    action: 'PERMISSION_CHANGED',
    targetType: 'matter',
    targetId: matterId,
    matterId,
    metadata: {
      matter_id: matterId,
      member_user_id: operatorUserId,
      before_ref: 'none',
      after_ref: afterRef,
      reason_code: 'member_added',
      migration_run_id: migrationRunId,
      source_ref: SAFE_SOURCE_REF,
    },
  });
  return { created: true };
}

async function syncClientProjection(client, { tenantId, clientId, target, migrationRunId, matterAppResult }) {
  if (!matterAppResult) return { updated: false };
  const metadata = matterAppProjectionMetadata({ target, matterAppResult, migrationRunId });
  await client.query(
    `
      UPDATE clients
      SET metadata_json = coalesce(metadata_json, '{}'::jsonb) || $3::jsonb,
          updated_at = now()
      WHERE tenant_id = $1
        AND client_id = $2
    `,
    [tenantId, clientId, JSON.stringify(metadata)],
  );
  return { updated: true };
}

async function syncMatterProjection(client, { tenantId, matterId, target, migrationRunId, matterAppResult }) {
  if (!matterAppResult) return { updated: false };
  const metadata = matterAppProjectionMetadata({ target, matterAppResult, migrationRunId });
  await client.query(
    `
      UPDATE matters
      SET matter_code = $3,
          matter_name = $4,
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || $5::jsonb,
          updated_at = now()
      WHERE tenant_id = $1
        AND matter_id = $2
    `,
    [tenantId, matterId, target.matterCode, target.matterCode, JSON.stringify(metadata)],
  );
  return { updated: true };
}

async function processTarget({ db, indexed, target, args, aiPolicyId, execute }) {
  const base = sanitizedTarget(target);
  const blockers = [...target.validationBlockers];
  if (blockers.length > 0) {
    return { ...base, state: 'blocked', action: 'none', blockers };
  }

  const clientKey = normalizedClientKey(target.clientShortName);
  const existingMatter = indexed.mattersByCode.get(target.matterCode);
  if (existingMatter) {
    const existingMatterClient = indexed.clientById.get(existingMatter.client_id);
    if (existingMatter.matter_type !== target.dbMatterType) blockers.push('existing_matter_type_mismatch');
    if (!existingMatterClient) blockers.push('existing_matter_client_missing');
    else if (normalizedClientKey(existingMatterClient.name) !== clientKey) {
      blockers.push('existing_matter_client_mismatch');
    }
    if (blockers.length > 0) {
      return { ...base, state: 'blocked', action: 'none', blockers };
    }
    if (!execute) {
      return { ...base, state: 'matter_reused', action: 'reuse_existing_matter', blockers };
    }
    const matterAppResult = await upsertMatterAppTarget({ args, target });
    blockers.push(...matterAppResult.blockers);
    if (blockers.length > 0) {
      return { ...base, state: 'blocked', action: 'none', blockers };
    }
    await syncClientProjection(db, {
      tenantId: args.tenantId,
      clientId: existingMatter.client_id,
      target,
      migrationRunId: args.migrationRunId,
      matterAppResult,
    });
    await syncMatterProjection(db, {
      tenantId: args.tenantId,
      matterId: existingMatter.matter_id,
      target,
      migrationRunId: args.migrationRunId,
      matterAppResult,
    });
    return {
      ...base,
      state: 'vault_projection_synced',
      action: 'matter_app_upsert_and_sync_existing_vault_projection',
      blockers,
      matter_app_matter_ref_hash: sha256Hex(matterAppResult.matterResult.matterAppMatterId),
      matter_app_client_ref_hash: sha256Hex(matterAppResult.clientResult.clientId),
      matter_app_source_revision_hash: sha256Hex(matterAppResult.matterResult.sourceRevision),
    };
  }

  const clientMatches = indexed.clientsByKey.get(clientKey) ?? [];
  if (clientMatches.length > 1) {
    return { ...base, state: 'blocked', action: 'none', blockers: ['ambiguous_client_match'] };
  }

  let clientRow = clientMatches[0] ?? null;
  let clientAction = 'reuse_existing_client';
  if (!clientRow) {
    clientAction = execute ? 'create_client' : 'would_create_client';
    if (!execute) {
      clientRow = { client_id: `planned:${sha256Hex(clientKey)}`, name: target.clientShortName, status: 'active' };
      indexed.clientsByKey.set(clientKey, [clientRow]);
    }
  }

  if (!execute) {
    return {
      ...base,
      state: clientAction === 'would_create_client' ? 'planned_create_client_and_matter' : 'planned_create_matter',
      action: clientAction === 'would_create_client' ? 'would_create_client_and_matter' : 'would_create_matter',
      blockers,
    };
  }

  const matterAppResult = await upsertMatterAppTarget({ args, target });
  blockers.push(...matterAppResult.blockers);
  if (blockers.length > 0) {
    return { ...base, state: 'blocked', action: 'none', blockers };
  }

  if (!clientRow) {
    clientRow = await insertClient(db, {
      tenantId: args.tenantId,
      operatorUserId: args.operatorUserId,
      target,
      migrationRunId: args.migrationRunId,
      matterAppResult,
    });
    indexed.clientById.set(clientRow.client_id, clientRow);
    indexed.clientsByKey.set(clientKey, [clientRow]);
  } else {
    await syncClientProjection(db, {
      tenantId: args.tenantId,
      clientId: clientRow.client_id,
      target,
      migrationRunId: args.migrationRunId,
      matterAppResult,
    });
  }

  const matter = await insertMatter(db, {
    tenantId: args.tenantId,
    operatorUserId: args.operatorUserId,
    target,
    clientId: clientRow.client_id,
    aiPolicyId,
    migrationRunId: args.migrationRunId,
    matterAppResult,
  });
  indexed.mattersByCode.set(target.matterCode, matter);
  indexed.mattersById.set(matter.matter_id, matter);
  const member = await ensureLeadOwner(db, {
    tenantId: args.tenantId,
    operatorUserId: args.operatorUserId,
    matterId: matter.matter_id,
    migrationRunId: args.migrationRunId,
  });
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'MATTER_CREATED',
    targetType: 'matter',
    targetId: matter.matter_id,
    matterId: matter.matter_id,
    metadata: {
      matter_id: matter.matter_id,
      client_id: clientRow.client_id,
      migration_run_id: args.migrationRunId,
      source_ref: SAFE_SOURCE_REF,
      mapping_candidate_hash: target.matterCodeHash,
    },
  });
  return {
    ...base,
    state: clientAction === 'create_client' ? 'created_client_and_matter' : 'created_matter',
    action: member.created
      ? `matter_app_upsert_${clientAction}_create_matter_and_owner`
      : `matter_app_upsert_${clientAction}_create_matter`,
    blockers,
    matter_app_matter_ref_hash: sha256Hex(matterAppResult.matterResult.matterAppMatterId),
    matter_app_client_ref_hash: sha256Hex(matterAppResult.clientResult.clientId),
    matter_app_source_revision_hash: sha256Hex(matterAppResult.matterResult.sourceRevision),
  };
}

function summarize(details) {
  const states = {};
  const actions = {};
  let blocked = 0;
  for (const row of details) {
    states[row.state] = (states[row.state] ?? 0) + 1;
    actions[row.action] = (actions[row.action] ?? 0) + 1;
    if (row.blockers.length > 0) blocked += 1;
  }
  return { states, actions, blocked };
}

function assertTargetReceiptPass(receipt) {
  const blockers = [];
  if (receipt?.status !== 'pass') blockers.push('target_resolution_receipt_not_pass');
  if (receipt?.blocked_target_count !== 0) blockers.push('target_resolution_blocked_targets_present');
  if (Array.isArray(receipt?.environment_blockers) && receipt.environment_blockers.length > 0) {
    blockers.push('target_resolution_environment_blockers_present');
  }
  return blockers;
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.tenantId || !args.operatorUserId) {
    console.error(
      'usage: node tools/migration/onedrive-client-matter-write.mjs --tenant-id <uuid> --operator-user-id <uuid> [--execute] [--matter-app-api-base-url <url> --matter-app-api-token <token>]',
    );
    process.exit(args.help ? 0 : 2);
  }

  await mkdir(args.outputDir, { recursive: true });
  const targetReceipt = readJson(args.targetReceipt);
  const receiptBlockers = assertTargetReceiptPass(targetReceipt);
  const planRows = readNdjsonGz(args.plan);
  const approvedGroupRows = readNdjsonGz(args.approvedGroups);
  const targets = buildWriteTargets({ planRows, approvedGroupRows });

  const db = new Client({ connectionString: args.databaseUrl });
  await db.connect();
  const details = [];
  let dbSnapshot;
  try {
    await db.query(args.execute ? 'BEGIN' : 'BEGIN READ ONLY');
    await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', args.tenantId]);
    dbSnapshot = await loadDbSnapshot(db, {
      tenantId: args.tenantId,
      operatorUserId: args.operatorUserId,
    });
    const environmentBlockers = [...receiptBlockers];
    if (!dbSnapshot.operator) environmentBlockers.push('active_firm_admin_operator_missing');
    const matterAppApiBlockers = args.execute ? await checkMatterAppApi(args) : [];
    environmentBlockers.push(...matterAppApiBlockers);
    const indexed = indexSnapshot(dbSnapshot);

    if (environmentBlockers.length === 0) {
      for (const target of targets) {
        details.push(
          await processTarget({
            db,
            indexed,
            target,
            args,
            aiPolicyId: dbSnapshot.defaultAiPolicyId,
            execute: args.execute,
          }),
        );
      }
    }

    const summary = summarize(details);
    const status = environmentBlockers.length === 0 && summary.blocked === 0 ? 'pass' : 'blocked';
    if (args.execute && status !== 'pass') {
      await db.query('ROLLBACK');
    } else if (args.execute) {
      await db.query('COMMIT');
    } else {
      await db.query('ROLLBACK');
    }

    const receipt = {
      artifact: 'onedrive_client_matter_write_sanitized',
      generated_at: new Date().toISOString(),
      status,
      execute: args.execute,
      tenant_ref_hash: sha256Hex(args.tenantId),
      operator_ref_hash: sha256Hex(args.operatorUserId),
      migration_run_id_hash: sha256Hex(args.migrationRunId),
      plan_ref: path.basename(args.plan),
      approved_groups_ref: path.basename(args.approvedGroups),
      target_receipt_ref: path.basename(args.targetReceipt),
      target_rows: targets.length,
      approved_group_rows: approvedGroupRows.length,
      db_connected: true,
      matter_app_api_checked: args.execute,
      matter_app_api_configured: matterAppApiConfigured(args),
      db_snapshot_counts_before: {
        clients: dbSnapshot.clients.length,
        matters: dbSnapshot.matters.length,
        matter_members: dbSnapshot.members.length,
      },
      default_local_ai_policy_resolved: Boolean(dbSnapshot.defaultAiPolicyId),
      operator_resolved: Boolean(dbSnapshot.operator),
      result_counts: summary.states,
      action_counts: summary.actions,
      blocked_target_count: summary.blocked,
      environment_blockers: environmentBlockers,
      details_ref: path.basename(args.details),
      not_executed: NOT_EXECUTED,
      sanitization:
        'Receipt contains hashes, counts, states, and blocker codes only; no raw paths, filenames, Matter codes, client names, document contents, tokens, secrets, or tenant-private identifiers.',
    };
    await writeNdjsonGz(args.details, details);
    await writeJson(args.receipt, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (status !== 'pass') process.exitCode = 1;
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
