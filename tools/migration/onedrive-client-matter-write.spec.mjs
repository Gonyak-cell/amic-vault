import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWriteTargets,
  matterTypeToDb,
  parseArgs,
} from './onedrive-client-matter-write.mjs';
import { sha256Hex } from './onedrive-target-resolution-dry-run.mjs';

test('maps approved English matter types to Vault DB enums', () => {
  assert.equal(matterTypeToDb('Criminal'), 'investigation');
  assert.equal(matterTypeToDb('Civil'), 'litigation');
  assert.equal(matterTypeToDb('Advisory'), 'advisory');
  assert.equal(matterTypeToDb('M&A'), 'ma');
  assert.equal(matterTypeToDb('Tax'), null);
});

test('builds write targets from approved groups without raw path dependency', () => {
  const matterCode = '알파/Civil/계약분쟁';
  const targets = buildWriteTargets({
    planRows: [
      {
        matter_code_hash: sha256Hex(matterCode),
        client_short_name: '알파',
        matter_type_english: 'Civil',
        matter_detail_type_korean: '계약분쟁',
        approved_group_count: 2,
        approved_group_ids: ['g1', 'g2'],
      },
    ],
    approvedGroupRows: [
      {
        group_id: 'g1',
        client_short_name: '알파',
        matter_type_english: 'Civil',
        matter_detail_type_korean: '계약분쟁',
        matter_code: matterCode,
      },
      {
        group_id: 'g2',
        client_short_name: '알파',
        matter_type_english: 'Civil',
        matter_detail_type_korean: '계약분쟁',
        matter_code: matterCode,
      },
    ],
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].dbMatterType, 'litigation');
  assert.equal(targets[0].approvedGroupCount, 2);
  assert.deepEqual(targets[0].validationBlockers, []);
});

test('blocks unsupported or mismatched matter code candidates before write', () => {
  const approvedMatterCode = '알파/Civil/계약분쟁';
  const mismatchedMatterCode = '알파/Tax/계약분쟁';
  const targets = buildWriteTargets({
    planRows: [
      {
        matter_code_hash: sha256Hex(approvedMatterCode),
        client_short_name: '알파',
        matter_type_english: 'Tax',
        matter_detail_type_korean: '계약분쟁',
        approved_group_count: 1,
        approved_group_ids: ['g1'],
      },
    ],
    approvedGroupRows: [
      {
        group_id: 'g1',
        client_short_name: '알파',
        matter_type_english: 'Tax',
        matter_detail_type_korean: '계약분쟁',
        matter_code: mismatchedMatterCode,
      },
    ],
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].dbMatterType, null);
  assert.deepEqual(targets[0].validationBlockers, [
    'approved_group_missing_for_target_hash',
    'unsupported_matter_type_english',
    'missing_matter_code',
    'unsupported_db_matter_type',
  ]);
});

test('parses execute-mode write cli arguments', () => {
  const args = parseArgs([
    '--tenant-id',
    'tenant-id',
    '--operator-user-id',
    'operator-id',
    '--migration-run-id',
    'run-id',
    '--output-dir',
    'out',
    '--execute',
  ]);

  assert.equal(args.tenantId, 'tenant-id');
  assert.equal(args.operatorUserId, 'operator-id');
  assert.equal(args.migrationRunId, 'run-id');
  assert.equal(args.outputDir, 'out');
  assert.equal(args.execute, true);
});
