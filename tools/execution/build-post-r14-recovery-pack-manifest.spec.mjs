import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertFocusedTestPath,
  cleanupGuaranteedShellCommand,
  parseCliArgs,
  validateFocusedTestResult,
  validateNonOverlayGitSources,
  validateAuthorityArtifacts,
  validateManifest,
} from './build-post-r14-recovery-pack-manifest.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifestPath = new URL('../../docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json', import.meta.url);
const markdownPath = new URL('../../docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md', import.meta.url);
const packRegistryPath = new URL('../../docs/execution/PACKS_R4_R14.md', import.meta.url);
const decisionLedgerPath = new URL('../../docs/ledger/decision.md', import.meta.url);
const scriptPath = new URL('./build-post-r14-recovery-pack-manifest.mjs', import.meta.url);

const expectedAliases = {
  'tests/document-edit-bridge.spec.ts': 'apps/desktop/tests/document-edit-bridge.spec.ts',
  'tests/test_clause_tree.py': 'workers/ingestion/tests/test_clause_tree.py',
  'tests/test_contract_parser.py': 'workers/ingestion/tests/test_contract_parser.py',
  'tests/test_report_synthesis.py': 'workers/ingestion/tests/test_report_synthesis.py',
};

const expectedPlannedGaps = [
  ['tests/integration/search-permission/search-email.spec.ts', 'D8', 'PACK-R14-13'],
  ['apps/api/src/modules/dd/dd-ai-mapping.service.spec.ts', 'E12', 'PACK-R14-21'],
  ['tests/integration/document-access/comparison-ai.spec.ts', 'B13', 'PACK-R14-32'],
  ['tests/integration/document-access/email-egress-dlp.spec.ts', 'C14', 'PACK-R14-31'],
  ['apps/api/src/modules/ai/features/ai-drafting.service.spec.ts', 'E13', 'PACK-R14-32'],
  ['tests/integration/ai-drafting.spec.ts', 'E13', 'PACK-R14-32'],
  ['tests/integration/redline.spec.ts', 'B19', 'PACK-R14-30'],
];

const focusedAssertionPrefix =
  'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --assert-focused-test ';
const focusedRunPrefix =
  'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --run-focused-test ';

function executableCommandText(command) {
  if (!command.startsWith("bash -c '") || !command.endsWith("'")) return command;
  return command.slice("bash -c '".length, -1).replaceAll("'\"'\"'", "'");
}

function isFocusedRunnerCommand(command) {
  return executableCommandText(command).includes(focusedRunPrefix);
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

async function fixture() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function resign(manifest) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
  };
  manifest.payloadSha256 = createHash('sha256')
    .update(JSON.stringify(canonical(manifest.payload)))
    .digest('hex');
  return manifest;
}

test('committed v2 manifest validates complete overlay and Git-source coverage', async () => {
  const manifest = await fixture();
  assert.deepEqual(validateManifest(manifest), { ok: true, errors: [] });
  assert.deepEqual(validateNonOverlayGitSources(manifest), {
    ok: true,
    errors: [],
    commits: 20,
    paths: 9,
  });
  assert.equal(manifest.payload.unitUniverse.unitIds.length, 117);
  assert.equal(manifest.payload.pathDispositions.length, 893);
  assert.equal(manifest.payload.hunkAssignments.length, 4801);
  assert.equal(manifest.payload.migrations.length, 86);
  assert.equal(manifest.payload.quarantines.hunkOrdinals.length, 196);
  assert.equal(manifest.payload.quarantines.pathB64s.length, 79);
  assert.deepEqual(manifest.payload.quarantines.conditionalUnitIds, ['B20', 'D9', 'H14']);
  assert.deepEqual(manifest.payload.quarantines.migrationSourceOrdinals, [102, 159]);
});

test('committed authority docs pin the canonical payload and allow non-complete adjudication', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger, markdown] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
    readFile(markdownPath, 'utf8'),
  ]);
  assert.deepEqual(validateAuthorityArtifacts(manifest, { packRegistry, decisionLedger }), {
    ok: true,
    errors: [],
  });
  assert.match(markdown,
    /Inactive D9, H14, and B20 hunks, migrations, implementation, and completion-state transitions remain quarantined;/);
  assert.match(markdown,
    /their sealed non-complete status adjudications remain permitted until a separately registered/);
  assert.doesNotMatch(markdown, /Inactive D9, H14, and B20 hunks, migrations, tests, and transitions remain quarantined/);
});

test('authority validation rejects stale registry or decision-ledger payload anchors', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const staleHash = 'bb9ebac9a5d25cf53be5fe0ca99bce90f6dd7675dd8186ab0826f9f62940d724';
  const staleRegistry = packRegistry.replace(manifest.payloadSha256, staleHash);
  assert.equal(validateAuthorityArtifacts(manifest, {
    packRegistry: staleRegistry,
    decisionLedger,
  }).errors.some((error) => error.code === 'AUTHORITY_PACK_REGISTRY_PAYLOAD_HASH'), true);
  const staleDecision = decisionLedger.replace(manifest.payloadSha256, staleHash);
  assert.equal(validateAuthorityArtifacts(manifest, {
    packRegistry,
    decisionLedger: staleDecision.replace(
      'canonicalPayloadSha256=`' + manifest.payloadSha256 + '`',
      'canonicalPayloadSha256=`' + staleHash + '`',
    ),
  }).errors.some((error) => error.code === 'AUTHORITY_DECISION_LEDGER_PAYLOAD_HASH'), true);
});

test('authority validation rejects duplicate or conflicting registry anchors', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const amendmentHeading = packRegistry.match(
    /^## PACK-R14-03-AMENDMENT-01 — Recovery manifest v2 correction$/m,
  )?.[0];
  assert.ok(amendmentHeading);
  const duplicateHeading = validateAuthorityArtifacts(manifest, {
    packRegistry: packRegistry + '\n' + amendmentHeading + '\n',
    decisionLedger,
  });
  assert.equal(duplicateHeading.ok, false);
  assert.equal(duplicateHeading.errors.some(
    (error) => error.code === 'AUTHORITY_PACK_REGISTRY_HEADING_COUNT',
  ), true);

  const canonicalField = '- Canonical payload SHA-256:\n  `' + manifest.payloadSha256 + '`.';
  const duplicateAnchor = packRegistry.replace(
    canonicalField,
    canonicalField + '\n' + canonicalField,
  );
  const duplicateCanonicalField = validateAuthorityArtifacts(manifest, {
    packRegistry: duplicateAnchor,
    decisionLedger,
  });
  assert.equal(duplicateCanonicalField.ok, false);
  assert.equal(duplicateCanonicalField.errors.some(
    (error) => error.code === 'AUTHORITY_PACK_REGISTRY_CANONICAL_FIELD_COUNT',
  ), true);

  const staleHash = 'bb9ebac9a5d25cf53be5fe0ca99bce90f6dd7675dd8186ab0826f9f62940d724';
  const conflictingAnchor = validateAuthorityArtifacts(manifest, {
    packRegistry: packRegistry.replace(canonicalField,
      '- Canonical payload SHA-256:\n  `' + staleHash + '`.'),
    decisionLedger,
  });
  assert.equal(conflictingAnchor.ok, false);
  assert.equal(conflictingAnchor.errors.some(
    (error) => error.code === 'AUTHORITY_PACK_REGISTRY_PAYLOAD_HASH',
  ), true);
});

test('authority validation rejects duplicate, missing-ref, rejection, and quoted decision records', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const affirmativeLine = decisionLedger.split('\n').find(
    (line) => line.includes('authority decision record:'),
  );
  assert.ok(affirmativeLine);
  const assertDecisionRejected = (mutatedLedger, code) => {
    const result = validateAuthorityArtifacts(manifest, {
      packRegistry,
      decisionLedger: mutatedLedger,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.code === code), true);
  };

  assertDecisionRejected(decisionLedger + '\n' + affirmativeLine, 'AUTHORITY_DECISION_RECORD_COUNT');
  assertDecisionRejected(
    decisionLedger.replace(affirmativeLine, affirmativeLine.replace('decision=AFFIRM', 'decision=REJECT')),
    'AUTHORITY_DECISION_RECORD_FORMAT',
  );
  assertDecisionRejected(
    decisionLedger.replace(affirmativeLine, affirmativeLine.replace(
      'authorityRef=`DIRECT-OPERATOR-AGGREGATE-EXECUTION-20260717`; ',
      '',
    )),
    'AUTHORITY_DECISION_RECORD_FORMAT',
  );
  assertDecisionRejected(
    decisionLedger.split('\n').map((line) => line.includes('authority decision record:')
      ? '> ' + line : line).join('\n'),
    'AUTHORITY_DECISION_RECORD_COUNT',
  );
});

