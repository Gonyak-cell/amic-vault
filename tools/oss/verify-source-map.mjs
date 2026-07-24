import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const PORTFOLIOS = Array.from({ length: 11 }, (_, index) => `OSS-${String(index + 1).padStart(2, '0')}`);
const PRESIDIO_THRESHOLDS = Object.freeze({
  microPrecisionMinimum: 0.98,
  microRecallMinimum: 0.90,
  microF1Minimum: 0.94,
  classRecallMinimum: 0.80,
});
const PRESIDIO_PIN = Object.freeze({
  officialUrl: 'https://github.com/microsoft/presidio',
  release: '2.2.364',
  commit: '779dbd286d5ef4d1fbe2514275fb1bce358f2417',
  tree: 'faa34e3cfd7b00ab1e99b570ac16333488b4f9a8',
  licensePath: 'LICENSE',
  licenseHash: 'sha256:f3e86ee59a49bcfb0d9a9547484d55224ea7b2d04f95b1947b4d18d17f6de535',
  clonePath: 'clones/presidio',
  baseline: {
    command: [
      'python3',
      '-m',
      'pytest',
      'presidio-analyzer/tests/test_kr_rrn_recognizer.py',
      'presidio-analyzer/tests/test_kr_passport_recognizer.py',
    ],
    timeoutMs: 180000,
    outcome: 'TEST_FAILURE',
    exitCode: 1,
    timedOut: false,
    logs: {
      stdoutSha256: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      stderrSha256: 'sha256:e33688c9c0c9a5aedf876266cc617f2c572e0d1ad4ec27d79c0e93a9f6ccc385',
      stdoutBytes: 0,
      stderrBytes: 76,
    },
  },
  targets: [
    {
      sourcePath: 'presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/korea/kr_rrn_recognizer.py',
      sourceBlob: '77ebab08d16bd6314a72cc49caeb88eb492c70f5',
      testPath: 'presidio-analyzer/tests/test_kr_rrn_recognizer.py',
      testBlob: '3a1719e0793275553fd2e84fd4c34041af92d423',
    },
    {
      sourcePath: 'presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/korea/kr_passport_recognizer.py',
      sourceBlob: '93606722c83465c09120069aa1d6b0d7ec09d199',
      testPath: 'presidio-analyzer/tests/test_kr_passport_recognizer.py',
      testBlob: 'b6d7d93f35a9334dd5d9cb621e58c6e9c8056e27',
    },
  ],
});

function fail(message) { throw new Error(`source map verification failed: ${message}`); }
function assert(condition, message) { if (!condition) fail(message); }
function byId(items) { return new Map(items.map((item) => [item.id, item])); }
function sourceKey(item) { return `${item.component}:${item.sourceBlob}:${item.testBlob}`; }

function gitBlobHash(value) {
  return createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
}

