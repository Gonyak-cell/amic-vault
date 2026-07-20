#!/usr/bin/env node
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { databaseUrl as defaultDatabaseUrl } from '../db/config.mjs';
import { receiptLeakFindings, sha256Hex } from './matter-app-identity-preflight.mjs';

export const LAWOS_SOURCE_ARTIFACT =
  '/Users/jws/Documents/Codex/Law Firm OS/docs/lazycodex/evidence/matter-desktop/artifacts/amic-matter-code-candidates-2026-07-01.json';
export const LAWOS_SOURCE_PACKAGE =
  '/Users/jws/Documents/Codex/Law Firm OS/packages/matter/src/amic-matter-code-candidates.js';
export const LAWOS_SOURCE_CONTRACT =
  '/Users/jws/Documents/Codex/Law Firm OS/contracts/matter-core-contract.json';
export const LAWOS_SOURCE_REVISION = 'amic_current_onedrive_matter_code_inventory_2026_07_01';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/LAWOS-CANONICAL-MATTER-REFLECTION';
const DEFAULT_RECEIPT = `${DEFAULT_OUTPUT_DIR}/lawos-canonical-matter-reflection.sanitized.json`;
const DEFAULT_DETAILS = `${DEFAULT_OUTPUT_DIR}/lawos-canonical-matter-reflection.local.ndjson.gz`;
const SOURCE_REF = 'lawos_lazycodex_canonical_identity';
const ALLOWED_AXES = new Set(['Advisory', 'DEAL', 'Dispute']);
const LITIGATION_AXES = new Set(['CIV', 'CRM', 'ADM']);
const VALID_MODES = new Set([
  'preflight',
  'dry-run',
  'execute',
  'replay',
  'invariant-check',
  'runtime-smoke',
  'negative-smoke',
  'rollback',
  'closeout',
]);
const NOT_IN_SCOPE = Object.freeze([
  'document import',
  'file content mutation',
  'storage object write',
  'OneDrive connected-state claim',
  'Office open/save/sync claim',
  'Gemma indexing',
  'production go-live',
]);
const EXPECTED_AXIS_COUNTS = Object.freeze({
  Advisory: 14,
  LIT: 99,
  Dispute: 7,
  DEAL: 28,
});
const DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME = 'AMIC local file organization prep';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function isoStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

