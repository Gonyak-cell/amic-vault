import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  FROZEN_TUW_IDS,
  assertExactTuwIdSet,
  buildLedgerFromPlan,
  parseTuwBlocks,
  parseTuwHeading,
} from './build-tuw-status-ledger.mjs';

const repositoryRoot = resolve(process.cwd());
const toolPath = resolve(repositoryRoot, 'tools/execution/build-tuw-status-ledger.mjs');
const activePlanPath = resolve(repositoryRoot, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md');
const activeOverridesPath = resolve(
  repositoryRoot,
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json',
);
const activeJsonPath = resolve(
  repositoryRoot,
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json',
);
const activeMarkdownPath = resolve(
  repositoryRoot,
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md',
);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function maskedSha256(path, allowedLines) {
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const lineNumber of allowedLines) lines[lineNumber - 1] = `__ACTIVE_POINTER_SELECTOR_${lineNumber}__`;
  return { hash: createHash('sha256').update(lines.join('\n')).digest('hex'), lineCount: lines.length };
}

const appendixShapes = new Map([
  ['B15', ['H1', 'M', false]],
  ['B16', ['H1', 'S', false]],
  ['B17', ['H2', 'S', false]],
  ['C16', ['H2', 'M', false]],
  ['B18', ['H2', 'L', false]],
  ['B19', ['H2', 'L', false]],
  ['B20', ['H3', 'L', true]],
]);

function headingFor(id) {
  const appendix = appendixShapes.get(id);
  if (appendix) {
    const [horizon, size, conditional] = appendix;
    return `### ${id} [${horizon}/${size}${conditional ? '·선택' : ''}] ${id} synthetic appendix title`;
  }
  return `#### ${id} [M] ${id} synthetic title`;
}

function fullSyntheticPlan({ missing, duplicate, extra } = {}) {
  const ids = FROZEN_TUW_IDS.filter((id) => id !== missing);
  const lines = ['# Synthetic TUW plan', '## Horizon 1', '### A: Matter Core'];
  for (const id of ids) {
    if (id === 'B15') lines.push('## Appendix 2: Baseline-8');
    lines.push(headingFor(id), `Body for ${id}`);
    if (id === duplicate) lines.push(headingFor(id), `Duplicate body for ${id}`);
    if (id === 'B20') lines.push('### Existing unit reinforcement directives', 'post-B20 directive');
  }
  if (extra) lines.push(headingFor(extra), `Body for ${extra}`);
  lines.push('## End of synthetic plan');
  return lines.join('\n');
}

test('heading grammars parse original and Appendix-2 metadata', () => {
  assert.deepEqual(parseTuwHeading('#### A1 [M] Matter core', 12), {
    grammar: 'original',
    rank: 4,
    id: 'A1',
    horizon: null,
    size: 'M',
    conditional: false,
    title: 'Matter core',
    heading: '#### A1 [M] Matter core',
    line: 12,
  });
  assert.deepEqual(parseTuwHeading('### B20 [H3/L·선택] Conditional redline', 24), {
    grammar: 'appendix-2',
    rank: 3,
    id: 'B20',
    horizon: 'H3',
    size: 'L',
    conditional: true,
    title: 'Conditional redline',
    heading: '### B20 [H3/L·선택] Conditional redline',
    line: 24,
  });
});

test('boundary cuts at equal-or-higher Markdown heading ranks', () => {
  const markdown = [
    '## Root',
    '#### A1 [M] first',
    'A1 body',
    '##### deeper implementation note',
    'deeper note stays in A1',
    '### non-TUW peer heading',
    'peer text',
    '#### A2 [S] second',
    'A2 body',
    '## Root boundary',
  ].join('\n');
  const blocks = parseTuwBlocks(markdown, { expectedIds: ['A1', 'A2'] });
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].block, /deeper implementation note/);
  assert.doesNotMatch(blocks[0].block, /non-TUW peer heading/);
  assert.doesNotMatch(blocks[1].block, /Root boundary/);
});

test('117 parser requires the exact frozen ID set', () => {
  const blocks = parseTuwBlocks(fullSyntheticPlan());
  assert.equal(FROZEN_TUW_IDS.length, 117);
  assert.equal(blocks.length, 117);
  assert.deepEqual(
    blocks.map((block) => block.id),
    FROZEN_TUW_IDS,
  );
  assertExactTuwIdSet(blocks);
});

test('117 parser rejects missing B19, duplicate C16, and an extra TUW ID', () => {
  assert.throws(() => parseTuwBlocks(fullSyntheticPlan({ missing: 'B19' })), /missing: B19/);
  assert.throws(
    () => parseTuwBlocks(fullSyntheticPlan({ duplicate: 'C16' })),
    /duplicate: C16/,
  );
  assert.throws(
    () => parseTuwBlocks(fullSyntheticPlan({ extra: 'A99' })),
    /extra: A99/,
  );
});