test('authority validation ignores fenced and commented Markdown authority examples', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const heading = '## PACK-R14-03-AMENDMENT-01 — Recovery manifest v2 correction';
  const affirmativeLines = decisionLedger.split('\n').filter(
    (line) => line.includes('authority decision record:'),
  );
  assert.ok(affirmativeLines.length);
  for (const wrap of [(value) => '```md\n' + value + '\n```', (value) => '<!--\n' + value + '\n-->']) {
    const registryResult = validateAuthorityArtifacts(manifest, {
      packRegistry: packRegistry.replace(heading, wrap(heading)),
      decisionLedger,
    });
    assert.equal(registryResult.ok, false);
    assert.equal(registryResult.errors.some(
      (error) => error.code === 'AUTHORITY_PACK_REGISTRY_HEADING_COUNT',
    ), true);
    const decisionResult = validateAuthorityArtifacts(manifest, {
      packRegistry,
      decisionLedger: decisionLedger.split('\n').map((line) => affirmativeLines.includes(line)
        ? wrap(line) : line).join('\n'),
    });
    assert.equal(decisionResult.ok, false);
    assert.equal(decisionResult.errors.some(
      (error) => error.code === 'AUTHORITY_DECISION_RECORD_COUNT',
    ), true);
  }
});

test('authority validation rejects alternate canonical and nonaffirmative statements', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const staleHash = 'bb9ebac9a5d25cf53be5fe0ca99bce90f6dd7675dd8186ab0826f9f62940d724';
  const alternateRegistry = packRegistry.replace(
    '- Canonical payload SHA-256:\n  `' + manifest.payloadSha256 + '`.',
    '- Canonical payload SHA-256:\n  `' + manifest.payloadSha256 + '`.\n'
      + '- canonical PAYLOAD sha-256: `' + staleHash + '`.',
  );
  const registryResult = validateAuthorityArtifacts(manifest, {
    packRegistry: alternateRegistry,
    decisionLedger,
  });
  assert.equal(registryResult.ok, false);
  assert.equal(registryResult.errors.some(
    (error) => error.code === 'AUTHORITY_PACK_REGISTRY_CANONICAL_LABEL_COUNT',
  ), true);
  const decisionResult = validateAuthorityArtifacts(manifest, {
    packRegistry,
    decisionLedger: decisionLedger + '\n- 2026-07-18 PACK-R14-03-AMENDMENT-01 authority decision: REJECTED; status=NOT_AUTHORIZED.\n',
  });
  assert.equal(decisionResult.ok, false);
  assert.equal(decisionResult.errors.some(
    (error) => error.code === 'AUTHORITY_DECISION_RECORD_FORMAT',
  ), true);
});

test('authority validation keeps inline-comment text active and honors fence length', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const rejection = '- 2026-07-18 PACK-R14-03-AMENDMENT-01 authority decision: REJECTED; status=NOT_AUTHORIZED. <!-- note -->';
  const inlineResult = validateAuthorityArtifacts(manifest, {
    packRegistry,
    decisionLedger: decisionLedger + '\n' + rejection + '\n',
  });
  assert.equal(inlineResult.ok, false);
  assert.equal(inlineResult.errors.some(
    (error) => error.code === 'AUTHORITY_DECISION_RECORD_FORMAT',
  ), true);

  const heading = '## PACK-R14-03-AMENDMENT-01 — Recovery manifest v2 correction';
  const canonical = '- Canonical payload SHA-256:\n  `' + manifest.payloadSha256 + '`.';
  const affirmative = decisionLedger.split('\n').filter(
    (line) => line.includes('authority decision record:'),
  ).join('\n');
  const fencedRegistry = packRegistry.replace(
    heading + '\n\nStatus:',
    '````md\n```\n' + heading + '\n\nStatus:',
  ).replace(canonical, canonical + '\n````');
  const fencedLedger = decisionLedger.replace(affirmative, '````text\n```\n' + affirmative + '\n````');
  const fencedResult = validateAuthorityArtifacts(manifest, {
    packRegistry: fencedRegistry,
    decisionLedger: fencedLedger,
  });
  assert.equal(fencedResult.ok, false);
  assert.equal(fencedResult.errors.some(
    (error) => error.code === 'AUTHORITY_PACK_REGISTRY_HEADING_COUNT',
  ), true);
  assert.equal(fencedResult.errors.some(
    (error) => error.code === 'AUTHORITY_DECISION_RECORD_COUNT',
  ), true);
});

test('authority validation keeps comment-contained fences and code-span literals non-operative', async () => {
  const manifest = await fixture();
  const [packRegistry, decisionLedger] = await Promise.all([
    readFile(packRegistryPath, 'utf8'),
    readFile(decisionLedgerPath, 'utf8'),
  ]);
  const rejection = '- 2026-07-18 PACK-R14-03-AMENDMENT-01 authority decision: REJECTED; status=NOT_AUTHORIZED.';
  for (const prefix of ['<!--\n```\n-->\n', '`<!--`\n']) {
    const result = validateAuthorityArtifacts(manifest, {
      packRegistry,
      decisionLedger: decisionLedger + '\n' + prefix + rejection + '\n',
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some(
      (error) => error.code === 'AUTHORITY_DECISION_RECORD_FORMAT',
    ), true);
  }
});

test('every PACK has three to eight TUWs, a unique branch, review, and earlier predecessors', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs;
  assert.equal(new Set(packs.map((pack) => pack.branch)).size, packs.length);
  for (const pack of packs) {
    assert.ok(pack.tuwIds.length >= 3 && pack.tuwIds.length <= 8);
    assert.ok(pack.review.requiredReviewer);
    for (const predecessor of pack.predecessorPackIds) {
      if (['PACK-R14-03', 'PACK-R14-03-AMENDMENT-01'].includes(predecessor)) continue;
      assert.ok(packs.find((candidate) => candidate.packId === predecessor).sequence < pack.sequence);
    }
  }
});

