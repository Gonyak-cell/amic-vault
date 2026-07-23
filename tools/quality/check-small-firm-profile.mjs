import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSourceLabBoundary } from '../oss/verify-upstream-lock.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const EXPECTED_INVARIANTS = new Set([
  'permission-before-search',
  'permission-before-ai',
  'audit-by-default',
  'fail-closed',
  'immutable-original',
  'private-gateway-mtls',
  'production-loopback-identity-deny',
  'restore-direct-readback',
  'sensitive-data-not-logged',
]);
const EXPECTED_OUTCOMES = new Set([
  'PROPOSED-OSS05-SBX-TUW-001',
  'PROPOSED-OSS05-SBX-TUW-002',
  'PROPOSED-OSS05-SBX-TUW-003',
  'PROPOSED-OSS05-SBX-TUW-004',
  'PROPOSED-OSS07-LCM-TUW-002',
  'PROPOSED-OSS07-LCM-TUW-003',
  'PROPOSED-OSS08-DLP-TUW-001',
  'PROPOSED-OSS08-DLP-TUW-002',
  'PROPOSED-OSS09-OPS-TUW-001',
  'PROPOSED-OSS09-OPS-TUW-002',
  'PROPOSED-OSS09-OPS-TUW-004',
  'PROPOSED-OSS10-IAC-TUW-001',
  'PROPOSED-OSS10-IAC-TUW-002',
  'PROPOSED-OSS10-IAC-TUW-003',
  'PROPOSED-OSS10-IAC-TUW-004',
  'PROPOSED-OSS10-DR-TUW-001',
  'PROPOSED-OSS10-DR-TUW-002',
  'PROPOSED-OSS10-DR-TUW-003',
  'PROPOSED-OSS10-DR-TUW-004',
]);
const EXPECTED_PACKS = [
  'PACK-SF20-00',
  'PACK-SF20-01',
  'PACK-SF20-02',
  'PACK-SF20-03',
  'PACK-SF20-04',
  'PACK-SF20-05',
  'PACK-SF20-06',
];
const REQUIRED_SOURCE_PINS = new Set([
  'nginx',
  'prometheus',
  'alertmanager',
  'ansible',
  'pgbackrest',
]);

