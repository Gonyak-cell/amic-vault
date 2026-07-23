#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

import { verifyBackupSetManifest } from './build-backup-set-manifest.mjs';

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
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_READ_BYTES = 10 * 1024 * 1024 * 1024;
const EXPECTED_DENIAL_SQLSTATE = '42501';

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
  backupSetProof,
  tenantProtectionProof,
  auditImmutabilityProof,
  crossTenantProof,
  objectReadbackProof,
  cleanupVerified,
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
  validateDirectProofs({
    backupSetProof,
    tenantProtectionProof,
    auditImmutabilityProof,
    crossTenantProof,
    objectReadbackProof,
    cleanupVerified,
  });

  const manifest = {
    schemaVersion: 'amic-vault.sf20-isolated-restore.v1',
    tenantScopeHash: hashJson({ tenantId }),
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
    backupSet: {
      status: backupSetProof.status,
      unsignedPayloadSha256: backupSetProof.unsignedPayloadSha256,
      signingKeyFingerprint: backupSetProof.signingKeyFingerprint,
      objectCount: backupSetProof.objectCount,
    },
    tenantProtection: tenantProtectionProof,
    auditImmutability: auditImmutabilityProof,
    crossTenantIsolation: crossTenantProof,
    objectReadback: objectReadbackProof,
    cleanup: 'VERIFIED',
  };
  return {
    ...manifest,
    drillManifestHash: hashJson(manifest),
  };
}