test('every raw test anchor has an exact availability or gap disposition', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs;
  const packById = Object.fromEntries(packs.map((pack) => [pack.packId, pack]));
  const baseTree = spawnSync('git', [
    '--no-replace-objects',
    'ls-tree',
    '-r',
    '--name-only',
    manifest.payload.baseCommit,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(baseTree.status, 0, baseTree.stderr);
  const basePaths = new Set(baseTree.stdout.split('\n').filter(Boolean));
  const providersByPath = new Map();
  for (const pack of packs) {
    for (const file of [...pack.files.create, ...pack.files.modify]) {
      const providers = providersByPath.get(file) ?? [];
      providers.push(pack.packId);
      providersByPath.set(file, [...new Set(providers)].sort());
    }
  }
  const blockedUnitsByPath = new Map();
  for (const hunk of manifest.payload.hunkAssignments) {
    if (hunk.quarantineReason !== 'INACTIVE_CONDITIONAL_TRIGGER') continue;
    const blockedPath = Buffer.from(hunk.pathB64, 'base64').toString('utf8');
    blockedUnitsByPath.set(blockedPath, [...new Set([
      ...(blockedUnitsByPath.get(blockedPath) ?? []),
      hunk.sourceOwner,
    ])].sort());
  }
  const gapByPath = Object.fromEntries(expectedPlannedGaps.map((row) => [row[0], row]));
  assert.deepEqual(manifest.payload.testAnchorContract.aliases, expectedAliases);
  assert.deepEqual(
    manifest.payload.testAnchorContract.plannedAcceptanceTestGaps
      .map((gap) => [gap.path, gap.ownerUnitId, gap.ownerPackId]),
    expectedPlannedGaps,
  );
  for (const [gapPath, , ownerPackId] of expectedPlannedGaps) {
    const ownerPack = packById[ownerPackId];
    assert.ok(ownerPack.files.plannedTestCreate.includes(gapPath));
    assert.ok(ownerPack.files.create.includes(gapPath));
    assert.ok(ownerPack.verification.focusedTestPaths.includes(gapPath));
    assert.deepEqual(
      packs.filter((pack) => pack.files.plannedTestCreate.includes(gapPath))
        .map((pack) => pack.packId),
      [ownerPackId],
    );
  }

  const predecessorClosure = (pack) => {
    const result = new Set();
    const pending = [...pack.predecessorPackIds];
    while (pending.length) {
      const id = pending.pop();
      if (result.has(id)) continue;
      result.add(id);
      if (packById[id]) pending.push(...packById[id].predecessorPackIds);
    }
    return result;
  };
  const syntacticRunner = (testPath) => {
    if (testPath.startsWith('tests/integration')
      && (testPath === 'tests/integration'
        || testPath.endsWith('.spec.ts')
        || !path.posix.basename(testPath).includes('.'))) return 'INTEGRATION';
    if (/^(?:apps\/(?:api|web|desktop)|packages\/(?:ai|domain|shared))\//.test(testPath)
      && /\.(?:spec|test)\.(?:js|jsx|ts|tsx)$/.test(testPath)) return 'WORKSPACE_VITEST';
    if (/\.(?:spec|test)\.(?:js|jsx|ts|tsx)$/.test(testPath)) return 'ROOT_VITEST';
    if (testPath.endsWith('.spec.mjs')) return 'NODE_TEST';
    if (/(^|\/)test_[^/]+\.py$/.test(testPath)) return 'PYTEST';
    return null;
  };

  const dispositionNames = [
    'AVAILABLE_AT_BASE',
    'PROVIDED_BY_CURRENT_PACK',
    'PLANNED_CURRENT_PACK_CREATE',
    'PROVIDED_BY_PREDECESSOR_PACK',
    'DEFERRED_PROVIDER_PACK',
    'PLANNED_ACCEPTANCE_TEST_GAP',
    'BLOCKED_INACTIVE_TRIGGER',
    'NON_EXECUTABLE_ANCHOR',
  ];
  const focusedDispositions = new Set(dispositionNames.slice(0, 4));
  for (const pack of packs) {
    const closure = predecessorClosure(pack);
    const expectedPaths = new Set(pack.verification.rawTestAnchorPaths.map(
      (sourcePath) => expectedAliases[sourcePath] ?? sourcePath,
    ));
    for (const [gapPath, , ownerPackId] of expectedPlannedGaps) {
      if (ownerPackId === pack.packId) expectedPaths.add(gapPath);
    }
    const records = dispositionNames.flatMap((disposition) => {
      const paths = pack.verification.testAnchorDispositions[disposition];
      assert.ok(Array.isArray(paths), pack.packId + ':' + disposition);
      return paths.map((canonicalPath) => ({ canonicalPath, disposition }));
    });
    assert.deepEqual(
      [...new Set(records.map((record) => record.canonicalPath))].sort(),
      [...expectedPaths].sort(),
      pack.packId,
    );
    assert.equal(records.length, expectedPaths.size, pack.packId + ': duplicate disposition');

    for (const { canonicalPath, disposition } of records) {
      const initialRunner = syntacticRunner(canonicalPath);
      const directorySelector = initialRunner === 'INTEGRATION'
        && !canonicalPath.endsWith('.spec.ts');
      const providerPackIds = [...new Set([...providersByPath]
        .filter(([providedPath]) => providedPath === canonicalPath
          || (directorySelector
            && providedPath.startsWith(canonicalPath + '/')
            && providedPath.endsWith('.spec.ts')))
        .flatMap(([, ids]) => ids))].sort();
      const blockedTriggerUnitIds = [...blockedUnitsByPath]
        .filter(([blockedPath]) => blockedPath === canonicalPath
          || (directorySelector
            && blockedPath.startsWith(canonicalPath + '/')
            && blockedPath.endsWith('.spec.ts')))
        .flatMap(([, unitIds]) => unitIds);
      const predecessorProviderPackIds = providerPackIds.filter((id) => closure.has(id));
      const availableAtBase = basePaths.has(canonicalPath)
        || (directorySelector && [...basePaths].some(
          (basePath) => basePath.startsWith(canonicalPath + '/')
            && basePath.endsWith('.spec.ts'),
        ));
      if (disposition === 'AVAILABLE_AT_BASE') assert.equal(availableAtBase, true);
      if (disposition === 'PROVIDED_BY_CURRENT_PACK') {
        assert.ok(providerPackIds.includes(pack.packId));
        assert.equal(availableAtBase, false);
      }
      if (disposition === 'PLANNED_CURRENT_PACK_CREATE') {
        assert.equal(gapByPath[canonicalPath]?.[2], pack.packId);
      }
      if (disposition === 'PROVIDED_BY_PREDECESSOR_PACK') {
        assert.ok(predecessorProviderPackIds.length > 0);
      }
      if (disposition === 'DEFERRED_PROVIDER_PACK') {
        assert.ok(providerPackIds.length > 0);
        assert.equal(providerPackIds.includes(pack.packId), false);
        assert.equal(predecessorProviderPackIds.length, 0);
      }
      if (disposition === 'PLANNED_ACCEPTANCE_TEST_GAP') {
        assert.ok(gapByPath[canonicalPath]);
      }
      if (disposition === 'BLOCKED_INACTIVE_TRIGGER') {
        assert.ok(blockedTriggerUnitIds.length > 0);
        assert.equal(availableAtBase, false);
        assert.equal(providerPackIds.length, 0);
      }
      if (disposition === 'NON_EXECUTABLE_ANCHOR') {
        assert.ok(initialRunner === null || (directorySelector
          && !availableAtBase
          && providerPackIds.length === 0
          && blockedTriggerUnitIds.length === 0));
      }
    }
    assert.deepEqual(
      pack.verification.focusedTestPaths,
      records.filter((record) => focusedDispositions.has(record.disposition))
        .map((record) => record.canonicalPath).sort(),
    );
    assert.deepEqual(
      pack.verification.deferredTestPaths,
      records.filter((record) => record.disposition === 'DEFERRED_PROVIDER_PACK')
        .map((record) => record.canonicalPath).sort(),
    );
  }
});

test('every generated focused command is one-to-one, reachable, bootstrapped, and shell-safe', async () => {
  const manifest = await fixture();
  const allFocusedCommands = manifest.payload.packs.flatMap((pack) => pack.verification.commands)
    .filter((command) => command.startsWith(focusedAssertionPrefix)
      || isFocusedRunnerCommand(command));
  assert.equal(manifest.payload.packs.some((pack) => pack.verification.commands
    .some((command) => command.startsWith('pnpm test -- '))), false);
  assert.ok(allFocusedCommands.some((command) => command.startsWith(focusedRunPrefix)));
  assert.ok(allFocusedCommands.some((command) => command.startsWith('bash -c ')));
  assert.ok(allFocusedCommands.some((command) => command.includes('(app)')));
  for (const command of allFocusedCommands) {
    for (const shell of ['bash', 'zsh']) {
      const result = spawnSync(shell, ['-n', '-c', command], { encoding: 'utf8' });
      assert.equal(result.status, 0, shell + ' rejected: ' + command + '\n' + result.stderr);
    }
  }

  for (const pack of manifest.payload.packs) {
    const packCommands = pack.verification.commands;
    const executableCommands = packCommands.map(executableCommandText);
    const runnerLines = executableCommands.flatMap((command) =>
      command.split('\n').filter((line) => line.includes(focusedRunPrefix)));
    const assertionCommands = packCommands.filter(
      (command) => command.startsWith(focusedAssertionPrefix),
    );
    const installIndex = packCommands.indexOf('pnpm install --frozen-lockfile');
    assert.equal(installIndex, 1);
    for (const testPath of pack.verification.focusedTestPaths) {
      assert.equal(
        assertionCommands.filter(
          (command) => command === focusedAssertionPrefix + shellQuote(testPath),
        ).length,
        1,
        pack.packId + ' did not assert exactly once: ' + testPath,
      );
      const exactRunner = focusedRunPrefix + shellQuote(testPath);
      assert.equal(
        runnerLines.reduce(
          (count, line) => count + line.split(exactRunner).length - 1,
          0,
        ),
        1,
        pack.packId + ' did not route exactly once: ' + testPath,
      );
      assert.ok(executableCommands.findIndex((command) => command.includes(exactRunner)) > installIndex);
    }
    assert.equal(assertionCommands.length, pack.verification.focusedTestPaths.length);
    assert.equal(
      runnerLines.length,
      pack.verification.focusedTestPaths.length
        + (pack.migrationSourceOrdinals.length > 0
          && !pack.verification.focusedTestPaths.includes('tests/integration') ? 1 : 0),
      pack.packId,
    );
  }

  const taskEight = manifest.payload.packs.find((pack) => pack.packId === 'PACK-R14-08');
  assert.ok(taskEight.verification.commands.some((command) =>
    command === focusedRunPrefix
      + shellQuote('tools/migration/lawos-canonical-matter-reflection.spec.mjs')));
});

test('focused assertions reject missing, helper-only, and static exclusion markers', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'amic-vault-focused-assert-'));
  try {
    const helperDirectory = path.join(scratch, 'tests/integration/helpers');
    await mkdir(helperDirectory, { recursive: true });
    await writeFile(path.join(helperDirectory, 'db.ts'), 'export const db = true;\n');
    await assert.rejects(
      assertFocusedTestPath('tests/integration/helpers', { root: scratch }),
      /no \.spec\.ts descendants/,
    );
    await assert.rejects(
      assertFocusedTestPath('tests/integration/missing.spec.ts', { root: scratch }),
      /ENOENT/,
    );

    const linkedDirectory = path.join(scratch, 'tests/integration/linked');
    await symlink(helperDirectory, linkedDirectory);
    await assert.rejects(
      assertFocusedTestPath('tests/integration/linked', { root: scratch }),
      /must not contain a symlink/,
    );

    const specPath = path.join(helperDirectory, 'focused.spec.ts');
    await writeFile(specPath, "test('works', () => {});\n");
    assert.deepEqual(
      await assertFocusedTestPath('tests/integration/helpers', { root: scratch }),
      {
        path: 'tests/integration/helpers',
        files: ['tests/integration/helpers/focused.spec.ts'],
      },
    );
    for (const source of [
      "test.skip('disabled', () => {});\n",
      "test.only('isolated', () => {});\n",
      "test.skipIf(true)('conditional', () => {});\n",
      "test.runIf(false)('conditional', () => {});\n",
      "test('option', { skip: 'reason' }, () => {});\n",
      "test.fails('expected failure', () => {});\n",
      "it.fails('expected failure', () => {});\n",
      "test.each([1]).fails('expected failure', () => {});\n",
      "test('option', { fails: true }, () => {});\n",
      "test('option', { fails: shouldFail }, () => {});\n",
      "pytest.importorskip('missing_module')\n",
      "pytestmark = pytest.mark.skip('reason')\n",
    ]) {
      await writeFile(specPath, source);
      await assert.rejects(
        assertFocusedTestPath('tests/integration/helpers/focused.spec.ts', { root: scratch }),
        /static exclusion or expected-failure marker/,
      );
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('helper-only integration anchors never become focused commands', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs.filter(
    (pack) => pack.verification.rawTestAnchorPaths.includes('tests/integration/helpers'),
  );
  assert.ok(packs.length > 0);
  for (const pack of packs) {
    assert.ok(pack.verification.testAnchorDispositions.NON_EXECUTABLE_ANCHOR
      .includes('tests/integration/helpers'));
    assert.equal(pack.verification.focusedTestPaths.includes('tests/integration/helpers'), false);
    assert.equal(pack.verification.commands.some(
      (command) => command.includes("'tests/integration/helpers'"),
    ), false);
  }
});

test('mixed inactive hunks do not suppress base or active regression tests', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-17');
  for (const testPath of ['tests/integration', 'tests/integration/auth-session.spec.ts']) {
    assert.ok(pack.verification.testAnchorDispositions.AVAILABLE_AT_BASE.includes(testPath));
    assert.ok(pack.verification.focusedTestPaths.includes(testPath));
    assert.equal(
      pack.verification.testAnchorDispositions.BLOCKED_INACTIVE_TRIGGER.includes(testPath),
      false,
    );
  }
  assert.ok(pack.verification.testAnchorDispositions.BLOCKED_INACTIVE_TRIGGER
    .includes('tests/integration/auth-oidc.spec.ts'));
});

