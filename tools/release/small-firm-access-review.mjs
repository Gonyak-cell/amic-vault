#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  linkSync,
  openSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client } from 'pg';

import { stableStringify } from './build-backup-set-manifest.mjs';

const ACCESS_REVIEW_SCHEMA_VERSION = 'amic-vault.sf20-access-review.v1';
const MAX_ACCOUNT_COUNT = 20;
const MAX_FILE_BYTES = 8 * 1024;
const MAX_MANIFEST_BYTES = 128 * 1024;
const STALE_ACCOUNT_DAYS = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HASHED_REFERENCE = /^ref:[a-f0-9]{16}$/u;
const REVIEW_MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const USER_STATUSES = Object.freeze(['active', 'inactive', 'locked']);
const USER_ROLES = Object.freeze([
  'firm_admin',
  'security_admin',
  'matter_owner',
  'matter_member',
  'limited_reviewer',
  'knowledge_manager',
  'external_user',
]);
const MFA_STATES = Object.freeze(['active', 'missing', 'inconsistent']);
const OFFBOARDING_STATES = Object.freeze(['clear', 'review_required']);
const FINDING_CODES = Object.freeze([
  'ADMIN_MFA_MISSING',
  'INACTIVE_ACCOUNT_ACTIVE_PREVIEW_SESSION',
  'INACTIVE_ACCOUNT_ACTIVE_SESSION',
  'INACTIVE_ACCOUNT_OPEN_UPLOAD_AUTHORITY',
  'MFA_STATE_INCONSISTENT',
  'ORPHAN_MATTER_MEMBERSHIP',
  'STALE_ACTIVE_ACCOUNT',
]);
const MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'reviewMonth',
  'tenantScopeHash',
  'accountCount',
  'accounts',
  'findings',
]);
const ACCOUNT_KEYS = Object.freeze([
  'accountRef',
  'status',
  'role',
  'admin',
  'mfa',
  'matterMembershipCount',
  'lastLoginAt',
  'activeSessionCount',
  'activePreviewSessionCount',
  'openUploadAuthorityCount',
  'offboardingState',
]);

const ACCOUNT_QUERY = `
  SELECT
    u.user_id::text AS user_id,
    u.status,
    u.role,
    u.mfa_enabled,
    u.last_login_at,
    EXISTS (
      SELECT 1
      FROM mfa_secrets ms
      WHERE ms.tenant_id = u.tenant_id
        AND ms.user_id = u.user_id
        AND ms.status = 'active'
    ) AS active_mfa_secret,
    (
      SELECT count(*)::text
      FROM matter_members mm
      WHERE mm.tenant_id = u.tenant_id
        AND mm.user_id = u.user_id
    ) AS matter_membership_count,
    (
      SELECT count(*)::text
      FROM sessions s
      WHERE s.tenant_id = u.tenant_id
        AND s.user_id = u.user_id
        AND s.revoked_at IS NULL
        AND s.expires_at > clock_timestamp()
    ) AS active_session_count,
    (
      SELECT count(*)::text
      FROM preview_access_sessions ps
      WHERE ps.tenant_id = u.tenant_id
        AND ps.user_id = u.user_id
        AND ps.revoked_at IS NULL
        AND ps.expires_at > clock_timestamp()
    ) AS active_preview_session_count,
    (
      SELECT count(*)::text
      FROM bulk_upload_batch_items bi
      WHERE bi.tenant_id = u.tenant_id
        AND bi.actor_user_id = u.user_id
        AND bi.status IN ('pending', 'uploaded')
    ) AS open_upload_authority_count
  FROM users u
  WHERE u.tenant_id = $1
  ORDER BY u.user_id ASC
`;

const ORPHAN_MEMBERSHIP_QUERY = `
  SELECT count(*)::text AS orphan_membership_count
  FROM matter_members mm
  LEFT JOIN users u
    ON u.tenant_id = mm.tenant_id
    AND u.user_id = mm.user_id
  WHERE mm.tenant_id = $1
    AND u.user_id IS NULL
`;

