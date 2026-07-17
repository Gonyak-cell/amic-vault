import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  FROZEN_TUW_IDS,
  LedgerValidationError,
  assertExactTuwIdSet,
  buildLedgerFromPlan,
  computeValidationScopeDigest,
  exitCodeFor,
  isCurrentComplete,
  isNonDurableRef,
  parseTuwBlocks,
  parseTuwHeading,
  sha256Hash,
  validateAcceptedBlocker,
  validateEvidence,
  validateGitSha,
  validateHash,
  validateLedgerRow,
  validateTimestamp,
  validateValidationScope,
} from './build-tuw-status-ledger.mjs';

const repositoryRoot = resolve(process.cwd());
const toolPath = resolve(repositoryRoot, 'tools/execution/build-tuw-status-ledger.mjs');
const activePlanPath = resolve(repositoryRoot, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md');
const activeOverridesPath = resolve(
  repositoryRoot,
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json',
);
const candidateSha = 'a'.repeat(40);
const asOf = '2026-07-17T00:00:00.000Z';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function maskedSha256(path, allowedLines) {
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const lineNumber of allowedLines)
    lines[lineNumber - 1] = `__ACTIVE_POINTER_SELECTOR_${lineNumber}__`;
  return {
    hash: createHash('sha256').update(lines.join('\n')).digest('hex'),
    lineCount: lines.length,
  };
}

function throwsCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code);
}

function validationScope() {
  const entries = [
    {
      path: 'apps/api/src/provenance.ts',
      mode: '100644',
      contentSha256: sha256Hash('candidate content'),
    },
  ];
  return { entries, aggregateSha256: computeValidationScopeDigest(entries) };
}

function currentEvidence(overrides = {}) {
  const scope = validationScope();
  const evidence = {
    type: 'UNIT_TEST',
    ref: 'docs/evidence/unit-test-receipt.json',
    hash: sha256Hash('unit test receipt'),
    timestamp: '2026-07-16T00:00:00.000Z',
    candidateSha,
    validationScopeDigest: scope.aggregateSha256,
    environment: {
      class: 'CI',
      targetRef: 'ci/run/123',
      targetHash: sha256Hash('ci target'),
    },
    provenance: {
      producerKind: 'TEST_RUNNER',
      producerRef: 'node:test',
      receiptRef: 'docs/evidence/unit-test-receipt.json',
      ownerRole: 'CI_RUNNER',
      commandRef: 'node --test provenance.spec.mjs',
      approvalRef: null,
      approvalScopeHash: null,
      expiresAt: null,
      exitCode: 0,
      expectedCount: 1,
      passCount: 1,
      failCount: 0,
      skipCount: 0,
      visibility: 'REPO_SAFE',
      durability: 'DURABLE',
      nonClaims: ['NO_GO_LIVE'],
      invalidationTriggers: ['CANDIDATE_SHA_DRIFT'],
    },
  };
  return {
    ...evidence,
    ...overrides,
    environment: { ...evidence.environment, ...overrides.environment },
    provenance: { ...evidence.provenance, ...overrides.provenance },
  };
}

function currentRow(overrides = {}) {
  const scope = validationScope();
  const row = {
    id: 'A1',
    status: 'COMPLETE_CANDIDATE',
    validationState: 'CURRENT_VALIDATED',
    validatedCandidateSha: candidateSha,
    validationScope: scope,
    historicalEvidenceRefs: [],
    evidenceRefs: [currentEvidence()],
    blockerClass: 'NONE',
    blockingRefs: [],
    acceptedBlockers: [],
    dependencyConditions: [],
    dependencies: [],
    remainingGaps: [],
    statusRationale: 'Current candidate and scope have durable evidence.',
    nextAction: 'Retain only while the candidate and scope remain unchanged.',
  };
  return { ...row, ...overrides };
}