test('earlier test providers are explicit predecessors and planned gaps become executable after ownership', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs;
  const providerEntries = packs.flatMap((pack) => [...pack.files.create, ...pack.files.modify]
    .map((providedPath) => [providedPath, pack]));
  let earlierProviderEdges = 0;
  for (const pack of packs) {
    for (const sourcePath of pack.verification.rawTestAnchorPaths) {
      const canonicalPath = expectedAliases[sourcePath] ?? sourcePath;
      const integrationDirectory = canonicalPath.startsWith('tests/integration')
        && !canonicalPath.endsWith('.spec.ts')
        && !path.posix.basename(canonicalPath).includes('.');
      const earlierProviders = providerEntries
        .filter(([providedPath, provider]) => provider.sequence < pack.sequence
          && (providedPath === canonicalPath
            || (integrationDirectory
              && providedPath.startsWith(canonicalPath + '/')
              && providedPath.endsWith('.spec.ts'))))
        .map(([, provider]) => provider.packId);
      for (const providerPackId of new Set(earlierProviders)) {
        earlierProviderEdges += 1;
        assert.ok(pack.predecessorPackIds.includes(providerPackId),
          pack.packId + ' omitted test provider ' + providerPackId + ' for ' + canonicalPath);
      }
    }
  }
  assert.ok(earlierProviderEdges > 0);

  for (const gap of manifest.payload.testAnchorContract.plannedAcceptanceTestGaps) {
    const successorPacks = packs.filter((pack) =>
      pack.verification.testAnchorDispositions.PROVIDED_BY_PREDECESSOR_PACK.includes(gap.path));
    assert.ok(successorPacks.length > 0, gap.path + ' never became predecessor-provided');
    assert.ok(successorPacks.every((pack) =>
      !pack.verification.testAnchorDispositions.PLANNED_ACCEPTANCE_TEST_GAP.includes(gap.path)));
  }
});

test('removing an earlier test-provider predecessor is rejected after re-signing', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs;
  let selected;
  for (const pack of packs) {
    for (const testPath of pack.verification.rawTestAnchorPaths) {
      const canonicalPath = expectedAliases[testPath] ?? testPath;
      const provider = packs.find((candidate) => candidate.sequence < pack.sequence
        && [...candidate.files.create, ...candidate.files.modify].includes(canonicalPath)
        && pack.predecessorPackIds.includes(candidate.packId));
      if (provider) {
        selected = { pack, provider, canonicalPath };
        break;
      }
    }
    if (selected) break;
  }
  assert.ok(selected);
  selected.pack.predecessorPackIds = selected.pack.predecessorPackIds
    .filter((packId) => packId !== selected.provider.packId);
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('TEST_PROVIDER_PREDECESSOR'), selected.canonicalPath);
});

test('batched OR-style focused selectors are rejected after re-signing', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((candidate) => {
    const directRunners = candidate.verification.commands.filter(
      (command) => command.startsWith(focusedRunPrefix),
    );
    return directRunners.length >= 2;
  });
  assert.ok(pack);
  const runnerIndices = pack.verification.commands
    .map((command, index) => command.startsWith(focusedRunPrefix)
      ? index : -1)
    .filter((index) => index !== -1);
  const secondCommand = pack.verification.commands[runnerIndices[1]];
  const secondSelector = secondCommand.slice(focusedRunPrefix.length);
  assert.ok(secondSelector);
  pack.verification.commands[runnerIndices[0]] += ' ' + secondSelector;
  pack.verification.commands.splice(runnerIndices[1], 1);
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('FOCUSED_TEST_COMMAND_CARDINALITY'));
  assert.ok(codes.includes('PACK_VERIFICATION'));
});

test('migration PACKs preserve isolated up-down-up ordering and both migrate commands', async () => {
  const manifest = await fixture();
  const migrationPacks = manifest.payload.packs.filter(
    (pack) => pack.migrationSourceOrdinals.length > 0,
  );
  assert.ok(migrationPacks.length > 0);
  for (const pack of migrationPacks) {
    const commands = pack.verification.commands;
    const wrapperCommand = commands.find((command) =>
      command.startsWith('bash -c ') && command.includes(
        pack.verification.isolatedDatabase.lockPath,
      ));
    assert.ok(wrapperCommand, pack.packId);
    const wrapper = executableCommandText(wrapperCommand);
    const up = wrapper.indexOf(' up -d --wait --build --force-recreate --renew-anon-volumes');
    const firstMigrate = wrapper.indexOf(' pnpm db:migrate', up);
    const rollback = wrapper.indexOf(' pnpm db:rollback', firstMigrate);
    const secondMigrate = wrapper.indexOf(' pnpm db:migrate', firstMigrate + 1);
    const seed = wrapper.indexOf(' pnpm db:seed', secondMigrate);
    const integration = wrapper.indexOf(
      focusedRunPrefix + shellQuote('tests/integration'),
      seed,
    );
    assert.equal(pack.verification.isolatedDatabase.projectName,
      'amic-vault-' + pack.packId.toLowerCase());
    assert.equal(pack.verification.isolatedDatabase.bucket, 'amic-vault-dev');
    assert.equal(pack.verification.isolatedDatabase.ingestionWorkerUrl,
      'http://127.0.0.1:' + pack.verification.isolatedDatabase.ingestionPort);
    assert.equal(pack.verification.isolatedDatabase.hostBinding, '127.0.0.1');
    assert.equal(pack.verification.isolatedDatabase.precleanRequired, true);
    assert.equal(pack.verification.isolatedDatabase.forceBuildRequired, true);
    assert.equal(pack.verification.isolatedDatabase.forceRecreateRequired, true);
    assert.equal(pack.verification.isolatedDatabase.cleanupExecutor,
      'BASH_EXIT_TRAP_STATUS_PRESERVING');
    assert.equal(pack.verification.isolatedDatabase.cleanupRequiredOnSuccessOrFailure, true);
    assert.equal(wrapper.split(' pnpm db:migrate').length - 1, 2, pack.packId);
    assert.equal(wrapper.split(' down -v --remove-orphans --rmi local').length - 1,
      2, pack.packId);
    assert.ok(wrapper.includes('trap cleanup EXIT'), pack.packId);
    assert.ok(wrapper.includes('mkdir "$lock_path"'), pack.packId);
    assert.ok(wrapper.includes('ports: !override'), pack.packId);
    assert.ok(wrapper.includes('127.0.0.1:' + pack.verification.isolatedDatabase.postgresPort
      + ':5432'), pack.packId);
    assert.ok(wrapper.includes("S3_BUCKET='amic-vault-dev'"), pack.packId);
    assert.ok(wrapper.includes("INGESTION_WORKER_URL='http://127.0.0.1:"
      + pack.verification.isolatedDatabase.ingestionPort + "'"), pack.packId);
    assert.ok(up < firstMigrate
      && firstMigrate < rollback
      && rollback < secondMigrate
      && secondMigrate < seed
      && seed < integration, pack.packId);
  }
});

