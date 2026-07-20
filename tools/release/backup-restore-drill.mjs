#!/usr/bin/env node

import { createHash } from 'node:crypto';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

export const BACKUP_TABLES = Object.freeze([
  'users',
  'clients',
  'matters',
  'documents',
  'document_versions',
  'audit_events',
  'external_secure_links',
  'retention_policies',
  'disposal_requests',
  'enterprise_sso_providers',
  'enterprise_key_references',
  'enterprise_compliance_evidence',
]);

export const SCHEMA_QUERIES = Object.freeze([
  `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name <> 'schema_migrations'
    ORDER BY table_name, ordinal_position
  `,
  `
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
    ORDER BY tablename, indexname
  `,
  `
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conrelid::regclass::text <> 'schema_migrations'
    ORDER BY table_name, conname
  `,
  `
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `,
  `
    SELECT event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name, event_manipulation
  `,
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;
const codePattern = /^[A-Z0-9][A-Z0-9._-]{1,79}$/;
const hashPattern = /^[a-f0-9]{64}$/u;

export class DrillError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DrillError';
    this.code = code;
    this.details = details;
  }
}

export function stableStringify(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry) ?? 'null').join(',')}]`;
  }

  const body = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',');
  return `{${body}}`;
}

export function hashJson(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export async function schemaHashForClient(client) {
  const payload = [];
  for (const query of SCHEMA_QUERIES) {
    const result = await client.query(query);
    payload.push(result.rows);
  }
  return hashJson(payload);
}

export async function tenantRowCounts(client, tenantId) {
  const counts = {};
  for (const table of BACKUP_TABLES) {
    const result = await client.query(
      `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
      [tenantId],
    );
    const count = Number(result.rows[0]?.count ?? '0');
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new DrillError('invalid_row_count', `invalid row count for ${table}`);
    }
    counts[table] = count;
  }
  return counts;
}

export function compareRowCounts(primaryRowCounts, restoredRowCounts) {
  const tables = [];
  const mismatches = [];
  for (const table of BACKUP_TABLES) {
    const primaryCount = normalizedCount(primaryRowCounts[table], table);
    const restoredCount = normalizedCount(restoredRowCounts[table], table);
    const delta = restoredCount - primaryCount;
    tables.push({ table, primaryCount, restoredCount, delta });
    if (delta !== 0) {
      mismatches.push({ table, primaryCount, restoredCount, delta });
    }
  }
  return {
    matches: mismatches.length === 0,
    mismatches,
    tables,
    rowCountsHash: hashJson(
      Object.fromEntries(tables.map(({ table, primaryCount }) => [table, primaryCount])),
    ),
    rowCountsDriftHash: hashJson(tables),
  };
}

export function buildDrillManifest({
  tenantId,
  scope = 'tenant',
  reasonCode = 'MONTHLY_DRILL',
  drillId,
  drillEvidenceRef,
  primarySchemaHash,
  restoredSchemaHash,
  primaryRowCounts,
  restoredRowCounts,
  verifiedAt = new Date().toISOString(),
}) {
  validateTenantId(tenantId);
  validateScope(scope);
  validateCode(reasonCode, 'reasonCode');
  validateKey(drillId, 'drillId');
  if (drillEvidenceRef) validateKey(drillEvidenceRef, 'drillEvidenceRef');
  validateHash(primarySchemaHash, 'primarySchemaHash');
  validateHash(restoredSchemaHash, 'restoredSchemaHash');

  if (primarySchemaHash !== restoredSchemaHash) {
    throw new DrillError('schema_hash_mismatch', 'primary and restored schema hashes differ', {
      primarySchemaHash,
      restoredSchemaHash,
    });
  }

  const rowComparison = compareRowCounts(primaryRowCounts, restoredRowCounts);
  if (!rowComparison.matches) {
    throw new DrillError('row_counts_mismatch', 'primary and restored row counts differ', {
      mismatches: rowComparison.mismatches,
    });
  }

  const manifest = {
    tenantId,
    scope,
    reasonCode,
    status: 'verified',
    drillId,
    drillEvidenceRef: drillEvidenceRef ?? null,
    verifiedAt,
    schemaHash: primarySchemaHash,
    restoredSchemaHash,
    rowCountsHash: rowComparison.rowCountsHash,
    rowCountsDriftHash: rowComparison.rowCountsDriftHash,
    tableCount: BACKUP_TABLES.length,
    tables: rowComparison.tables,
  };
  return {
    ...manifest,
    drillManifestHash: hashJson(manifest),
  };
}

