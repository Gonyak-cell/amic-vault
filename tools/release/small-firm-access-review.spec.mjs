import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { Client } from 'pg';

import {
  AccessReviewError,
  buildAccessReviewManifest,
  main,
  readDatabaseUrlFile,
  readTenantIdFile,
  runAccessReview,
  verifyAccessReviewManifest,
  writeAccessReviewManifest,
} from './small-firm-access-review.mjs';

const fixturePath = fileURLToPath(
  new URL('../../tests/fixtures/small-firm-access-review/review-rows.json', import.meta.url),
);
const seedFixturePath = fileURLToPath(
  new URL('../../tests/fixtures/seed/users.json', import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const seedFixture = JSON.parse(readFileSync(seedFixturePath, 'utf8'));
const runtimeDatabaseUrl =
  process.env.DATABASE_RUNTIME_URL ??
  'postgres://vault_app:vault_app_dev_password@localhost:5432/amic_vault';
const migrationDatabaseUrl =
  process.env.DATABASE_MIGRATION_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

function writeOwnerFile(path, value) {
  writeFileSync(path, value, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function cleanRow(index = 1) {
  return {
    user_id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    status: 'active',
    role: 'matter_member',
    mfa_enabled: true,
    active_mfa_secret: true,
    last_login_at: '2026-07-25T09:00:00.000Z',
    matter_membership_count: '1',
    active_session_count: '0',
    active_preview_session_count: '0',
    open_upload_authority_count: '0',
  };
}

function createFakeClient(rows, orphanMembershipCount = '0') {
  const queries = [];
  return {
    queries,
    connected: false,
    ended: false,
    async connect() {
      this.connected = true;
    },
    async query(text, values = []) {
      queries.push({ text, values });
      if (text.includes('FROM users u')) return { rows };
      if (text.includes('FROM matter_members mm')) {
        return { rows: [{ orphan_membership_count: orphanMembershipCount }] };
      }
      return { rows: [] };
    },
    async end() {
      this.ended = true;
    },
  };
}

function collectStream() {
  let value = '';
  return {
    write(chunk) {
      value += String(chunk);
    },
    value() {
      return value;
    },
  };
}

async function tenantRowCounts(connectionString, tenantId) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT
          (SELECT count(*)::text FROM users WHERE tenant_id = $1) AS users,
          (SELECT count(*)::text FROM sessions WHERE tenant_id = $1) AS sessions,
          (SELECT count(*)::text FROM preview_access_sessions WHERE tenant_id = $1) AS previews,
          (SELECT count(*)::text FROM bulk_upload_batch_items WHERE tenant_id = $1) AS upload_items,
          (SELECT count(*)::text FROM audit_events WHERE tenant_id = $1) AS audit_events
      `,
      [tenantId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

describe('small-firm monthly access review', () => {
  it('creates deterministic opaque manifests and never exports raw canaries', () => {
    const first = buildAccessReviewManifest(fixture);
    const second = buildAccessReviewManifest({ ...fixture, rows: [...fixture.rows].reverse() });
    const serialized = JSON.stringify(first);

    assert.deepEqual(first, second);
    assert.equal(first.accountCount, fixture.rows.length);
    assert.deepEqual(
      first.accounts.map((account) => account.accountRef),
      [...first.accounts.map((account) => account.accountRef)].sort(),
    );
    assert.match(first.payloadSha256, /^sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(verifyAccessReviewManifest(first), {
      status: 'VERIFIED',
      accountCount: fixture.rows.length,
      findingCount: first.findings.length,
      payloadSha256: first.payloadSha256,
    });
    assert.equal(serialized.includes(fixture.tenantId), false);
    for (const row of fixture.rows) assert.equal(serialized.includes(row.user_id), false);
    for (const canary of Object.values(fixture.canaries))
      assert.equal(serialized.includes(canary), false);
  });

  it('uses tenant context before data reads and emits every closed review finding', async () => {
    const client = createFakeClient(fixture.rows, fixture.orphanMembershipCount);
    const manifest = await runAccessReview({
      databaseUrl: 'postgres://reviewer:password@localhost:5432/review',
      tenantId: fixture.tenantId,
      reviewMonth: fixture.reviewMonth,
      clientFactory: () => client,
    });

    const tenantContext = client.queries.findIndex((query) => query.text.includes('set_config'));
    const accountRead = client.queries.findIndex((query) => query.text.includes('FROM users u'));
    const orphanRead = client.queries.findIndex((query) =>
      query.text.includes('LEFT JOIN users u'),
    );
    assert.equal(client.queries[0].text, 'BEGIN READ ONLY');
    assert.ok(tenantContext > 0);
    assert.ok(tenantContext < accountRead);
    assert.ok(tenantContext < orphanRead);
    assert.deepEqual(client.queries[tenantContext].values, [
      'app.current_tenant_id',
      fixture.tenantId,
    ]);
    assert.equal(client.queries.at(-1).text, 'COMMIT');
    assert.equal(client.connected, true);
    assert.equal(client.ended, true);
    assert.deepEqual(manifest.findings, [
      'ADMIN_MFA_MISSING',
      'INACTIVE_ACCOUNT_ACTIVE_PREVIEW_SESSION',
      'INACTIVE_ACCOUNT_ACTIVE_SESSION',
      'INACTIVE_ACCOUNT_OPEN_UPLOAD_AUTHORITY',
      'ORPHAN_MATTER_MEMBERSHIP',
      'STALE_ACTIVE_ACCOUNT',
    ]);
    assert.equal(
      manifest.accounts.some(
        (account) =>
          account.status === 'locked' &&
          account.offboardingState === 'review_required' &&
          account.activePreviewSessionCount === 1 &&
          account.openUploadAuthorityCount === 1,
      ),
      true,
    );
  });

  it('returns PASS for a clean account and enforces the twenty-account ceiling', () => {
    const clean = buildAccessReviewManifest({
      tenantId: fixture.tenantId,
      reviewMonth: fixture.reviewMonth,
      rows: [cleanRow()],
      orphanMembershipCount: '0',
    });
    assert.deepEqual(clean.findings, []);
    assert.equal(clean.accounts[0].offboardingState, 'clear');

    const twenty = buildAccessReviewManifest({
      tenantId: fixture.tenantId,
      reviewMonth: fixture.reviewMonth,
      rows: Array.from({ length: 20 }, (_, index) => cleanRow(index + 1)),
      orphanMembershipCount: '0',
    });
    assert.equal(twenty.accountCount, 20);
    assert.throws(
      () =>
        buildAccessReviewManifest({
          tenantId: fixture.tenantId,
          reviewMonth: fixture.reviewMonth,
          rows: Array.from({ length: 21 }, (_, index) => cleanRow(index + 1)),
          orphanMembershipCount: '0',
        }),
      (error) =>
        error instanceof AccessReviewError && error.code === 'ACCESS_REVIEW_ACCOUNT_LIMIT_EXCEEDED',
    );
  });

  it('rejects malformed closed enums, counts, timestamps, and manifest shape', async (t) => {
    const cases = [
      {
        name: 'unknown role',
        mutate: (row) => {
          row.role = 'administrator';
        },
      },
      {
        name: 'unknown status',
        mutate: (row) => {
          row.status = 'disabled';
        },
      },
      {
        name: 'negative count',
        mutate: (row) => {
          row.active_session_count = '-1';
        },
      },
      {
        name: 'malformed timestamp',
        mutate: (row) => {
          row.last_login_at = 'not-a-timestamp';
        },
      },
      {
        name: 'mfa flag not boolean',
        mutate: (row) => {
          row.mfa_enabled = 'true';
        },
      },
    ];
    for (const testCase of cases) {
      await t.test(testCase.name, () => {
        const row = cleanRow();
        testCase.mutate(row);
        assert.throws(
          () =>
            buildAccessReviewManifest({
              tenantId: fixture.tenantId,
              reviewMonth: fixture.reviewMonth,
              rows: [row],
              orphanMembershipCount: '0',
            }),
          (error) =>
            error instanceof AccessReviewError && error.code === 'ACCESS_REVIEW_ROW_INVALID',
        );
      });
    }
    const manifest = buildAccessReviewManifest({
      tenantId: fixture.tenantId,
      reviewMonth: fixture.reviewMonth,
      rows: [cleanRow()],
      orphanMembershipCount: '0',
    });
    manifest.accounts[0].mfa = 'unknown';
    assert.throws(
      () => verifyAccessReviewManifest(manifest),
      (error) =>
        error instanceof AccessReviewError &&
        error.code === 'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
    );
    const hashTampered = buildAccessReviewManifest({
      tenantId: fixture.tenantId,
      reviewMonth: fixture.reviewMonth,
      rows: [cleanRow()],
      orphanMembershipCount: '0',
    });
    hashTampered.tenantScopeHash = `sha256:${'0'.repeat(64)}`;
    assert.throws(
      () => verifyAccessReviewManifest(hashTampered),
      (error) =>
        error instanceof AccessReviewError && error.code === 'ACCESS_REVIEW_MANIFEST_HASH_INVALID',
    );
    const policyTampered = buildAccessReviewManifest({
      tenantId: fixture.tenantId,
      reviewMonth: fixture.reviewMonth,
      rows: [cleanRow()],
      orphanMembershipCount: '0',
    });
    policyTampered.accounts[0].offboardingState = 'review_required';
    assert.throws(
      () => verifyAccessReviewManifest(policyTampered),
      (error) =>
        error instanceof AccessReviewError &&
        error.code === 'ACCESS_REVIEW_MANIFEST_ACCOUNT_INVALID',
    );
  });

  it('rejects malformed, oversized, or symlinked owner-only runtime files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'amic-vault-access-review-input-'));
    try {
      const databaseUrlPath = join(directory, 'database-url');
      const tenantIdPath = join(directory, 'tenant-id');
      writeOwnerFile(databaseUrlPath, 'postgres://reviewer:password@localhost:5432/review');
      writeOwnerFile(tenantIdPath, fixture.tenantId);
      assert.match(readDatabaseUrlFile(databaseUrlPath), /^postgres:/u);
      assert.equal(readTenantIdFile(tenantIdPath), fixture.tenantId);

      writeOwnerFile(join(directory, 'malformed-url'), 'not-a-database-url');
      assert.throws(
        () => readDatabaseUrlFile(join(directory, 'malformed-url')),
        (error) =>
          error instanceof AccessReviewError &&
          error.code === 'ACCESS_REVIEW_DATABASE_URL_FILE_INVALID',
      );
      writeOwnerFile(join(directory, 'oversized-url'), 'x'.repeat(8 * 1024 + 1));
      assert.throws(
        () => readDatabaseUrlFile(join(directory, 'oversized-url')),
        (error) =>
          error instanceof AccessReviewError &&
          error.code === 'ACCESS_REVIEW_DATABASE_URL_FILE_INVALID',
      );
      symlinkSync(databaseUrlPath, join(directory, 'symlink-url'));
      assert.throws(
        () => readDatabaseUrlFile(join(directory, 'symlink-url')),
        (error) =>
          error instanceof AccessReviewError &&
          error.code === 'ACCESS_REVIEW_DATABASE_URL_FILE_INVALID',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('writes atomically without overwriting an existing manifest and returns review-required nonzero', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'amic-vault-access-review-output-'));
    try {
      const outputPath = resolve(directory, 'review.json');
      const databaseUrlPath = join(directory, 'database-url');
      const tenantIdPath = join(directory, 'tenant-id');
      writeOwnerFile(databaseUrlPath, 'postgres://reviewer:password@localhost:5432/review');
      writeOwnerFile(tenantIdPath, fixture.tenantId);
      const manifest = buildAccessReviewManifest(fixture);
      writeAccessReviewManifest(outputPath, manifest);
      const firstBody = readFileSync(outputPath, 'utf8');
      assert.throws(
        () => writeAccessReviewManifest(outputPath, manifest),
        (error) =>
          error instanceof AccessReviewError &&
          error.code === 'ACCESS_REVIEW_OUTPUT_ALREADY_EXISTS',
      );
      assert.equal(readFileSync(outputPath, 'utf8'), firstBody);

      const reviewOutputPath = resolve(directory, 'review-required.json');
      const stdout = collectStream();
      const stderr = collectStream();
      const code = await main(
        [
          '--database-url-file',
          databaseUrlPath,
          '--tenant-id-file',
          tenantIdPath,
          '--review-month',
          fixture.reviewMonth,
          '--output',
          reviewOutputPath,
        ],
        {
          clientFactory: () => createFakeClient(fixture.rows, fixture.orphanMembershipCount),
          stdout,
          stderr,
        },
      );
      assert.equal(code, 1);
      assert.equal(stderr.value(), '');
      assert.match(stdout.value(), /"status":"REVIEW_REQUIRED"/u);
      const written = JSON.parse(readFileSync(reviewOutputPath, 'utf8'));
      assert.deepEqual(verifyAccessReviewManifest(written), {
        status: 'VERIFIED',
        accountCount: fixture.rows.length,
        findingCount: written.findings.length,
        payloadSha256: written.payloadSha256,
      });
      const verifyOutput = collectStream();
      assert.equal(
        await main(['--verify-manifest', reviewOutputPath], {
          stdout: verifyOutput,
          stderr: collectStream(),
        }),
        0,
      );
      assert.match(verifyOutput.value(), /"status":"VERIFIED"/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('runs against the local synthetic database in a read-only tenant transaction', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'amic-vault-access-review-db-'));
    const tenantId = seedFixture.tenants[0].tenantId;
    try {
      const databaseUrlPath = join(directory, 'database-url');
      const tenantIdPath = join(directory, 'tenant-id');
      const outputPath = resolve(directory, 'review.json');
      writeOwnerFile(databaseUrlPath, runtimeDatabaseUrl);
      writeOwnerFile(tenantIdPath, tenantId);
      const before = await tenantRowCounts(migrationDatabaseUrl, tenantId);
      const stdout = collectStream();
      const stderr = collectStream();
      const code = await main(
        [
          '--database-url-file',
          databaseUrlPath,
          '--tenant-id-file',
          tenantIdPath,
          '--review-month',
          fixture.reviewMonth,
          '--output',
          outputPath,
        ],
        { stdout, stderr },
      );
      const after = await tenantRowCounts(migrationDatabaseUrl, tenantId);
      const manifest = JSON.parse(readFileSync(outputPath, 'utf8'));

      assert.equal(code, 1);
      assert.equal(stderr.value(), '');
      assert.match(stdout.value(), /"status":"REVIEW_REQUIRED"/u);
      assert.ok(manifest.accountCount > 0 && manifest.accountCount <= 20);
      assert.match(manifest.payloadSha256, /^sha256:[a-f0-9]{64}$/u);
      assert.equal(verifyAccessReviewManifest(manifest).status, 'VERIFIED');
      assert.deepEqual(after, before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