for (const missingPath of [
  'tests/integration/never-owned.spec.ts',
  'workers/ingestion/tests/test_never_owned.py',
]) {
  test('unowned executable anchor is rejected: ' + missingPath, async () => {
    const manifest = await fixture();
    manifest.payload.packs[0].verification.rawTestAnchorPaths.push(missingPath);
    resign(manifest);
    const codes = validateManifest(manifest).errors.map((error) => error.code);
    assert.ok(codes.includes('UNRESOLVED_EXECUTABLE_TEST_ANCHOR'));
    assert.ok(codes.includes('TEST_ANCHOR_SOURCE_CONTRACT'));
  });
}

test('focused commands cannot run before the frozen dependency install', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.verification.commands
    .some(isFocusedRunnerCommand));
  const installIndex = pack.verification.commands.indexOf('pnpm install --frozen-lockfile');
  const focusedIndex = pack.verification.commands.findIndex(
    isFocusedRunnerCommand,
  );
  [pack.verification.commands[installIndex], pack.verification.commands[focusedIndex]] = [
    pack.verification.commands[focusedIndex],
    pack.verification.commands[installIndex],
  ];
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some(
    (error) => error.code === 'PACK_VERIFICATION',
  ), true);
});

test('a planned acceptance test cannot lose its sole owning PACK create route', async () => {
  const manifest = await fixture();
  const gap = manifest.payload.testAnchorContract.plannedAcceptanceTestGaps[0];
  const ownerPack = manifest.payload.packs.find((pack) => pack.packId === gap.ownerPackId);
  ownerPack.files.plannedTestCreate = ownerPack.files.plannedTestCreate
    .filter((file) => file !== gap.path);
  ownerPack.files.create = ownerPack.files.create.filter((file) => file !== gap.path);
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('PLANNED_ACCEPTANCE_TEST_PROVIDER'));
  assert.ok(codes.includes('PACK_FILE_SOURCE_SET'));
});

test('PACK-R14-04 reconstructs only the exact 19-commit five-path history source', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-04');
  const source = manifest.payload.nonOverlaySources.find(
    (item) => item.sourceId === 'TASK7-RELEASE-HISTORY-19',
  );
  assert.equal(source.commits.length, 19);
  assert.equal(source.pathActions.length, 5);
  assert.deepEqual(pack.hunkOrdinals, []);
  assert.deepEqual(pack.files.modify, []);
  assert.deepEqual(pack.files.create, source.pathActions.map((item) => item.path).sort());
  assert.deepEqual(pack.nonOverlaySourceIds, [source.sourceId]);
});

test('every later overlay consumer explicitly depends on its non-overlay source PACK', async () => {
  const manifest = await fixture();
  const consumer = manifest.payload.packs.find((pack) => pack.packId === 'PACK-R14-29');
  assert.ok(consumer.predecessorPackIds.includes('PACK-R14-04'));
  consumer.predecessorPackIds = consumer.predecessorPackIds
    .filter((packId) => packId !== 'PACK-R14-04');
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('NON_OVERLAY_SOURCE_PREDECESSOR'));
});

test('stale historical-base overlay records are quarantined instead of routed', async () => {
  const manifest = await fixture();
  const historical = manifest.payload.hunkAssignments.filter(
    (item) => item.sourceOwnerType === 'historical_base',
  );
  assert.equal(historical.length, 19);
  assert.ok(historical.every((item) => item.disposition === 'QUARANTINE'));
  assert.ok(historical.every((item) => item.packId === null));
  assert.ok(historical.every(
    (item) => item.quarantineReason
      === 'STALE_HISTORICAL_BASE_REPLACED_BY_REGISTERED_GIT_HISTORY_SOURCE',
  ));
});

test('exact-base create collisions are sealed as four identical and two superseded quarantines', async () => {
  const manifest = await fixture();
  const collisions = manifest.payload.basePathCollisions;
  assert.equal(collisions.length, 6);
  assert.equal(collisions.filter((collision) =>
    collision.resolution === 'QUARANTINE_IDENTICAL_AT_AMENDMENT_BASE').length, 4);
  assert.equal(collisions.filter((collision) =>
    collision.resolution === 'QUARANTINE_STALE_OVERLAY_SUPERSEDED_BY_AMENDMENT_BASE').length, 2);
  assert.deepEqual(collisions.filter((collision) => collision.baseSha256 !== collision.overlaySha256)
    .map((collision) => collision.path), [
    'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md',
    'tools/execution/build-tuw-status-ledger.mjs',
  ]);
  const collisionPaths = new Set(collisions.map((collision) => collision.path));
  for (const pack of manifest.payload.packs) {
    assert.equal([...pack.files.create, ...pack.files.modify]
      .some((file) => collisionPaths.has(file)), false, pack.packId);
  }
  for (const collision of collisions) {
    assert.ok(collision.hunkOrdinals.length > 0);
    assert.ok(collision.supersededPackIds.length > 0);
    for (const ordinal of collision.hunkOrdinals) {
      const hunk = manifest.payload.hunkAssignments.find((item) => item.ordinal === ordinal);
      assert.equal(hunk.disposition, 'QUARANTINE');
      assert.equal(hunk.packId, null);
    }
  }
});

test('re-signed exact-base collision recreation is rejected', async () => {
  const manifest = await fixture();
  const collision = manifest.payload.basePathCollisions[0];
  const pack = manifest.payload.packs.find(
    (candidate) => candidate.packId === collision.supersededPackIds[0],
  );
  pack.files.create.push(collision.path);
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('PACK_CREATE_BASE_COLLISION'));
  assert.ok(codes.includes('PACK_FILE_SET'));
});

test('PACK-R14-05 adjudicates all seven rows without permitting completion', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-05');
  assert.deepEqual(pack.files.create, []);
  assert.deepEqual(pack.files.modify, []);
  assert.deepEqual(pack.controlPlane.transitionTuwIds, [
    'B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20',
  ]);
  assert.deepEqual(
    pack.controlPlane.nonCompleteOnlyTransitionTuwIds,
    ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'],
  );
  assert.deepEqual(pack.conditionalBlockedTuwIds, ['B20']);
  assert.equal(pack.controlPlane.transitionCommit.exactPaths.length, 4);
  assert.deepEqual(pack.controlPlane.candidateBookkeeping.create, [pack.repoSafeReceipt]);
  assert.deepEqual(pack.controlPlane.candidateBookkeeping.modify, ['docs/ledger/execution.md']);
});

test('later plan work authorizes ordered row re-adjudication independently of ownership', async () => {
  const manifest = await fixture();
  const expected = {
    'PACK-R14-12': ['C1', 'C2', 'C8', 'C9', 'C16'],
    'PACK-R14-17': ['H1', 'H2', 'H6', 'C4', 'H14'],
    'PACK-R14-22': ['B15', 'B16'],
    'PACK-R14-23': ['B18', 'B19', 'B20'],
    'PACK-R14-24': ['A6', 'A7'],
    'PACK-R14-25': ['A8', 'A9', 'A10', 'G1', 'G7'],
    'PACK-R14-30': ['B3', 'B19', 'B20', 'G9', 'G11'],
    'PACK-R14-31': ['C7', 'C16', 'C14', 'C15', 'B13'],
    'PACK-R14-32': ['E8', 'B13', 'E13'],
    'PACK-R14-34': ['B12', 'B17'],
  };
  for (const [packId, transitionTuwIds] of Object.entries(expected)) {
    const pack = manifest.payload.packs.find((item) => item.packId === packId);
    assert.deepEqual(pack.controlPlane.transitionTuwIds, transitionTuwIds, packId);
  }
  assert.deepEqual(
    manifest.payload.packs.find((item) => item.packId === 'PACK-R14-23')
      .controlPlane.nonCompleteOnlyTransitionTuwIds,
    ['B19', 'B20'],
  );
  assert.deepEqual(
    manifest.payload.packs.find((item) => item.packId === 'PACK-R14-31')
      .controlPlane.nonCompleteOnlyTransitionTuwIds,
    ['B13'],
  );
});