function parseIntArg(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shortHash(value) {
  return sha256Hex(value).slice(0, 16);
}

function normalizeLabel(value) {
  return clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

function countBy(rows, field) {
  const output = {};
  for (const row of rows) {
    const key = clean(row[field]) || 'null';
    output[key] = (output[key] ?? 0) + 1;
  }
  return output;
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    databaseUrl: env.DATABASE_URL || defaultDatabaseUrl(),
    tenantId: null,
    operatorUserId: null,
    mode: env.LAWOS_CANONICAL_REFLECTION_MODE || 'preflight',
    sourceArtifact: env.LAWOS_CANONICAL_SOURCE_ARTIFACT || LAWOS_SOURCE_ARTIFACT,
    sourceRevision: env.LAWOS_CANONICAL_SOURCE_REVISION || LAWOS_SOURCE_REVISION,
    approvalRef: env.LAWOS_CANONICAL_REFLECTION_APPROVAL_REF || '',
    rollbackApprovalRef: env.LAWOS_CANONICAL_REFLECTION_ROLLBACK_APPROVAL_REF || '',
    runId: `lawos-canonical-matter-reflection-${isoStamp()}`,
    receipt: DEFAULT_RECEIPT,
    details: DEFAULT_DETAILS,
    executeReceipt: DEFAULT_RECEIPT,
    expectedClients: 99,
    expectedMatters: 148,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--database-url') args.databaseUrl = value;
    else if (key === '--tenant-id') args.tenantId = value;
    else if (key === '--operator-user-id') args.operatorUserId = value;
    else if (key === '--mode') args.mode = value;
    else if (key === '--source-artifact') args.sourceArtifact = value;
    else if (key === '--source-revision') args.sourceRevision = value;
    else if (key === '--approval-ref') args.approvalRef = value;
    else if (key === '--rollback-approval-ref') args.rollbackApprovalRef = value;
    else if (key === '--run-id') args.runId = value;
    else if (key === '--receipt') args.receipt = value;
    else if (key === '--details') args.details = value;
    else if (key === '--execute-receipt') args.executeReceipt = value;
    else if (key === '--expected-clients') args.expectedClients = parseIntArg(value, 99);
    else if (key === '--expected-matters') args.expectedMatters = parseIntArg(value, 148);
    else if (key === '--dry-run') {
      args.mode = 'dry-run';
      continue;
    } else if (key === '--execute') {
      args.mode = 'execute';
      continue;
    } else if (key === '--closeout') {
      args.mode = 'closeout';
      continue;
    } else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  if (!VALID_MODES.has(args.mode)) throw new Error(`invalid mode: ${args.mode}`);
  return args;
}

export function validateLawOsMatterCode(matter) {
  const matterCode = clean(matter.matter_code);
  const axis = clean(matter.matter_axis);
  const litigationAxis = clean(matter.matter_litigation_axis);
  const detail = clean(matter.matter_detail_type_korean);
  const blockers = [];
  if (!matterCode) blockers.push('matter_code_missing');
  if (matterCode.length > 120) blockers.push('matter_code_over_120');
  const parts = matterCode.split('/');
  if (parts.some((part) => clean(part) === '')) blockers.push('matter_code_empty_segment');
  if (parts.length === 3) {
    if (!ALLOWED_AXES.has(parts[1])) blockers.push('matter_code_axis_not_source_format');
    if (parts[1] === 'LIT') blockers.push('lit_matter_code_requires_litigation_axis');
    if (parts[1] === 'ADV') blockers.push('adv_alias_not_source_format');
    if (parts[1] !== axis) blockers.push('matter_axis_field_mismatch');
    if (litigationAxis) blockers.push('non_lit_litigation_axis_present');
  } else if (parts.length === 4) {
    if (parts[1] !== 'LIT') blockers.push('four_segment_matter_code_requires_lit_axis');
    if (!LITIGATION_AXES.has(parts[2])) blockers.push('litigation_axis_not_source_format');
    if (axis !== 'LIT') blockers.push('matter_axis_field_mismatch');
    if (parts[2] !== litigationAxis) blockers.push('litigation_axis_field_mismatch');
  } else {
    blockers.push('matter_code_segment_count_invalid');
  }
  if (parts.at(-1) !== detail) blockers.push('matter_detail_field_mismatch');
  return {
    ok: blockers.length === 0,
    format: parts.length === 4 ? 'litigation_four_segment' : 'three_segment',
    blockers: [...new Set(blockers)],
  };
}

export function matterTypeToVault(matter) {
  const axis = clean(matter.matter_axis);
  const litigationAxis = clean(matter.matter_litigation_axis);
  if (axis === 'Advisory') return 'advisory';
  if (axis === 'DEAL') return 'ma';
  if (axis === 'Dispute') return 'litigation';
  if (axis === 'LIT' && litigationAxis === 'CRM') return 'investigation';
  if (axis === 'LIT') return 'litigation';
  return 'other';
}

function matterStatusToVault(status) {
  const value = clean(status);
  if (value === 'open') return 'open';
  return 'proposed';
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

export function buildReflectionManifest({ source, sourceArtifactHash, args }) {
  const blockers = [];
  if (!source || typeof source !== 'object') blockers.push('source_artifact_invalid');
  const clients = Array.isArray(source?.clients) ? source.clients : [];
  const matters = Array.isArray(source?.matters) ? source.matters : [];
  if (clean(source?.source_revision) !== args.sourceRevision) {
    blockers.push('source_revision_mismatch');
  }
  if (source?.client_count !== args.expectedClients || clients.length !== args.expectedClients) {
    blockers.push('source_client_count_mismatch');
  }
  if (source?.matter_count !== args.expectedMatters || matters.length !== args.expectedMatters) {
    blockers.push('source_matter_count_mismatch');
  }
  for (const [axis, expected] of Object.entries(EXPECTED_AXIS_COUNTS)) {
    if (source?.axis_counts?.[axis] !== expected) blockers.push(`source_axis_${axis}_count_mismatch`);
  }

  const clientIds = new Set(clients.map((client) => clean(client.client_id)));
  const duplicateClientIds = duplicateValues(clients.map((client) => clean(client.client_id)));
  const duplicateClientShortNames = duplicateValues(
    clients.map((client) => normalizeLabel(client.client_short_name)),
  );
  const duplicateMatterIds = duplicateValues(matters.map((matter) => clean(matter.matter_id)));
  const duplicateMatterCodes = duplicateValues(matters.map((matter) => normalizeLabel(matter.matter_code)));
  if (duplicateClientIds.length > 0) blockers.push('source_client_id_duplicate');
  if (duplicateClientShortNames.length > 0) blockers.push('source_client_short_name_duplicate');
  if (duplicateMatterIds.length > 0) blockers.push('source_matter_id_duplicate');
  if (duplicateMatterCodes.length > 0) blockers.push('source_matter_code_duplicate');

  const clientRows = clients.map((client) => ({
    sourceClientId: clean(client.client_id),
    clientDisplayName: clean(client.client_display_name ?? client.canonical_display_name),
    clientShortName: clean(client.client_short_name),
    sourceRevision: clean(client.source_revision),
    clientRefHash: sha256Hex(clean(client.client_id)),
    clientNameHash: sha256Hex(clean(client.client_display_name ?? client.client_short_name)),
    clientShortNameHash: sha256Hex(clean(client.client_short_name)),
    sourceLaneHashes: Array.isArray(client.source_lanes)
      ? client.source_lanes.map((lane) => sha256Hex(lane))
      : [],
  }));

  const matterRows = matters.map((matter) => {
    const format = validateLawOsMatterCode(matter);
    if (!clientIds.has(clean(matter.client_id))) blockers.push('source_matter_client_missing');
    if (clean(matter.source_revision) !== args.sourceRevision) {
      blockers.push('source_matter_revision_mismatch');
    }
    if (matter.review_required === true) blockers.push('source_review_required_present');
    if (!format.ok) blockers.push('source_matter_code_format_invalid');
    return {
      sourceMatterId: clean(matter.matter_id),
      sourceClientId: clean(matter.client_id),
      clientDisplayName: clean(matter.client_display_name),
      clientShortName: clean(matter.client_short_name),
      matterCode: clean(matter.matter_code),
      matterName: clean(matter.matter_name ?? matter.title ?? matter.matter_code),
      matterNumber: clean(matter.matter_number),
      matterAxis: clean(matter.matter_axis),
      matterLitigationAxis: clean(matter.matter_litigation_axis) || null,
      matterTypeEnglish: clean(matter.matter_type_english),
      matterDetailTypeKorean: clean(matter.matter_detail_type_korean),
      status: clean(matter.status),
      vaultMatterType: matterTypeToVault(matter),
      vaultStatus: matterStatusToVault(matter.status),
      sourceLaneHash: matter.source_lane ? sha256Hex(matter.source_lane) : null,
      sourceRefHash: matter.source_ref ? sha256Hex(matter.source_ref) : null,
      clientCaseRoleHash: matter.client_case_role ? sha256Hex(matter.client_case_role) : null,
      clientCaseRoleConfidence: clean(matter.client_case_role_confidence) || null,
      confidence: clean(matter.confidence) || null,
      sourceRevision: clean(matter.source_revision),
      matterCodeHash: sha256Hex(clean(matter.matter_code)),
      matterNameHash: sha256Hex(clean(matter.matter_name ?? matter.title ?? matter.matter_code)),
      format,
    };
  });

  return {
    source: {
      artifact_ref: path.basename(args.sourceArtifact),
      package_ref: path.basename(LAWOS_SOURCE_PACKAGE),
      contract_ref: path.basename(LAWOS_SOURCE_CONTRACT),
      source_revision: clean(source?.source_revision),
      expected_source_revision: args.sourceRevision,
      source_artifact_hash: sourceArtifactHash,
      generated_at_hash: source?.generated_at ? sha256Hex(source.generated_at) : null,
    },
    counts: {
      clients: clientRows.length,
      matters: matterRows.length,
      axis_counts: countBy(matterRows, 'matterAxis'),
      litigation_axis_counts: countBy(matterRows, 'matterLitigationAxis'),
      review_required: matters.filter((matter) => matter.review_required === true).length,
      duplicate_codes: duplicateMatterCodes.length,
      over_120: matterRows.filter((matter) => matter.matterCode.length > 120).length,
      invalid_format_rows: matterRows.filter((matter) => !matter.format.ok).length,
    },
    clients: clientRows,
    matters: matterRows,
    blockers: [...new Set(blockers)],
  };
}

export function validateManifest(manifest, args) {
  const blockers = [...manifest.blockers];
  if (manifest.counts.clients !== args.expectedClients) blockers.push('manifest_client_count_mismatch');
  if (manifest.counts.matters !== args.expectedMatters) blockers.push('manifest_matter_count_mismatch');
  if (manifest.counts.invalid_format_rows !== 0) blockers.push('manifest_invalid_format_rows_present');
  if (manifest.counts.review_required !== 0) blockers.push('manifest_review_required_present');
  if (manifest.counts.duplicate_codes !== 0) blockers.push('manifest_duplicate_codes_present');
  if (manifest.source.source_revision !== LAWOS_SOURCE_REVISION) {
    blockers.push('manifest_source_revision_not_pinned');
  }
  return [...new Set(blockers)];
}

function makeMultiMap(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function metadata(row) {
  return row?.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
}

function metadataSourceClientId(row) {
  const meta = metadata(row);
  return clean(meta.lawosClientId ?? meta.matterAppClientId);
}

function metadataSourceMatterId(row) {
  const meta = metadata(row);
  return clean(meta.lawosMatterId ?? meta.matterAppMatterId);
}

function indexVaultSnapshot(snapshot) {
  return {
    clientsBySourceId: makeMultiMap(snapshot.clients, metadataSourceClientId),
    clientsByName: makeMultiMap(snapshot.clients, (row) => normalizeLabel(row.name)),
    mattersBySourceId: makeMultiMap(snapshot.matters, metadataSourceMatterId),
    mattersByCode: makeMultiMap(snapshot.matters, (row) => normalizeLabel(row.matter_code)),
    mattersById: new Map(snapshot.matters.map((row) => [row.matter_id, row])),
    membersByMatterAndUser: new Set(
      snapshot.members.map((row) => `${row.matter_id}:${row.user_id}`),
    ),
  };
}

function clientProjectionMetadata({ manifest, client, args }) {
  return {
    lawosClientId: client.sourceClientId,
    lawosSourceRevision: manifest.source.source_revision,
    lawosSourceArtifactHash: manifest.source.source_artifact_hash,
    lawosClientShortNameHash: client.clientShortNameHash,
    matterAppClientId: client.sourceClientId,
    matterAppClientSourceRevision: manifest.source.source_revision,
    sourceRevision: manifest.source.source_revision,
    migration_run_id: args.runId,
    source_ref: SOURCE_REF,
    mapping_candidate_hash: client.clientRefHash,
  };
}

function matterProjectionMetadata({ manifest, matter, args }) {
  return {
    lawosClientId: matter.sourceClientId,
    lawosMatterId: matter.sourceMatterId,
    lawosSourceRevision: manifest.source.source_revision,
    lawosSourceArtifactHash: manifest.source.source_artifact_hash,
    lawosMatterAxis: matter.matterAxis,
    lawosMatterLitigationAxis: matter.matterLitigationAxis,
    lawosMatterDetailHash: sha256Hex(matter.matterDetailTypeKorean),
    lawosMatterCodeHash: matter.matterCodeHash,
    lawosSourceRefHash: matter.sourceRefHash,
    lawosSourceLaneHash: matter.sourceLaneHash,
    lawosConfidence: matter.confidence,
    matterAppClientId: matter.sourceClientId,
    matterAppMatterId: matter.sourceMatterId,
    matterAppMatterCodeHash: matter.matterCodeHash,
    matterAppSourceRevision: manifest.source.source_revision,
    sourceRevision: manifest.source.source_revision,
    matter_detail_type_korean: matter.matterDetailTypeKorean,
    matter_type_english: matter.matterTypeEnglish,
    migration_run_id: args.runId,
    source_ref: SOURCE_REF,
    mapping_candidate_hash: matter.matterCodeHash,
  };
}

function sanitizedClientPlan({ client, action, state, blockers, existingClientId = null }) {
  return {
    target: 'client',
    action,
    state,
    source_client_ref_hash: client.clientRefHash,
    client_name_hash: client.clientNameHash,
    existing_client_ref_hash: existingClientId ? sha256Hex(existingClientId) : null,
    blockers,
  };
}

function sanitizedMatterPlan({ matter, action, state, blockers, existingMatterId = null, clientRefHash = null }) {
  return {
    target: 'matter',
    action,
    state,
    source_matter_ref_hash: sha256Hex(matter.sourceMatterId),
    source_client_ref_hash: sha256Hex(matter.sourceClientId),
    matter_code_hash: matter.matterCodeHash,
    matter_name_hash: matter.matterNameHash,
    existing_matter_ref_hash: existingMatterId ? sha256Hex(existingMatterId) : null,
    target_client_ref_hash: clientRefHash,
    matter_axis: matter.matterAxis,
    matter_litigation_axis: matter.matterLitigationAxis,
    vault_matter_type: matter.vaultMatterType,
    blockers,
  };
}

export function planReflection({ manifest, snapshot, args }) {
  const indexed = indexVaultSnapshot(snapshot);
  const clientPlans = [];
  const clientPlanBySourceId = new Map();
  for (const client of manifest.clients) {
    const blockers = [];
    const bySourceId = indexed.clientsBySourceId.get(client.sourceClientId) ?? [];
    const byName = indexed.clientsByName.get(normalizeLabel(client.clientShortName)) ?? [];
    if (bySourceId.length > 1) blockers.push('vault_client_source_id_ambiguous');
    if (bySourceId.length === 0 && byName.length > 1) blockers.push('vault_client_name_ambiguous');
    const existing = bySourceId[0] ?? byName[0] ?? null;
    const action = existing ? 'update_client_projection' : 'create_client';
    const state = blockers.length > 0 ? 'blocked' : existing ? 'planned_client_projection_update' : 'planned_client_create';
    const plan = {
      target: 'client',
      action,
      state,
      source: client,
      existing,
      blockers,
      detail: sanitizedClientPlan({
        client,
        action: args.mode === 'execute' ? action : `would_${action}`,
        state,
        blockers,
        existingClientId: existing?.client_id ?? null,
      }),
    };
    clientPlans.push(plan);
    clientPlanBySourceId.set(client.sourceClientId, plan);
  }

  const matterPlans = [];
  for (const matter of manifest.matters) {
    const blockers = [...matter.format.blockers];
    const clientPlan = clientPlanBySourceId.get(matter.sourceClientId);
    if (!clientPlan) blockers.push('source_client_plan_missing');
    if (clientPlan?.blockers.length) blockers.push('source_client_plan_blocked');
    const bySourceId = indexed.mattersBySourceId.get(matter.sourceMatterId) ?? [];
    const byCode = indexed.mattersByCode.get(normalizeLabel(matter.matterCode)) ?? [];
    if (bySourceId.length > 1) blockers.push('vault_matter_source_id_ambiguous');
    if (byCode.length > 1) blockers.push('vault_matter_code_ambiguous');
    const existing = bySourceId[0] ?? byCode[0] ?? null;
    const targetClientId = clientPlan?.existing?.client_id ?? null;
    if (existing && targetClientId && existing.client_id !== targetClientId) {
      blockers.push('vault_matter_client_projection_mismatch');
    }
    if (existing && existing.matter_code !== matter.matterCode && byCode.length > 0) {
      blockers.push('vault_matter_code_conflict');
    }
    if (existing && existing.active_document_count > 0 && existing.client_id !== targetClientId) {
      blockers.push('document_matter_remap_not_in_scope');
    }
    const action = existing ? 'update_matter_projection' : 'create_matter';
    const state = blockers.length > 0 ? 'blocked' : existing ? 'planned_matter_projection_update' : 'planned_matter_create';
    matterPlans.push({
      target: 'matter',
      action,
      state,
      source: matter,
      existing,
      clientPlan,
      blockers: [...new Set(blockers)],
      detail: sanitizedMatterPlan({
        matter,
        action: args.mode === 'execute' ? action : `would_${action}`,
        state,
        blockers: [...new Set(blockers)],
        existingMatterId: existing?.matter_id ?? null,
        clientRefHash: targetClientId ? sha256Hex(targetClientId) : null,
      }),
    });
  }

  const details = [...clientPlans.map((plan) => plan.detail), ...matterPlans.map((plan) => plan.detail)];
  return {
    clients: clientPlans,
    matters: matterPlans,
    details,
    summary: summarizeDetails(details),
  };
}

export function summarizeDetails(details) {
  const states = {};
  const actions = {};
  const blockers = {};
  for (const detail of details) {
    states[detail.state] = (states[detail.state] ?? 0) + 1;
    actions[detail.action] = (actions[detail.action] ?? 0) + 1;
    for (const blocker of detail.blockers ?? []) blockers[blocker] = (blockers[blocker] ?? 0) + 1;
  }
  return {
    states,
    actions,
    blockers,
    blocked: details.filter((detail) => detail.blockers?.length > 0).length,
    target_rows: details.length,
  };
}

export function validateProjectionInvariants({ manifest, snapshot }) {
  const lawosMatters = snapshot.matters.filter(
    (matter) => metadata(matter).lawosSourceRevision === manifest.source.source_revision,
  );
  const lawosClients = snapshot.clients.filter(
    (client) => metadata(client).lawosSourceRevision === manifest.source.source_revision,
  );
  const matterCodes = new Set(lawosMatters.map((matter) => matter.matter_code));
  const sourceMatterCodes = new Set(manifest.matters.map((matter) => matter.matterCode));
  const blockers = [];
  if (lawosClients.length !== manifest.counts.clients) blockers.push('projection_client_count_mismatch');
  if (lawosMatters.length !== manifest.counts.matters) blockers.push('projection_matter_count_mismatch');
  for (const matter of manifest.matters) {
    if (!matterCodes.has(matter.matterCode)) blockers.push('projection_matter_code_missing');
  }
  for (const matter of lawosMatters) {
    if (!sourceMatterCodes.has(matter.matter_code)) blockers.push('projection_extra_matter_code');
  }
  return [...new Set(blockers)];
}

export function validateReplayIdempotency({ plan }) {
  const actionable = [...plan.clients, ...plan.matters].filter((row) => row.blockers.length === 0);
  const creates = actionable.filter((row) => row.action.startsWith('create_')).length;
  const updates = actionable.filter((row) => row.action.startsWith('update_')).length;
  return {
    proof: creates === 0 ? 'idempotent_replay_no_creates' : 'initial_reflection_requires_creates',
    planned_creates: creates,
    planned_updates: updates,
    blockers: creates === 0 ? [] : ['replay_would_create_rows'],
  };
}

export function validateRuntimeSmoke({ manifest, snapshot, operatorUserId }) {
  const blockers = [];
  const lawosMatters = snapshot.matters.filter(
    (matter) => metadata(matter).lawosSourceRevision === manifest.source.source_revision,
  );
  const byMatterId = new Map(lawosMatters.map((matter) => [matter.matter_id, matter]));
  if (lawosMatters.length !== manifest.counts.matters) blockers.push('runtime_smoke_projection_matter_count_mismatch');
  const operatorMemberships = snapshot.members.filter(
    (member) => member.user_id === operatorUserId && byMatterId.has(member.matter_id),
  );
  const uploadPreflightMemberships = operatorMemberships.filter(
    (member) => member.matter_role === 'owner' && member.access_level === 'edit',
  );
  if (operatorMemberships.length !== lawosMatters.length) {
    blockers.push('runtime_smoke_operator_membership_missing');
  }
  if (uploadPreflightMemberships.length !== lawosMatters.length) {
    blockers.push('runtime_smoke_upload_preflight_owner_edit_missing');
  }
  const codeLookupReady = manifest.matters.every((matter) =>
    lawosMatters.some((row) => row.matter_code === matter.matterCode),
  );
  if (!codeLookupReady) blockers.push('runtime_smoke_code_lookup_missing');
  return {
    blockers: [...new Set(blockers)],
    checks: {
      lookup_matter_count: lawosMatters.length,
      lookup_expected_matter_count: manifest.counts.matters,
      upload_preflight_owner_edit_count: uploadPreflightMemberships.length,
      search_visible_matter_count_for_operator: operatorMemberships.length,
      files_active_document_count_on_reflected_matters: lawosMatters.reduce(
        (sum, matter) => sum + Number.parseInt(String(matter.active_document_count ?? 0), 10),
        0,
      ),
      files_scope: 'observed only; runner does not import documents or mutate file/storage rows',
    },
  };
}

async function validateNegativeSmoke({ db, args, snapshot, allowEphemeralEthicalWall = false }) {
  const blockers = [];
  const reflectedMatterIds = new Set(
    snapshot.matters
      .filter((matter) => metadata(matter).source_ref === SOURCE_REF)
      .map((matter) => matter.matter_id),
  );
  const nonMemberCandidate = snapshot.users.find((user) => {
    if (user.user_id === args.operatorUserId || user.status !== 'active') return false;
    return !snapshot.members.some(
      (member) => member.user_id === user.user_id && reflectedMatterIds.has(member.matter_id),
    );
  });
  if (!nonMemberCandidate && reflectedMatterIds.size > 0) blockers.push('negative_smoke_non_member_candidate_missing');
  let excludedCount = snapshot.wallMemberships.filter(
    (membership) =>
      membership.membership_type === 'excluded' && reflectedMatterIds.has(membership.matter_id),
  ).length;
  const ethicalWallProof = {
    ephemeral_exclusion_attempted: false,
    ephemeral_exclusion_inserted: false,
    rollback_contained_by_outer_transaction: allowEphemeralEthicalWall,
  };
  if (allowEphemeralEthicalWall && nonMemberCandidate && reflectedMatterIds.size > 0) {
    const [matterId] = reflectedMatterIds;
    const wall = await db.query(
      `
        INSERT INTO ethical_walls (
          tenant_id, matter_id, wall_name, reason, status, created_by
        )
        VALUES ($1, $2, $3, 'lawos canonical reflection negative smoke', 'active', $4)
        RETURNING wall_id
      `,
      [
        args.tenantId,
        matterId,
        `lawos-negative-smoke-${shortHash(args.runId)}`,
        args.operatorUserId,
      ],
    );
    await db.query(
      `
        INSERT INTO ethical_wall_memberships (
          tenant_id, wall_id, subject_type, subject_id, membership_type, created_by
        )
        VALUES ($1, $2, 'user', $3, 'excluded', $4)
      `,
      [args.tenantId, wall.rows[0].wall_id, nonMemberCandidate.user_id, args.operatorUserId],
    );
    excludedCount += 1;
    ethicalWallProof.ephemeral_exclusion_attempted = true;
    ethicalWallProof.ephemeral_exclusion_inserted = true;
  }
  return {
    blockers: [...new Set(blockers)],
    expected_denials: {
      non_member_denied_by_missing_matter_membership: Boolean(nonMemberCandidate),
      ethical_wall_excluded_rows_observed: excludedCount,
    },
    ethical_wall_proof: ethicalWallProof,
  };
}

async function readLawOsSource(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { source: JSON.parse(raw), sourceArtifactHash: sha256Hex(raw) };
}

async function resolveTenantId(client, requestedTenantId) {
  if (requestedTenantId) return { tenantId: requestedTenantId, blockers: [] };
  const result = await client.query(
    `
      SELECT tenant_id, count(*)::int AS row_count
      FROM (
        SELECT tenant_id FROM clients
        UNION ALL
        SELECT tenant_id FROM matters
      ) rows
      GROUP BY tenant_id
      ORDER BY row_count DESC, tenant_id
      LIMIT 2
    `,
  );
  if (result.rows.length === 1) return { tenantId: result.rows[0].tenant_id, blockers: [] };
  return { tenantId: result.rows[0]?.tenant_id ?? null, blockers: ['tenant_id_required_for_multi_tenant_db'] };
}

async function loadOperator(client, args) {
  if (!args.operatorUserId || !args.tenantId) return null;
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

async function loadVaultSnapshot(client, tenantId, operatorUserId = null) {
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
        m.metadata_json,
        count(d.document_id)::int AS active_document_count
      FROM matters m
      JOIN clients c
        ON c.tenant_id = m.tenant_id
        AND c.client_id = m.client_id
      LEFT JOIN documents d
        ON d.tenant_id = m.tenant_id
        AND d.matter_id = m.matter_id
        AND d.deleted_at IS NULL
      WHERE m.tenant_id = $1
      GROUP BY m.matter_id, m.client_id, c.name, m.matter_code, m.matter_name,
        m.matter_type, m.status, m.metadata_json
      ORDER BY m.matter_code, m.matter_id
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
  const users = await client.query(
    `
      SELECT user_id, role, status
      FROM users
      WHERE tenant_id = $1
      ORDER BY user_id
    `,
    [tenantId],
  );
  const wallMemberships = await client.query(
    `
      SELECT ew.matter_id, ewm.subject_id AS user_id, ewm.membership_type
      FROM ethical_wall_memberships ewm
      JOIN ethical_walls ew
        ON ew.tenant_id = ewm.tenant_id
        AND ew.wall_id = ewm.wall_id
      WHERE ewm.tenant_id = $1
        AND ewm.subject_type = 'user'
        AND ew.status = 'active'
    `,
    [tenantId],
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
  const operator = operatorUserId
    ? users.rows.find((user) => user.user_id === operatorUserId && user.status === 'active') ?? null
    : null;
  return {
    clients: clients.rows,
    matters: matters.rows,
    members: members.rows,
    users: users.rows,
    wallMemberships: wallMemberships.rows,
    defaultAiPolicyId: aiPolicy.rows[0]?.policy_id ?? null,
    operator,
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

async function upsertClientProjection(db, { args, manifest, plan }) {
  const metadataJson = JSON.stringify(clientProjectionMetadata({ manifest, client: plan.source, args }));
  if (plan.existing) {
    const result = await db.query(
      `
        UPDATE clients
        SET name = $3,
            metadata_json = coalesce(metadata_json, '{}'::jsonb) || $4::jsonb,
            updated_at = now()
        WHERE tenant_id = $1
          AND client_id = $2
        RETURNING client_id, name
      `,
      [args.tenantId, plan.existing.client_id, plan.source.clientShortName, metadataJson],
    );
    const row = result.rows[0];
    await insertAudit(db, {
      tenantId: args.tenantId,
      actorId: args.operatorUserId,
      action: 'CLIENT_UPDATED',
      targetType: 'client',
      targetId: row.client_id,
      metadata: {
        migration_run_id: args.runId,
        source_ref: SOURCE_REF,
        mapping_candidate_hash: plan.source.clientRefHash,
        lawos_source_revision_hash: sha256Hex(manifest.source.source_revision),
      },
    });
    return row;
  }
  const result = await db.query(
    `
      INSERT INTO clients (
        tenant_id, name, client_type, confidentiality_level, status, metadata_json, created_by
      )
      VALUES ($1, $2, 'other', 'standard', 'active', $3::jsonb, $4)
      RETURNING client_id, name
    `,
    [args.tenantId, plan.source.clientShortName, metadataJson, args.operatorUserId],
  );
  const row = result.rows[0];
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'CLIENT_CREATED',
    targetType: 'client',
    targetId: row.client_id,
    metadata: {
      migration_run_id: args.runId,
      source_ref: SOURCE_REF,
      mapping_candidate_hash: plan.source.clientRefHash,
      lawos_source_revision_hash: sha256Hex(manifest.source.source_revision),
    },
  });
  return row;
}

async function ensureLeadOwner(db, { args, matterId }) {
  const result = await db.query(
    `
      INSERT INTO matter_members (
        tenant_id, matter_id, user_id, matter_role, access_level, added_by
      )
      VALUES ($1, $2, $3, 'owner', 'edit', $3)
      ON CONFLICT (matter_id, user_id) DO NOTHING
      RETURNING matter_id, user_id
    `,
    [args.tenantId, matterId, args.operatorUserId],
  );
  if (!result.rows[0]) return { created: false };
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'MATTER_MEMBER_ADDED',
    targetType: 'matter',
    targetId: matterId,
    matterId,
    metadata: {
      matter_id: matterId,
      member_user_id: args.operatorUserId,
      role_after: 'owner',
      migration_run_id: args.runId,
      source_ref: SOURCE_REF,
    },
  });
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'PERMISSION_CHANGED',
    targetType: 'matter',
    targetId: matterId,
    matterId,
    metadata: {
      matter_id: matterId,
      member_user_id: args.operatorUserId,
      before_ref: 'none',
      after_ref: 'member:operator:owner:edit',
      reason_code: 'lawos_canonical_reflection_owner_added',
      migration_run_id: args.runId,
      source_ref: SOURCE_REF,
    },
  });
  return { created: true };
}

async function upsertMatterProjection(db, { args, manifest, plan, clientRow, aiPolicyId }) {
  const source = plan.source;
  const metadataJson = JSON.stringify(matterProjectionMetadata({ manifest, matter: source, args }));
  if (plan.existing) {
    const result = await db.query(
      `
        UPDATE matters
        SET matter_code = $3,
            matter_name = $4,
            matter_type = $5,
            status = $6,
            metadata_json = coalesce(metadata_json, '{}'::jsonb) || $7::jsonb,
            updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
        RETURNING matter_id, client_id, matter_code
      `,
      [
        args.tenantId,
        plan.existing.matter_id,
        source.matterCode,
        source.matterName,
        source.vaultMatterType,
        source.vaultStatus,
        metadataJson,
      ],
    );
    const row = result.rows[0];
    await ensureLeadOwner(db, { args, matterId: row.matter_id });
    await insertAudit(db, {
      tenantId: args.tenantId,
      actorId: args.operatorUserId,
      action: 'MATTER_UPDATED',
      targetType: 'matter',
      targetId: row.matter_id,
      matterId: row.matter_id,
      metadata: {
        migration_run_id: args.runId,
        source_ref: SOURCE_REF,
        mapping_candidate_hash: source.matterCodeHash,
        lawos_source_revision_hash: sha256Hex(manifest.source.source_revision),
      },
    });
    return row;
  }
  const result = await db.query(
    `
      INSERT INTO matters (
        tenant_id, client_id, matter_code, matter_name, matter_type, status,
        opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json, created_by,
        ai_policy_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, NULL, $8::jsonb, $7, $9)
      RETURNING matter_id, client_id, matter_code
    `,
    [
      args.tenantId,
      clientRow.client_id,
      source.matterCode,
      source.matterName,
      source.vaultMatterType,
      source.vaultStatus,
      args.operatorUserId,
      metadataJson,
      aiPolicyId,
    ],
  );
  const row = result.rows[0];
  await ensureLeadOwner(db, { args, matterId: row.matter_id });
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'MATTER_CREATED',
    targetType: 'matter',
    targetId: row.matter_id,
    matterId: row.matter_id,
    metadata: {
      matter_id: row.matter_id,
      client_id: row.client_id,
      migration_run_id: args.runId,
      source_ref: SOURCE_REF,
      mapping_candidate_hash: source.matterCodeHash,
      lawos_source_revision_hash: sha256Hex(manifest.source.source_revision),
    },
  });
  return row;
}

