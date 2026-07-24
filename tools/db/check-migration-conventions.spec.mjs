import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-migration-conventions.mjs', import.meta.url));

function validate(sql) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'amic-vault-migration-convention-'));
  try {
    writeFileSync(path.join(directory, '0001_fixture.sql'), sql);
    const result = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test('permits a documented global reference table only when the exemption is adjacent', () => {
  const result = validate(`
-- RLS-EXEMPT: this pre-authentication reference has no known tenant context.
-- It may contain only non-identifying HMAC references.
CREATE TABLE auth_throttle_states (
  reference_hash text NOT NULL
);
`);

  assert.equal(result.status, 0, result.output);
});

test('does not let a remote RLS exemption bypass a tenant business table', () => {
  const result = validate(`
-- RLS-EXEMPT: this comment belongs only to the immediately following global reference.
CREATE TABLE global_reference (
  reference_hash text NOT NULL
);

CREATE TABLE tenant_business_rows (
  row_id uuid PRIMARY KEY
);
`);

  assert.equal(result.status, 1);
  assert.match(result.output, /tenant_business_rows: missing tenant_id uuid NOT NULL/);
});

test('continues to require full RLS for a normal tenant table', () => {
  const result = validate(`
CREATE TABLE tenant_business_rows (
  row_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL
);
ALTER TABLE tenant_business_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_business_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_business_rows_tenant ON tenant_business_rows USING (true);
`);

  assert.equal(result.status, 0, result.output);
});