test('PACK-R14-08 composes the exact LawOS source with only its owned later hunks', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-08');
  const source = manifest.payload.nonOverlaySources.find(
    (item) => item.sourceId === 'TASK8-LAWOS-REFLECTION-0B39414',
  );
  assert.equal(source.commits.length, 1);
  assert.deepEqual(pack.files.create, [
    'docs/release/lawos-canonical-matter-reflection-tuw-plan.md',
    'tools/migration/lawos-canonical-matter-reflection.mjs',
    'tools/migration/lawos-canonical-matter-reflection.spec.mjs',
  ]);
  assert.deepEqual(pack.files.modify, ['package.json']);
  assert.deepEqual(pack.files.overlayModify, [
    'tools/migration/lawos-canonical-matter-reflection.mjs',
    'tools/migration/lawos-canonical-matter-reflection.spec.mjs',
  ]);
  assert.deepEqual(pack.controlPlane.transitionTuwIds, []);
  const taskTwelve = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-09');
  assert.ok(taskTwelve.predecessorPackIds.includes(pack.packId));
  assert.equal(pack.predecessorPackIds.includes(taskTwelve.packId), false);
  assert.deepEqual(taskTwelve.controlPlane.transitionTuwIds.filter((id) => id === 'A14'), ['A14']);
});

test('removing one primary TUW is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.unitUniverse.primaryAssignments.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PRIMARY_ASSIGNMENT_COVERAGE'), true);
});

test('assigning one hunk to two PACKs is rejected', async () => {
  const manifest = await fixture();
  const hunk = manifest.payload.hunkAssignments.find((item) => item.disposition === 'PACK');
  const other = manifest.payload.packs.find((pack) => pack.packId !== hunk.packId);
  other.hunkOrdinals.push(hunk.ordinal);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'HUNK_MULTI_PACK'), true);
});

test('bare-letter dependency is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.unitUniverse.dependencies.A1.push({
    id: 'B',
    kind: 'hard',
    sourceText: 'B',
    resolutionRef: null,
  });
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'DEPENDENCY_ID'), true);
});

test('nine-TUW PACK without an authority exception is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[0].tuwIds.push(
    'RECOVERY-OVERFLOW-TUW-001',
    'RECOVERY-OVERFLOW-TUW-002',
    'RECOVERY-OVERFLOW-TUW-003',
    'RECOVERY-OVERFLOW-TUW-004',
    'RECOVERY-OVERFLOW-TUW-005',
    'RECOVERY-OVERFLOW-TUW-006',
  );
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PACK_SIZE'), true);
});

test('active D9 without written approval is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.conditionalTriggers.find((item) => item.unitId === 'D9').state = 'ACTIVE';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'TRIGGER_APPROVAL'), true);
});

test('current manifest rejects D9 activation even with an unregistered approval string', async () => {
  const manifest = await fixture();
  const trigger = manifest.payload.conditionalTriggers.find((item) => item.unitId === 'D9');
  trigger.state = 'ACTIVE';
  trigger.approvalRef = 'UNREGISTERED-REF';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'TRIGGER_STATE'), true);
});

test('inactive conditional hunks and migrations cannot execute or complete', async () => {
  const hunkManifest = await fixture();
  const hunk = hunkManifest.payload.hunkAssignments.find(
    (item) => item.quarantineReason === 'INACTIVE_CONDITIONAL_TRIGGER',
  );
  hunk.disposition = 'PACK';
  hunk.packId = hunk.blockedPackId;
  hunk.quarantineReason = null;
  hunk.blockedPackId = null;
  hunk.activationTriggerId = null;
  hunkManifest.payload.packs.find((pack) => pack.packId === hunk.packId)
    .hunkOrdinals.push(hunk.ordinal);
  resign(hunkManifest);
  assert.ok(validateManifest(hunkManifest).errors
    .some((error) => error.code === 'TRIGGER_HUNK_EXECUTABLE'));

  const migrationManifest = await fixture();
  const migration = migrationManifest.payload.migrations.find(
    (item) => item.executionDisposition === 'BLOCKED_INACTIVE_TRIGGER',
  );
  migration.executionDisposition = 'PACK';
  migration.packId = migration.blockedPackId;
  resign(migrationManifest);
  assert.ok(validateManifest(migrationManifest).errors
    .some((error) => error.code === 'TRIGGER_MIGRATION_EXECUTABLE'));

  const transitionManifest = await fixture();
  const transitionPack = transitionManifest.payload.packs.find(
    (pack) => pack.conditionalBlockedTuwIds.includes('H14'),
  );
  transitionPack.controlPlane.nonCompleteOnlyTransitionTuwIds =
    transitionPack.controlPlane.nonCompleteOnlyTransitionTuwIds.filter((id) => id !== 'H14');
  resign(transitionManifest);
  assert.ok(validateManifest(transitionManifest).errors
    .some((error) => error.code === 'TRIGGER_COMPLETION_EXECUTABLE'));
});

test('same-PACK migration hard dependencies must remain topologically ordered', async () => {
  const manifest = await fixture();
  const blocked = manifest.payload.migrations.find(
    (migration) => migration.ownerUnitId === 'H14' && migration.sourceOrdinal === 102,
  );
  blocked.executionDisposition = 'PACK';
  blocked.packId = blocked.blockedPackId;
  blocked.blockedPackId = null;
  blocked.activationTriggerId = null;
  blocked.targetOrdinal = 124;
  blocked.targetName = '0124' + blocked.sourceName.slice(4);
  blocked.targetPredecessor = 123;
  blocked.renumberRequired = true;
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('MIGRATION_HARD_DEPENDENCY_ORDER'));
});

test('Risk C without a reviewer is rejected', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.review.risk === 'C');
  pack.review.requiredReviewer = '';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'RISK_C_REVIEWER'), true);
});

test('duplicate branch is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[1].branch = manifest.payload.packs[0].branch;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'BRANCH_DUPLICATE'), true);
});

test('migration target gap is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.migrations[0].targetOrdinal = 180;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'MIGRATION_TARGET_SET'), true);
});

test('missing authority is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.governance.authorityRef = null;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'AUTHORITY_REF'), true);
});

test('sealed source hash drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.sourceInputs.ownership.sha256 = '0'.repeat(64);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'SOURCE_HASH'), true);
});

test('sealed source and active-ledger ID-set digest drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.sourceInputs.units117.idSetSha256 = '0'.repeat(64);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'UNIT_ID_SET_HASH'), true);
});

test('substituting a hunk ordinal outside 1-4801 is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.hunkAssignments.at(-1).ordinal = 4802;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'HUNK_ORDINAL_SET'), true);
});

test('removing a hard-dependency predecessor is rejected', async () => {
  const manifest = await fixture();
  const routes = manifest.payload.unitUniverse.hunkExecutionPackByUnit;
  const edge = Object.entries(manifest.payload.unitUniverse.dependencies)
    .flatMap(([unitId, rows]) => rows.map((row) => ({
      unitId,
      dependencyId: row.id,
      kind: row.kind,
    })))
    .find((row) => row.kind === 'hard'
      && routes[row.dependencyId]
      && routes[row.unitId] !== routes[row.dependencyId]);
  assert.ok(edge);
  const dependentPack = manifest.payload.packs.find((pack) => pack.packId === routes[edge.unitId]);
  dependentPack.predecessorPackIds = dependentPack.predecessorPackIds
    .filter((packId) => packId !== routes[edge.dependencyId]);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'HARD_DEPENDENCY_PREDECESSOR'), true);
});

test('path reverse mapping drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.pathDispositions[0].hunkOrdinals.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PATH_REVERSE_MAPPING'), true);
});

test('a hunk path outside the 893-path universe is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.hunkAssignments.at(-1).pathB64 = Buffer.from('outside.txt').toString('base64');
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'HUNK_PATH_SET'), true);
});

test('PACK file mapping drift is rejected', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.files.create.length > 0);
  pack.files.create.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PACK_FILE_SET'), true);
});

test('migration owner-to-PACK drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.migrations[0].packId = manifest.payload.packs.at(-1).packId;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'MIGRATION_UNIT_PACK'), true);
});

