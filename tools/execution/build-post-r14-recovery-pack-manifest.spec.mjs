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
  validateNonOverlayGitSources,
  validateManifest,
} from './build-post-r14-recovery-pack-manifest.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifestPath = new URL('../../docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json', import.meta.url);
const markdownPath = new URL('../../docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md', import.meta.url);
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

const focusedCommandPrefixes = [
  'pnpm --filter ',
  'pnpm exec vitest run ',
  'node --test ',
  'python3 -m pytest ',
  'pnpm test:integration -- ',
];
const focusedAssertionPrefix =
  'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --assert-focused-test ';

function isFocusedRunnerCommand(command) {
  return focusedCommandPrefixes.some((prefix) => command.startsWith(prefix))
    || command.includes(' pnpm test:integration -- ');
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function commandSelector(testPath) {
  const match = /^(?:apps\/(?:api|web|desktop)|packages\/(?:ai|domain|shared))\/(.+)$/.exec(testPath);
  return match && /\.(?:spec|test)\.(?:js|jsx|ts|tsx)$/.test(testPath) ? match[1] : testPath;
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
  assert.equal(manifest.payload.quarantines.hunkOrdinals.length, 34);
  assert.equal(manifest.payload.quarantines.pathB64s.length, 28);
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

  for (const pack of packs) {
    const records = [];
    const closure = predecessorClosure(pack);
    for (const sourcePath of pack.verification.rawTestAnchorPaths) {
      const canonicalPath = expectedAliases[sourcePath] ?? sourcePath;
      const initialRunner = syntacticRunner(canonicalPath);
      const directorySelector = initialRunner === 'INTEGRATION' && !canonicalPath.endsWith('.spec.ts');
      const providers = [...providersByPath]
        .filter(([providedPath]) => providedPath === canonicalPath
          || (directorySelector
            && providedPath.startsWith(canonicalPath + '/')
            && providedPath.endsWith('.spec.ts')))
        .flatMap(([, ids]) => ids);
      const providerPackIds = [...new Set(providers)].sort();
      const predecessorProviderPackIds = providerPackIds.filter((id) => closure.has(id));
      const availableAtBase = basePaths.has(canonicalPath)
        || (directorySelector && [...basePaths].some(
          (basePath) => basePath.startsWith(canonicalPath + '/')
            && basePath.endsWith('.spec.ts'),
        ));
      const runner = directorySelector && !availableAtBase && providerPackIds.length === 0
        ? null
        : initialRunner;
      let disposition;
      if (!runner) disposition = 'NON_EXECUTABLE_ANCHOR';
      else if (gapByPath[canonicalPath] && providerPackIds.includes(pack.packId)) {
        disposition = 'PLANNED_CURRENT_PACK_CREATE';
      } else if (availableAtBase) disposition = 'AVAILABLE_AT_BASE';
      else if (providerPackIds.includes(pack.packId)) {
        disposition = 'PROVIDED_BY_CURRENT_PACK';
      } else if (predecessorProviderPackIds.length) {
        disposition = 'PROVIDED_BY_PREDECESSOR_PACK';
      } else if (gapByPath[canonicalPath]) {
        disposition = 'PLANNED_ACCEPTANCE_TEST_GAP';
      } else {
        assert.ok(providerPackIds.length > 0);
        disposition = 'DEFERRED_PROVIDER_PACK';
      }
      records.push({ canonicalPath, disposition });
    }
    for (const [gapPath, , ownerPackId] of expectedPlannedGaps) {
      if (ownerPackId === pack.packId
        && !records.some((record) => record.canonicalPath === gapPath)) {
        records.push({ canonicalPath: gapPath, disposition: 'PLANNED_CURRENT_PACK_CREATE' });
      }
    }
    const expectedDispositions = Object.fromEntries([
      'AVAILABLE_AT_BASE',
      'PROVIDED_BY_CURRENT_PACK',
      'PLANNED_CURRENT_PACK_CREATE',
      'PROVIDED_BY_PREDECESSOR_PACK',
      'DEFERRED_PROVIDER_PACK',
      'PLANNED_ACCEPTANCE_TEST_GAP',
      'NON_EXECUTABLE_ANCHOR',
    ].map((disposition) => [
      disposition,
      [...new Set(records
        .filter((record) => record.disposition === disposition)
        .map((record) => record.canonicalPath))].sort(),
    ]));
    assert.deepEqual(pack.verification.testAnchorDispositions, expectedDispositions);
    const expectedFocused = [...new Set(records
      .filter((record) => [
        'AVAILABLE_AT_BASE',
        'PROVIDED_BY_CURRENT_PACK',
        'PLANNED_CURRENT_PACK_CREATE',
        'PROVIDED_BY_PREDECESSOR_PACK',
      ].includes(record.disposition))
      .map((record) => record.canonicalPath))].sort();
    const expectedDeferred = [...new Set(records
      .filter((record) => record.disposition === 'DEFERRED_PROVIDER_PACK')
      .map((record) => record.canonicalPath))].sort();
    assert.deepEqual(pack.verification.focusedTestPaths, expectedFocused);
    assert.deepEqual(pack.verification.deferredTestPaths, expectedDeferred);
  }
});