function acceptedBlocker(overrides = {}) {
  return {
    dependencyId: 'CAP-EXTERNAL-PROVIDER',
    blockerClass: 'EXTERNAL_EVIDENCE',
    disposition: 'ACCEPT_DEFER',
    scope: 'DEPENDENCY_ORDER_ONLY',
    authorityKind: 'DECISION_LEDGER',
    authorityRef: 'docs/ledger/decision.md:30',
    authorityHash: sha256Hash('registered authority'),
    acceptedAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-08-16T00:00:00.000Z',
    candidateSha,
    validationScopeDigest: validationScope().aggregateSha256,
    nonClaims: ['NO_EXTERNAL_EXECUTION', 'NO_GO_LIVE', 'NOT_COMPLETE'],
    ...overrides,
  };
}

function listEntries(root, current = root) {
  const entries = [];
  for (const dirent of readdirSync(current, { withFileTypes: true })) {
    if (dirent.name === '.git') continue;
    const path = join(current, dirent.name);
    const name = relative(root, path);
    entries.push(`${dirent.isDirectory() ? 'd' : 'f'}:${name}`);
    if (dirent.isDirectory()) entries.push(...listEntries(root, path));
  }
  return entries.sort();
}

function gitState(root) {
  return spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout;
}

function surfaceSnapshot(root) {
  const paths = [
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md',
  ];
  return {
    entries: listEntries(root),
    git: gitState(root),
    files: Object.fromEntries(
      paths
        .filter((path) => {
          try {
            return statSync(join(root, path)).isFile();
          } catch {
            return false;
          }
        })
        .map((path) => [
          path,
          {
            hash: sha256(join(root, path)),
            mtimeNs: statSync(join(root, path), { bigint: true }).mtimeNs.toString(),
          },
        ]),
    ),
  };
}