export class AccessReviewError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AccessReviewError';
    this.code = code;
  }
}

function fail(code) {
  throw new AccessReviewError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected, code) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value);
  assert(
    actual.length === expected.length &&
      actual.every((key) => expected.includes(key)) &&
      expected.every((key) => actual.includes(key)),
    code,
  );
}

function parseTenantId(value, code) {
  assert(typeof value === 'string' && UUID.test(value), code);
  return value.toLowerCase();
}

function reviewMonthEnd(value, code) {
  assert(typeof value === 'string' && REVIEW_MONTH.test(value), code);
  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  assert(end.getUTCFullYear() === year && end.getUTCMonth() === month - 1, code);
  return end;
}

function normalizedTimestamp(value, code) {
  if (value === null) return null;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  assert(Number.isFinite(milliseconds), code);
  const normalized = new Date(milliseconds).toISOString();
  assert(TIMESTAMP.test(normalized), code);
  return normalized;
}

function boundedCount(value, code) {
  const normalized =
    typeof value === 'string' && /^\d+$/u.test(value)
      ? Number(value)
      : typeof value === 'number'
        ? value
        : Number.NaN;
  assert(Number.isSafeInteger(normalized) && normalized >= 0 && normalized <= 1_000_000, code);
  return normalized;
}

function hashTenantScope(tenantId) {
  return `sha256:${sha256(`amic-vault:sf20-access-review:tenant:v1:${tenantId}`)}`;
}

function hashAccountReference(tenantId, userId) {
  return `ref:${sha256(`amic-vault:sf20-access-review:account:v1:${tenantId}:${userId}`).slice(0, 16)}`;
}

function isAdministrator(role) {
  return role === 'firm_admin' || role === 'security_admin';
}

function mfaState(mfaEnabled, activeMfaSecret) {
  assert(
    typeof mfaEnabled === 'boolean' && typeof activeMfaSecret === 'boolean',
    'ACCESS_REVIEW_ROW_INVALID',
  );
  if (mfaEnabled && activeMfaSecret) return 'active';
  if (!mfaEnabled && !activeMfaSecret) return 'missing';
  return 'inconsistent';
}