export function collectProductTreeBlobHashes(repoRoot = process.cwd()) {
  const root = resolve(repoRoot);
  const hashes = new Set();
  const staged = execFileSync('git', ['-C', root, 'ls-files', '--stage', '-z'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  for (const row of staged) {
    const match = /^[0-9]+ ([a-f0-9]{40}) [0-3]\t/u.exec(row);
    assert(match, 'cannot parse product-tree index');
    hashes.add(match[1]);
  }
  const working = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    { encoding: 'buffer' },
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  for (const path of working) {
    const absolute = resolve(root, path);
    if (existsSync(absolute) && lstatSync(absolute).isFile()) hashes.add(gitBlobHash(readFileSync(absolute)));
  }
  return hashes;
}

function validatePresidio({ sourceMap, decisions, dlpBaseline, productBlobHashes, repoRoot, exists }) {
  const component = sourceMap.components.find(({ id }) => id === 'presidio');
  assert(component?.state === 'PINNED', 'presidio: exact source pin required');
  for (const key of ['officialUrl', 'release', 'commit', 'tree', 'licensePath', 'licenseHash', 'clonePath']) {
    assert(component[key] === PRESIDIO_PIN[key], `presidio: ${key} mismatch`);
  }
  assert(component.artifact === undefined, 'presidio: runtime artifact is forbidden');
  assert(JSON.stringify(component.baseline) === JSON.stringify(PRESIDIO_PIN.baseline), 'presidio: baseline record mismatch');

  const targets = sourceMap.sourceTestTargets.filter(({ component: id }) => id === 'presidio');
  assert(targets.length === PRESIDIO_PIN.targets.length, 'presidio: exactly two Korean source/test targets required');
  const targetByPath = new Map(targets.map((row) => [`${row.sourcePath}:${row.testPath}`, row]));
  for (const expected of PRESIDIO_PIN.targets) {
    const target = targetByPath.get(`${expected.sourcePath}:${expected.testPath}`);
    assert(target, `presidio: target missing for ${expected.testPath}`);
    for (const key of ['sourceBlob', 'testBlob']) assert(target[key] === expected[key], `presidio: ${key} mismatch`);
    assert(target.portfolio === 'OSS-08' && target.expectedReuse === 'L0', 'presidio: L0 OSS-08 classification required');
    assert(target.fixturePolicy === 'NO_COPY', 'presidio: NO_COPY policy required');
    const authorities = new Set((target.prohibitedAuthority ?? '').split(','));
    for (const authority of ['permission', 'ethical-wall', 'audit', 'tenant', 'immutable-original', 'egress']) {
      assert(authorities.has(authority), `presidio: prohibited authority missing ${authority}`);
    }
    assert(
      target.sourceBlobUrl === `${PRESIDIO_PIN.officialUrl}/blob/${PRESIDIO_PIN.commit}/${expected.sourcePath}`
        && target.testBlobUrl === `${PRESIDIO_PIN.officialUrl}/blob/${PRESIDIO_PIN.commit}/${expected.testPath}`,
      'presidio: source/test URL mismatch',
    );
  }

  if (productBlobHashes !== undefined) {
    assert(productBlobHashes instanceof Set, 'presidio: product blob inventory invalid');
    for (const target of PRESIDIO_PIN.targets) {
      assert(!productBlobHashes.has(target.sourceBlob), 'presidio: upstream source copied into product tree');
      assert(!productBlobHashes.has(target.testBlob), 'presidio: upstream test copied into product tree');
    }
  }

  assert(dlpBaseline?.schemaVersion === 'amic-vault.dlp-korean-pii-baseline.v1', 'presidio: DLP baseline missing or invalid');
  assert(Number.isInteger(dlpBaseline.caseCount) && dlpBaseline.caseCount > 0, 'presidio: DLP baseline case count invalid');
  const classes = Object.values(dlpBaseline.classes ?? {});
  assert(classes.length > 0, 'presidio: DLP baseline classes missing');
  const aggregate = dlpBaseline.aggregate ?? {};
  for (const value of [aggregate.microPrecision, aggregate.microRecall, aggregate.microF1, ...classes.map(({ recall }) => recall)]) {
    assert(Number.isFinite(value) && value >= 0 && value <= 1, 'presidio: DLP metric invalid');
  }

  const decision = decisions.decisions.find(({ id }) => id === 'presidio');
  assert(decision?.kind === 'source-test-reference' && decision.decision === 'REJECTED', 'presidio: decision must remain a rejected source-test reference');
  assert(decision.approvedPaths === undefined && decision.approvedDependencyPaths === undefined, 'presidio: runtime or dependency approval is forbidden');
  const activation = decision.activation;
  assert(activation?.baselinePath === 'security/dlp-korean-pii-baseline.json' && exists(resolve(repoRoot, activation.baselinePath)), 'presidio: activation baseline path invalid');
  assert(
    activation.schemaVersion === dlpBaseline.schemaVersion
      && activation.policyVersion === dlpBaseline.policyVersion
      && activation.corpusHash === dlpBaseline.corpusHash
      && activation.caseCount === dlpBaseline.caseCount,
    'presidio: activation baseline identity mismatch',
  );
  assert(JSON.stringify(activation.thresholds) === JSON.stringify(PRESIDIO_THRESHOLDS), 'presidio: activation thresholds mismatch');
  assert(typeof activation.requiredEntityClassMissing === 'boolean', 'presidio: required entity-class decision missing');
  const thresholdMiss = aggregate.microPrecision < PRESIDIO_THRESHOLDS.microPrecisionMinimum
    || aggregate.microRecall < PRESIDIO_THRESHOLDS.microRecallMinimum
    || aggregate.microF1 < PRESIDIO_THRESHOLDS.microF1Minimum
    || classes.some(({ recall }) => recall < PRESIDIO_THRESHOLDS.classRecallMinimum)
    || activation.requiredEntityClassMissing;
  const outcome = thresholdMiss ? 'FOLLOW_ON_PACK_REQUIRED' : 'DEFERRED_BY_PROFILE';
  assert(decision.status === outcome && activation.outcome === outcome, `presidio: measured outcome must be ${outcome}`);
  assert(activation.followOnPackRequired === thresholdMiss, 'presidio: follow-on PACK flag does not match measured outcome');
  assert(Number.isFinite(activation.expectedMicroF1Improvement) && activation.expectedMicroF1Improvement >= 0, 'presidio: expected metric improvement missing');
  if (!thresholdMiss) assert(activation.expectedMicroF1Improvement === 0, 'presidio: passing baseline must not claim improvement');
  const conditional = sourceMap.noCandidateTargets.filter(({ component: id }) => id === 'presidio');
  assert(conditional.length === 1 && conditional[0].result === outcome && conditional[0].reason, 'presidio: source-map outcome mismatch');
  const vetoes = (decision.hardVeto ?? []).join(' ').toLowerCase();
  for (const authority of ['permission', 'ethical-wall', 'audit', 'immutable-original', 'egress']) {
    assert(vetoes.includes(authority), `presidio: decision veto missing ${authority}`);
  }
  assert(decision.reason, 'presidio: decision reason missing');
  return {
    outcome,
    thresholdMiss,
    sourceTestTargetsVerified: targets.length,
    productTreeNoCopy: productBlobHashes === undefined ? 'NOT_RUN_LIBRARY' : 'VERIFIED',
  };
}

function verifyLab(sourceMap, sourceRoot, repoRoot, componentId) {
  if (!sourceRoot) return { status: 'NOT_RUN_STATIC_CI' };
  const root = resolve(sourceRoot);
  const productRoot = resolve(repoRoot);
  assert(root !== productRoot && !root.startsWith(`${productRoot}/`), 'source root overlaps product worktree');
  const pinned = sourceMap.components.filter(
    ({ id, state }) => state === 'PINNED' && (componentId === undefined || id === componentId),
  );
  if (componentId !== undefined) assert(pinned.length === 1, `${componentId}: pinned component scope invalid`);
  for (const component of pinned) {
    const clone = resolve(root, component.clonePath);
    assert(existsSync(clone), `${component.id}: pinned clone missing`);
    assert(execFileSync('git', ['-C', clone, 'status', '--porcelain'], { encoding: 'utf8' }).trim() === '', `${component.id}: clone dirty`);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === component.commit, `${component.id}: head mismatch`);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}^{tree}`], { encoding: 'utf8' }).trim() === component.tree, `${component.id}: tree mismatch`);
    const license = createHash('sha256').update(execFileSync('git', ['-C', clone, 'show', `${component.commit}:${component.licensePath}`], { encoding: 'buffer' })).digest('hex');
    assert(`sha256:${license}` === component.licenseHash, `${component.id}: license mismatch`);
  }
  const targets = sourceMap.sourceTestTargets.filter(
    ({ component }) => componentId === undefined || component === componentId,
  );
  for (const target of targets) {
    const component = sourceMap.components.find(({ id }) => id === target.component);
    const clone = resolve(root, component.clonePath);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}:${target.sourcePath}`], { encoding: 'utf8' }).trim() === target.sourceBlob, `${target.component}: source blob mismatch`);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}:${target.testPath}`], { encoding: 'utf8' }).trim() === target.testBlob, `${target.component}: test blob mismatch`);
  }
  return {
    status: 'VERIFIED',
    componentScope: componentId ?? 'ALL',
    pinnedCloneCount: pinned.length,
    sourceTestTargetCount: targets.length,
  };
}

export function validateSourceMap({ sourceMap, decisions, reuseManifest, dlpBaseline, productBlobHashes, repoRoot = process.cwd(), sourceRoot, componentId, exists = existsSync } = {}) {
  assert(sourceMap?.schemaVersion === 'oss-source-map-v1', 'source map schema invalid');
  assert(decisions?.schemaVersion === 'amic-vault.oss-adoption-decisions.v1', 'decision schema invalid');
  assert(reuseManifest?.schemaVersion === 'amic-vault.oss-test-reuse.v1', 'reuse schema invalid');
  assert(sourceMap.sourceLab?.productTreeInclusion === 'FORBIDDEN', 'source lab inclusion must be forbidden');
  const authority = new Map((sourceMap.productAuthorityTargets ?? []).map((row) => [row.portfolio, row]));
  for (const portfolio of PORTFOLIOS) {
    const row = authority.get(portfolio);
    assert(row?.owner && row.productPaths?.length && row.testPaths?.length, `${portfolio}: authority row incomplete`);
    for (const path of [...row.productPaths, ...row.testPaths]) assert(exists(resolve(repoRoot, path)), `${portfolio}: missing local path ${path}`);
  }
  const components = byId(sourceMap.components ?? []);
  const reuse = new Map((reuseManifest.entries ?? []).map((row) => [sourceKey(row), row]));
  const decisionById = byId(decisions.decisions ?? []);
  const requiredDecisions = new Set();
  const presidio = validatePresidio({ sourceMap, decisions, dlpBaseline, productBlobHashes, repoRoot, exists });
  for (const row of sourceMap.sourceTestTargets ?? []) {
    const component = components.get(row.component);
    assert(component?.state === 'PINNED' && SHA.test(component.commit ?? '') && SHA.test(component.tree ?? '') && DIGEST.test(component.licenseHash ?? '') && component.owner, `${row.component}: incomplete pinned provenance`);
    assert(SHA.test(row.sourceBlob ?? '') && SHA.test(row.testBlob ?? '') && row.sourcePath && row.testPath, `${row.component}: invalid source/test pin`);
    const parity = reuse.get(sourceKey(row));
    assert(parity?.fixturePolicy === 'NO_COPY' && ['REJECTED', 'BEHAVIORAL_SCENARIO'].includes(parity.classification), `${row.component}: copied or invalid reuse classification`);
    assert(parity.sourceBlob === row.sourceBlob && parity.testBlob === row.testBlob && parity.sourceLicenseHash === component.licenseHash, `${row.component}: reuse provenance mismatch`);
    assert(parity.canonicalSuite && exists(resolve(repoRoot, parity.canonicalSuite)), `${row.component}: canonical suite missing`);
    requiredDecisions.add(row.component);
  }
  for (const row of [...(sourceMap.noCandidateTargets ?? []), ...(sourceMap.operationalNoCandidateTargets ?? [])]) {
    assert(row.component && row.reason, 'conditional/no-candidate row incomplete');
    if (row.state) assert(row.state === 'CONDITIONAL_NOT_AUTHORIZED', `${row.component}: operational row must be conditional`);
    if (row.productAnchor) assert(exists(resolve(repoRoot, row.productAnchor)) && exists(resolve(repoRoot, row.testAnchor)), `${row.component}: operational anchors missing`);
    requiredDecisions.add(row.component);
  }
  for (const id of requiredDecisions) {
    const decision = decisionById.get(id);
    assert(decision && decision.decision !== 'REPLACE' && decision.hardVeto?.length && decision.reason, `${id}: decision missing or weak`);
    if (decision.decision === 'L1') {
      const isBlocked = /^BLOCKED_PENDING_OSS\d\d_SCOPE$/u.test(decision.status ?? '');
      const isExplicitlyScoped = decision.status === 'APPROVED_FOR_PRODUCT_CHANGE' && Array.isArray(decision.approvedPaths) && decision.approvedPaths.length > 0;
      assert(isBlocked || isExplicitlyScoped, `${id}: L1 must remain blocked or be explicitly path-scoped`);
    }
    if (['L2', 'L3', 'L4'].includes(decision.decision)) assert(decision.status === 'APPROVED_FOR_PRODUCT_CHANGE' && decision.obligations?.length, `${id}: advanced adoption obligations missing`);
  }
  for (const portfolio of ['OSS-09', 'OSS-10', 'OSS-11']) assert((sourceMap.operationalNoCandidateTargets ?? []).some((row) => row.portfolio === portfolio), `${portfolio}: operational coverage missing`);
  return { schemaVersion: 'amic-vault.source-map-report.v1', authorityTargetsVerified: PORTFOLIOS.length, sourceTestTargetsVerified: sourceMap.sourceTestTargets.length, conditionalTargetsVerified: (sourceMap.noCandidateTargets?.length ?? 0) + (sourceMap.operationalNoCandidateTargets?.length ?? 0), decisionsVerified: requiredDecisions.size, presidio, sourceLab: verifyLab(sourceMap, sourceRoot, repoRoot, componentId) };
}

function args(argv) { const value = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (token === '--static') value.static = true; else if (['--source-map', '--decisions', '--reuse', '--source-root', '--dlp-baseline', '--component'].includes(token)) value[token.slice(2)] = argv[++i]; else fail(`unknown argument ${token}`); } return value; }
const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) { try { const value = args(process.argv.slice(2)); console.log(JSON.stringify(validateSourceMap({ sourceMap: JSON.parse(readFileSync(value['source-map'] ?? 'security/oss-source-map.yml', 'utf8')), decisions: JSON.parse(readFileSync(value.decisions ?? 'security/oss-adoption-decisions.yml', 'utf8')), reuseManifest: JSON.parse(readFileSync(value.reuse ?? 'security/oss-test-reuse.yml', 'utf8')), dlpBaseline: JSON.parse(readFileSync(value['dlp-baseline'] ?? 'security/dlp-korean-pii-baseline.json', 'utf8')), productBlobHashes: collectProductTreeBlobHashes(), sourceRoot: value.static ? undefined : value['source-root'], componentId: value.component }))); } catch (error) { process.stderr.write(`SOURCE_MAP_INVALID: ${error.message}\n`); process.exitCode = 1; } }