function fail(message) {
  throw new Error(`small-firm profile check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertExactSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues);
  assert(actual.size === actualValues.length, `${label} contains duplicates`);
  assert(actual.size === expectedValues.size, `${label} count mismatch`);
  for (const value of expectedValues) assert(actual.has(value), `${label} missing ${value}`);
}

function assertRequiredSet(actualValues, requiredValues, label) {
  const actual = new Set(actualValues);
  assert(actual.size === actualValues.length, `${label} contains duplicates`);
  for (const value of requiredValues) assert(actual.has(value), `${label} missing ${value}`);
}

function relativeSafePath(value, label) {
  assert(typeof value === 'string' && value && !value.startsWith('/'), `${label} must be relative`);
  assert(!value.split('/').includes('..'), `${label} cannot traverse`);
}

function byId(items, label) {
  assert(Array.isArray(items), `${label} must be an array`);
  const map = new Map();
  for (const item of items) {
    assert(typeof item?.id === 'string' && item.id, `${label} row ID missing`);
    assert(!map.has(item.id), `${label} duplicate ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function validateCapacityAndSlo(profile) {
  const expectedCapacity = {
    namedUsers: 20,
    simultaneousActiveSessions: 12,
    concurrentApiRequestBurst: 25,
    simultaneousPreviewDownloads: 8,
    concurrentIngestionJobs: 4,
    documentVersions: 500000,
    objectStorageBytes: 2199023255552,
    tenantFixtureCount: 2,
  };
  for (const [key, value] of Object.entries(expectedCapacity)) {
    assert(profile.capacity?.[key] === value, `capacity ${key} must remain ${value}`);
  }
  const expectedSlo = {
    monthlyAvailabilityPercent: 99.5,
    apiP95Milliseconds: 1000,
    permissionBoundSearchP95Milliseconds: 2000,
    previewFirstByteP95Milliseconds: 3000,
    databaseRpoMinutes: 60,
    databaseRtoMinutes: 240,
  };
  for (const [key, value] of Object.entries(expectedSlo)) {
    assert(profile.slo?.[key] === value, `SLO ${key} must remain ${value}`);
  }
}

function validatePackGraph(profile) {
  const packs = profile.executionPacks;
  assert(Array.isArray(packs) && packs.length === 7, 'exactly seven execution packs are required');
  assertExactSet(
    packs.map(({ id }) => id),
    new Set(EXPECTED_PACKS),
    'execution packs',
  );
  const seenPacks = new Set();
  const allTuws = [];
  for (const [index, pack] of packs.entries()) {
    assert(pack.id === EXPECTED_PACKS[index], `pack order mismatch at ${index}`);
    assert(pack.order === index, `${pack.id} order must be ${index}`);
    assert(Array.isArray(pack.dependsOn), `${pack.id} dependencies missing`);
    for (const dependency of pack.dependsOn) {
      assert(
        seenPacks.has(dependency),
        `${pack.id} dependency ${dependency} is not an earlier pack`,
      );
    }
    assert(Array.isArray(pack.tuws) && pack.tuws.length >= 4, `${pack.id} TUWs missing`);
    allTuws.push(...pack.tuws);
    seenPacks.add(pack.id);
  }
  assert(allTuws.length === 33, 'exactly 33 testable TUWs are required');
  assert(new Set(allTuws).size === 33, 'testable TUW IDs must be unique');
  assert(
    allTuws.every((id) => /^(?:DEVOPS|SEC)-SF20-[A-Z]+-TUW-\d{3}$/u.test(id)),
    'testable TUW ID format invalid',
  );
  return allTuws;
}

function runGit(clonePath, args) {
  return execFileSync('git', ['-C', clonePath, ...args], { encoding: 'utf8' }).trim();
}

function verifyPinnedPath({ component, path, blob, sourceRoot }) {
  relativeSafePath(path, `${component.id} pinned path`);
  assert(SHA.test(blob), `${component.id} blob invalid`);
  const clonePath = resolve(sourceRoot, component.clonePath);
  assert(existsSync(clonePath), `${component.id} clone missing`);
  assert(
    runGit(clonePath, ['rev-parse', 'HEAD']) === component.commit,
    `${component.id} clone commit mismatch`,
  );
  assert(
    runGit(clonePath, ['rev-parse', 'HEAD^{tree}']) === component.tree,
    `${component.id} clone tree mismatch`,
  );
  assert(runGit(clonePath, ['status', '--porcelain']) === '', `${component.id} clone dirty`);
  assert(
    runGit(clonePath, ['rev-parse', `${component.commit}:${path}`]) === blob,
    `${component.id} blob mismatch for ${path}`,
  );
}

function verifyComponentIdentity({ component, sourceRoot }) {
  const clonePath = resolve(sourceRoot, component.clonePath);
  assert(
    runGit(clonePath, ['remote', 'get-url', 'origin']) === component.officialUrl,
    `${component.id} clone remote mismatch`,
  );
  const license = execFileSync(
    'git',
    ['-C', clonePath, 'show', `${component.commit}:${component.licensePath}`],
    { encoding: 'buffer' },
  );
  const licenseHash = `sha256:${createHash('sha256').update(license).digest('hex')}`;
  assert(licenseHash === component.licenseHash, `${component.id} license hash mismatch`);
}

function validateSourcePins({ profile, sourceMap, sourceRoot, repoRoot }) {
  assert(sourceMap?.schemaVersion === 'oss-source-map-v1', 'source-map schema mismatch');
  const components = byId(sourceMap.components, 'source-map components');
  const pins = byId(profile.sourcePins, 'profile source pins');
  assertExactSet([...pins.keys()], REQUIRED_SOURCE_PINS, 'profile source pins');
  let pinnedArtifacts = 0;
  for (const pin of pins.values()) {
    const component = components.get(pin.component);
    const testComponent = components.get(pin.testComponent);
    assert(component?.state === 'PINNED', `${pin.id} source component is not pinned`);
    assert(testComponent?.state === 'PINNED', `${pin.id} test component is not pinned`);
    for (const row of new Set([component, testComponent])) {
      assert(
        /^https:\/\/[a-z0-9.-]+\//iu.test(row.officialUrl ?? ''),
        `${row.id} official URL invalid`,
      );
      assert(
        SHA.test(row.commit ?? '') && SHA.test(row.tree ?? ''),
        `${row.id} source identity incomplete`,
      );
      assert(DIGEST.test(row.licenseHash ?? ''), `${row.id} license hash invalid`);
      relativeSafePath(row.clonePath, `${row.id} clone path`);
      relativeSafePath(row.licensePath, `${row.id} license path`);
    }
    assert(
      ['L0', 'L1', 'L2', 'L3', 'L4'].includes(pin.reuseLevel),
      `${pin.id} reuse level invalid`,
    );
    assert(pin.copyPolicy === 'NO_COPY', `${pin.id} copy policy must remain NO_COPY`);
    relativeSafePath(pin.sourcePath, `${pin.id} source path`);
    relativeSafePath(pin.testPath, `${pin.id} test path`);
    assert(
      SHA.test(pin.sourceBlob ?? '') && SHA.test(pin.testBlob ?? ''),
      `${pin.id} source/test blob invalid`,
    );
    if (pin.runtimeArtifact?.state === 'PINNED') {
      assert(
        typeof pin.runtimeArtifact.reference === 'string' && pin.runtimeArtifact.reference,
        `${pin.id} artifact reference missing`,
      );
      assert(DIGEST.test(pin.runtimeArtifact.digest ?? ''), `${pin.id} artifact digest invalid`);
      pinnedArtifacts += 1;
    } else {
      assert(
        ['SOURCE_PIN_ONLY', 'CONDITIONAL_NOT_AUTHORIZED'].includes(pin.runtimeArtifact?.state),
        `${pin.id} runtime artifact state invalid`,
      );
      assert(
        typeof pin.runtimeArtifact.requiredBeforeUse === 'string' &&
          pin.runtimeArtifact.requiredBeforeUse,
        `${pin.id} pre-use gate missing`,
      );
    }
    if (sourceRoot) {
      verifyPinnedPath({ component, path: pin.sourcePath, blob: pin.sourceBlob, sourceRoot });
      verifyPinnedPath({
        component: testComponent,
        path: pin.testPath,
        blob: pin.testBlob,
        sourceRoot,
      });
      for (const row of new Set([component, testComponent]))
        verifyComponentIdentity({ component: row, sourceRoot });
    }
  }
  if (sourceRoot) validateSourceLabBoundary({ sourceRoot, repoRoot });
  assert(
    pinnedArtifacts === 3,
    'NGINX, Prometheus, and Alertmanager artifacts must be digest-pinned',
  );
  return { sourcePinsVerified: pins.size, pinnedArtifacts };
}

function pathExcluded(path, excludedPaths) {
  return excludedPaths.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function shouldInclude(name, scan) {
  return (
    scan.includedNames.includes(name) ||
    scan.includedSuffixes.some((suffix) => name.endsWith(suffix))
  );
}

function walkRuntimeManifests(root, path, scan, files) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (['.git', '.next', 'artifacts', 'coverage', 'dist', 'node_modules'].includes(entry.name))
      continue;
    const absolute = resolve(path, entry.name);
    const repoPath = relative(root, absolute);
    if (pathExcluded(repoPath, scan.excludedPaths)) continue;
    if (entry.isDirectory()) walkRuntimeManifests(root, absolute, scan, files);
    else if (entry.isFile() && shouldInclude(entry.name, scan))
      files.push({ path: repoPath, text: readFileSync(absolute, 'utf8') });
  }
}

export function loadRuntimeManifestFiles({ profile, repoRoot = process.cwd() }) {
  const scan = profile.runtimeManifestScan;
  assert(
    scan && Array.isArray(scan.rootFiles) && Array.isArray(scan.roots),
    'runtime manifest scan missing',
  );
  const files = [];
  for (const path of scan.rootFiles) {
    const absolute = resolve(repoRoot, path);
    if (existsSync(absolute) && !pathExcluded(path, scan.excludedPaths)) {
      files.push({ path, text: readFileSync(absolute, 'utf8') });
    }
  }
  for (const path of scan.roots)
    walkRuntimeManifests(repoRoot, resolve(repoRoot, path), scan, files);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function validateApprovedExpansions(profile) {
  const components = byId(profile.expansionPolicy?.conditionalComponents, 'conditional components');
  const approvals = profile.expansionPolicy?.approvedExpansions;
  assert(Array.isArray(approvals), 'approved expansions must be an array');
  const unique = new Set();
  for (const approval of approvals) {
    assert(
      components.has(approval.component),
      `approval references unknown component ${approval.component}`,
    );
    relativeSafePath(approval.path, `${approval.component} approved path`);
    assert(
      typeof approval.triggerReceipt === 'string' && approval.triggerReceipt.trim(),
      `${approval.component} trigger receipt missing`,
    );
    assert(
      typeof approval.approvalReference === 'string' && approval.approvalReference.trim(),
      `${approval.component} approval reference missing`,
    );
    const key = `${approval.component}\t${approval.path}`;
    assert(!unique.has(key), `duplicate expansion approval ${key}`);
    unique.add(key);
  }
  return approvals;
}

function sectionPublishesWorkerPort(text) {
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(?:ingestion|ingestion-worker):\s*(?:#.*)?$/u);
    if (!match) continue;
    const serviceIndent = match[1].length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= serviceIndent) break;
      if (/^\s*ports:\s*(?:#.*)?$/u.test(line)) return true;
    }
  }
  return false;
}

export function scanRuntimeExpansion({ profile, runtimeFiles }) {
  const approvals = validateApprovedExpansions(profile);
  const matches = [];
  for (const file of runtimeFiles) {
    relativeSafePath(file.path, 'runtime manifest path');
    for (const component of profile.expansionPolicy.conditionalComponents) {
      assert(
        Array.isArray(component.patterns) && component.patterns.length > 0,
        `${component.id} patterns missing`,
      );
      assert(
        typeof component.triggerReference === 'string' && component.triggerReference,
        `${component.id} trigger missing`,
      );
      const matched = component.patterns.some((pattern) =>
        new RegExp(pattern, 'iu').test(file.text),
      );
      if (!matched) continue;
      const approved = approvals.some(
        (approval) => approval.component === component.id && approval.path === file.path,
      );
      if (!approved) matches.push({ component: component.id, path: file.path });
    }
    if (sectionPublishesWorkerPort(file.text))
      matches.push({ component: 'public-worker-port', path: file.path });
  }
  assert(matches.length === 0, `unauthorized runtime expansion: ${JSON.stringify(matches)}`);
  return { runtimeFilesScanned: runtimeFiles.length, approvedExpansionCount: approvals.length };
}

export function validateSmallFirmProfile({
  profile,
  sourceMap,
  sourceRoot,
  repoRoot = process.cwd(),
  runtimeFiles = loadRuntimeManifestFiles({ profile, repoRoot }),
}) {
  assert(
    profile?.schemaVersion === 'amic-vault.small-firm-20-profile.v1',
    'profile schema mismatch',
  );
  assert(
    profile.profileId === 'SF20' && profile.status === 'CANONICAL_BASELINE',
    'profile identity/state mismatch',
  );
  assert(profile.baseline?.sourceRef === 'origin/main', 'baseline source ref must be origin/main');
  assert(SHA.test(profile.baseline?.sourceSha ?? ''), 'baseline source SHA invalid');
  for (const path of [
    profile.baseline.planPath,
    profile.baseline.packRegistryPath,
    profile.baseline.backlogCsvPath,
    profile.baseline.backlogJsonPath,
  ]) {
    relativeSafePath(path, 'baseline path');
    assert(existsSync(resolve(repoRoot, path)), `baseline path missing: ${path}`);
  }
  assertRequiredSet(profile.mandatoryInvariants, EXPECTED_INVARIANTS, 'mandatory invariants');
  assertExactSet(
    profile.originalImmediateOutcomes,
    EXPECTED_OUTCOMES,
    'original immediate outcomes',
  );
  const tuws = validatePackGraph(profile);
  validateCapacityAndSlo(profile);
  const sources = validateSourcePins({ profile, sourceMap, sourceRoot, repoRoot });
  const expansion = scanRuntimeExpansion({ profile, runtimeFiles });
  return {
    schemaVersion: 'amic-vault.small-firm-20-profile-report.v1',
    status: 'PASS',
    baselineSourceSha: profile.baseline.sourceSha,
    originalImmediateOutcomeCount: profile.originalImmediateOutcomes.length,
    packCount: profile.executionPacks.length,
    testableTuwCount: tuws.length,
    ...sources,
    ...expansion,
  };
}

function parseArgs(argv) {
  const args = {
    profilePath: 'security/small-firm-20-profile.yml',
    sourceMapPath: 'security/oss-source-map.yml',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--static') args.static = true;
    else if (token === '--profile') args.profilePath = argv[++index];
    else if (token === '--source-map') args.sourceMapPath = argv[++index];
    else if (token === '--source-root') args.sourceRoot = argv[++index];
    else fail(`unknown argument: ${token}`);
  }
  return args;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const sourceRoot = args.static ? undefined : (args.sourceRoot ?? process.env.OSS_RESEARCH_ROOT);
    const profile = JSON.parse(readFileSync(resolve(args.profilePath), 'utf8'));
    const sourceMap = JSON.parse(readFileSync(resolve(args.sourceMapPath), 'utf8'));
    const report = validateSmallFirmProfile({ profile, sourceMap, sourceRoot });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`SMALL_FIRM_PROFILE_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