test('every generated focused command is one-to-one, reachable, bootstrapped, and shell-safe', async () => {
  const manifest = await fixture();
  const allFocusedCommands = manifest.payload.packs.flatMap((pack) => pack.verification.commands)
    .filter((command) => command.startsWith(focusedAssertionPrefix)
      || isFocusedRunnerCommand(command));
  const commands = allFocusedCommands
    .filter(isFocusedRunnerCommand);
  assert.equal(manifest.payload.packs.some((pack) => pack.verification.commands
    .some((command) => command.startsWith('pnpm test -- '))), false);
  assert.ok(commands.some((command) => command.startsWith('pnpm --filter @amic-vault/api test -- ')));
  assert.ok(commands.some((command) => command.startsWith('pnpm exec vitest run ')));
  assert.ok(commands.some((command) => command.startsWith('node --test ')));
  assert.ok(commands.some((command) => command.startsWith("python3 -m pytest '")));
  assert.ok(commands.some((command) => command.includes('pnpm test:integration -- ')));
  assert.ok(commands.some((command) => command.includes('(app)')));
  for (const command of allFocusedCommands) {
    for (const shell of ['bash', 'zsh']) {
      const result = spawnSync(shell, ['-n', '-c', command], { encoding: 'utf8' });
      assert.equal(result.status, 0, shell + ' rejected: ' + command + '\n' + result.stderr);
    }
  }

  for (const pack of manifest.payload.packs) {
    const packCommands = pack.verification.commands;
    const focusedCommands = packCommands.filter(
      (command) => isFocusedRunnerCommand(command)
        && pack.verification.focusedTestPaths.some((testPath) =>
          command.includes(shellQuote(commandSelector(testPath)))),
    );
    const assertionCommands = packCommands.filter(
      (command) => command.startsWith(focusedAssertionPrefix),
    );
    const installIndex = packCommands.indexOf('pnpm install --frozen-lockfile');
    assert.equal(installIndex, 1);
    assert.ok(focusedCommands.every((command) => packCommands.indexOf(command) > installIndex));
    for (const testPath of pack.verification.focusedTestPaths) {
      assert.equal(
        assertionCommands.filter(
          (command) => command === focusedAssertionPrefix + shellQuote(testPath),
        ).length,
        1,
        pack.packId + ' did not assert exactly once: ' + testPath,
      );
      assert.equal(
        focusedCommands.filter(
          (command) => command.includes(shellQuote(commandSelector(testPath))),
        ).length,
        1,
        pack.packId + ' did not route exactly once: ' + testPath,
      );
    }
    assert.equal(assertionCommands.length, pack.verification.focusedTestPaths.length);
    assert.equal(focusedCommands.length, pack.verification.focusedTestPaths.length);
    for (const command of focusedCommands) {
      assert.equal(pack.verification.focusedTestPaths.filter(
        (testPath) => command.includes(shellQuote(commandSelector(testPath))),
      ).length, 1, pack.packId + ' batched or ambiguously selected: ' + command);
    }
  }

  const taskEight = manifest.payload.packs.find((pack) => pack.packId === 'PACK-R14-09');
  assert.ok(taskEight.verification.commands.includes(
    "node --test 'tools/migration/lawos-canonical-matter-reflection.spec.mjs'",
  ));
});

