#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE';
const DEFAULT_SANITIZED_OUT = `${DEFAULT_OUTPUT_DIR}/identity-preflight.sanitized.json`;
const DEFAULT_DETAILS = `${DEFAULT_OUTPUT_DIR}/identity-preflight.local.ndjson.gz`;
const MATTER_APP_STATUS_PATH = '/api/matters/vault-bridge/status';
const ALLOWED_MATTER_TYPES = new Set(['investigation', 'litigation', 'advisory', 'ma']);
const NOT_EXECUTED = Object.freeze([
  'Matter app client upsert',
  'Matter app matter upsert',
  'Vault projection sync',
  'customer document import',
  'Vault storage write',
  'source-of-truth cutover',
  'OneDrive connected-state claim',
  'Office open/save/sync claim',
  'Gemma indexing execution',
]);

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function shortHash(value) {
  return sha256Hex(value).slice(0, 16);
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function isoStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

function toNumber(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function parseIntArg(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeIdentityLabel(value) {
  return clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    databaseUrl: env.DATABASE_URL || defaultDatabaseUrl(),
    tenantId: null,
    matterAppApiBaseUrl: env.MATTER_APP_API_BASE_URL || '',
    matterAppApiToken: env.MATTER_APP_API_TOKEN || '',
    matterAppApiTimeoutMs: parseIntArg(env.MATTER_APP_API_TIMEOUT_MS, 10000),
    sanitizedOut: DEFAULT_SANITIZED_OUT,
    details: DEFAULT_DETAILS,
    runId: `matter-app-identity-preflight-${isoStamp()}`,
    expectedClients: 80,
    expectedMatters: 123,
    expectedActiveDocuments: 22299,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--matter-app-api-base-url') args.matterAppApiBaseUrl = value;
    else if (key === '--matter-app-api-token') args.matterAppApiToken = value;
    else if (key === '--matter-app-api-timeout-ms') {
      args.matterAppApiTimeoutMs = parseIntArg(value, 10000);
    } else if (key === '--sanitized-out') args.sanitizedOut = value;
    else if (key === '--details') args.details = value;
    else if (key === '--run-id') args.runId = value;
    else if (key === '--expected-clients') args.expectedClients = parseIntArg(value, 80);
    else if (key === '--expected-matters') args.expectedMatters = parseIntArg(value, 123);
    else if (key === '--expected-active-documents') {
      args.expectedActiveDocuments = parseIntArg(value, 22299);
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

function matterAppUrl(args, apiPath) {
  const baseUrl = clean(args.matterAppApiBaseUrl);
  if (!baseUrl) throw new Error('matter_app_api_base_url_missing');
  return new URL(apiPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function matterAppRequest(args, apiPath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.matterAppApiTimeoutMs);
  try {
    const response = await fetch(matterAppUrl(args, apiPath), {
      headers: { authorization: `Bearer ${args.matterAppApiToken}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { httpStatus: response.status, ok: response.ok, payload };
  } finally {
    clearTimeout(timeout);
  }
}

export function bridgeStatusFromPayload(result) {
  const payload = result?.payload ?? {};
  const item = payload.item ?? {};
  const capabilities = item.capabilities ?? payload.capabilities ?? {};
  const clientUpsert =
    capabilities.client_upsert === true ||
    capabilities.clientUpsert === true ||
    item.client_upsert_supported === true ||
    item.clientUpsertSupported === true ||
    clean(item.client_upsert_path) === '/api/matters/vault-bridge/clients/upsert' ||
    clean(item.clientUpsertPath) === '/api/matters/vault-bridge/clients/upsert' ||
    Array.isArray(item.supported_operations) && item.supported_operations.includes('clients/upsert');
  const matterUpsert =
    capabilities.matter_upsert === true ||
    capabilities.matterUpsert === true ||
    item.matter_upsert_supported === true ||
    item.matterUpsertSupported === true ||
    clean(item.matter_upsert_path) === '/api/matters/vault-bridge/matters/upsert' ||
    clean(item.matterUpsertPath) === '/api/matters/vault-bridge/matters/upsert' ||
    Array.isArray(item.supported_operations) && item.supported_operations.includes('matters/upsert');
  const sourceMode = clean(item.source_mode ?? item.sourceMode ?? payload.source_mode ?? payload.sourceMode);
  const outcome = clean(payload.outcome ?? item.outcome);
  const bridgeReady =
    result?.ok === true &&
    (outcome === 'passed' || outcome === 'pass' || outcome === 'ready') &&
    sourceMode === 'matter_app_api';
  return {
    checked: true,
    http_status_class: result?.httpStatus ? `${Math.floor(result.httpStatus / 100)}xx` : null,
    bridge_ready: bridgeReady,
    source_mode_hash: sourceMode ? shortHash(sourceMode) : null,
    client_upsert_supported: clientUpsert,
    matter_upsert_supported: matterUpsert,
    source_revision_hash: item.source_revision || item.sourceRevision
      ? shortHash(item.source_revision ?? item.sourceRevision)
      : null,
    blockers: [
      ...(bridgeReady ? [] : ['matter_app_bridge_status_not_ready']),
      ...(clientUpsert ? [] : ['matter_app_client_upsert_not_advertised']),
      ...(matterUpsert ? [] : ['matter_app_matter_upsert_not_advertised']),
    ],
  };
}

async function checkMatterAppBridge(args) {
  if (!matterAppApiConfigured(args)) {
    return {
      checked: false,
      configured: false,
      bridge_ready: false,
      client_upsert_supported: false,
      matter_upsert_supported: false,
      blockers: ['matter_app_api_config_missing'],
    };
  }
  try {
    const result = await matterAppRequest(args, MATTER_APP_STATUS_PATH);
    return {
      configured: true,
      ...bridgeStatusFromPayload(result),
    };
  } catch {
    return {
      checked: true,
      configured: true,
      bridge_ready: false,
      client_upsert_supported: false,
      matter_upsert_supported: false,
      blockers: ['matter_app_bridge_status_unreachable'],
    };
  }
}

async function scalar(client, sql, params = []) {
  const result = await client.query(sql, params);
  return toNumber(Object.values(result.rows[0] ?? {})[0]);
}

async function resolveTenantId(client, requestedTenantId) {
  if (requestedTenantId) return { tenantId: requestedTenantId, blockers: [] };
  const result = await client.query(
    `
      SELECT tenant_id, count(*)::int AS matter_count
      FROM matters
      GROUP BY tenant_id
      HAVING count(*) > 0
      ORDER BY matter_count DESC, tenant_id
      LIMIT 2
    `,
  );
  if (result.rows.length === 1) return { tenantId: result.rows[0].tenant_id, blockers: [] };
  return { tenantId: result.rows[0]?.tenant_id ?? null, blockers: ['tenant_id_required_for_multi_tenant_db'] };
}

async function loadIdentityRows(client, tenantId) {
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
        m.tenant_id,
        m.matter_id,
        m.client_id,
        c.name AS client_name,
        m.matter_code,
        m.matter_name,
        m.matter_type,
        m.status,
        m.practice_group,
        m.metadata_json,
        count(d.document_id)::int AS active_document_count
      FROM matters m
      LEFT JOIN clients c
        ON c.tenant_id = m.tenant_id
        AND c.client_id = m.client_id
      LEFT JOIN documents d
        ON d.tenant_id = m.tenant_id
        AND d.matter_id = m.matter_id
        AND d.deleted_at IS NULL
      WHERE m.tenant_id = $1
      GROUP BY m.tenant_id, m.matter_id, m.client_id, c.name, m.matter_code, m.matter_name,
        m.matter_type, m.status, m.practice_group, m.metadata_json
      ORDER BY m.matter_code, m.matter_id
    `,
    [tenantId],
  );
  return { clients: clients.rows, matters: matters.rows };
}

export function buildIdentityDetails(rows) {
  const clientNameCounts = new Map();
  for (const client of rows.clients) {
    const key = normalizeIdentityLabel(client.name);
    clientNameCounts.set(key, (clientNameCounts.get(key) ?? 0) + 1);
  }
  const matterCodeCounts = new Map();
  for (const matter of rows.matters) {
    const key = normalizeIdentityLabel(matter.matter_code);
    matterCodeCounts.set(key, (matterCodeCounts.get(key) ?? 0) + 1);
  }
  return rows.matters.map((matter) => {
    const blockers = [];
    const matterCodeKey = normalizeIdentityLabel(matter.matter_code);
    const clientNameKey = normalizeIdentityLabel(matter.client_name);
    if (!matter.client_id) blockers.push('matter_client_id_missing');
    if (!matter.client_name) blockers.push('matter_client_row_missing');
    if (!matter.matter_code) blockers.push('matter_code_missing');
    if ((matterCodeCounts.get(matterCodeKey) ?? 0) > 1) blockers.push('matter_code_duplicate');
    if ((clientNameCounts.get(clientNameKey) ?? 0) > 1) blockers.push('client_label_ambiguous');
    if (!ALLOWED_MATTER_TYPES.has(clean(matter.matter_type))) blockers.push('matter_type_unsupported');
    if (String(matter.matter_code ?? '').startsWith('999_')) blockers.push('archive_only_matter_excluded');
    const metadata = matter.metadata_json && typeof matter.metadata_json === 'object'
      ? matter.metadata_json
      : {};
    return {
      tenant_ref_hash: matter.tenant_id ? shortHash(matter.tenant_id) : null,
      matter_ref_hash: shortHash(matter.matter_id),
      client_ref_hash: matter.client_id ? shortHash(matter.client_id) : null,
      matter_code_hash: matter.matter_code ? sha256Hex(matter.matter_code) : null,
      matter_name_hash: matter.matter_name ? sha256Hex(matter.matter_name) : null,
      client_name_hash: matter.client_name ? sha256Hex(matter.client_name) : null,
      matter_type: clean(matter.matter_type) || null,
      status: clean(matter.status) || null,
      active_document_count: toNumber(matter.active_document_count),
      projection: {
        matter_app_client_ref_present: Boolean(metadata.matterAppClientId),
        matter_app_matter_ref_present: Boolean(metadata.matterAppMatterId),
        matter_app_source_revision_present: Boolean(
          metadata.matterAppSourceRevision || metadata.sourceRevision,
        ),
      },
      blockers,
    };
  });
}

export async function loadIdentitySnapshot(client, tenantId) {
  const rows = await loadIdentityRows(client, tenantId);
  const activeDocuments = await scalar(
    client,
    'SELECT count(*) FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL',
    [tenantId],
  );
  const docsWithMatter = await scalar(
    client,
    'SELECT count(*) FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL AND matter_id IS NOT NULL',
    [tenantId],
  );
  const documentMatterCount = await scalar(
    client,
    'SELECT count(DISTINCT matter_id) FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL',
    [tenantId],
  );
  const details = buildIdentityDetails(rows);
  return {
    counts: {
      clients: rows.clients.length,
      matters: rows.matters.length,
      matters_with_client: rows.matters.filter((matter) => matter.client_id).length,
      matters_without_client: rows.matters.filter((matter) => !matter.client_id).length,
      active_documents: activeDocuments,
      docs_with_matter: docsWithMatter,
      docs_without_matter: activeDocuments - docsWithMatter,
      document_matter_count: documentMatterCount,
      matter_code_duplicate_rows: details.filter((row) =>
        row.blockers.includes('matter_code_duplicate'),
      ).length,
      client_ambiguous_rows: details.filter((row) =>
        row.blockers.includes('client_label_ambiguous'),
      ).length,
      unsupported_matter_type_rows: details.filter((row) =>
        row.blockers.includes('matter_type_unsupported'),
      ).length,
      archive_only_rows: details.filter((row) =>
        row.blockers.includes('archive_only_matter_excluded'),
      ).length,
      matter_app_client_refs: details.filter((row) => row.projection.matter_app_client_ref_present).length,
      matter_app_matter_refs: details.filter((row) => row.projection.matter_app_matter_ref_present).length,
      matter_app_source_revisions: details.filter((row) =>
        row.projection.matter_app_source_revision_present,
      ).length,
      blocked_identity_rows: details.filter((row) => row.blockers.length > 0).length,
    },
    details,
  };
}

export function validateIdentitySnapshot(snapshot, args) {
  const counts = snapshot.counts;
  return {
    expected_clients: counts.clients === args.expectedClients,
    expected_matters: counts.matters === args.expectedMatters,
    all_matters_have_client: counts.matters_without_client === 0,
    active_documents_expected: counts.active_documents === args.expectedActiveDocuments,
    all_documents_have_matter: counts.docs_without_matter === 0,
    document_matter_count_matches: counts.document_matter_count === counts.matters,
    matter_code_duplicates_zero: counts.matter_code_duplicate_rows === 0,
    client_ambiguity_zero: counts.client_ambiguous_rows === 0,
    unsupported_matter_type_zero: counts.unsupported_matter_type_rows === 0,
    archive_only_excluded: counts.archive_only_rows === 0,
    identity_blockers_zero: counts.blocked_identity_rows === 0,
  };
}

export function receiptLeakFindings(receipt) {
  const payload = JSON.stringify(receipt);
  const checks = [
    ['local_absolute_path', /\/Users\/|CloudStorage/],
    ['cookie_or_session', /amic_session=|set-cookie/i],
    ['secret_or_bearer', /MATTER_APP_API_TOKEN|LAWOS_VAULT_BRIDGE_TOKEN|Bearer\s+[A-Za-z0-9._-]+/i],
    ['private_key', /BEGIN [A-Z ]*PRIVATE KEY/],
    ['openai_secret_key', /sk-[A-Za-z0-9_-]{8,}/],
    ['raw_uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}/i],
    ['object_key_or_storage_uri', /s3:\/\/|storage_uri|object_key/i],
  ];
  return checks.filter(([, pattern]) => pattern.test(payload)).map(([name]) => name);
}

export function buildReceipt({ args, tenantResolution, snapshot, bridge }) {
  const identityGate = validateIdentitySnapshot(snapshot, args);
  const bridgeGate = {
    configured: bridge.configured === true,
    status_checked: bridge.checked === true,
    bridge_ready: bridge.bridge_ready === true,
    client_upsert_supported: bridge.client_upsert_supported === true,
    matter_upsert_supported: bridge.matter_upsert_supported === true,
  };
  const acceptanceGate = {
    tenant_resolved: Boolean(tenantResolution.tenantId) && tenantResolution.blockers.length === 0,
    ...identityGate,
    ...bridgeGate,
  };
  const blockers = [
    ...tenantResolution.blockers,
    ...Object.entries(identityGate)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    ...bridge.blockers,
  ];
  const receipt = {
    artifact: 'matter_app_identity_preflight_sanitized',
    generated_at: new Date().toISOString(),
    status: blockers.length === 0 ? 'pass' : 'blocked',
    run_id_hash: sha256Hex(args.runId),
    tenant_ref_hash: tenantResolution.tenantId ? sha256Hex(tenantResolution.tenantId) : null,
    scope:
      'Identity-only Vault client/matter export and Matter app bridge preflight; no client/matter/document writes.',
    details_ref: path.basename(args.details),
    counts: snapshot.counts,
    identity_gate: Object.fromEntries(
      Object.entries(identityGate).map(([key, passed]) => [key, passed ? 'PASS' : 'FAIL']),
    ),
    matter_app_bridge: {
      configured: bridge.configured === true,
      checked: bridge.checked === true,
      http_status_class: bridge.http_status_class ?? null,
      bridge_ready: bridge.bridge_ready === true,
      client_upsert_supported: bridge.client_upsert_supported === true,
      matter_upsert_supported: bridge.matter_upsert_supported === true,
      source_mode_hash: bridge.source_mode_hash ?? null,
      source_revision_hash: bridge.source_revision_hash ?? null,
      blockers: bridge.blockers,
    },
    acceptance_gate: Object.fromEntries(
      Object.entries(acceptanceGate).map(([key, passed]) => [key, passed ? 'PASS' : 'FAIL']),
    ),
    blockers: [...new Set(blockers)],
    not_executed: NOT_EXECUTED,
    sanitization:
      'Receipt contains counts, hashes, booleans, status classes, sanitized detail filename, and blocker codes only; no raw path, customer document body, OCR/text excerpt, screenshot, storage reference, credential value, raw UUID, Matter Code, matter name, or client label is persisted.',
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
      'usage: node tools/migration/matter-app-identity-preflight.mjs --tenant-id <uuid> [--sanitized-out <out.json>] [--details <details.local.ndjson.gz>]',
    );
    process.exit(0);
  }
  const db = new Client({ connectionString: args.databaseUrl });
  await db.connect();
  try {
    const tenantResolution = await resolveTenantId(db, args.tenantId);
    const emptySnapshot = {
      counts: {
        clients: 0,
        matters: 0,
        matters_with_client: 0,
        matters_without_client: 0,
        active_documents: 0,
        docs_with_matter: 0,
        docs_without_matter: 0,
        document_matter_count: 0,
        matter_code_duplicate_rows: 0,
        client_ambiguous_rows: 0,
        unsupported_matter_type_rows: 0,
        archive_only_rows: 0,
        matter_app_client_refs: 0,
        matter_app_matter_refs: 0,
        matter_app_source_revisions: 0,
        blocked_identity_rows: 0,
      },
      details: [],
    };
    const snapshot = tenantResolution.tenantId
      ? await loadIdentitySnapshot(db, tenantResolution.tenantId)
      : emptySnapshot;
    const bridge = await checkMatterAppBridge(args);
    const receipt = buildReceipt({ args, tenantResolution, snapshot, bridge });
    await writeNdjsonGz(args.details, snapshot.details);
    await writeJson(args.sanitizedOut, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status !== 'pass') process.exitCode = 1;
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