function withCheckFixture(callback) {
  const root = mkdtempSync(join(tmpdir(), 'amic-vault-ledger-check-'));
  try {
    const executionDir = join(root, 'docs/execution');
    mkdirSync(executionDir, { recursive: true });
    copyFileSync(activePlanPath, join(executionDir, 'TUW_INTERNAL_DMS_UPLIFT_H1_H3.md'));
    copyFileSync(
      activeOverridesPath,
      join(executionDir, 'TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json'),
    );
    const generated = spawnSync(process.execPath, [toolPath], { cwd: root, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
    assert.equal(spawnSync('git', ['add', '.'], { cwd: root }).status, 0);
    assert.equal(
      spawnSync(
        'git',
        [
          '-c',
          'user.name=Ledger Test',
          '-c',
          'user.email=ledger@example.invalid',
          'commit',
          '-qm',
          'fixture',
        ],
        { cwd: root },
      ).status,
      0,
    );
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    if (id === 'B20')
      lines.push('### Existing unit reinforcement directives', 'post-B20 directive');
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
  assert.throws(() => parseTuwBlocks(fullSyntheticPlan({ duplicate: 'C16' })), /duplicate: C16/);
  assert.throws(() => parseTuwBlocks(fullSyntheticPlan({ extra: 'A99' })), /extra: A99/);
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
  assert.equal(
    ledger.overridesPath,
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json',
  );
  assert.equal(ledger.units.length, 117);
  assert.equal(new Set(ledger.units.map((unit) => unit.id)).size, 117);
  assert.deepEqual(
    ledger.units.reduce((counts, unit) => {
      counts[unit.horizon] = (counts[unit.horizon] ?? 0) + 1;
      return counts;
    }, {}),
    { 1: 38, 2: 61, 3: 18 },
  );
  assert.deepEqual(ledger.counts, {
    COMPLETE_CANDIDATE: 19,
    LOCAL_IMPLEMENTED_NEEDS_EVIDENCE: 80,
    EXTERNAL_BLOCKED: 11,
    UNADJUDICATED: 7,
  });
  assert.equal(ledger.schemaId, 'PACK-R14-02-TASK5-SCHEMA-V1');
  assert.equal(ledger.phase, 'BOOTSTRAP_IMPORT');
  assert.deepEqual(ledger.validationCounts, {
    BOOTSTRAP_PREIMAGE: 117,
    CURRENT_VALIDATED: 0,
  });
  assert.equal(ledger.generationMetadata.asOf, overrides.updatedAt);
  assert.equal(ledger.generatedAt, ledger.generationMetadata.asOf);
  assert.equal(ledger.generationMetadata.transitionJournalSha256, null);
  assert.equal(ledger.generationMetadata.sourcePlanSha256.value, sha256(activePlanPath));
  assert.equal(ledger.generationMetadata.overridesSha256.value, sha256(activeOverridesPath));
  assert.ok(ledger.units.every((unit) => unit.validationState === 'BOOTSTRAP_PREIMAGE'));
  assert.ok(ledger.units.every((unit) => unit.validatedCandidateSha === null));
  assert.ok(ledger.units.every((unit) => unit.validationScope === null));
  assert.equal(
    ledger.units.reduce((count, unit) => count + unit.evidenceRefs.length, 0),
    0,
  );
  assert.equal(
    ledger.units.reduce((count, unit) => count + unit.historicalEvidenceRefs.length, 0),
    4432,
  );
  for (const unit of ledger.units) {
    assert.deepEqual(
      unit.blockingRefs,
      unit.status === 'EXTERNAL_BLOCKED'
        ? [`docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:${unit.source.planLine}`]
        : [],
      unit.id,
    );
  }
  for (const id of ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20']) {
    const row = ledger.units.find((unit) => unit.id === id);
    assert.equal(row?.status, 'UNADJUDICATED', id);
    assert.ok(row?.statusRationale);
    assert.ok(row?.remainingGaps.length);
    assert.ok(row?.nextAction);
    assert.doesNotMatch(
      `${row?.statusRationale} ${row?.nextAction}`,
      /(?:claims?|promot|complete|done|ready)/i,
    );
  }
  assert.match(markdown, /^# TUW Internal DMS Uplift 117 Status Ledger/m);
  assert.equal(
    markdown.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('|---')).length,
    118,
  );
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
    [
      'docs/handoff/dms-uplift-2026-07/00_README.md',
      new Set([8, 16]),
      67,
      '3b6ff8f3aacba937753b7698a67fc4a93e2e862aa965e72f9ff6d128fc62d1f2',
    ],
    [
      'docs/handoff/dms-uplift-2026-07/06_execution-guide.md',
      new Set([3]),
      155,
      '094d562c20788ec518aae6cb9dfd0eb25f1fac16b0103780deddd02f101ac5cc',
    ],
  ];
  for (const [
    relativePath,
    allowedLines,
    expectedLineCount,
    expectedMaskedHash,
  ] of pointerSelectors) {
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
    ledger.units
      .filter((unit) => unit.id.startsWith('B1') || unit.id === 'C16' || unit.id === 'B20')
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
  withCheckFixture((root) => {
    const jsonPath = join(root, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json');
    const markdownPath = join(root, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md');
    const first = spawnSync(process.execPath, [toolPath], { cwd: root, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).writes, 2);
    const firstJson = readFileSync(jsonPath, 'utf8');
    const firstMarkdown = readFileSync(markdownPath, 'utf8');
    const fixedMetadata = JSON.parse(firstJson);
    assert.equal(fixedMetadata.generatedAt, asOf);
    assert.deepEqual(fixedMetadata.generationMetadata, {
      hashAlgorithm: 'SHA-256',
      sourcePlanSha256: {
        algorithm: 'SHA-256',
        value: '23774be4a061ad1e887d44cbbcfb1a34cae66f13165e08ff62d44968a57a81f7',
      },
      overridesSha256: {
        algorithm: 'SHA-256',
        value: 'd0404c84bfe3e7b4d14d071a0c9f267a87eb62a512a78f3e4d98499abaae6a4a',
      },
      transitionJournalSha256: null,
      asOf,
      phase: 'BOOTSTRAP_IMPORT',
    });

    const second = spawnSync(process.execPath, [toolPath], { cwd: root, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).writes, 2);
    assert.equal(readFileSync(jsonPath, 'utf8'), firstJson);
    assert.equal(readFileSync(markdownPath, 'utf8'), firstMarkdown);

    const beforeJsonMtime = statSync(jsonPath, { bigint: true }).mtimeNs;
    const beforeMarkdownMtime = statSync(markdownPath, { bigint: true }).mtimeNs;
    const check = spawnSync(process.execPath, [toolPath, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, check.stderr);
    assert.deepEqual(JSON.parse(check.stdout), {
      ok: true,
      code: 'CHECK_OK',
      phase: 'BOOTSTRAP_IMPORT',
      rowCount: 117,
      journalEntries: 0,
      writes: 0,
    });
    assert.equal(readFileSync(jsonPath, 'utf8'), firstJson);
    assert.equal(readFileSync(markdownPath, 'utf8'), firstMarkdown);
    assert.equal(statSync(jsonPath, { bigint: true }).mtimeNs, beforeJsonMtime);
    assert.equal(statSync(markdownPath, { bigint: true }).mtimeNs, beforeMarkdownMtime);
  });
});

test('117 overrides retain every imported 110 adjudication and add only the seven appendix rows', () => {
  const legacy = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json'),
      'utf8',
    ),
  );
  const active = JSON.parse(readFileSync(activeOverridesPath, 'utf8'));
  assert.equal(Object.keys(active.unitOverrides).length, 117);
  for (const [id, adjudication] of Object.entries(legacy.unitOverrides)) {
    const activeRow = active.unitOverrides[id];
    const { evidenceRefs: legacyEvidenceRefs = [], ...legacyFields } = adjudication;
    for (const [field, value] of Object.entries(legacyFields)) {
      assert.deepEqual(activeRow[field], value, `${id}.${field}`);
    }
    assert.deepEqual(
      activeRow.historicalEvidenceRefs,
      legacyEvidenceRefs,
      `${id}.historicalEvidenceRefs`,
    );
    assert.deepEqual(activeRow.evidenceRefs, [], `${id}.evidenceRefs`);
    assert.equal(activeRow.validationState, 'BOOTSTRAP_PREIMAGE', id);
    assert.equal(activeRow.validatedCandidateSha, null, id);
    assert.equal(activeRow.validationScope, null, id);
    assert.deepEqual(activeRow.acceptedBlockers, [], id);
    assert.deepEqual(activeRow.dependencyConditions, [], id);
  }
  assert.deepEqual(Object.keys(active.unitOverrides).slice(-7), [
    'B15',
    'B16',
    'B17',
    'C16',
    'B18',
    'B19',
    'B20',
  ]);
  assert.deepEqual(
    Object.fromEntries(
      ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'].map((id) => [
        id,
        active.unitOverrides[id].status,
      ]),
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
  for (const [id, row] of Object.entries(active.unitOverrides)) {
    if (row.status === 'EXTERNAL_BLOCKED') {
      assert.equal(row.blockerClass, 'EXTERNAL_EVIDENCE', id);
      assert.ok(row.blockingRefs.length > 0, id);
      assert.ok(
        row.blockingRefs.every((ref) =>
          /^docs\/execution\/TUW_INTERNAL_DMS_UPLIFT_H1_H3\.md:\d+$/.test(ref),
        ),
        id,
      );
    } else {
      assert.equal(row.blockerClass, 'NONE', id);
      assert.deepEqual(row.blockingRefs, [], id);
    }
  }
});

test('bootstrap validation order rejects mutations by identity after raw timestamp syntax', () => {
  const plan = readFileSync(activePlanPath, 'utf8');
  const overrides = JSON.parse(readFileSync(activeOverridesPath, 'utf8'));
  overrides.unitOverrides.A1.validationState = 'CURRENT_VALIDATED';
  overrides.unitOverrides.A1.validatedCandidateSha = candidateSha;
  overrides.unitOverrides.A1.validationScope = validationScope();
  overrides.unitOverrides.A1.evidenceRefs = [currentEvidence()];
  throwsCode(() => buildLedgerFromPlan(plan, { overrides }), 'E_BOOTSTRAP_IDENTITY');

  const clockOverrides = JSON.parse(readFileSync(activeOverridesPath, 'utf8'));
  clockOverrides.updatedAt = '2026-08-17T00:00:00.000Z';
  throwsCode(
    () => buildLedgerFromPlan(plan, { overrides: clockOverrides }),
    'E_BOOTSTRAP_IDENTITY',
  );

  const malformedClock = JSON.parse(readFileSync(activeOverridesPath, 'utf8'));
  malformedClock.updatedAt = '2026-08-17T00:00:00Z';
  throwsCode(() => buildLedgerFromPlan(plan, { overrides: malformedClock }), 'E_SCHEMA_TIMESTAMP');
});

test('bootstrap exact input identity rejects status, history, and bytes split-brain drift', () => {
  const plan = readFileSync(activePlanPath, 'utf8');
  const overridesBytes = readFileSync(activeOverridesPath, 'utf8');
  const overrides = JSON.parse(overridesBytes);
  const rejectOverrideMutation = (mutate) => {
    const changed = structuredClone(overrides);
    mutate(changed);
    throwsCode(() => buildLedgerFromPlan(plan, { overrides: changed }), 'E_BOOTSTRAP_IDENTITY');
  };

  rejectOverrideMutation((changed) => {
    const a1 = changed.unitOverrides.A1;
    const b1 = changed.unitOverrides.B1;
    [a1.status, b1.status] = [b1.status, a1.status];
    [a1.remainingGaps, b1.remainingGaps] = [b1.remainingGaps, a1.remainingGaps];
  });
  rejectOverrideMutation((changed) => {
    changed.unitOverrides.A1.historicalEvidenceRefs.shift();
  });
  rejectOverrideMutation((changed) => {
    const history = changed.unitOverrides.A1.historicalEvidenceRefs;
    [history[0], history[1]] = [history[1], history[0]];
  });
  rejectOverrideMutation((changed) => {
    changed.unitOverrides.A1.historicalEvidenceRefs[0].note += ' tampered';
  });

  const bytesMismatch = structuredClone(overrides);
  bytesMismatch.unitOverrides.A1.historicalEvidenceRefs[0].note += ' bytes mismatch';
  throwsCode(
    () =>
      buildLedgerFromPlan(plan, {
        overrides,
        overridesBytes: `${JSON.stringify(bytesMismatch, null, 2)}\n`,
      }),
    'E_BOOTSTRAP_IDENTITY',
  );
  throwsCode(
    () => buildLedgerFromPlan(plan, { overrides, sourcePlanBytes: `${plan}\n` }),
    'E_BOOTSTRAP_IDENTITY',
  );
  const changedPlan = `${plan}\n`;
  throwsCode(
    () => buildLedgerFromPlan(changedPlan, { overrides, sourcePlanBytes: changedPlan }),
    'E_BOOTSTRAP_IDENTITY',
  );
});

test('journal, replay, transition, and phase error families use registered exit codes', () => {
  for (const [code, expected] of [
    ['E_JOURNAL_SEQUENCE', 36],
    ['E_REPLAY_MISMATCH', 37],
    ['E_TRANSITION_INVALID', 38],
    ['E_PHASE_UNADJUDICATED', 38],
  ]) {
    assert.equal(exitCodeFor(new LedgerValidationError(code, 'test error')), expected, code);
  }
});

test('provenance primitives and valid future CURRENT evidence enforce exact schemas', () => {
  const hash = sha256Hash('value');
  const scope = validationScope();
  assert.equal(validateHash(hash), true);
  assert.equal(validateGitSha(candidateSha), true);
  assert.equal(validateTimestamp(asOf), true);
  assert.equal(validateValidationScope(scope), true);
  assert.equal(
    validateEvidence(currentEvidence(), {
      asOf,
      candidateSha,
      validationScopeDigest: scope.aggregateSha256,
    }),
    true,
  );
  assert.equal(validateLedgerRow(currentRow(), { asOf }), true);
  assert.equal(isCurrentComplete(currentRow()), true);

  throwsCode(() => validateHash({ ...hash, extra: true }), 'E_SCHEMA_HASH');
  throwsCode(() => validateGitSha('A'.repeat(40)), 'E_SCHEMA_GIT_SHA');
  throwsCode(() => validateTimestamp('2026-02-30T00:00:00.000Z'), 'E_SCHEMA_TIMESTAMP');
  throwsCode(() => validateTimestamp('2026-07-17T00:00:00Z'), 'E_SCHEMA_TIMESTAMP');

  const missingField = currentEvidence();
  delete missingField.environment;
  throwsCode(
    () =>
      validateEvidence(missingField, {
        asOf,
        candidateSha,
        validationScopeDigest: scope.aggregateSha256,
      }),
    'E_EVIDENCE_SCHEMA',
  );

  const legacyRow = currentRow({
    evidenceRefs: [{ type: 'command_pass', ref: 'node --test', note: 'legacy only' }],
  });
  throwsCode(() => validateLedgerRow(legacyRow, { asOf }), 'E_EVIDENCE_LEGACY_CURRENT');
});

test('provenance row status, gaps, rationale, and validation scope fail closed', () => {
  throwsCode(() => validateLedgerRow(currentRow({ status: 'READY' }), { asOf }), 'E_SCHEMA_SHAPE');
  throwsCode(
    () => validateLedgerRow(currentRow({ statusRationale: ' ' }), { asOf }),
    'E_SCHEMA_SHAPE',
  );
  throwsCode(
    () =>
      validateLedgerRow(
        currentRow({
          status: 'LOCAL_IMPLEMENTED_NEEDS_EVIDENCE',
          remainingGaps: [' '],
        }),
        { asOf },
      ),
    'E_SCHEMA_SHAPE',
  );
  const scope = validationScope();
  scope.aggregateSha256 = sha256Hash('wrong aggregate');
  throwsCode(() => validateValidationScope(scope), 'E_EVIDENCE_SCOPE_DRIFT');
});

test('evidence rejects stale, future, expired, wrong-SHA, and scope drift receipts', () => {
  const scope = validationScope();
  const validate = (evidence) =>
    validateEvidence(evidence, {
      asOf,
      candidateSha,
      validationScopeDigest: scope.aggregateSha256,
    });
  throwsCode(
    () => validate(currentEvidence({ timestamp: '2026-06-16T23:59:59.999Z' })),
    'E_EVIDENCE_STALE',
  );
  throwsCode(
    () => validate(currentEvidence({ timestamp: '2026-07-17T00:00:00.001Z' })),
    'E_EVIDENCE_STALE',
  );
  throwsCode(
    () => validate(currentEvidence({ provenance: { expiresAt: asOf } })),
    'E_EVIDENCE_STALE',
  );
  throwsCode(
    () => validate(currentEvidence({ candidateSha: 'b'.repeat(40) })),
    'E_EVIDENCE_WRONG_SHA',
  );
  throwsCode(
    () => validate(currentEvidence({ validationScopeDigest: sha256Hash('different scope') })),
    'E_EVIDENCE_SCOPE_DRIFT',
  );
});

test('tmp, file URI, and .omo evidence refs are lexically non-durable without dereference', () => {
  for (const ref of [
    '/tmp/evidence.json',
    '/private/tmp/evidence.json',
    'tmp/evidence.json',
    '.omo/evidence/receipt.json',
    './.omo/evidence/receipt.json',
    'file:/tmp/evidence.json',
    'FILE:///private/tmp/evidence.json',
    'file://host.example/private/tmp/evidence.json',
    'file:%ZZ',
  ]) {
    assert.equal(isNonDurableRef(ref), true, ref);
    throwsCode(
      () =>
        validateEvidence(currentEvidence({ ref }), {
          asOf,
          candidateSha,
          validationScopeDigest: validationScope().aggregateSha256,
        }),
      'E_EVIDENCE_NON_DURABLE',
    );
  }
  for (const ref of [
    '/tmpx/evidence.json',
    '/private/tmpx/evidence.json',
    '.omotive/x',
    'tmpfiles/x',
  ]) {
    assert.equal(isNonDurableRef(ref), false, ref);
  }
});

test('evidence test counts and generated or non-durable completion support fail closed', () => {
  const scopeDigest = validationScope().aggregateSha256;
  throwsCode(
    () =>
      validateEvidence(currentEvidence({ provenance: { expectedCount: 2 } }), {
        asOf,
        candidateSha,
        validationScopeDigest: scopeDigest,
      }),
    'E_EVIDENCE_TEST_COUNTS',
  );
  throwsCode(
    () =>
      validateEvidence(
        currentEvidence({
          type: 'ARTIFACT',
          provenance: {
            producerKind: 'GENERATED_ARTIFACT',
            durability: 'DURABLE',
            exitCode: null,
            expectedCount: null,
            passCount: null,
            failCount: null,
            skipCount: null,
          },
        }),
        { asOf, candidateSha, validationScopeDigest: scopeDigest },
      ),
    'E_EVIDENCE_SCHEMA',
  );

  const generated = currentEvidence({
    type: 'ARTIFACT',
    ref: 'docs/generated/ledger.json',
    provenance: {
      producerKind: 'GENERATED_ARTIFACT',
      durability: 'GENERATED',
      exitCode: null,
      expectedCount: null,
      passCount: null,
      failCount: null,
      skipCount: null,
    },
  });
  throwsCode(
    () => validateLedgerRow(currentRow({ evidenceRefs: [generated] }), { asOf }),
    'E_BLOCKER_NOT_COMPLETE',
  );

  const nonDurable = currentEvidence({
    ref: '/tmp/evidence.json',
    provenance: { durability: 'NON_DURABLE' },
  });
  assert.equal(
    validateEvidence(nonDurable, { asOf, candidateSha, validationScopeDigest: scopeDigest }),
    true,
  );
  throwsCode(
    () => validateLedgerRow(currentRow({ evidenceRefs: [nonDurable] }), { asOf }),
    'E_BLOCKER_NOT_COMPLETE',
  );
});

test('blocker acceptance is external-only, bounded, scope-bound, and never completion', () => {
  const dependency = {
    id: 'CAP-EXTERNAL-PROVIDER',
    kind: 'external',
    sourceText: 'Registered external provider receipt',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:TEST',
  };
  const row = currentRow({
    status: 'LOCAL_IMPLEMENTED_NEEDS_EVIDENCE',
    blockerClass: 'EXTERNAL_EVIDENCE',
    blockingRefs: ['docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:47'],
    dependencies: [dependency],
    remainingGaps: ['The registered external receipt remains absent.'],
  });
  row.acceptedBlockers = [acceptedBlocker()];
  assert.equal(validateAcceptedBlocker(row.acceptedBlockers[0], { row, asOf }), true);
  assert.equal(validateLedgerRow(row, { asOf }), true);
  assert.equal(isCurrentComplete(row), false);

  const malformedShaRow = structuredClone(row);
  malformedShaRow.validatedCandidateSha = 'not-a-git-sha';
  malformedShaRow.acceptedBlockers[0].candidateSha = malformedShaRow.validatedCandidateSha;
  throwsCode(
    () =>
      validateAcceptedBlocker(malformedShaRow.acceptedBlockers[0], {
        row: malformedShaRow,
        asOf,
      }),
    'E_SCHEMA_GIT_SHA',
  );

  const hardRow = structuredClone(row);
  hardRow.dependencies[0].kind = 'hard';
  throwsCode(
    () => validateAcceptedBlocker(hardRow.acceptedBlockers[0], { row: hardRow, asOf }),
    'E_BLOCKER_HARD_NOT_ACCEPTABLE',
  );
  const conditionalRow = structuredClone(row);
  conditionalRow.dependencies[0].kind = 'conditional';
  throwsCode(
    () =>
      validateAcceptedBlocker(conditionalRow.acceptedBlockers[0], { row: conditionalRow, asOf }),
    'E_BLOCKER_HARD_NOT_ACCEPTABLE',
  );

  const policyRow = structuredClone(row);
  policyRow.blockerClass = 'POLICY_CONFLICT';
  policyRow.acceptedBlockers[0].blockerClass = 'POLICY_CONFLICT';
  throwsCode(
    () => validateAcceptedBlocker(policyRow.acceptedBlockers[0], { row: policyRow, asOf }),
    'E_BLOCKER_POLICY_CONFLICT',
  );
  for (const blockerClass of ['DEPENDENCY', 'TOOLING']) {
    const invalidRow = structuredClone(row);
    invalidRow.blockerClass = blockerClass;
    invalidRow.acceptedBlockers[0].blockerClass = blockerClass;
    throwsCode(
      () => validateAcceptedBlocker(invalidRow.acceptedBlockers[0], { row: invalidRow, asOf }),
      'E_BLOCKER_ACCEPTANCE',
    );
  }

  const expiredWindow = acceptedBlocker({ expiresAt: '2026-10-16T00:00:00.000Z' });
  throwsCode(() => validateAcceptedBlocker(expiredWindow, { row, asOf }), 'E_BLOCKER_ACCEPTANCE');

  const completeRow = structuredClone(row);
  completeRow.status = 'COMPLETE_CANDIDATE';
  completeRow.remainingGaps = [];
  throwsCode(() => validateLedgerRow(completeRow, { asOf }), 'E_BLOCKER_NOT_COMPLETE');

  const missingRefs = structuredClone(row);
  missingRefs.blockingRefs = [];
  throwsCode(() => validateLedgerRow(missingRefs, { asOf }), 'E_BLOCKER_ACCEPTANCE');
  const duplicateRefs = structuredClone(row);
  duplicateRefs.blockingRefs = [row.blockingRefs[0], row.blockingRefs[0]];
  throwsCode(() => validateLedgerRow(duplicateRefs, { asOf }), 'E_BLOCKER_ACCEPTANCE');
});

test('EXTERNAL_BLOCKED remains current-validated noncompletion with honest gaps', () => {
  const row = currentRow({
    status: 'EXTERNAL_BLOCKED',
    blockerClass: 'EXTERNAL_EVIDENCE',
    blockingRefs: ['docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md:47'],
    remainingGaps: ['External operational evidence is not available.'],
  });
  assert.equal(validateLedgerRow(row, { asOf }), true);
  assert.equal(isCurrentComplete(row), false);
  throwsCode(() => validateLedgerRow({ ...row, remainingGaps: [] }, { asOf }), 'E_SCHEMA_SHAPE');
});

test('check failures for missing surfaces and invalid input preserve zero writes', () => {
  for (const missingPath of [
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json',
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md',
  ]) {
    withCheckFixture((root) => {
      unlinkSync(join(root, missingPath));
      const before = surfaceSnapshot(root);
      const checked = spawnSync(process.execPath, [toolPath, '--check'], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(checked.status, 39, checked.stderr);
      assert.equal(JSON.parse(checked.stderr).writes, 0);
      assert.deepEqual(surfaceSnapshot(root), before);
    });
  }

  withCheckFixture((root) => {
    const path = join(root, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json');
    const overrides = JSON.parse(readFileSync(path, 'utf8'));
    overrides.unitOverrides.A1.status = 'INVALID';
    writeFileSync(path, `${JSON.stringify(overrides, null, 2)}\n`);
    const before = surfaceSnapshot(root);
    const checked = spawnSync(process.execPath, [toolPath, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    const output = JSON.parse(checked.stderr);
    assert.equal(checked.status, 31, checked.stderr);
    assert.equal(output.code, 'E_BOOTSTRAP_IDENTITY');
    assert.equal(output.writes, 0);
    assert.deepEqual(surfaceSnapshot(root), before);
  });
});

test('drift on JSON, Markdown, or both surfaces proves absolute zero write', () => {
  const json = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json';
  const markdown = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md';
  for (const paths of [[json], [markdown], [json, markdown]]) {
    withCheckFixture((root) => {
      for (const path of paths) {
        writeFileSync(join(root, path), `${readFileSync(join(root, path), 'utf8')}DRIFT\n`);
      }
      const before = surfaceSnapshot(root);
      const checked = spawnSync(process.execPath, [toolPath, '--check'], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(checked.status, 39, checked.stderr);
      const output = JSON.parse(checked.stderr);
      assert.equal(output.writes, 0);
      assert.equal(output.code, paths.includes(json) ? 'E_DRIFT_JSON' : 'E_DRIFT_MARKDOWN');
      assert.deepEqual(surfaceSnapshot(root), before);
    });
  }
});