test('H14 and B20 boundaries do not bleed into Appendix or post-B20 directives', () => {
  const blocks = parseTuwBlocks(fullSyntheticPlan());
  const h14 = blocks.find((block) => block.id === 'H14');
  const b15 = blocks.find((block) => block.id === 'B15');
  const b20 = blocks.find((block) => block.id === 'B20');
  assert.equal(h14.rank, 4);
  assert.equal(b15.rank, 3);
  assert.equal(b20.conditional, true);
  assert.doesNotMatch(h14.block, /Appendix 2|B15 synthetic/);
  assert.doesNotMatch(b20.block, /post-B20 directive|Existing unit reinforcement/);
  assert.match(b15.block, /Body for B15/);
});

test('heading rejects malformed Appendix horizon, size, and conditional marker', () => {
  assert.throws(() => parseTuwHeading('### B15 [H4/M] bad horizon'), /Malformed TUW heading/);
  assert.throws(() => parseTuwHeading('### B15 [H1/X] bad size'), /Malformed TUW heading/);
  assert.throws(
    () => parseTuwHeading('### B20 [H3/L] missing marker'),
    /Malformed Appendix-2 conditional marker/,
  );
  assert.throws(
    () => parseTuwHeading('### B15 [H1/M·선택] unexpected marker'),
    /Malformed Appendix-2 conditional marker/,
  );
});

test('heading source line refs prove H14 and Appendix boundaries through B20', () => {
  const lines = Array.from({ length: 3180 }, (_, index) => `synthetic line ${index + 1}`);
  lines[3055] = '#### H14 [M] Microsoft OIDC';
  lines[3056] = 'H14 body must not bleed';
  lines[3083] = '## 부록: 실행 순서 가이드 (Horizon 1 critical path)';
  lines[3093] = '### B15 [H1/M] B15 baseline';
  lines[3105] = '### B16 [H1/S] B16 baseline';
  lines[3117] = '### B17 [H2/S] B17 baseline';
  lines[3129] = '### C16 [H2/M] C16 baseline';
  lines[3141] = '### B18 [H2/L] B18 baseline';
  lines[3153] = '### B19 [H2/L] B19 baseline';
  lines[3165] = '### B20 [H3/L·선택] B20 conditional baseline';
  lines[3166] = 'B20 body must stop before the same-rank directive';
  lines[3175] = '### 기존 유닛 보강 지시 (Baseline-8 연계)';
  lines[3176] = 'post-B20 directive must not bleed into B20';

  const blocks = parseTuwBlocks(lines.join('\n'), { assertExact: false });
  const expectedLines = {
    H14: 3056,
    B15: 3094,
    B16: 3106,
    B17: 3118,
    C16: 3130,
    B18: 3142,
    B19: 3154,
    B20: 3166,
  };
  for (const [id, line] of Object.entries(expectedLines)) {
    assert.equal(blocks.find((block) => block.id === id)?.line, line, id);
  }
  const h14 = blocks.find((block) => block.id === 'H14');
  const b20 = blocks.find((block) => block.id === 'B20');
  assert.equal(h14.endLine, 3084);
  assert.equal(b20.endLine, 3176);
  assert.doesNotMatch(h14.block, /B15|부록/);
  assert.doesNotMatch(b20.block, /post-B20 directive|기존 유닛 보강 지시/);
});