async function executeReflection(db, { args, manifest, plan, snapshot }) {
  const clientRowsBySourceId = new Map();
  let clientsCreated = 0;
  let clientsUpdated = 0;
  let mattersCreated = 0;
  let mattersUpdated = 0;
  for (const clientPlan of plan.clients) {
    const row = await upsertClientProjection(db, { args, manifest, plan: clientPlan });
    clientRowsBySourceId.set(clientPlan.source.sourceClientId, row);
    if (clientPlan.existing) clientsUpdated += 1;
    else clientsCreated += 1;
  }
  for (const matterPlan of plan.matters) {
    const clientRow = clientRowsBySourceId.get(matterPlan.source.sourceClientId);
    const row = await upsertMatterProjection(db, {
      args,
      manifest,
      plan: matterPlan,
      clientRow,
      aiPolicyId: snapshot.defaultAiPolicyId,
    });
    if (matterPlan.existing) mattersUpdated += 1;
    else mattersCreated += 1;
    matterPlan.executedMatterId = row.matter_id;
  }
  return {
    clients_created: clientsCreated,
    clients_updated: clientsUpdated,
    matters_created: mattersCreated,
    matters_updated: mattersUpdated,
  };
}

async function executeRollbackContainment(db, { args, manifest }) {
  const matterResult = await db.query(
    `
      UPDATE matters
      SET metadata_json = metadata_json
          - 'lawosClientId'
          - 'lawosMatterId'
          - 'lawosSourceRevision'
          - 'lawosSourceArtifactHash'
          - 'lawosMatterAxis'
          - 'lawosMatterLitigationAxis'
          - 'lawosMatterDetailHash'
          - 'lawosMatterCodeHash'
          - 'lawosSourceRefHash'
          - 'lawosSourceLaneHash'
          - 'lawosConfidence',
          updated_at = now()
      WHERE tenant_id = $1
        AND metadata_json->>'lawosSourceRevision' = $2
      RETURNING matter_id
    `,
    [args.tenantId, manifest.source.source_revision],
  );
  const clientResult = await db.query(
    `
      UPDATE clients
      SET metadata_json = metadata_json
          - 'lawosClientId'
          - 'lawosSourceRevision'
          - 'lawosSourceArtifactHash'
          - 'lawosClientShortNameHash',
          updated_at = now()
      WHERE tenant_id = $1
        AND metadata_json->>'lawosSourceRevision' = $2
      RETURNING client_id
    `,
    [args.tenantId, manifest.source.source_revision],
  );
  await insertAudit(db, {
    tenantId: args.tenantId,
    actorId: args.operatorUserId,
    action: 'COMPLIANCE_EVIDENCE_RECORDED',
    targetType: 'lawos_canonical_reflection_rollback',
    targetId: args.tenantId,
    metadata: {
      migration_run_id: args.runId,
      rollback_approval_ref_hash: sha256Hex(args.rollbackApprovalRef),
      source_ref: SOURCE_REF,
      lawos_source_revision_hash: sha256Hex(manifest.source.source_revision),
      clients_projection_refs_removed: clientResult.rowCount ?? 0,
      matters_projection_refs_removed: matterResult.rowCount ?? 0,
      containment_mode: 'lawos_projection_metadata_removed_only',
    },
  });
  return {
    clients_projection_refs_removed: clientResult.rowCount ?? 0,
    matters_projection_refs_removed: matterResult.rowCount ?? 0,
  };
}