export async function runBackupRestoreDrill({
  primaryClient,
  restoredClient,
  tenantId,
  scope = 'tenant',
  reasonCode = 'MONTHLY_DRILL',
  drillId,
  drillEvidenceRef,
  apiBaseUrl,
  sessionCookie,
  dryRun = false,
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  const resolvedDrillId = drillId ?? defaultDrillId(now);
  const resolvedEvidenceRef = drillEvidenceRef ?? resolvedDrillId;
  const [primarySchemaHash, restoredSchemaHash, primaryRowCounts, restoredRowCounts] =
    await Promise.all([
      schemaHashForClient(primaryClient),
      schemaHashForClient(restoredClient),
      tenantRowCounts(primaryClient, tenantId),
      tenantRowCounts(restoredClient, tenantId),
    ]);

  const manifest = buildDrillManifest({
    tenantId,
    scope,
    reasonCode,
    drillId: resolvedDrillId,
    drillEvidenceRef: resolvedEvidenceRef,
    primarySchemaHash,
    restoredSchemaHash,
    primaryRowCounts,
    restoredRowCounts,
    verifiedAt: now.toISOString(),
  });

  const snapshot = dryRun
    ? null
    : await recordDrillSnapshot({
        manifest,
        apiBaseUrl,
        sessionCookie,
        fetchImpl,
      });

  return { manifest, snapshot };
}

export async function recordDrillSnapshot({ manifest, apiBaseUrl, sessionCookie, fetchImpl }) {
  if (!fetchImpl) {
    throw new DrillError('fetch_unavailable', 'fetch implementation is not available');
  }
  if (!apiBaseUrl) {
    throw new DrillError('api_base_url_required', 'apiBaseUrl is required unless --dry-run is set');
  }
  if (!sessionCookie) {
    throw new DrillError(
      'session_cookie_required',
      'sessionCookie is required unless --dry-run is set',
    );
  }

  const response = await fetchImpl(
    `${enterpriseApiRoot(apiBaseUrl)}/enterprise/backups/snapshots`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        scope: manifest.scope,
        reasonCode: manifest.reasonCode,
        status: manifest.status,
        drillId: manifest.drillId,
        drillEvidenceRef: manifest.drillEvidenceRef,
        drillManifestHash: manifest.drillManifestHash,
        schemaHash: manifest.schemaHash,
        restoredSchemaHash: manifest.restoredSchemaHash,
        rowCountsDriftHash: manifest.rowCountsDriftHash,
      }),
    },
  );

  if (!response.ok) {
    throw new DrillError('api_snapshot_record_failed', 'backup snapshot ledger POST failed', {
      status: response.status,
    });
  }
  return response.json();
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let primaryClient;
  let restoredClient;
  try {
    const options = parseCliOptions(argv, deps.env ?? process.env);
    if (options.help) {
      stdout.write(usage());
      return 0;
    }

    const clientFactory =
      deps.clientFactory ?? ((connectionString) => new Client({ connectionString }));
    primaryClient = deps.primaryClient ?? clientFactory(options.primaryDatabaseUrl, 'primary');
    restoredClient = deps.restoredClient ?? clientFactory(options.restoredDatabaseUrl, 'restored');
    await primaryClient.connect?.();
    await restoredClient.connect?.();

    const result = await runBackupRestoreDrill({
      ...options,
      primaryClient,
      restoredClient,
      fetchImpl: deps.fetchImpl ?? globalThis.fetch,
      now: deps.now ?? new Date(),
    });
    stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify(safeErrorPayload(error), null, 2)}\n`);
    return 1;
  } finally {
    await restoredClient?.end?.();
    await primaryClient?.end?.();
  }
}

export function parseCliOptions(argv, env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'primary-database-url': { type: 'string' },
      'restored-database-url': { type: 'string' },
      'tenant-id': { type: 'string' },
      'api-base-url': { type: 'string' },
      'session-cookie': { type: 'string' },
      scope: { type: 'string', default: 'tenant' },
      'reason-code': { type: 'string', default: 'MONTHLY_DRILL' },
      'drill-id': { type: 'string' },
      'evidence-ref': { type: 'string' },
      'drill-evidence-ref': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) return { help: true };

  const now = new Date();
  const options = {
    primaryDatabaseUrl:
      values['primary-database-url'] ?? env.PRIMARY_DATABASE_URL ?? env.DATABASE_URL,
    restoredDatabaseUrl: values['restored-database-url'] ?? env.RESTORED_DATABASE_URL,
    tenantId: values['tenant-id'] ?? env.TENANT_ID,
    apiBaseUrl: values['api-base-url'] ?? env.API_BASE_URL,
    sessionCookie: values['session-cookie'] ?? env.SESSION_COOKIE,
    scope: values.scope,
    reasonCode: values['reason-code'],
    drillId: values['drill-id'] ?? defaultDrillId(now),
    drillEvidenceRef:
      values['drill-evidence-ref'] ??
      values['evidence-ref'] ??
      values['drill-id'] ??
      defaultDrillId(now),
    dryRun: values['dry-run'],
  };

  requireOption(options.primaryDatabaseUrl, '--primary-database-url');
  requireOption(options.restoredDatabaseUrl, '--restored-database-url');
  requireOption(options.tenantId, '--tenant-id');
  if (!options.dryRun) {
    requireOption(options.apiBaseUrl, '--api-base-url');
    requireOption(options.sessionCookie, '--session-cookie');
  }
  validateTenantId(options.tenantId);
  validateScope(options.scope);
  validateCode(options.reasonCode, 'reasonCode');
  validateKey(options.drillId, 'drillId');
  validateKey(options.drillEvidenceRef, 'drillEvidenceRef');
  return options;
}

export function enterpriseApiRoot(apiBaseUrl) {
  const trimmed = apiBaseUrl.replace(/\/+$/u, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function normalizedCount(value, table) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new DrillError('invalid_row_count', `invalid row count for ${table}`);
  }
  return count;
}

function defaultDrillId(now) {
  return `restore-drill-${now.toISOString().slice(0, 10)}`;
}

function requireOption(value, name) {
  if (!value) throw new DrillError('missing_required_option', `${name} is required`);
}

function validateTenantId(value) {
  if (!uuidPattern.test(value)) {
    throw new DrillError('invalid_tenant_id', 'tenantId must be a UUID');
  }
}

function validateScope(value) {
  if (!['tenant', 'audit', 'configuration'].includes(value)) {
    throw new DrillError('invalid_scope', 'scope must be tenant, audit, or configuration');
  }
}

function validateCode(value, name) {
  if (!codePattern.test(value)) {
    throw new DrillError('invalid_code', `${name} must be an uppercase bounded code`);
  }
}

function validateKey(value, name) {
  if (!keyPattern.test(value)) {
    throw new DrillError('invalid_key', `${name} must be a bounded reference`);
  }
}

function validateHash(value, name) {
  if (!hashPattern.test(value)) {
    throw new DrillError('invalid_hash', `${name} must be a lowercase SHA-256 hash`);
  }
}

function safeErrorPayload(error) {
  if (error instanceof DrillError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    ok: false,
    code: 'backup_restore_drill_failed',
    message: 'backup restore drill failed',
  };
}

function usage() {
  return `Usage: backup-restore-drill.mjs --primary-database-url URL --restored-database-url URL --tenant-id UUID [options]

Options:
  --api-base-url URL        API origin or /v1 base used to record the drill ledger row
  --session-cookie COOKIE   Admin Cookie header for the snapshot ledger request
  --scope VALUE             tenant, audit, or configuration (default: tenant)
  --reason-code CODE        Bounded uppercase reason code (default: MONTHLY_DRILL)
  --drill-id REF            Bounded drill reference (default: restore-drill-YYYY-MM-DD)
  --evidence-ref REF        Bounded external evidence reference
  --dry-run                 Compare and print the manifest without recording to the API
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
