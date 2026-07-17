import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FROZEN_TUW_IDS,
  assertExactTuwIdSet,
  parseTuwBlocks,
  parseTuwHeading,
} from './build-tuw-status-ledger.mjs';

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