function staleAccount(lastLoginAt, reviewEnd) {
  if (lastLoginAt === null) return true;
  return Date.parse(lastLoginAt) < reviewEnd.getTime() - STALE_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

function normalizeAccountRow(row, tenantId, reviewEnd) {
  assert(
    row !== null && typeof row === 'object' && !Array.isArray(row),
    'ACCESS_REVIEW_ROW_INVALID',
  );
  const userId = parseTenantId(row.user_id, 'ACCESS_REVIEW_ROW_INVALID');
  const status = row.status;
  const role = row.role;
  assert(USER_STATUSES.includes(status) && USER_ROLES.includes(role), 'ACCESS_REVIEW_ROW_INVALID');

  const lastLoginAt = normalizedTimestamp(row.last_login_at, 'ACCESS_REVIEW_ROW_INVALID');
  const activeSessionCount = boundedCount(row.active_session_count, 'ACCESS_REVIEW_ROW_INVALID');
  const activePreviewSessionCount = boundedCount(
    row.active_preview_session_count,
    'ACCESS_REVIEW_ROW_INVALID',
  );
  const openUploadAuthorityCount = boundedCount(
    row.open_upload_authority_count,
    'ACCESS_REVIEW_ROW_INVALID',
  );
  const normalizedMfaState = mfaState(row.mfa_enabled, row.active_mfa_secret);
  const inactiveAuthority =
    status !== 'active' &&
    (activeSessionCount > 0 || activePreviewSessionCount > 0 || openUploadAuthorityCount > 0);
  const account = {
    accountRef: hashAccountReference(tenantId, userId),
    status,
    role,
    admin: isAdministrator(role),
    mfa: normalizedMfaState,
    matterMembershipCount: boundedCount(row.matter_membership_count, 'ACCESS_REVIEW_ROW_INVALID'),
    lastLoginAt,
    activeSessionCount,
    activePreviewSessionCount,
    openUploadAuthorityCount,
    offboardingState: inactiveAuthority ? 'review_required' : 'clear',
  };
  const findings = [];
  if (account.admin && account.mfa !== 'active') findings.push('ADMIN_MFA_MISSING');
  if (account.mfa === 'inconsistent') findings.push('MFA_STATE_INCONSISTENT');
  if (account.status === 'active' && staleAccount(account.lastLoginAt, reviewEnd)) {
    findings.push('STALE_ACTIVE_ACCOUNT');
  }
  if (account.status !== 'active' && account.activeSessionCount > 0) {
    findings.push('INACTIVE_ACCOUNT_ACTIVE_SESSION');
  }
  if (account.status !== 'active' && account.activePreviewSessionCount > 0) {
    findings.push('INACTIVE_ACCOUNT_ACTIVE_PREVIEW_SESSION');
  }
  if (account.status !== 'active' && account.openUploadAuthorityCount > 0) {
    findings.push('INACTIVE_ACCOUNT_OPEN_UPLOAD_AUTHORITY');
  }
  return { account, findings };
}

function manifestPayload(manifest) {
  return Object.fromEntries(MANIFEST_KEYS.map((key) => [key, manifest[key]]));
}

function assertManifestShape(manifest) {
  exactKeys(manifest, [...MANIFEST_KEYS, 'payloadSha256'], 'ACCESS_REVIEW_MANIFEST_SCHEMA_INVALID');
  const reviewEnd = reviewMonthEnd(manifest.reviewMonth, 'ACCESS_REVIEW_MANIFEST_SCHEMA_INVALID');
  assert(
    manifest.schemaVersion === ACCESS_REVIEW_SCHEMA_VERSION &&
      REVIEW_MONTH.test(manifest.reviewMonth) &&
      /^sha256:[a-f0-9]{64}$/u.test(manifest.tenantScopeHash) &&
      Number.isSafeInteger(manifest.accountCount) &&
      manifest.accountCount >= 0 &&
      manifest.accountCount <= MAX_ACCOUNT_COUNT &&
      Array.isArray(manifest.accounts) &&
      manifest.accounts.length === manifest.accountCount &&
      Array.isArray(manifest.findings) &&
      /^sha256:[a-f0-9]{64}$/u.test(manifest.payloadSha256),
    'ACCESS_REVIEW_MANIFEST_SCHEMA_INVALID',
  );

  const references = [];
  const expectedFindings = new Set();
  for (const account of manifest.accounts) {
    exactKeys(account, ACCOUNT_KEYS, 'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID');
    assert(
      HASHED_REFERENCE.test(account.accountRef) &&
        USER_STATUSES.includes(account.status) &&
        USER_ROLES.includes(account.role) &&
        typeof account.admin === 'boolean' &&
        MFA_STATES.includes(account.mfa) &&
        Number.isSafeInteger(account.matterMembershipCount) &&
        account.matterMembershipCount >= 0 &&
        Number.isSafeInteger(account.activeSessionCount) &&
        account.activeSessionCount >= 0 &&
        Number.isSafeInteger(account.activePreviewSessionCount) &&
        account.activePreviewSessionCount >= 0 &&
        Number.isSafeInteger(account.openUploadAuthorityCount) &&
        account.openUploadAuthorityCount >= 0 &&
        OFFBOARDING_STATES.includes(account.offboardingState) &&
        (account.lastLoginAt === null || TIMESTAMP.test(account.lastLoginAt)),
      'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
    );
    if (account.lastLoginAt !== null) {
      assert(
        normalizedTimestamp(account.lastLoginAt, 'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID') ===
          account.lastLoginAt,
        'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
      );
    }
    assert(
      account.admin === isAdministrator(account.role),
      'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
    );
    const inactiveAuthority =
      account.status !== 'active' &&
      (account.activeSessionCount > 0 ||
        account.activePreviewSessionCount > 0 ||
        account.openUploadAuthorityCount > 0);
    assert(
      account.offboardingState === (inactiveAuthority ? 'review_required' : 'clear'),
      'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
    );
    if (account.admin && account.mfa !== 'active') expectedFindings.add('ADMIN_MFA_MISSING');
    if (account.mfa === 'inconsistent') expectedFindings.add('MFA_STATE_INCONSISTENT');
    if (account.status === 'active' && staleAccount(account.lastLoginAt, reviewEnd)) {
      expectedFindings.add('STALE_ACTIVE_ACCOUNT');
    }
    if (account.status !== 'active' && account.activeSessionCount > 0) {
      expectedFindings.add('INACTIVE_ACCOUNT_ACTIVE_SESSION');
    }
    if (account.status !== 'active' && account.activePreviewSessionCount > 0) {
      expectedFindings.add('INACTIVE_ACCOUNT_ACTIVE_PREVIEW_SESSION');
    }
    if (account.status !== 'active' && account.openUploadAuthorityCount > 0) {
      expectedFindings.add('INACTIVE_ACCOUNT_OPEN_UPLOAD_AUTHORITY');
    }
    references.push(account.accountRef);
  }
  assert(
    references.every((reference, index) => index === 0 || references[index - 1] < reference) &&
      new Set(references).size === references.length,
    'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
  );
  assert(
    manifest.findings.every((finding) => FINDING_CODES.includes(finding)) &&
      manifest.findings.every(
        (finding, index) => index === 0 || manifest.findings[index - 1] < finding,
      ) &&
      new Set(manifest.findings).size === manifest.findings.length,
    'ACCESS_REVIEW_MANIFEST_FINDINGS_INVALID',
  );
  const policyFindings = manifest.findings.filter(
    (finding) => finding !== 'ORPHAN_MATTER_MEMBERSHIP',
  );
  assert(
    policyFindings.length === expectedFindings.size &&
      policyFindings.every((finding) => expectedFindings.has(finding)),
    'ACCESS_REVIEW_MANIFEST_FINDINGS_INVALID',
  );
}

export function buildAccessReviewManifest({ tenantId, reviewMonth, rows, orphanMembershipCount }) {
  const normalizedTenantId = parseTenantId(tenantId, 'ACCESS_REVIEW_TENANT_INVALID');
  const reviewEnd = reviewMonthEnd(reviewMonth, 'ACCESS_REVIEW_MONTH_INVALID');
  assert(
    Array.isArray(rows) && rows.length <= MAX_ACCOUNT_COUNT,
    'ACCESS_REVIEW_ACCOUNT_LIMIT_EXCEEDED',
  );
  const normalized = rows.map((row) => normalizeAccountRow(row, normalizedTenantId, reviewEnd));
  const accounts = normalized
    .map(({ account }) => account)
    .sort((left, right) => left.accountRef.localeCompare(right.accountRef));
  assert(
    accounts.every(
      (account, index) => index === 0 || accounts[index - 1].accountRef !== account.accountRef,
    ),
    'ACCESS_REVIEW_ACCOUNT_REFERENCE_COLLISION',
  );
  const findings = normalized.flatMap(({ findings: rowFindings }) => rowFindings);
  if (boundedCount(orphanMembershipCount, 'ACCESS_REVIEW_ORPHAN_COUNT_INVALID') > 0) {
    findings.push('ORPHAN_MATTER_MEMBERSHIP');
  }
  const payload = {
    schemaVersion: ACCESS_REVIEW_SCHEMA_VERSION,
    reviewMonth,
    tenantScopeHash: hashTenantScope(normalizedTenantId),
    accountCount: accounts.length,
    accounts,
    findings: [...new Set(findings)].sort(),
  };
  const manifest = {
    ...payload,
    payloadSha256: `sha256:${sha256(stableStringify(payload))}`,
  };
  assertManifestShape(manifest);
  return manifest;
}

export function verifyAccessReviewManifest(manifest) {
  assertManifestShape(manifest);
  assert(
    manifest.payloadSha256 === `sha256:${sha256(stableStringify(manifestPayload(manifest)))}`,
    'ACCESS_REVIEW_MANIFEST_HASH_INVALID',
  );
  return {
    status: 'VERIFIED',
    accountCount: manifest.accountCount,
    findingCount: manifest.findings.length,
    payloadSha256: manifest.payloadSha256,
  };
}

function readBoundedOwnerFile(path, maximumBytes, code, { singleLine = true } = {}) {
  assert(
    typeof path === 'string' && isAbsolute(path) && !path.includes('\0'),
    'ACCESS_REVIEW_INPUT_PATH_INVALID',
  );
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = fstatSync(descriptor);
    const mode = metadata.mode & 0o777;
    const expectedUid = process.getuid?.();
    assert(
      metadata.isFile() &&
        metadata.size >= 1 &&
        metadata.size <= maximumBytes &&
        (mode & 0o077) === 0 &&
        (mode & 0o400) !== 0 &&
        (metadata.uid === 0 || (expectedUid !== undefined && metadata.uid === expectedUid)),
      code,
    );
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    assert(bytesRead >= 1 && bytesRead <= maximumBytes, code);
    const value = buffer.subarray(0, bytesRead).toString('utf8').trim();
    assert(value.length > 0 && (!singleLine || !/\s/u.test(value)), code);
    return value;
  } catch (error) {
    if (error instanceof AccessReviewError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readDatabaseUrlFile(path) {
  const value = readBoundedOwnerFile(
    path,
    MAX_FILE_BYTES,
    'ACCESS_REVIEW_DATABASE_URL_FILE_INVALID',
  );
  try {
    const url = new URL(value);
    assert(
      ['postgres:', 'postgresql:'].includes(url.protocol),
      'ACCESS_REVIEW_DATABASE_URL_FILE_INVALID',
    );
    assert(
      url.username.length > 0 && url.hostname.length > 0,
      'ACCESS_REVIEW_DATABASE_URL_FILE_INVALID',
    );
    return value;
  } catch (error) {
    if (error instanceof AccessReviewError) throw error;
    fail('ACCESS_REVIEW_DATABASE_URL_FILE_INVALID');
  }
}

export function readTenantIdFile(path) {
  return parseTenantId(
    readBoundedOwnerFile(path, 128, 'ACCESS_REVIEW_TENANT_ID_FILE_INVALID'),
    'ACCESS_REVIEW_TENANT_ID_FILE_INVALID',
  );
}

export function readAccessReviewManifestFile(path) {
  const body = readBoundedOwnerFile(
    path,
    MAX_MANIFEST_BYTES,
    'ACCESS_REVIEW_MANIFEST_FILE_INVALID',
    { singleLine: false },
  );
  try {
    return JSON.parse(body);
  } catch {
    fail('ACCESS_REVIEW_MANIFEST_FILE_INVALID');
  }
}

export function writeAccessReviewManifest(path, manifest) {
  assert(
    typeof path === 'string' && isAbsolute(path) && !path.includes('\0'),
    'ACCESS_REVIEW_OUTPUT_PATH_INVALID',
  );
  assertManifestShape(manifest);
  const target = resolve(path);
  const temporary = resolve(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${randomUUID()}`,
  );
  try {
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    linkSync(temporary, target);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('ACCESS_REVIEW_OUTPUT_ALREADY_EXISTS');
    if (error instanceof AccessReviewError) throw error;
    fail('ACCESS_REVIEW_OUTPUT_WRITE_FAILED');
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export async function runAccessReview({
  databaseUrl,
  tenantId,
  reviewMonth,
  clientFactory = (connectionString) => new Client({ connectionString }),
}) {
  assert(
    typeof databaseUrl === 'string' && databaseUrl.length > 0,
    'ACCESS_REVIEW_DATABASE_URL_INVALID',
  );
  const normalizedTenantId = parseTenantId(tenantId, 'ACCESS_REVIEW_TENANT_INVALID');
  reviewMonthEnd(reviewMonth, 'ACCESS_REVIEW_MONTH_INVALID');
  const client = clientFactory(databaseUrl);
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      normalizedTenantId,
    ]);
    const accountRows = await client.query(ACCOUNT_QUERY, [normalizedTenantId]);
    const orphanRows = await client.query(ORPHAN_MEMBERSHIP_QUERY, [normalizedTenantId]);
    await client.query('COMMIT');
    transactionOpen = false;
    return buildAccessReviewManifest({
      tenantId: normalizedTenantId,
      reviewMonth,
      rows: accountRows.rows,
      orphanMembershipCount: orphanRows.rows[0]?.orphan_membership_count,
    });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original closed error remains authoritative and is not printed.
      }
    }
    if (error instanceof AccessReviewError) throw error;
    fail('ACCESS_REVIEW_DATABASE_QUERY_FAILED');
  } finally {
    try {
      await client.end();
    } catch {
      // Connection cleanup cannot turn a completed read-only review into a success claim.
    }
  }
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'database-url-file': { type: 'string' },
      'tenant-id-file': { type: 'string' },
      'review-month': { type: 'string' },
      output: { type: 'string' },
      'verify-manifest': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (values['verify-manifest']) {
    assert(
      !values['database-url-file'] &&
        !values['tenant-id-file'] &&
        !values['review-month'] &&
        !values.output,
      'ACCESS_REVIEW_CLI_MODE_INVALID',
    );
    return { verifyManifest: values['verify-manifest'] };
  }
  for (const option of ['database-url-file', 'tenant-id-file', 'review-month', 'output']) {
    assert(values[option], 'ACCESS_REVIEW_CLI_OPTION_REQUIRED');
  }
  return {
    databaseUrlFile: values['database-url-file'],
    tenantIdFile: values['tenant-id-file'],
    reviewMonth: values['review-month'],
    output: values.output,
  };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  try {
    const options = parseCli(argv);
    if (options.help) {
      stdout.write(
        'Usage: small-firm-access-review.mjs --database-url-file ABSOLUTE_FILE --tenant-id-file ABSOLUTE_FILE --review-month YYYY-MM --output ABSOLUTE_FILE\n       small-firm-access-review.mjs --verify-manifest ABSOLUTE_FILE\n',
      );
      return 0;
    }
    if (options.verifyManifest) {
      stdout.write(
        `${JSON.stringify(verifyAccessReviewManifest(readAccessReviewManifestFile(options.verifyManifest)))}\n`,
      );
      return 0;
    }
    const manifest = await runAccessReview({
      databaseUrl: readDatabaseUrlFile(options.databaseUrlFile),
      tenantId: readTenantIdFile(options.tenantIdFile),
      reviewMonth: options.reviewMonth,
      clientFactory: deps.clientFactory,
    });
    writeAccessReviewManifest(options.output, manifest);
    const status = manifest.findings.length === 0 ? 'PASS' : 'REVIEW_REQUIRED';
    stdout.write(
      `${JSON.stringify({
        status,
        accountCount: manifest.accountCount,
        findingCount: manifest.findings.length,
        payloadSha256: manifest.payloadSha256,
      })}\n`,
    );
    return status === 'PASS' ? 0 : 1;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({
        status: 'FAILED',
        code: error instanceof AccessReviewError ? error.code : 'ACCESS_REVIEW_FAILED',
      })}\n`,
    );
    return 1;
  }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) process.exitCode = await main();