test('focused assertions reject missing, helper-only, and statically skipped tests', async () => {
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
    await writeFile(specPath, "test.skip('disabled', () => {});\n");
    await assert.rejects(
      assertFocusedTestPath('tests/integration/helpers/focused.spec.ts', { root: scratch }),
      /static skip\/todo marker/,
    );
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
    const apiRunners = candidate.verification.commands.filter(
      (command) => command.startsWith('pnpm --filter @amic-vault/api test -- '),
    );
    return apiRunners.length >= 2;
  });
  assert.ok(pack);
  const runnerIndices = pack.verification.commands
    .map((command, index) => command.startsWith('pnpm --filter @amic-vault/api test -- ')
      ? index : -1)
    .filter((index) => index !== -1);
  const secondCommand = pack.verification.commands[runnerIndices[1]];
  const secondSelector = /test -- ('(?:[^']|'"'"')+')/.exec(secondCommand)?.[1];
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
    const migrateIndices = commands
      .map((command, index) => command.endsWith(' pnpm db:migrate') ? index : -1)
      .filter((index) => index !== -1);
    const up = commands.findIndex((command) => command.includes(' docker compose -p ')
      && command.endsWith(' up -d --wait'));
    const rollback = commands.findIndex((command) => command.endsWith(' pnpm db:rollback'));
    const seed = commands.findIndex((command) => command.endsWith(' pnpm db:seed'));
    const integration = commands.findIndex((command) => command.endsWith(' pnpm test:integration'));
    const down = commands.findIndex((command) => command.includes(' docker compose -p ')
      && command.endsWith(' down -v --remove-orphans'));
    assert.equal(migrateIndices.length, 2, pack.packId);
    assert.equal(pack.verification.isolatedDatabase.projectName,
      'amic-vault-' + pack.packId.toLowerCase());
    assert.equal(pack.verification.isolatedDatabase.cleanupRequiredOnSuccessOrFailure, true);
    assert.ok(up < migrateIndices[0]
      && migrateIndices[0] < rollback
      && rollback < migrateIndices[1]
      && migrateIndices[1] < seed
      && seed < integration
      && integration < down, pack.packId);
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

test('PACK-R14-05 registers seven one-row transitions plus candidate bookkeeping', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-05');
  assert.deepEqual(pack.files.create, []);
  assert.deepEqual(pack.files.modify, []);
  assert.deepEqual(pack.controlPlane.transitionTuwIds, [
    'B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20',
  ]);
  assert.equal(pack.controlPlane.transitionCommit.exactPaths.length, 4);
  assert.deepEqual(pack.controlPlane.candidateBookkeeping.create, [pack.repoSafeReceipt]);
  assert.deepEqual(pack.controlPlane.candidateBookkeeping.modify, ['docs/ledger/execution.md']);
});

test('PACK-R14-09 composes the exact LawOS source with only its owned later hunks', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-09');
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

test('moving A14 from a row role to support cannot remove its transition', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-09');
  pack.secondaryTuwIds = pack.secondaryTuwIds.filter((id) => id !== 'A14');
  pack.supportTuwIds.unshift('A14');
  pack.controlPlane.transitionTuwIds = pack.controlPlane.transitionTuwIds
    .filter((id) => id !== 'A14');
  resign(manifest);

  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('PACK_TUW_ROLE_CONTRACT'));
  assert.ok(codes.includes('PACK_CONTROL_PLANE_CONTRACT'));
  assert.ok(codes.includes('CANONICAL_PAYLOAD_HASH'));
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
    ], { cwd: clone, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /"code":"CHECK_DRIFT"/);
    assert.match(result.stderr, /"writes":0/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