test('artifact count surfaces expose the canonical 117 rows and seven unadjudicated records', () => {
  const plan = readFileSync(activePlanPath, 'utf8');
  const overrides = JSON.parse(readFileSync(activeOverridesPath, 'utf8'));
  const { ledger, markdown } = buildLedgerFromPlan(plan, { overrides });
  assert.equal(ledger.generatedAt, overrides.updatedAt);
  assert.equal(ledger.sourcePlan, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md');
  assert.equal(ledger.overridesPath, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json');
  assert.equal(ledger.units.length, 117);
  assert.equal(new Set(ledger.units.map((unit) => unit.id)).size, 117);
  assert.deepEqual(
    ledger.units.reduce((counts, unit) => {
      counts[unit.horizon] = (counts[unit.horizon] ?? 0) + 1;
      return counts;
    }, {}),
    { '1': 38, '2': 61, '3': 18 },
  );
  assert.deepEqual(ledger.counts, {
    COMPLETE_CANDIDATE: 19,
    LOCAL_IMPLEMENTED_NEEDS_EVIDENCE: 80,
    EXTERNAL_BLOCKED: 11,
    UNADJUDICATED: 7,
  });
  for (const id of ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20']) {
    const row = ledger.units.find((unit) => unit.id === id);
    assert.equal(row?.status, 'UNADJUDICATED', id);
    assert.ok(row?.statusRationale);
    assert.ok(row?.remainingGaps.length);
    assert.ok(row?.nextAction);
    assert.doesNotMatch(`${row?.statusRationale} ${row?.nextAction}`, /(?:claims?|promot|complete|done|ready)/i);
  }
  assert.match(markdown, /^# TUW Internal DMS Uplift 117 Status Ledger/m);
  assert.equal(markdown.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('|---')).length, 118);
});

test('artifact import preserves all four 110 hashes and only registered pointer selectors move', () => {
  const legacyHashes = {
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_EXECUTION_POLICY.md':
      '5c8f40f9f093535f5a7a438a98335552c7e937aa6e5a8301ecf20a55a16a6040',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json':
      '36004dc408cbf6c3164bdde6ab80d90312b539e0c6e1a7b5c340eca6243febb7',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md':
      'bf5fe7cb3d956a64b0cfff818bf9f4d7386ff21254d42c519a879980b31586e2',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json':
      'b94e141ab1fd796884c2d452e2da14d4f9a43b69fdbb5d07f7cf178f2bd7711a',
  };
  for (const [path, expected] of Object.entries(legacyHashes)) {
    assert.equal(sha256(resolve(repositoryRoot, path)), expected, path);
  }

  const pointerSelectors = [
    [
      'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md',
      new Set([9, 10, 11, 12, 13, 40, 41, 42, 43, 44, 45]),
      3182,
      'aea1efe75f658cc6abd4176b9af476525a73c943a1696e9180243207b0ba3e63',
    ],
    ['docs/handoff/dms-uplift-2026-07/00_README.md', new Set([8, 16]), 67, '3b6ff8f3aacba937753b7698a67fc4a93e2e862aa965e72f9ff6d128fc62d1f2'],
    ['docs/handoff/dms-uplift-2026-07/06_execution-guide.md', new Set([3]), 155, '094d562c20788ec518aae6cb9dfd0eb25f1fac16b0103780deddd02f101ac5cc'],
  ];
  for (const [relativePath, allowedLines, expectedLineCount, expectedMaskedHash] of pointerSelectors) {
    const currentPath = resolve(repositoryRoot, relativePath);
    const masked = maskedSha256(currentPath, allowedLines);
    assert.equal(masked.lineCount, expectedLineCount, `${relativePath} line count`);
    assert.equal(masked.hash, expectedMaskedHash, `${relativePath} outside-selector hash`);
  }

  const plan = readFileSync(activePlanPath, 'utf8');
  const { ledger } = buildLedgerFromPlan(plan, {
    overrides: JSON.parse(readFileSync(activeOverridesPath, 'utf8')),
  });
  assert.deepEqual(
    ledger.units.filter((unit) => unit.id.startsWith('B1') || unit.id === 'C16' || unit.id === 'B20')
      .filter((unit) => ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'].includes(unit.id))
      .map((unit) => [unit.id, unit.source.planLine]),
    [
      ['B15', 3094],
      ['B16', 3106],
      ['B17', 3118],
      ['C16', 3130],
      ['B18', 3142],
      ['B19', 3154],
      ['B20', 3166],
    ],
  );
});

test('deterministic generation is byte-identical and matching check mode does not write', () => {
  const first = spawnSync(process.execPath, [toolPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(first.status, 0, first.stderr);
  const firstJson = readFileSync(activeJsonPath, 'utf8');
  const firstMarkdown = readFileSync(activeMarkdownPath, 'utf8');

  const second = spawnSync(process.execPath, [toolPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(activeJsonPath, 'utf8'), firstJson);
  assert.equal(readFileSync(activeMarkdownPath, 'utf8'), firstMarkdown);

  const beforeJson = readFileSync(activeJsonPath, 'utf8');
  const beforeMarkdown = readFileSync(activeMarkdownPath, 'utf8');
  const beforeJsonMtime = statSync(activeJsonPath).mtimeMs;
  const beforeMarkdownMtime = statSync(activeMarkdownPath).mtimeMs;
  const check = spawnSync(process.execPath, [toolPath, '--check'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(readFileSync(activeJsonPath, 'utf8'), beforeJson);
  assert.equal(readFileSync(activeMarkdownPath, 'utf8'), beforeMarkdown);
  assert.equal(statSync(activeJsonPath).mtimeMs, beforeJsonMtime);
  assert.equal(statSync(activeMarkdownPath).mtimeMs, beforeMarkdownMtime);
  assert.doesNotMatch(readFileSync(toolPath, 'utf8'), /new Date\(/);
});

test('117 overrides retain every imported 110 adjudication and add only the seven appendix rows', () => {
  const legacy = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json'), 'utf8'),
  );
  const active = JSON.parse(readFileSync(activeOverridesPath, 'utf8'));
  assert.equal(Object.keys(active.unitOverrides).length, 117);
  for (const [id, adjudication] of Object.entries(legacy.unitOverrides)) {
    assert.deepEqual(active.unitOverrides[id], adjudication, id);
  }
  assert.deepEqual(Object.keys(active.unitOverrides).slice(-7), ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20']);
  assert.deepEqual(
    Object.fromEntries(
      ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'].map((id) => [id, active.unitOverrides[id].status]),
    ),
    {
      B15: 'UNADJUDICATED',
      B16: 'UNADJUDICATED',
      B17: 'UNADJUDICATED',
      C16: 'UNADJUDICATED',
      B18: 'UNADJUDICATED',
      B19: 'UNADJUDICATED',
      B20: 'UNADJUDICATED',
    },
  );
});