export function buildReceipt({
  args,
  tenantResolution,
  manifest,
  manifestBlockers,
  environmentBlockers,
  plan,
  projectionBlockers = [],
  replayProof = null,
  runtimeSmokeBlockers = [],
  runtimeSmoke = null,
  negativeSmoke = null,
  executeResult = null,
  rollbackResult = null,
}) {
  const planBlockers = Object.keys(plan.summary.blockers);
  const blockers = [
    ...tenantResolution.blockers,
    ...manifestBlockers,
    ...environmentBlockers,
    ...planBlockers,
    ...projectionBlockers,
    ...runtimeSmokeBlockers,
    ...(negativeSmoke?.blockers ?? []),
  ];
  if (args.mode === 'replay' && replayProof?.blockers?.length) blockers.push(...replayProof.blockers);
  const executeModes = new Set(['execute', 'rollback']);
  const readyModes = new Set(['dry-run', 'preflight']);
  let status = blockers.length === 0 ? 'pass' : 'blocked';
  if (readyModes.has(args.mode) && blockers.length === 0) status = 'ready_for_execute';
  if (executeModes.has(args.mode) && blockers.length === 0) status = 'pass';
  const receipt = {
    artifact: 'lawos_canonical_matter_reflection_sanitized',
    generated_at: new Date().toISOString(),
    mode: args.mode,
    status,
    run_id_hash: sha256Hex(args.runId),
    approval_ref_hash: args.approvalRef ? sha256Hex(args.approvalRef) : null,
    rollback_approval_ref_hash: args.rollbackApprovalRef ? sha256Hex(args.rollbackApprovalRef) : null,
    tenant_ref_hash: tenantResolution.tenantId ? sha256Hex(tenantResolution.tenantId) : null,
    operator_ref_hash: args.operatorUserId ? sha256Hex(args.operatorUserId) : null,
    source: {
      artifact_ref: manifest.source.artifact_ref,
      package_ref: manifest.source.package_ref,
      contract_ref: manifest.source.contract_ref,
      source_revision_hash: sha256Hex(manifest.source.source_revision),
      source_artifact_hash: manifest.source.source_artifact_hash,
      format_contract:
        '[client_short_name]/[Advisory|DEAL|Dispute]/[matter_detail_type_korean] or [client_short_name]/LIT/[CIV|CRM|ADM]/[matter_detail_type_korean]',
    },
    counts: manifest.counts,
    plan_summary: plan.summary,
    projection_blockers: [...new Set(projectionBlockers)],
    runtime_smoke_blockers: [...new Set(runtimeSmokeBlockers)],
    runtime_smoke: runtimeSmoke,
    negative_smoke: negativeSmoke,
    replay_proof: replayProof,
    execute_result: executeResult,
    rollback_result: rollbackResult,
    details_ref: path.basename(args.details),
    blockers: [...new Set(blockers)],
    not_in_scope: NOT_IN_SCOPE,
    sanitization:
      'Receipt contains counts, hashes, format contract, sanitized filenames, and blocker codes only; no raw local path, customer document body, OCR/text excerpt, screenshot, storage reference, credential value, raw UUID, Matter Code, matter name, or client label is persisted.',
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

function readReceiptIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateExecuteReceipt(receipt) {
  const blockers = [];
  if (!receipt) return ['execute_receipt_missing'];
  if (receipt.artifact !== 'lawos_canonical_matter_reflection_sanitized') {
    blockers.push('execute_receipt_invalid');
  }
  if (receipt.mode !== 'execute') blockers.push('execute_receipt_mode_mismatch');
  if (receipt.status !== 'pass') blockers.push('execute_receipt_not_passed');
  if (receipt.leak_scan?.status !== 'PASS') blockers.push('execute_receipt_leak_scan_not_passed');
  return blockers;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.error(
      'usage: pnpm matter:lawos-reflection -- --mode <preflight|dry-run|execute|replay|invariant-check|runtime-smoke|negative-smoke|rollback|closeout> --tenant-id <uuid> [--operator-user-id <uuid>] [--approval-ref <ref>]',
    );
    process.exit(0);
    return;
  }

  const { source, sourceArtifactHash } = await readLawOsSource(args.sourceArtifact);
  const manifest = buildReflectionManifest({ source, sourceArtifactHash, args });
  const manifestBlockers = validateManifest(manifest, args);
  const db = new Client({ connectionString: args.databaseUrl });
  await db.connect();
  try {
    const executeMode = args.mode === 'execute' || args.mode === 'rollback';
    const ephemeralWriteMode = args.mode === 'negative-smoke';
    await db.query(executeMode || ephemeralWriteMode ? 'BEGIN' : 'BEGIN READ ONLY');
    const tenantResolution = await resolveTenantId(db, args.tenantId);
    args.tenantId = tenantResolution.tenantId;
    if (args.tenantId) {
      await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', args.tenantId]);
    }
    const snapshot = args.tenantId
      ? await loadVaultSnapshot(db, args.tenantId, args.operatorUserId)
      : { clients: [], matters: [], members: [], users: [], wallMemberships: [], defaultAiPolicyId: null };
    const plan = planReflection({ manifest, snapshot, args });
    const operator = await loadOperator(db, args);
    const environmentBlockers = [];
    if (['execute', 'runtime-smoke', 'negative-smoke', 'rollback'].includes(args.mode) && !operator) {
      environmentBlockers.push('active_operator_missing_or_unauthorized');
    }
    if (args.mode === 'execute' && !clean(args.approvalRef)) environmentBlockers.push('approval_ref_missing');
    if (args.mode === 'rollback' && !clean(args.rollbackApprovalRef)) {
      environmentBlockers.push('rollback_approval_ref_missing');
    }
    if (args.mode === 'execute' && !snapshot.defaultAiPolicyId) {
      environmentBlockers.push('default_local_ai_policy_missing');
    }
    const executeReceiptBlockers = args.mode === 'rollback'
      ? validateExecuteReceipt(readReceiptIfPresent(args.executeReceipt))
      : [];
    environmentBlockers.push(...executeReceiptBlockers);

    let projectionBlockers = [];
    let runtimeSmokeBlockers = [];
    let runtimeSmoke = null;
    let replayProof = null;
    let negativeSmoke = null;
    let executeResult = null;
    let rollbackResult = null;

    if (['invariant-check', 'runtime-smoke', 'negative-smoke', 'closeout'].includes(args.mode)) {
      projectionBlockers = validateProjectionInvariants({ manifest, snapshot });
    }
    if (args.mode === 'replay' || args.mode === 'closeout') {
      replayProof = validateReplayIdempotency({ plan });
    }
    if (args.mode === 'runtime-smoke' || args.mode === 'closeout') {
      runtimeSmoke = validateRuntimeSmoke({
        manifest,
        snapshot,
        operatorUserId: args.operatorUserId,
      });
      runtimeSmokeBlockers = runtimeSmoke.blockers;
    }
    if (args.mode === 'negative-smoke' || args.mode === 'closeout') {
      negativeSmoke = await validateNegativeSmoke({
        db,
        args,
        snapshot,
        allowEphemeralEthicalWall: args.mode === 'negative-smoke',
      });
    }

    const preExecuteBlockers = [
      ...tenantResolution.blockers,
      ...manifestBlockers,
      ...environmentBlockers,
      ...Object.keys(plan.summary.blockers),
    ];
    if (args.mode === 'execute' && preExecuteBlockers.length === 0) {
      executeResult = await executeReflection(db, { args, manifest, plan, snapshot });
    }
    if (args.mode === 'rollback' && preExecuteBlockers.length === 0) {
      rollbackResult = await executeRollbackContainment(db, { args, manifest });
    }

    const receipt = buildReceipt({
      args,
      tenantResolution,
      manifest,
      manifestBlockers,
      environmentBlockers,
      plan,
      projectionBlockers,
      replayProof,
      runtimeSmokeBlockers,
      runtimeSmoke,
      negativeSmoke,
      executeResult,
      rollbackResult,
    });
    if (executeMode && receipt.status === 'pass') await db.query('COMMIT');
    else await db.query('ROLLBACK');
    await writeNdjsonGz(args.details, plan.details);
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