test('registration allowlist drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.registrationPack.allowedModify.push('apps/api/src/forbidden.ts');
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'REGISTRATION_PACK'), true);
});

test('removing a release-history commit is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.nonOverlaySources
    .find((item) => item.sourceId === 'TASK7-RELEASE-HISTORY-19')
    .commits.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'NON_OVERLAY_SOURCE_CONTRACT'), true);
});

test('substituting a release-history path is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.nonOverlaySources
    .find((item) => item.sourceId === 'TASK7-RELEASE-HISTORY-19')
    .pathActions[0].path = 'docs/release/unregistered.md';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'NON_OVERLAY_SOURCE_CONTRACT'), true);
});

test('reassigning a stale historical-base hunk to a PACK is rejected', async () => {
  const manifest = await fixture();
  const hunk = manifest.payload.hunkAssignments.find(
    (item) => item.sourceOwnerType === 'historical_base',
  );
  hunk.disposition = 'PACK';
  hunk.packId = 'PACK-R14-04';
  hunk.quarantineReason = null;
  manifest.payload.packs.find((item) => item.packId === 'PACK-R14-04')
    .hunkOrdinals.push(hunk.ordinal);
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('QUARANTINE_MAPPING') || codes.includes('PACK_FILE_SOURCE_SET'));
});

test('fully synchronized stale historical-base reactivation is rejected by the sealed source contract', async () => {
  const manifest = await fixture();
  const hunk = manifest.payload.hunkAssignments.find((item) => item.ordinal === 4695);
  const path = manifest.payload.pathDispositions.find((item) => item.pathB64 === hunk.pathB64);
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-04');
  const decodedPath = Buffer.from(hunk.pathB64, 'base64').toString('utf8');

  hunk.disposition = 'PACK';
  hunk.packId = pack.packId;
  hunk.quarantineReason = null;
  path.disposition = 'PACK';
  path.packIds = [pack.packId];
  pack.hunkOrdinals.push(hunk.ordinal);
  pack.files.overlayCreate.push(decodedPath);
  pack.files.create.push(decodedPath);
  manifest.payload.quarantines.hunkOrdinals = manifest.payload.quarantines.hunkOrdinals
    .filter((ordinal) => ordinal !== hunk.ordinal);
  manifest.payload.quarantines.pathB64s = manifest.payload.quarantines.pathB64s
    .filter((pathB64) => pathB64 !== hunk.pathB64);
  resign(manifest);

  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('HISTORICAL_BASE_QUARANTINE_CONTRACT'));
  assert.ok(codes.includes('CANONICAL_PAYLOAD_HASH'));
});

test('omitting one transition control-plane path is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[1].controlPlane.transitionCommit.exactPaths.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_CONTROL_PLANE_CONTRACT'), true);
});

test('Task 12 cannot remove its single plan-aligned A14 transition', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-09');
  pack.controlPlane.transitionTuwIds = pack.controlPlane.transitionTuwIds
    .filter((id) => id !== 'A14');
  resign(manifest);

  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('PACK_CONTROL_PLANE_CONTRACT'));
  assert.ok(codes.includes('CANONICAL_PAYLOAD_HASH'));
});

test('Task 8 cannot transition A14 before Task 12', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-08');
  pack.controlPlane.transitionTuwIds.push('A14');
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('PACK_CONTROL_PLANE_CONTRACT'));
});

test('allowing candidate bookkeeping after transitions is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[1].controlPlane.candidateBookkeeping.mustPrecedeTransitions = false;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_CONTROL_PLANE_CONTRACT'), true);
});

test('omitting a repo-safe receipt from candidate bookkeeping is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[0].controlPlane.candidateBookkeeping.create = [];
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_CONTROL_PLANE_CONTRACT'), true);
});

test('amendment registration drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.amendmentRegistration.allowedModify.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'AMENDMENT_REGISTRATION'), true);
});

test('stale G003 evidence-target routing is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[0].evidenceTarget = '.omo/evidence/ulw/stale/PACK-R14-04.txt';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_EVIDENCE_CONTRACT'), true);
});

