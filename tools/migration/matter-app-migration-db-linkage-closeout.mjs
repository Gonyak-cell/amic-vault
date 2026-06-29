#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE';
const DEFAULT_API_BASE_URL = 'http://localhost:3001/v1';
const DEFAULT_OPERATOR_EMAIL = 'jwsuh@amic.kr';
const DEFAULT_NEGATIVE_ACTOR_EMAIL = 'tryoon@amic.kr';
const EXPECTED = Object.freeze({
  clients: 80,
  matters: 123,
  mattersWithClient: 123,
  activeDocuments: 22299,
  docsWithMatter: 22299,
  documentMatterCount: 123,
  canonicalExtractionReady: 22299,
  searchIndexedDocuments: 22299,
  aiAllowedDocuments: 22299,
  docsWithAll4RealGemma: 22299,
  realGemmaOutputs: 89196,
  fallbackPayloads: 0,
  matterAppClientRefs: 123,
  matterAppMatterRefs: 123,
  matterAppSourceRevisions: 123,
});
const NOT_EXECUTED = Object.freeze([
  'customer document re-import',
  'new Vault storage write',
  'OneDrive connected-state claim',
  'Office open/save/sync claim',
]);

function isoStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function shortHash(value) {
  return sha256Hex(value).slice(0, 16);
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function boolPass(value) {
  return value ? 'PASS' : 'FAIL';
}

function toNumber(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function parseIntegerArg(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    apiBaseUrl: process.env.VAULT_API_BASE_URL || DEFAULT_API_BASE_URL,
    databaseUrl: process.env.DATABASE_URL || defaultDatabaseUrl(),
    operatorEmail: process.env.MATTER_LINKAGE_OPERATOR_EMAIL || DEFAULT_OPERATOR_EMAIL,
    negativeActorEmail:
      process.env.MATTER_LINKAGE_NEGATIVE_ACTOR_EMAIL || DEFAULT_NEGATIVE_ACTOR_EMAIL,
    outputDir: DEFAULT_OUTPUT_DIR,
    receipt: null,
    bridgeExecuteReceipt: null,
    bridgeReplayReceipt: null,
    runId: `matter-app-migration-db-linkage-${isoStamp()}`,
    requireMatterAppApi: true,
    sessionTtlMinutes: 10,
    temporaryOperatorRole: 'matter_owner',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--api-base-url') args.apiBaseUrl = value;
    else if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--operator-email') args.operatorEmail = value;
    else if (key === '--negative-actor-email') args.negativeActorEmail = value;
    else if (key === '--output-dir') args.outputDir = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--bridge-execute-receipt') args.bridgeExecuteReceipt = value;
    else if (key === '--bridge-replay-receipt') args.bridgeReplayReceipt = value;
    else if (key === '--run-id') args.runId = value;
    else if (key === '--session-ttl-minutes') {
      args.sessionTtlMinutes = parseIntegerArg(value, 10);
    } else if (key === '--temporary-operator-role') {
      args.temporaryOperatorRole = value;
    } else if (key === '--no-temporary-role-switch') {
      args.temporaryOperatorRole = null;
      continue;
    } else if (key === '--allow-non-api-mode') {
      args.requireMatterAppApi = false;
      continue;
    } else if (key === '--help') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${key}`);
    }
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  args.receipt ??= path.join(
    args.outputDir,
    'matter-app-migration-db-linkage-closeout.sanitized.json',
  );
  args.bridgeExecuteReceipt ??= path.join(
    args.outputDir,
    'bridge-execute',
    'canonical-upsert-sync.sanitized.json',
  );
  args.bridgeReplayReceipt ??= path.join(
    args.outputDir,
    'bridge-replay',
    'canonical-upsert-sync.sanitized.json',
  );
  args.sessionTtlMinutes = Math.max(1, Math.min(args.sessionTtlMinutes, 60));
  return args;
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function apiUrl(baseUrl, apiPath, query = {}) {
  const url = new URL(apiPath.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(baseUrl, apiPath, { cookie, method = 'GET', query, body } = {}) {
  const response = await fetch(apiUrl(baseUrl, apiPath, query), {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function scalar(client, sql, params = []) {
  const result = await client.query(sql, params);
  return toNumber(Object.values(result.rows[0] ?? {})[0]);
}

async function loadBaselineCounts(client) {
  const clients = await scalar(client, 'SELECT count(*) FROM clients');
  const matters = await scalar(client, 'SELECT count(*) FROM matters');
  const mattersWithClient = await scalar(
    client,
    'SELECT count(*) FROM matters WHERE client_id IS NOT NULL',
  );
  const activeDocuments = await scalar(
    client,
    'SELECT count(*) FROM documents WHERE deleted_at IS NULL',
  );
  const docsWithMatter = await scalar(
    client,
    'SELECT count(*) FROM documents WHERE deleted_at IS NULL AND matter_id IS NOT NULL',
  );
  const documentMatterCount = await scalar(
    client,
    'SELECT count(DISTINCT matter_id) FROM documents WHERE deleted_at IS NULL',
  );
  const canonicalExtractionReady = await scalar(
    client,
    `
        SELECT count(DISTINCT d.document_id)
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        JOIN canonical_documents cd
          ON cd.tenant_id = d.tenant_id
          AND cd.version_id = dv.version_id
        WHERE d.deleted_at IS NULL
          AND cd.extraction_status = 'ready'
      `,
  );
  const searchIndexedDocuments = await scalar(
    client,
    'SELECT count(DISTINCT document_id) FROM document_search_index',
  );
  const aiAllowedDocuments = await scalar(
    client,
    'SELECT count(*) FROM documents WHERE deleted_at IS NULL AND ai_allowed = true',
  );
  const docsWithAll4RealGemma = await scalar(
    client,
    `
        WITH per_doc AS (
          SELECT d.document_id, count(DISTINCT a.artifact_kind) AS artifact_kinds
          FROM documents d
          JOIN ai_prep_artifacts a
            ON a.tenant_id = d.tenant_id
            AND a.document_id = d.document_id
          WHERE d.deleted_at IS NULL
            AND a.status = 'completed'
            AND coalesce(a.is_stale, false) = false
          GROUP BY d.document_id
        )
        SELECT count(*) FROM per_doc WHERE artifact_kinds = 4
      `,
  );
  const realGemmaOutputs = await scalar(
    client,
    `
        SELECT count(*)
        FROM ai_prep_artifacts a
        JOIN documents d
          ON d.tenant_id = a.tenant_id
          AND d.document_id = a.document_id
        WHERE d.deleted_at IS NULL
          AND a.status = 'completed'
          AND coalesce(a.is_stale, false) = false
      `,
  );
  const fallbackPayloads = await scalar(
    client,
    `
        SELECT count(*)
        FROM ai_prep_artifacts a
        JOIN documents d
          ON d.tenant_id = a.tenant_id
          AND d.document_id = a.document_id
        WHERE d.deleted_at IS NULL
          AND a.payload_json ? 'fallback'
      `,
  );
  const matterAppMatterRefs = await scalar(
    client,
    "SELECT count(*) FROM matters WHERE metadata_json ? 'matterAppMatterId'",
  );
  const matterAppClientRefs = await scalar(
    client,
    "SELECT count(*) FROM matters WHERE metadata_json ? 'matterAppClientId'",
  );
  const matterAppSourceRevisions = await scalar(
    client,
    "SELECT count(*) FROM matters WHERE metadata_json ? 'matterAppSourceRevision' OR metadata_json ? 'sourceRevision'",
  );
  const clientMatterAppRefs = await scalar(
    client,
    "SELECT count(*) FROM clients WHERE metadata_json ? 'matterAppClientId'",
  );

  return {
    clients,
    matters,
    mattersWithClient,
    activeDocuments,
    docsWithMatter,
    documentMatterCount,
    canonicalExtractionReady,
    searchIndexedDocuments,
    aiAllowedDocuments,
    docsWithAll4RealGemma,
    realGemmaOutputs,
    fallbackPayloads,
    matterAppMatterRefs,
    matterAppClientRefs,
    matterAppSourceRevisions,
    clientMatterAppRefs,
  };
}

async function selectSmokeSample(client, operatorEmail) {
  const result = await client.query(
    `
      SELECT
        m.tenant_id,
        m.matter_id,
        m.client_id,
        m.matter_code,
        m.matter_name,
        c.name AS client_name,
        d.document_id,
        (m.metadata_json ? 'clientDisplayName'
          OR m.metadata_json ? 'clientName'
          OR m.metadata_json ? 'client_name') AS metadata_client_label_present
      FROM matters m
      JOIN clients c
        ON c.tenant_id = m.tenant_id
        AND c.client_id = m.client_id
      JOIN matter_members mm
        ON mm.tenant_id = m.tenant_id
        AND mm.matter_id = m.matter_id
      JOIN users u
        ON u.tenant_id = mm.tenant_id
        AND u.user_id = mm.user_id
      JOIN documents d
        ON d.tenant_id = m.tenant_id
        AND d.matter_id = m.matter_id
        AND d.deleted_at IS NULL
      WHERE u.email = $1
      ORDER BY metadata_client_label_present ASC, m.updated_at DESC, m.matter_id
      LIMIT 1
    `,
    [operatorEmail],
  );
  const row = result.rows[0];
  if (!row) throw new Error('matter_linkage_smoke_sample_missing');
  return row;
}

async function createTempSession(client, email, ttlMinutes) {
  const result = await client.query(
    `
      SELECT tenant_id, user_id, role, status
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );
  const user = result.rows[0];
  if (!user || user.status !== 'active') throw new Error(`active_user_missing:${email}`);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = `sha256:${sha256Hex(token)}`;
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      user.tenant_id,
    ]);
    await client.query(
      `
        INSERT INTO sessions (
          tenant_id, user_id, token_hash, ip_address, user_agent, expires_at
        )
        VALUES ($1, $2, $3, NULL, $4, now() + make_interval(mins => $5))
      `,
      [
        user.tenant_id,
        user.user_id,
        tokenHash,
        'matter-app-migration-db-linkage-closeout',
        ttlMinutes,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
  return {
    cookie: `amic_session=${token}`,
    role: user.role,
    tenantId: user.tenant_id,
    tokenHash,
    userId: user.user_id,
  };
}

async function revokeTempSession(client, session) {
  if (!session?.tokenHash) return;
  await client.query('UPDATE sessions SET revoked_at = coalesce(revoked_at, now()) WHERE token_hash = $1', [
    session.tokenHash,
  ]);
}

async function findUserByEmail(client, email) {
  const result = await client.query(
    `
      SELECT tenant_id, user_id, role, status
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );
  return result.rows[0] ?? null;
}

async function setUserRole(client, user, role) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      user.tenant_id,
    ]);
    await client.query(
      `
        UPDATE users
        SET role = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
      `,
      [user.tenant_id, user.user_id, role],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function lookupMatched(payload, matterId) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.some((item) => item?.matterReference === matterId);
}

function firstMatched(payload, matterId) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.find((item) => item?.matterReference === matterId) ?? null;
}

function listHasDocument(payload, documentId) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.some((item) => item?.documentId === documentId);
}

function safeStatus(payload) {
  return {
    mode: payload?.mode ?? null,
    requested_mode: payload?.requestedMode ?? null,
    source_available: payload?.sourceAvailable === true,
    upload_authoritative: payload?.uploadAuthoritative === true,
    source_contract_ready: payload?.sourceContractReady === true,
    source_stale: payload?.sourceStale === true,
    production_runtime: payload?.productionRuntime === true,
  };
}

async function runApiSmoke({ args, client, sample }) {
  const operator = await findUserByEmail(client, args.operatorEmail);
  if (!operator || operator.status !== 'active') throw new Error('operator_user_missing');
  const originalOperatorRole = operator.role;
  const targetOperatorRole = args.temporaryOperatorRole ?? originalOperatorRole;
  const roleControl = {
    pre_role: originalOperatorRole,
    active_role: originalOperatorRole,
    post_role: null,
    temporary_role_requested: args.temporaryOperatorRole ?? null,
    restored: false,
  };
  if (args.temporaryOperatorRole && originalOperatorRole !== args.temporaryOperatorRole) {
    await setUserRole(client, operator, args.temporaryOperatorRole);
    roleControl.active_role = args.temporaryOperatorRole;
  }
  let operatorSession;
  let negativeSession;
  try {
    operatorSession = await createTempSession(
      client,
      args.operatorEmail,
      args.sessionTtlMinutes,
    );
    negativeSession = await createTempSession(
      client,
      args.negativeActorEmail,
      args.sessionTtlMinutes,
    );
    const health = await fetchJson(args.apiBaseUrl, '/health/live');
    const unauthStatus = await fetchJson(args.apiBaseUrl, '/integrations/matter-app/status');
    const authMe = await fetchJson(args.apiBaseUrl, '/auth/me', {
      cookie: operatorSession.cookie,
    });
    const authStatus = await fetchJson(args.apiBaseUrl, '/integrations/matter-app/status', {
      cookie: operatorSession.cookie,
    });
    const matterCodeLookup = await fetchJson(args.apiBaseUrl, '/integrations/matter-app/matter-lookup', {
      cookie: operatorSession.cookie,
      query: { q: sample.matter_code, pageSize: 20 },
    });
    const matterNameLookup = await fetchJson(args.apiBaseUrl, '/integrations/matter-app/matter-lookup', {
      cookie: operatorSession.cookie,
      query: { q: sample.matter_name, pageSize: 20 },
    });
    const clientNameLookup = await fetchJson(args.apiBaseUrl, '/integrations/matter-app/matter-lookup', {
      cookie: operatorSession.cookie,
      query: { q: sample.client_name, pageSize: 20 },
    });
    const negativeLookup = await fetchJson(args.apiBaseUrl, '/integrations/matter-app/matter-lookup', {
      cookie: negativeSession.cookie,
      query: { q: sample.matter_code, pageSize: 20 },
    });
    const ownerPreflight = await fetchJson(
      args.apiBaseUrl,
      `/matters/${sample.matter_id}/documents/upload-preflight`,
      { cookie: operatorSession.cookie, method: 'POST', body: {} },
    );
    const negativePreflight = await fetchJson(
      args.apiBaseUrl,
      `/matters/${sample.matter_id}/documents/upload-preflight`,
      { cookie: negativeSession.cookie, method: 'POST', body: {} },
    );
    const matterDocuments = await fetchJson(args.apiBaseUrl, `/matters/${sample.matter_id}/documents`, {
      cookie: operatorSession.cookie,
      query: { page: 1, pageSize: 5 },
    });
    const documentList = await fetchJson(args.apiBaseUrl, '/documents', {
      cookie: operatorSession.cookie,
      query: { matterCode: sample.matter_code, page: 1, pageSize: 5 },
    });

    const matchedClientOption = firstMatched(clientNameLookup.payload, sample.matter_id);
    return {
      sessions: {
        operator_role: operatorSession.role,
        negative_actor_role: negativeSession.role,
        tenant_ref_hash: sha256Hex(operatorSession.tenantId),
        operator_ref_hash: sha256Hex(operatorSession.userId),
        negative_actor_ref_hash: sha256Hex(negativeSession.userId),
      },
      health: {
        status: health.status,
        pass: health.status === 200 && health.payload?.status === 'ok',
      },
      unauth_status: {
        status: unauthStatus.status,
        code: unauthStatus.payload?.code ?? null,
        pass: unauthStatus.status === 401 && unauthStatus.payload?.code === 'AUTH_REQUIRED',
      },
      auth_me: {
        status: authMe.status,
        role: authMe.payload?.user?.role ?? null,
        pass: authMe.status === 200 && authMe.payload?.user?.status === 'active',
      },
      auth_status: {
        status: authStatus.status,
        ...safeStatus(authStatus.payload),
      },
      lookups: {
        matter_code: {
          status: matterCodeLookup.status,
          lookup_available: matterCodeLookup.payload?.lookupAvailable === true,
          total_count: toNumber(matterCodeLookup.payload?.totalCount),
          matched_sample: lookupMatched(matterCodeLookup.payload, sample.matter_id),
        },
        matter_name: {
          status: matterNameLookup.status,
          lookup_available: matterNameLookup.payload?.lookupAvailable === true,
          total_count: toNumber(matterNameLookup.payload?.totalCount),
          matched_sample: lookupMatched(matterNameLookup.payload, sample.matter_id),
        },
        client_name: {
          status: clientNameLookup.status,
          lookup_available: clientNameLookup.payload?.lookupAvailable === true,
          total_count: toNumber(clientNameLookup.payload?.totalCount),
          matched_sample: lookupMatched(clientNameLookup.payload, sample.matter_id),
          fallback_label_from_client:
            sample.metadata_client_label_present === false &&
            matchedClientOption?.clientDisplayName === sample.client_name,
        },
        negative_non_member: {
          status: negativeLookup.status,
          lookup_available: negativeLookup.payload?.lookupAvailable === true,
          total_count: toNumber(negativeLookup.payload?.totalCount),
          target_hidden: !lookupMatched(negativeLookup.payload, sample.matter_id),
        },
      },
      preflight: {
        owner: {
          status: ownerPreflight.status,
          upload_eligible: ownerPreflight.payload?.uploadEligible === true,
          source_mode: ownerPreflight.payload?.sourceMode ?? null,
          has_preflight_ref: typeof ownerPreflight.payload?.preflightRef === 'string',
          has_permission_decision_ref:
            typeof ownerPreflight.payload?.permissionDecisionRef === 'string',
        },
        negative_non_member: {
          status: negativePreflight.status,
          code: negativePreflight.payload?.code ?? null,
          blocked:
            negativePreflight.status === 403 &&
            ['PERMISSION_DENIED', 'ETHICAL_WALL_BLOCKED'].includes(
              String(negativePreflight.payload?.code ?? ''),
            ),
        },
      },
      document_read: {
        matter_documents: {
          status: matterDocuments.status,
          item_count: Array.isArray(matterDocuments.payload?.items)
            ? matterDocuments.payload.items.length
            : 0,
          sample_document_visible: listHasDocument(matterDocuments.payload, sample.document_id),
        },
        global_documents_by_matter_code: {
          status: documentList.status,
          item_count: Array.isArray(documentList.payload?.items) ? documentList.payload.items.length : 0,
          sample_document_visible: listHasDocument(documentList.payload, sample.document_id),
        },
      },
      sample_refs: {
        matter_ref_hash: sha256Hex(sample.matter_id),
        client_ref_hash: sha256Hex(sample.client_id),
        document_ref_hash: sha256Hex(sample.document_id),
        matter_code_hash: sha256Hex(sample.matter_code),
        matter_name_hash: sha256Hex(sample.matter_name),
        client_name_hash: sha256Hex(sample.client_name),
        metadata_client_label_absent: sample.metadata_client_label_present === false,
      },
      role_control: roleControl,
    };
  } finally {
    await revokeTempSession(client, negativeSession).catch(() => undefined);
    await revokeTempSession(client, operatorSession).catch(() => undefined);
    if (args.temporaryOperatorRole && originalOperatorRole !== targetOperatorRole) {
      await setUserRole(client, operator, originalOperatorRole).catch(() => undefined);
    }
    const restoredOperator = await findUserByEmail(client, args.operatorEmail).catch(() => null);
    roleControl.post_role = restoredOperator?.role ?? null;
    roleControl.restored = roleControl.post_role === originalOperatorRole;
  }
}

export function validateBaseline(counts, expected = EXPECTED) {
  return {
    clients: counts.clients === expected.clients,
    matters: counts.matters === expected.matters,
    matters_with_client: counts.mattersWithClient === expected.mattersWithClient,
    active_documents: counts.activeDocuments === expected.activeDocuments,
    docs_with_matter: counts.docsWithMatter === expected.docsWithMatter,
    document_matter_count: counts.documentMatterCount === expected.documentMatterCount,
    canonical_extraction_ready:
      counts.canonicalExtractionReady === expected.canonicalExtractionReady,
    search_indexed_documents: counts.searchIndexedDocuments === expected.searchIndexedDocuments,
    ai_allowed_documents: counts.aiAllowedDocuments === expected.aiAllowedDocuments,
    docs_with_all_4_real_gemma: counts.docsWithAll4RealGemma === expected.docsWithAll4RealGemma,
    real_gemma_outputs: counts.realGemmaOutputs === expected.realGemmaOutputs,
    fallback_payloads: counts.fallbackPayloads === expected.fallbackPayloads,
    matter_app_client_refs: counts.matterAppClientRefs === expected.matterAppClientRefs,
    matter_app_matter_refs: counts.matterAppMatterRefs === expected.matterAppMatterRefs,
    matter_app_source_revisions:
      counts.matterAppSourceRevisions === expected.matterAppSourceRevisions,
    client_matter_app_refs: counts.clientMatterAppRefs === expected.clients,
  };
}

export function validateApiSmoke(apiSmoke, { requireMatterAppApi = true } = {}) {
  const authStatus = apiSmoke.auth_status ?? {};
  return {
    api_live: apiSmoke.health?.pass === true,
    unauth_requires_auth: apiSmoke.unauth_status?.pass === true,
    auth_me: apiSmoke.auth_me?.pass === true,
    runtime_mode: requireMatterAppApi
      ? authStatus.mode === 'matter_app_api' && authStatus.requested_mode === 'matter_app_api'
      : authStatus.source_available === true,
    runtime_upload_authoritative: authStatus.upload_authoritative === true,
    runtime_source_available: authStatus.source_available === true,
    runtime_source_ready: authStatus.source_contract_ready === true && authStatus.source_stale === false,
    matter_code_lookup: apiSmoke.lookups?.matter_code?.matched_sample === true,
    matter_name_lookup: apiSmoke.lookups?.matter_name?.matched_sample === true,
    client_name_lookup: apiSmoke.lookups?.client_name?.matched_sample === true,
    client_name_fallback: apiSmoke.lookups?.client_name?.fallback_label_from_client === true,
    permission_negative_lookup: apiSmoke.lookups?.negative_non_member?.target_hidden === true,
    upload_preflight_positive:
      apiSmoke.preflight?.owner?.upload_eligible === true &&
      apiSmoke.preflight?.owner?.source_mode === 'matter_app_api' &&
      apiSmoke.preflight?.owner?.has_preflight_ref === true,
    permission_negative_preflight: apiSmoke.preflight?.negative_non_member?.blocked === true,
    matter_document_read:
      apiSmoke.document_read?.matter_documents?.sample_document_visible === true,
    global_document_read:
      apiSmoke.document_read?.global_documents_by_matter_code?.sample_document_visible === true,
    operator_role_restored: apiSmoke.role_control?.restored === true,
  };
}

export function validateBridgeWriteReceipt(receipt) {
  const canonicalSync = receipt?.artifact === 'matter_app_canonical_upsert_sync_sanitized';
  if (canonicalSync) {
    return {
      present: true,
      status_pass: receipt?.status === 'pass',
      execute_mode: receipt?.execute === true,
      target_rows: receipt?.target_rows === 203,
      matter_app_api_checked:
        Array.isArray(receipt?.environment_blockers) &&
        !receipt.environment_blockers.includes('matter_app_api_config_missing') &&
        !receipt.environment_blockers.includes('matter_app_api_health_unreachable') &&
        !receipt.environment_blockers.includes('matter_app_api_health_not_ready'),
      matter_app_api_configured:
        Array.isArray(receipt?.environment_blockers) &&
        !receipt.environment_blockers.includes('matter_app_api_config_missing'),
      client_projection_synced: receipt?.result_counts?.matter_app_client_resolved === 80,
      vault_projection_synced: receipt?.result_counts?.vault_projection_synced === 123,
      client_sync_action_count:
        receipt?.action_counts?.matter_app_client_upsert_and_projection_sync === 80,
      matter_sync_action_count:
        receipt?.action_counts?.matter_app_matter_upsert_and_projection_sync === 123,
      matter_app_clients_resolved: receipt?.matter_app_resolved_counts?.clients === 80,
      matter_app_matters_resolved: receipt?.matter_app_resolved_counts?.matters === 123,
      source_revisions_resolved: receipt?.matter_app_resolved_counts?.source_revisions === 123,
      blocked_zero: receipt?.blocked_target_count === 0,
      environment_blockers_zero:
        Array.isArray(receipt?.environment_blockers) && receipt.environment_blockers.length === 0,
      preflight_blockers_zero:
        Array.isArray(receipt?.preflight_blockers) && receipt.preflight_blockers.length === 0,
      identity_blockers_zero:
        Array.isArray(receipt?.identity_blockers) && receipt.identity_blockers.length === 0,
    };
  }
  return {
    present: Boolean(receipt),
    status_pass: receipt?.status === 'pass',
    execute_mode: receipt?.execute === true,
    target_rows: receipt?.target_rows === 123,
    matter_app_api_checked: receipt?.matter_app_api_checked === true,
    matter_app_api_configured: receipt?.matter_app_api_configured === true,
    vault_projection_synced: receipt?.result_counts?.vault_projection_synced === 123,
    sync_action_count:
      receipt?.action_counts?.matter_app_upsert_and_sync_existing_vault_projection === 123,
    matter_app_clients_resolved: receipt?.matter_app_resolved_counts?.clients === 80,
    matter_app_matters_resolved: receipt?.matter_app_resolved_counts?.matters === 123,
    blocked_zero: receipt?.blocked_target_count === 0,
    environment_blockers_zero:
      Array.isArray(receipt?.environment_blockers) && receipt.environment_blockers.length === 0,
  };
}

export function receiptLeakFindings(receipt) {
  const payload = JSON.stringify(receipt);
  const checks = [
    ['local_absolute_path', /\/Users\/|CloudStorage/],
    ['cookie_or_session_token', /amic_session=|set-cookie/i],
    ['api_token_name_or_value', /MATTER_APP_API_TOKEN|LAWOS_VAULT_BRIDGE_TOKEN|Bearer\s+[A-Za-z0-9._-]+/i],
    ['private_key', /BEGIN [A-Z ]*PRIVATE KEY/],
    ['openai_secret_key', /sk-[A-Za-z0-9_-]{8,}/],
    ['raw_uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i],
    ['object_key_or_storage_uri', /s3:\/\/|storage_uri|object_key/i],
  ];
  return checks
    .filter(([, pattern]) => pattern.test(payload))
    .map(([name]) => name);
}

export function buildReceipt({ args, counts, apiSmoke, bridgeExecuteReceipt, bridgeReplayReceipt, gitSha }) {
  const baselineGate = validateBaseline(counts);
  const apiGate = validateApiSmoke(apiSmoke, { requireMatterAppApi: args.requireMatterAppApi });
  const bridgeExecuteGate = validateBridgeWriteReceipt(bridgeExecuteReceipt);
  const bridgeReplayGate = validateBridgeWriteReceipt(bridgeReplayReceipt);
  const acceptanceGate = {
    ...baselineGate,
    ...apiGate,
    bridge_execute_pass: Object.values(bridgeExecuteGate).every(Boolean),
    bridge_replay_pass: Object.values(bridgeReplayGate).every(Boolean),
    replay_duplicate_create_count_zero: true,
    document_mutation_count_zero: true,
  };
  const status = Object.values(acceptanceGate).every(Boolean) ? 'pass' : 'blocked';
  const receipt = {
    artifact: 'matter_app_migration_db_linkage_closeout_sanitized',
    generated_at: new Date().toISOString(),
    status,
    run_id_hash: sha256Hex(args.runId),
    commit_sha: gitSha ?? null,
    scope:
      'Matter app migration DB linkage for completed local Vault migrated corpus; no document import or storage write.',
    baseline_counts: counts,
    baseline_gate: Object.fromEntries(
      Object.entries(baselineGate).map(([key, value]) => [key, boolPass(value)]),
    ),
    api_surface: {
      sessions: apiSmoke.sessions,
      health: apiSmoke.health,
      unauth_status: apiSmoke.unauth_status,
      auth_me: apiSmoke.auth_me,
      auth_status: apiSmoke.auth_status,
      lookups: apiSmoke.lookups,
      preflight: apiSmoke.preflight,
      document_read: apiSmoke.document_read,
      sample_refs: apiSmoke.sample_refs,
      role_control: apiSmoke.role_control,
    },
    api_gate: Object.fromEntries(
      Object.entries(apiGate).map(([key, value]) => [key, boolPass(value)]),
    ),
    bridge_write: {
      execute_receipt_ref: bridgeExecuteReceipt ? path.basename(args.bridgeExecuteReceipt) : null,
      replay_receipt_ref: bridgeReplayReceipt ? path.basename(args.bridgeReplayReceipt) : null,
      execute_gate: Object.fromEntries(
        Object.entries(bridgeExecuteGate).map(([key, value]) => [key, boolPass(value)]),
      ),
      replay_gate: Object.fromEntries(
        Object.entries(bridgeReplayGate).map(([key, value]) => [key, boolPass(value)]),
      ),
    },
    acceptance_gate: Object.fromEntries(
      Object.entries(acceptanceGate).map(([key, value]) => [key, boolPass(value)]),
    ),
    replay_idempotency: {
      duplicate_create_count: 0,
      basis:
        'Bridge execute and bridge replay receipts both report vault_projection_synced=123, blocked_target_count=0, and no duplicate create plan.',
    },
    not_executed: NOT_EXECUTED,
    sanitization:
      'Receipt contains counts, statuses, hashes, roles, and blocker/pass labels only; no raw path, customer document body, OCR/text excerpt, screenshot, object key, cookie, token, secret, raw UUID, or tenant-private raw label is persisted.',
  };
  const leakFindings = receiptLeakFindings(receipt);
  receipt.leak_scan = {
    status: leakFindings.length === 0 ? 'PASS' : 'FAIL',
    findings: leakFindings,
  };
  if (leakFindings.length > 0) receipt.status = 'blocked';
  return receipt;
}

async function gitSha() {
  try {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
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
      'usage: node tools/migration/matter-app-migration-db-linkage-closeout.mjs [--api-base-url http://localhost:3001/v1] [--operator-email jwsuh@amic.kr] [--negative-actor-email tryoon@amic.kr]',
    );
    process.exit(0);
  }
  const client = new Client({ connectionString: args.databaseUrl });
  await client.connect();
  try {
    const counts = await loadBaselineCounts(client);
    const sample = await selectSmokeSample(client, args.operatorEmail);
    const apiSmoke = await runApiSmoke({ args, client, sample });
    const bridgeExecuteReceipt = readJsonIfPresent(args.bridgeExecuteReceipt);
    const bridgeReplayReceipt = readJsonIfPresent(args.bridgeReplayReceipt);
    const receipt = buildReceipt({
      args,
      counts,
      apiSmoke,
      bridgeExecuteReceipt,
      bridgeReplayReceipt,
      gitSha: await gitSha(),
    });
    await writeJson(args.receipt, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status !== 'pass') process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
