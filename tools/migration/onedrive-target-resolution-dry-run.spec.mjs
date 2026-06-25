import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApprovedTargets,
  normalizedClientKey,
  resolveTargets,
  sha256Hex,
  summarizeResults,
  validateTarget,
} from './onedrive-target-resolution-dry-run.mjs';

test('normalizes legal suffixes for target client matching', () => {
  assert.equal(normalizedClientKey('(주)알파 주식회사'), normalizedClientKey('알파'));
  assert.equal(normalizedClientKey('법무법인 베타'), normalizedClientKey('베타'));
});

test('builds approved targets by matter code hash without expanding duplicate groups', () => {
  const matterCode = '알파/Civil/계약분쟁';
  const targets = buildApprovedTargets({
    planRows: [
      {
        matter_code_hash: sha256Hex(matterCode),
        client_short_name: '알파',
        matter_type_english: 'Civil',
        matter_detail_type_korean: '계약분쟁',
        approved_group_count: 2,
        approved_group_ids: ['group-1', 'group-2'],
      },
    ],
    approvedGroupRows: [
      {
        group_id: 'group-1',
        client_short_name: '알파',
        matter_type_english: 'Civil',
        matter_detail_type_korean: '계약분쟁',
        matter_code: matterCode,
      },
      {
        group_id: 'group-2',
        client_short_name: '알파',
        matter_type_english: 'Civil',
        matter_detail_type_korean: '계약분쟁',
        matter_code: matterCode,
      },
    ],
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].approvedGroupCount, 2);
  assert.equal(validateTarget(targets[0]).length, 0);
});

test('resolves approved targets against a local DB snapshot as dry-run only', () => {
  const existingCode = '알파/Civil/계약분쟁';
  const existingClientCode = '베타/M&A/인수';
  const newCode = '감마/Advisory/자문';
  const mismatchCode = '델타/Criminal/고소';
  const targets = [
    {
      matterCodeHash: sha256Hex(existingCode),
      matterCode: existingCode,
      clientShortName: '알파',
      matterTypeEnglish: 'Civil',
      matterDetailTypeKorean: '계약분쟁',
      approvedGroupCount: 1,
      approvedGroupIds: ['group-1'],
    },
    {
      matterCodeHash: sha256Hex(existingClientCode),
      matterCode: existingClientCode,
      clientShortName: '베타',
      matterTypeEnglish: 'M&A',
      matterDetailTypeKorean: '인수',
      approvedGroupCount: 1,
      approvedGroupIds: ['group-2'],
    },
    {
      matterCodeHash: sha256Hex(newCode),
      matterCode: newCode,
      clientShortName: '감마',
      matterTypeEnglish: 'Advisory',
      matterDetailTypeKorean: '자문',
      approvedGroupCount: 1,
      approvedGroupIds: ['group-3'],
    },
    {
      matterCodeHash: sha256Hex(mismatchCode),
      matterCode: mismatchCode,
      clientShortName: '델타',
      matterTypeEnglish: 'Criminal',
      matterDetailTypeKorean: '고소',
      approvedGroupCount: 1,
      approvedGroupIds: ['group-4'],
    },
  ];
  const results = resolveTargets(targets, {
    clients: [
      { client_id: 'client-alpha', name: '(주)알파 주식회사', status: 'active' },
      { client_id: 'client-beta', name: '베타', status: 'active' },
      { client_id: 'client-delta', name: '다른델타', status: 'active' },
    ],
    matters: [
      {
        matter_id: 'matter-alpha',
        client_id: 'client-alpha',
        matter_code: existingCode,
        matter_type: 'litigation',
        status: 'active',
      },
      {
        matter_id: 'matter-delta',
        client_id: 'client-delta',
        matter_code: mismatchCode,
        matter_type: 'other',
        status: 'active',
      },
    ],
  });

  assert.deepEqual(
    results.map((result) => result.state),
    [
      'existing_matter_matched',
      'planned_create_matter_existing_client',
      'planned_create_client_and_matter',
      'blocked',
    ],
  );
  assert.deepEqual(results[3].blockers, ['existing_matter_type_mismatch', 'existing_matter_client_mismatch']);
  assert.equal(summarizeResults(results).blocked, 1);
});