test('source-less output validation rejects committed Markdown drift', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'amic-vault-manifest-drift-'));
  const clone = path.join(scratch, 'repo');
  try {
    const cloned = spawnSync('git', ['clone', '--shared', '--no-checkout', root, clone], {
      encoding: 'utf8',
    });
    assert.equal(cloned.status, 0, cloned.stderr);
    const checkedOut = spawnSync('git', ['-C', clone, 'checkout', '--detach', 'HEAD'], {
      encoding: 'utf8',
    });
    assert.equal(checkedOut.status, 0, checkedOut.stderr);

    await Promise.all([
      cp(fileURLToPath(scriptPath), path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      cp(fileURLToPath(manifestPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json')),
      cp(fileURLToPath(markdownPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md')),
    ]);
    const cloneMarkdown = path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md');
    const markdown = await readFile(cloneMarkdown, 'utf8');
    await writeFile(cloneMarkdown, markdown + '\nDRIFT\n');

    const result = spawnSync(process.execPath, [
      await realpath(path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      '--check',
      '--committed-only',
    ], { cwd: clone, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /"code":"CHECK_DRIFT"/);
    assert.match(result.stderr, /"writes":0/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('committed-only check rejects stale authority registry anchors', async () => {
  const manifest = await fixture();
  const scratch = await mkdtemp(path.join(tmpdir(), 'amic-vault-authority-drift-'));
  const clone = path.join(scratch, 'repo');
  try {
    const cloned = spawnSync('git', ['clone', '--shared', '--no-checkout', root, clone], {
      encoding: 'utf8',
    });
    assert.equal(cloned.status, 0, cloned.stderr);
    const checkedOut = spawnSync('git', ['-C', clone, 'checkout', '--detach', 'HEAD'], {
      encoding: 'utf8',
    });
    assert.equal(checkedOut.status, 0, checkedOut.stderr);

    await Promise.all([
      cp(fileURLToPath(scriptPath), path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      cp(fileURLToPath(manifestPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json')),
      cp(fileURLToPath(markdownPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md')),
      cp(fileURLToPath(packRegistryPath), path.join(clone, 'docs/execution/PACKS_R4_R14.md')),
      cp(fileURLToPath(decisionLedgerPath), path.join(clone, 'docs/ledger/decision.md')),
    ]);
    const cloneRegistry = path.join(clone, 'docs/execution/PACKS_R4_R14.md');
    const registry = await readFile(cloneRegistry, 'utf8');
    await writeFile(cloneRegistry, registry.replace(
      manifest.payloadSha256,
      'bb9ebac9a5d25cf53be5fe0ca99bce90f6dd7675dd8186ab0826f9f62940d724',
    ));

    const result = spawnSync(process.execPath, [
      await realpath(path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      '--check',
      '--committed-only',
    ], { cwd: clone, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /AUTHORITY_PACK_REGISTRY_PAYLOAD_HASH/);
    assert.match(result.stderr, /"writes": 0/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('committed-only check rejects a quoted decision record in a copied clone', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'amic-vault-authority-decision-drift-'));
  const clone = path.join(scratch, 'repo');
  try {
    const cloned = spawnSync('git', ['clone', '--shared', '--no-checkout', root, clone], {
      encoding: 'utf8',
    });
    assert.equal(cloned.status, 0, cloned.stderr);
    const checkedOut = spawnSync('git', ['-C', clone, 'checkout', '--detach', 'HEAD'], {
      encoding: 'utf8',
    });
    assert.equal(checkedOut.status, 0, checkedOut.stderr);

    await Promise.all([
      cp(fileURLToPath(scriptPath), path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      cp(fileURLToPath(manifestPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json')),
      cp(fileURLToPath(markdownPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md')),
      cp(fileURLToPath(packRegistryPath), path.join(clone, 'docs/execution/PACKS_R4_R14.md')),
      cp(fileURLToPath(decisionLedgerPath), path.join(clone, 'docs/ledger/decision.md')),
    ]);
    const cloneDecision = path.join(clone, 'docs/ledger/decision.md');
    const decision = await readFile(cloneDecision, 'utf8');
    const affirmativeLines = decision.split('\n').filter(
      (line) => line.includes('authority decision record:'),
    );
    assert.ok(affirmativeLines.length);
    await writeFile(cloneDecision, decision.split('\n').map((line) =>
      affirmativeLines.includes(line) ? '> ' + line : line).join('\n'));

    const result = spawnSync(process.execPath, [
      await realpath(path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      '--check',
      '--committed-only',
    ], { cwd: clone, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /AUTHORITY_DECISION_RECORD_COUNT/);
    assert.match(result.stderr, /"writes": 0/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('committed-only check rejects inline-comment conflicts and mixed-length fences', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'amic-vault-authority-context-drift-'));
  const clone = path.join(scratch, 'repo');
  try {
    const cloned = spawnSync('git', ['clone', '--shared', '--no-checkout', root, clone], {
      encoding: 'utf8',
    });
    assert.equal(cloned.status, 0, cloned.stderr);
    const checkedOut = spawnSync('git', ['-C', clone, 'checkout', '--detach', 'HEAD'], {
      encoding: 'utf8',
    });
    assert.equal(checkedOut.status, 0, checkedOut.stderr);
    await Promise.all([
      cp(fileURLToPath(scriptPath), path.join(clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs')),
      cp(fileURLToPath(manifestPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json')),
      cp(fileURLToPath(markdownPath), path.join(clone, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md')),
      cp(fileURLToPath(packRegistryPath), path.join(clone, 'docs/execution/PACKS_R4_R14.md')),
      cp(fileURLToPath(decisionLedgerPath), path.join(clone, 'docs/ledger/decision.md')),
    ]);
    const cloneScript = await realpath(path.join(
      clone, 'tools/execution/build-post-r14-recovery-pack-manifest.mjs',
    ));
    const run = () => spawnSync(process.execPath, [
      cloneScript,
      '--check', '--committed-only',
    ], { cwd: clone, encoding: 'utf8' });
    const cloneDecision = path.join(clone, 'docs/ledger/decision.md');
    const decision = await readFile(cloneDecision, 'utf8');
    await writeFile(cloneDecision, decision
      + '\n- 2026-07-18 PACK-R14-03-AMENDMENT-01 authority decision: REJECTED; status=NOT_AUTHORIZED. <!-- note -->\n');
    const inline = run();
    assert.equal(inline.status, 1, inline.stdout + inline.stderr);
    assert.match(inline.stderr, /AUTHORITY_DECISION_RECORD_FORMAT/);
    assert.match(inline.stderr, /"writes": 0/);

    for (const prefix of ['<!--\n```\n-->\n', '`<!--`\n']) {
      await writeFile(cloneDecision, decision
        + '\n' + prefix
        + '- 2026-07-18 PACK-R14-03-AMENDMENT-01 authority decision: REJECTED; status=NOT_AUTHORIZED.\n');
      const context = run();
      assert.equal(context.status, 1, context.stdout + context.stderr);
      assert.match(context.stderr, /AUTHORITY_DECISION_RECORD_FORMAT/);
      assert.match(context.stderr, /"writes": 0/);
    }

    await writeFile(cloneDecision, decision);
    const cloneRegistry = path.join(clone, 'docs/execution/PACKS_R4_R14.md');
    const registry = await readFile(cloneRegistry, 'utf8');
    const heading = '## PACK-R14-03-AMENDMENT-01 — Recovery manifest v2 correction';
    await writeFile(cloneRegistry, registry.replace(heading, '````md\n```\n' + heading) + '\n````\n');
    const fence = run();
    assert.equal(fence.status, 1, fence.stdout + fence.stderr);
    assert.match(fence.stderr, /AUTHORITY_PACK_REGISTRY_HEADING_COUNT/);
    assert.match(fence.stderr, /"writes": 0/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('CLI accepts one explicit mode and rejects malformed or conflicting options', () => {
  const script = fileURLToPath(scriptPath);
  assert.deepEqual(parseCliArgs(['--check', '--committed-only']), {
    action: '--check',
    sourceDir: null,
    committedOnly: true,
    focusedTestPath: null,
  });
  const cases = [
    { args: ['--check'], pattern: /requires --source-dir/ },
    { args: ['--check', '--source-dir'], pattern: /requires a nonempty value/ },
    { args: ['--check', '--source-dir', ''], pattern: /requires a nonempty value/ },
    { args: ['--check', '--check', '--committed-only'], pattern: /only once/ },
    {
      args: ['--check', '--committed-only', '--committed-only'],
      pattern: /only once/,
    },
    { args: ['--check', '--committed-only', '--unknown'], pattern: /unknown option/ },
    { args: ['--build', '--check', '--source-dir', '/tmp/source'], pattern: /exactly one action/ },
    {
      args: [
        '--assert-focused-test',
        'tools/migration/onedrive-profile-manifest.spec.mjs',
        '--run-focused-test',
        'tools/migration/onedrive-profile-manifest.spec.mjs',
      ],
      pattern: /exactly one action/,
    },
    {
      args: ['--check', '--source-dir', '/definitely/missing/amic-vault-source'],
      pattern: /ENOENT/,
    },
    {
      args: ['--check', '--source-dir', '/tmp/source', '--committed-only'],
      pattern: /mutually exclusive/,
    },
  ];
  for (const { args, pattern } of cases) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, pattern, args.join(' '));
  }
  const committed = spawnSync(process.execPath, [script, '--check', '--committed-only'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(committed.status, 0, committed.stderr);
  assert.match(committed.stdout, /"code":"CHECK_OK"/);
  assert.match(committed.stdout, /"writes":0/);
});

test('focused result accounting rejects semantic exclusions and zero-test greens', () => {
  assert.deepEqual(validateFocusedTestResult('WORKSPACE_VITEST', {
    status: 0,
    stdout: ' Tests  2 passed (2)\n',
  }), {
    executed: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    todo: 0,
    xfail: 0,
    xpass: 0,
    deselected: 0,
  });
  for (const stdout of [
    ' Tests  1 passed | 1 skipped (2)\n',
    ' Tests  1 todo (1)\n',
    ' Tests  0 passed (0)\n',
  ]) {
    assert.throws(
      () => validateFocusedTestResult('WORKSPACE_VITEST', { status: 0, stdout }),
      /zero-exclusion contract/,
    );
  }
  assert.deepEqual(validateFocusedTestResult('NODE_TEST', {
    status: 0,
    stdout: '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
  }).passed, 1);
  for (const stdout of [
    '# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n',
    '# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 1\n',
    '# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
  ]) {
    assert.throws(
      () => validateFocusedTestResult('NODE_TEST', { status: 0, stdout }),
      /zero-exclusion contract/,
    );
  }
  assert.equal(validateFocusedTestResult('PYTEST', {
    status: 0,
    stdout: '================ 2 passed in 0.10s ================\n',
  }).passed, 2);
  for (const stdout of [
    '================ 1 passed, 1 skipped in 0.10s ================\n',
    '================ 1 xfailed in 0.10s ================\n',
    '================ 1 xpassed in 0.10s ================\n',
    '================ no tests ran in 0.10s ================\n',
  ]) {
    assert.throws(
      () => validateFocusedTestResult('PYTEST', { status: 0, stdout }),
      /zero-exclusion contract/,
    );
  }
});

test('cleanup-guaranteed shell wrapper preserves failure status and always releases its lock', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'amic-vault-cleanup-wrapper-'));
  const log = path.join(scratch, 'events.log');
  const lock = path.join(scratch, 'lock');
  try {
    const command = cleanupGuaranteedShellCommand({
      lockPath: lock,
      preflightCommands: ["printf '%s\\n' preflight >> " + shellQuote(log)],
      commands: [
        "printf '%s\\n' body >> " + shellQuote(log),
        "sh -c 'exit 23'",
      ],
      cleanupCommands: ["printf '%s\\n' cleanup >> " + shellQuote(log)],
    });
    const result = spawnSync('bash', ['-c', command], { encoding: 'utf8' });
    assert.equal(result.status, 23, result.stderr);
    assert.equal(await readFile(log, 'utf8'), 'preflight\nbody\ncleanup\n');
    await assert.rejects(readFile(lock), /EISDIR|ENOENT/);
    const lockProbe = spawnSync('test', ['!', '-e', lock]);
    assert.equal(lockProbe.status, 0);

    const cleanupFailure = cleanupGuaranteedShellCommand({
      lockPath: lock,
      preflightCommands: [':'],
      commands: [':'],
      cleanupCommands: ["sh -c 'exit 29'"],
    });
    const cleanupResult = spawnSync('bash', ['-c', cleanupFailure], { encoding: 'utf8' });
    assert.equal(cleanupResult.status, 29);
    assert.match(cleanupResult.stderr, /cleanup failed/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('isolated database wrappers create overrides inside a private lock directory', async () => {
  const manifest = await fixture();
  const databaseCommand = manifest.payload.packs
    .flatMap((pack) => pack.verification.commands)
    .find((command) => command.includes('compose.override.yml'));
  assert.ok(databaseCommand);
  assert.match(databaseCommand, /umask 077/);
  assert.match(databaseCommand, /isolated\.lock\/compose\.override\.yml/);
  assert.match(databaseCommand, /set -C; : >/);
  assert.doesNotMatch(databaseCommand, /rm -f '\/tmp\/amic-vault-pack-r14-.*compose\.override\.yml'/);
});