export async function runBackupRestoreDrill({
  primaryClient,
  restoredClient,
  restoredRuntimeClient,
  tenantId,
  otherTenantId,
  scope = 'tenant',
  reasonCode = 'MONTHLY_DRILL',
  drillId,
  drillEvidenceRef,
  backupSetManifest,
  verificationPublicKey,
  verificationPublicKeyPath,
  expectedRegion,
  expectedCountry = 'KR',
  expectedProfileFingerprint,
  revokedKeyFingerprints = [],
  exactObjectReader,
  maxObjectReadBytes = MAX_OBJECT_READ_BYTES,
  teardownRestore,
  verifyRestoreCleanup,
  apiBaseUrl,
  sessionCookie,
  dryRun = false,
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  const resolvedDrillId = drillId ?? defaultDrillId(now);
  const resolvedEvidenceRef = drillEvidenceRef ?? resolvedDrillId;
  validateTenantId(tenantId);
  validateTenantId(otherTenantId);
  if (tenantId === otherTenantId) {
    throw new DrillError('cross_tenant_fixture_invalid', 'synthetic tenant IDs must differ');
  }
  if (typeof teardownRestore !== 'function' || typeof verifyRestoreCleanup !== 'function') {
    throw new DrillError(
      'restore_cleanup_contract_required',
      'a disposable restore cleanup contract is required',
    );
  }

  let directProof;
  let directError;
  try {
    const backupSetProof = verifySealedBackupSet({
      backupSetManifest,
      verificationPublicKey,
      verificationPublicKeyPath,
      expectedRegion,
      expectedCountry,
      expectedProfileFingerprint,
      revokedKeyFingerprints,
    });
    const [primarySchemaHash, restoredSchemaHash, primaryRowCounts, restoredRowCounts] =
      await Promise.all([
        schemaHashForClient(primaryClient),
        schemaHashForClient(restoredClient),
        tenantRowCounts(primaryClient, tenantId),
        tenantRowCounts(restoredClient, tenantId),
      ]);
    const tenantProtectionProof = await proveTenantTableProtection(restoredClient);
    const auditImmutabilityProof = await proveAuditImmutability(restoredRuntimeClient, tenantId);
    const crossTenantProof = await proveCrossTenantIsolation({
      runtimeClient: restoredRuntimeClient,
      tenantId,
      otherTenantId,
    });
    const objectReadbackProof = await proveExactObjectReadback({
      manifest: backupSetManifest,
      exactObjectReader,
      maxObjectReadBytes,
    });
    directProof = {
      backupSetProof,
      primarySchemaHash,
      restoredSchemaHash,
      primaryRowCounts,
      restoredRowCounts,
      tenantProtectionProof,
      auditImmutabilityProof,
      crossTenantProof,
      objectReadbackProof,
    };
  } catch (error) {
    directError = error;
  }

  let cleanupError;
  try {
    await teardownRestore();
    if ((await verifyRestoreCleanup()) !== true) {
      throw new DrillError('restore_cleanup_unverified', 'restore cleanup was not verified');
    }
  } catch (error) {
    cleanupError =
      error instanceof DrillError
        ? error
        : new DrillError('restore_cleanup_failed', 'restore cleanup failed');
  }
  if (cleanupError) throw cleanupError;
  if (directError) throw normalizeDrillError(directError);

  const manifest = buildDrillManifest({
    tenantId,
    scope,
    reasonCode,
    drillId: resolvedDrillId,
    drillEvidenceRef: resolvedEvidenceRef,
    ...directProof,
    cleanupVerified: true,
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

export async function proveTenantTableProtection(client) {
  const result = await client.query(
    `
      /* sf20:tenant-protection */
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls,
        count(p.polname)::text AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY($1::text[])
      GROUP BY c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      ORDER BY c.relname
    `,
    [BACKUP_TABLES],
  );
  const byTable = new Map(result.rows.map((row) => [row.table_name, row]));
  const tables = BACKUP_TABLES.map((table) => {
    const row = byTable.get(table);
    if (!row) {
      throw new DrillError('tenant_table_missing', 'a required tenant table is missing');
    }
    if (
      !databaseBoolean(row.rls_enabled) ||
      !databaseBoolean(row.force_rls) ||
      normalizedCount(row.policy_count, table) < 1
    ) {
      throw new DrillError(
        'tenant_table_protection_failed',
        'a required tenant table is not protected',
      );
    }
    return {
      table,
      rls: 'ENABLED',
      forceRls: 'ENABLED',
      policy: 'PRESENT',
    };
  });
  if (byTable.size !== BACKUP_TABLES.length) {
    throw new DrillError('tenant_table_catalog_invalid', 'tenant table catalog is invalid');
  }
  return {
    status: 'VERIFIED',
    tableCount: tables.length,
    tables,
    catalogHash: hashJson(tables),
  };
}

export async function proveAuditImmutability(runtimeClient, tenantId) {
  requireRuntimeClient(runtimeClient);
  validateTenantId(tenantId);
  let transactionOpen = false;
  try {
    await runtimeClient.query('BEGIN');
    transactionOpen = true;
    await setTenantContext(runtimeClient, tenantId);
    const before = await auditRowCount(runtimeClient);
    await requireDeniedMutation(
      runtimeClient,
      'sf20_audit_update',
      'UPDATE audit_events SET action = action WHERE tenant_id = $1',
      tenantId,
    );
    await requireDeniedMutation(
      runtimeClient,
      'sf20_audit_delete',
      'DELETE FROM audit_events WHERE tenant_id = $1',
      tenantId,
    );
    const after = await auditRowCount(runtimeClient);
    if (before !== after) {
      throw new DrillError('audit_rows_changed', 'audit rows changed during immutability proof');
    }
    await runtimeClient.query('ROLLBACK');
    transactionOpen = false;
    return {
      status: 'VERIFIED',
      update: 'DENIED',
      delete: 'DENIED',
      rowsChanged: 0,
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await runtimeClient.query('ROLLBACK');
      } catch {
        // The bounded failure below remains authoritative.
      }
    }
    throw normalizeDrillError(error, 'audit_immutability_proof_failed');
  }
}

export async function proveCrossTenantIsolation({ runtimeClient, tenantId, otherTenantId }) {
  requireRuntimeClient(runtimeClient);
  validateTenantId(tenantId);
  validateTenantId(otherTenantId);
  if (tenantId === otherTenantId) {
    throw new DrillError('cross_tenant_fixture_invalid', 'synthetic tenant IDs must differ');
  }
  let transactionOpen = false;
  try {
    const roleResult = await runtimeClient.query(`
      /* sf20:runtime-role */
      SELECT
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls,
        (c.relowner = r.oid) AS owns_documents
      FROM pg_roles r
      JOIN pg_class c ON c.relname = 'documents'
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE r.rolname = current_user
    `);
    const role = roleResult.rows[0];
    if (
      !role ||
      databaseBoolean(role.is_superuser) ||
      databaseBoolean(role.bypasses_rls) ||
      databaseBoolean(role.owns_documents)
    ) {
      throw new DrillError('runtime_role_unsafe', 'runtime role bypasses tenant isolation');
    }

    await runtimeClient.query('BEGIN');
    transactionOpen = true;
    await setTenantContext(runtimeClient, tenantId);
    let visibleRows = 0;
    let closedDenial = false;
    try {
      const result = await runtimeClient.query(
        `
          /* sf20:cross-tenant */
          SELECT count(*)::text AS count
          FROM documents
          WHERE tenant_id = $1
        `,
        [otherTenantId],
      );
      visibleRows = normalizedCount(result.rows[0]?.count ?? '0', 'documents');
    } catch (error) {
      if (error?.code !== EXPECTED_DENIAL_SQLSTATE) throw error;
      closedDenial = true;
    }
    if (visibleRows !== 0) {
      throw new DrillError('cross_tenant_rows_visible', 'runtime role can see a different tenant');
    }
    await runtimeClient.query('ROLLBACK');
    transactionOpen = false;
    return {
      status: 'VERIFIED',
      runtimeRole: 'NON_BYPASS',
      tenantContext: 'VERIFIED',
      crossTenantRows: 0,
      outcome: closedDenial ? 'DENIED' : 'ZERO_VISIBLE',
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await runtimeClient.query('ROLLBACK');
      } catch {
        // The bounded failure below remains authoritative.
      }
    }
    throw normalizeDrillError(error, 'cross_tenant_proof_failed');
  }
}

export async function proveExactObjectReadback({
  manifest,
  exactObjectReader,
  maxObjectReadBytes = MAX_OBJECT_READ_BYTES,
}) {
  if (
    exactObjectReader?.mode !== 'exact-version' ||
    typeof exactObjectReader.readExactVersion !== 'function'
  ) {
    throw new DrillError(
      'exact_object_reader_required',
      'an exact-version object reader is required',
    );
  }
  if (!Number.isSafeInteger(maxObjectReadBytes) || maxObjectReadBytes < 1) {
    throw new DrillError('object_read_limit_invalid', 'object read limit is invalid');
  }
  const objects = manifest?.unsigned?.objects;
  if (!Array.isArray(objects) || objects.length < 1) {
    throw new DrillError('backup_object_inventory_invalid', 'backup object inventory is invalid');
  }

  const verified = [];
  for (const entry of objects) {
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes > maxObjectReadBytes) {
      throw new DrillError('object_read_limit_exceeded', 'object exceeds the readback cap');
    }
    let response;
    try {
      response = await exactObjectReader.readExactVersion({
        reference: entry.reference,
        versionFingerprint: entry.versionFingerprint,
      });
    } catch {
      throw new DrillError('object_exact_read_failed', 'exact object readback failed');
    }
    if (
      response?.referenceKind !== 'exact-version' ||
      response.versionFingerprint !== entry.versionFingerprint
    ) {
      throw new DrillError('object_version_mismatch', 'exact object version did not match');
    }
    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of objectChunks(response.body)) {
      bytes += chunk.length;
      if (bytes > entry.bytes || bytes > maxObjectReadBytes) {
        throw new DrillError('object_size_mismatch', 'object readback size did not match');
      }
      digest.update(chunk);
    }
    const sha256 = digest.digest('hex');
    if (bytes !== entry.bytes) {
      throw new DrillError('object_size_mismatch', 'object readback size did not match');
    }
    if (sha256 !== entry.sha256) {
      throw new DrillError('object_hash_mismatch', 'object readback hash did not match');
    }
    verified.push({
      versionFingerprint: entry.versionFingerprint,
      sha256,
      bytes,
    });
  }
  return {
    status: 'VERIFIED',
    mode: 'EXACT_VERSION',
    objectCount: verified.length,
    inventoryHash: hashJson(
      objects.map(({ versionFingerprint, sha256, bytes }) => ({
        versionFingerprint,
        sha256,
        bytes,
      })),
    ),
    readbackHash: hashJson(verified),
  };
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
  let restoredRuntimeClient;
  try {
    const options = parseCliOptions(argv, deps.env ?? process.env);
    if (options.help) {
      stdout.write(usage());
      return 0;
    }
    if (
      !deps.exactObjectReader ||
      typeof deps.teardownRestore !== 'function' ||
      typeof deps.verifyRestoreCleanup !== 'function'
    ) {
      throw new DrillError(
        'external_restore_adapter_required',
        'an isolated restore and exact-object adapter is required',
      );
    }

    const clientFactory =
      deps.clientFactory ?? ((connectionString) => new Client({ connectionString }));
    primaryClient = deps.primaryClient ?? clientFactory(options.primaryDatabaseUrl, 'primary');
    restoredClient = deps.restoredClient ?? clientFactory(options.restoredDatabaseUrl, 'restored');
    restoredRuntimeClient =
      deps.restoredRuntimeClient ??
      clientFactory(options.restoredRuntimeDatabaseUrl, 'restored-runtime');
    await primaryClient.connect?.();
    await restoredClient.connect?.();
    await restoredRuntimeClient.connect?.();

    const result = await runBackupRestoreDrill({
      ...options,
      primaryClient,
      restoredClient,
      restoredRuntimeClient,
      backupSetManifest: deps.backupSetManifest ?? readBoundedJson(options.backupSetManifestPath),
      verificationPublicKey: deps.verificationPublicKey,
      verificationPublicKeyPath: resolve(options.verificationPublicKeyPath),
      exactObjectReader: deps.exactObjectReader,
      teardownRestore: deps.teardownRestore,
      verifyRestoreCleanup: deps.verifyRestoreCleanup,
      fetchImpl: deps.fetchImpl ?? globalThis.fetch,
      now: deps.now ?? new Date(),
    });
    stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify(safeErrorPayload(error), null, 2)}\n`);
    return 1;
  } finally {
    await restoredRuntimeClient?.end?.();
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
      'restored-runtime-database-url': { type: 'string' },
      'tenant-id': { type: 'string' },
      'other-tenant-id': { type: 'string' },
      'backup-set-manifest': { type: 'string' },
      'verification-key': { type: 'string' },
      'approved-region': { type: 'string' },
      country: { type: 'string', default: 'KR' },
      'profile-fingerprint': { type: 'string' },
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
    restoredRuntimeDatabaseUrl:
      values['restored-runtime-database-url'] ?? env.RESTORED_RUNTIME_DATABASE_URL,
    tenantId: values['tenant-id'] ?? env.TENANT_ID,
    otherTenantId: values['other-tenant-id'] ?? env.OTHER_TENANT_ID,
    backupSetManifestPath: values['backup-set-manifest'] ?? env.BACKUP_SET_MANIFEST_PATH,
    verificationPublicKeyPath: values['verification-key'] ?? env.BACKUP_VERIFICATION_KEY_PATH,
    expectedRegion: values['approved-region'] ?? env.APPROVED_REGION_CODE,
    expectedCountry: values.country,
    expectedProfileFingerprint: values['profile-fingerprint'] ?? env.PRODUCTION_PROFILE_SHA256,
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
  requireOption(options.restoredRuntimeDatabaseUrl, '--restored-runtime-database-url');
  requireOption(options.tenantId, '--tenant-id');
  requireOption(options.otherTenantId, '--other-tenant-id');
  requireOption(options.backupSetManifestPath, '--backup-set-manifest');
  requireOption(options.verificationPublicKeyPath, '--verification-key');
  requireOption(options.expectedRegion, '--approved-region');
  requireOption(options.expectedProfileFingerprint, '--profile-fingerprint');
  if (!options.dryRun) {
    requireOption(options.apiBaseUrl, '--api-base-url');
    requireOption(options.sessionCookie, '--session-cookie');
  }
  validateTenantId(options.tenantId);
  validateTenantId(options.otherTenantId);
  if (options.tenantId === options.otherTenantId) {
    throw new DrillError('cross_tenant_fixture_invalid', 'synthetic tenant IDs must differ');
  }
  validateScope(options.scope);
  validateCode(options.reasonCode, 'reasonCode');
  validateKey(options.drillId, 'drillId');
  validateKey(options.drillEvidenceRef, 'drillEvidenceRef');
  validateHash(options.expectedProfileFingerprint, 'expectedProfileFingerprint');
  if (
    options.expectedCountry !== 'KR' ||
    !/^[a-z]{2}-[a-z0-9][a-z0-9-]{1,47}-[1-9][0-9]?$/u.test(options.expectedRegion)
  ) {
    throw new DrillError('approved_region_invalid', 'approved region is invalid');
  }
  return options;
}

export function enterpriseApiRoot(apiBaseUrl) {
  const trimmed = apiBaseUrl.replace(/\/+$/u, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function verifySealedBackupSet({
  backupSetManifest,
  verificationPublicKey,
  verificationPublicKeyPath,
  expectedRegion,
  expectedCountry,
  expectedProfileFingerprint,
  revokedKeyFingerprints,
}) {
  if (!backupSetManifest || !expectedRegion || !expectedProfileFingerprint) {
    throw new DrillError(
      'sealed_backup_set_required',
      'a sealed region-bound backup set is required',
    );
  }
  try {
    return verifyBackupSetManifest({
      manifest: backupSetManifest,
      verificationPublicKey,
      verificationPublicKeyPath,
      expectedRegion,
      expectedCountry,
      expectedProfileFingerprint,
      revokedKeyFingerprints,
    });
  } catch {
    throw new DrillError('backup_set_manifest_invalid', 'backup set manifest is invalid');
  }
}

function validateDirectProofs({
  backupSetProof,
  tenantProtectionProof,
  auditImmutabilityProof,
  crossTenantProof,
  objectReadbackProof,
  cleanupVerified,
}) {
  if (
    backupSetProof?.status !== 'COMPLETE' ||
    !hashPattern.test(backupSetProof.unsignedPayloadSha256 ?? '') ||
    !/^sha256:[a-f0-9]{64}$/u.test(backupSetProof.signingKeyFingerprint ?? '') ||
    !Number.isSafeInteger(backupSetProof.objectCount) ||
    backupSetProof.objectCount < 1
  ) {
    throw new DrillError('backup_set_proof_invalid', 'backup set proof is invalid');
  }
  if (
    tenantProtectionProof?.status !== 'VERIFIED' ||
    tenantProtectionProof.tableCount !== BACKUP_TABLES.length ||
    !hashPattern.test(tenantProtectionProof.catalogHash ?? '') ||
    !Array.isArray(tenantProtectionProof.tables) ||
    tenantProtectionProof.tables.length !== BACKUP_TABLES.length ||
    tenantProtectionProof.tables.some(
      (entry, index) =>
        entry.table !== BACKUP_TABLES[index] ||
        entry.rls !== 'ENABLED' ||
        entry.forceRls !== 'ENABLED' ||
        entry.policy !== 'PRESENT',
    )
  ) {
    throw new DrillError('tenant_table_proof_invalid', 'tenant table protection proof is invalid');
  }
  if (
    auditImmutabilityProof?.status !== 'VERIFIED' ||
    auditImmutabilityProof.update !== 'DENIED' ||
    auditImmutabilityProof.delete !== 'DENIED' ||
    auditImmutabilityProof.rowsChanged !== 0
  ) {
    throw new DrillError('audit_immutability_proof_invalid', 'audit immutability proof is invalid');
  }
  if (
    crossTenantProof?.status !== 'VERIFIED' ||
    crossTenantProof.runtimeRole !== 'NON_BYPASS' ||
    crossTenantProof.tenantContext !== 'VERIFIED' ||
    crossTenantProof.crossTenantRows !== 0 ||
    !['DENIED', 'ZERO_VISIBLE'].includes(crossTenantProof.outcome)
  ) {
    throw new DrillError('cross_tenant_proof_invalid', 'cross-tenant isolation proof is invalid');
  }
  if (
    objectReadbackProof?.status !== 'VERIFIED' ||
    objectReadbackProof.mode !== 'EXACT_VERSION' ||
    objectReadbackProof.objectCount !== backupSetProof.objectCount ||
    !hashPattern.test(objectReadbackProof.inventoryHash ?? '') ||
    objectReadbackProof.inventoryHash !== objectReadbackProof.readbackHash
  ) {
    throw new DrillError('object_readback_proof_invalid', 'exact object readback proof is invalid');
  }
  if (cleanupVerified !== true) {
    throw new DrillError('restore_cleanup_unverified', 'restore cleanup was not verified');
  }
}

function requireRuntimeClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new DrillError('runtime_role_required', 'restored runtime role is required');
  }
}

async function setTenantContext(client, tenantId) {
  const result = await client.query(
    `
      /* sf20:set-tenant-context */
      SELECT
        set_config('app.current_tenant_id', $1, true) = $1
          AND current_setting('app.current_tenant_id', true) = $1 AS matches
    `,
    [tenantId],
  );
  if (!databaseBoolean(result.rows[0]?.matches)) {
    throw new DrillError('tenant_context_failed', 'tenant context was not established');
  }
}

async function auditRowCount(client) {
  const result = await client.query(`
    /* sf20:audit-count */
    SELECT count(*)::text AS count
    FROM audit_events
  `);
  return normalizedCount(result.rows[0]?.count ?? '0', 'audit_events');
}

async function requireDeniedMutation(client, savepoint, sql, tenantId) {
  await client.query(`SAVEPOINT ${savepoint}`);
  let denied = false;
  try {
    await client.query(sql, [tenantId]);
  } catch (error) {
    if (error?.code !== EXPECTED_DENIAL_SQLSTATE) throw error;
    denied = true;
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
  if (!denied) {
    throw new DrillError('audit_mutation_not_denied', 'audit mutation was not denied');
  }
}

function databaseBoolean(value) {
  return value === true || value === 't';
}

async function* objectChunks(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    yield Buffer.from(body);
    return;
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) {
      if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) {
        throw new DrillError('object_chunk_invalid', 'object reader returned an invalid chunk');
      }
      yield Buffer.from(chunk);
    }
    return;
  }
  throw new DrillError('object_body_invalid', 'object reader returned an invalid body');
}

function readBoundedJson(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) {
    throw new DrillError('manifest_file_invalid', 'backup manifest file is invalid');
  }
  let descriptor;
  try {
    descriptor = openSync(
      resolve(path),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_MANIFEST_BYTES) {
      throw new DrillError('manifest_file_invalid', 'backup manifest file is invalid');
    }
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error instanceof DrillError) throw error;
    throw new DrillError('manifest_file_invalid', 'backup manifest file is invalid');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function normalizeDrillError(error, fallbackCode = 'backup_restore_drill_failed') {
  if (error instanceof DrillError) return error;
  return new DrillError(fallbackCode, 'backup restore drill failed');
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
    };
  }
  return {
    ok: false,
    code: 'backup_restore_drill_failed',
  };
}

function usage() {
  return `Usage: backup-restore-drill.mjs --primary-database-url URL --restored-database-url URL --restored-runtime-database-url URL --tenant-id UUID --other-tenant-id UUID --backup-set-manifest FILE --verification-key FILE --approved-region REGION --profile-fingerprint SHA256 [options]

Options:
  --other-tenant-id UUID   Different synthetic tenant used for the RLS denial proof
  --backup-set-manifest    Signed COMPLETE backup-set manifest
  --verification-key FILE  Independent Ed25519 public verification key
  --approved-region VALUE  Approved domestic provider region
  --profile-fingerprint    Exact production-profile SHA-256
  --api-base-url URL        API origin or /v1 base used to record the drill ledger row
  --session-cookie COOKIE   Admin Cookie header for the snapshot ledger request
  --scope VALUE             tenant, audit, or configuration (default: tenant)
  --reason-code CODE        Bounded uppercase reason code (default: MONTHLY_DRILL)
  --drill-id REF            Bounded drill reference (default: restore-drill-YYYY-MM-DD)
  --evidence-ref REF        Bounded external evidence reference
  --dry-run                 Verify direct proofs without recording to the API

The CLI must be invoked through an operator-owned wrapper that injects an exact-version
reader plus teardown and cleanup-verification callbacks. Without that adapter the command
fails with external_restore_adapter_required and does not claim a completed restore.
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
