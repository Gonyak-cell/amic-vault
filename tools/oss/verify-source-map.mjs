import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const LICENSE_HASH = /^sha256:[0-9a-f]{64}$/;
const REQUIRED_PORTFOLIOS = Array.from({ length: 11 }, (_, index) => `OSS-${String(index + 1).padStart(2, '0')}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function asById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function validatePinnedComponent(component, id) {
  assert(component?.state === 'PINNED', `${id}: source-test target must reference a PINNED component`);
  assert(SHA.test(component.commit ?? ''), `${id}: component commit must be a full SHA`);
  assert(SHA.test(component.tree ?? ''), `${id}: component tree must be a full SHA`);
  assert(LICENSE_HASH.test(component.licenseHash ?? ''), `${id}: component license hash must be SHA-256`);
  assert(typeof component.owner === 'string' && component.owner.length > 0, `${id}: component owner is required`);
  assert(typeof component.clonePath === 'string' && component.clonePath.length > 0, `${id}: component clone path is required`);
  assert(typeof component.release === 'string' && component.release.length > 0, `${id}: source refresh reference is required`);
  assert(Array.isArray(component.baseline?.command) && component.baseline.command.length > 0, `${id}: source refresh baseline command is required`);
  assert(typeof component.baseline?.outcome === 'string' && component.baseline.outcome.length > 0, `${id}: source refresh baseline outcome is required`);
}

function gitBuffer(clone, args) {
  return execFileSync('git', ['-C', clone, ...args], { encoding: 'buffer' });
}

function validateSourceLab({ sourceMap, sourceTargets, sourceRoot, repoRoot }) {
  if (!sourceRoot) return { status: 'NOT_RUN_STATIC_CI' };
  const repositoryRoot = resolve(repoRoot);
  const labRoot = resolve(sourceRoot);
  assert(labRoot !== repositoryRoot && !labRoot.startsWith(`${repositoryRoot}/`), 'source lab must be outside the product worktree');

  const dirty = [];
  for (const component of sourceMap.components.filter((item) => item.state === 'PINNED')) {
    const clone = resolve(labRoot, component.clonePath);
    assert(existsSync(clone), `${component.id}: pinned clone is missing from source lab`);
    const status = execFileSync('git', ['-C', clone, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    if (status) dirty.push(component.id);
    const head = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert(head === component.commit, `${component.id}: source-lab HEAD does not match locked commit`);
    const tree = execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}^{tree}`], { encoding: 'utf8' }).trim();
    assert(tree === component.tree, `${component.id}: source-lab tree does not match locked tree`);
    const license = createHash('sha256').update(gitBuffer(clone, ['show', `${component.commit}:${component.licensePath}`])).digest('hex');
    assert(`sha256:${license}` === component.licenseHash, `${component.id}: source-lab license hash does not match lock`);
  }
  assert(dirty.length === 0, `source lab contains dirty clone(s): ${dirty.join(', ')}`);
  for (const target of sourceTargets) {
    const component = sourceMap.components.find((item) => item.id === target.component);
    const clone = resolve(labRoot, component.clonePath);
    const sourceBlob = execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}:${target.sourcePath}`], { encoding: 'utf8' }).trim();
    const testBlob = execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}:${target.testPath}`], { encoding: 'utf8' }).trim();
    assert(sourceBlob === target.sourceBlob, `${target.component}: source blob does not match the pinned source tree`);
    assert(testBlob === target.testBlob, `${target.component}: test blob does not match the pinned source tree`);
  }
  return { status: 'VERIFIED', pinnedCloneCount: sourceMap.components.filter((item) => item.state === 'PINNED').length };
}

/**
 * Validates the bounded OSS adoption authority map. Static CI deliberately
 * checks only committed metadata and product paths; source-lab clones are
 * validated only when an explicit external --source-root is supplied.
 */
export function validateSourceMap({
  sourceMap,
  decisions,
  reuseManifest,
  repoRoot = process.cwd(),
  sourceRoot,
  requiredPortfolios = REQUIRED_PORTFOLIOS,
  requireOperationalCoverage = true,
} = {}) {
  assert(sourceMap?.schemaVersion === 'oss-source-map-v1', 'source map schemaVersion must be oss-source-map-v1');
  assert(decisions?.schemaVersion === 'amic-vault.oss-adoption-decisions.v1', 'adoption decision schema version is invalid');
  assert(reuseManifest?.schemaVersion === 'amic-vault.oss-test-reuse.v1', 'test reuse manifest schema version is invalid');
  assert(sourceMap.sourceLab?.productTreeInclusion === 'FORBIDDEN', 'source lab product-tree inclusion must be FORBIDDEN');
  assert(Array.isArray(sourceMap.productAuthorityTargets), 'product authority targets are required');
  assert(Array.isArray(sourceMap.sourceTestTargets), 'source test targets are required');
  assert(Array.isArray(sourceMap.operationalCandidates), 'operational candidates are required');
  assert(Array.isArray(sourceMap.components), 'component inventory is required');

  const authorityByPortfolio = new Map(sourceMap.productAuthorityTargets.map((item) => [item.portfolio, item]));
  for (const portfolio of requiredPortfolios) {
    const target = authorityByPortfolio.get(portfolio);
    assert(target, `${portfolio}: product authority target is missing`);
    assert(typeof target.owner === 'string' && target.owner.length > 0, `${portfolio}: owner is required`);
    assert(Array.isArray(target.productPaths) && target.productPaths.length > 0, `${portfolio}: product paths are required`);
    assert(Array.isArray(target.testPaths) && target.testPaths.length > 0, `${portfolio}: test paths are required`);
    for (const relativePath of [...target.productPaths, ...target.testPaths]) {
      assert(existsSync(resolve(repoRoot, relativePath)), `${portfolio}: mapped authority path does not exist: ${relativePath}`);
    }
  }

  const components = asById(sourceMap.components);
  const reuseByComponent = new Map((reuseManifest.entries ?? []).map((item) => [item.component, item]));
  const mappedDecisionIds = new Set();
  for (const target of sourceMap.sourceTestTargets) {
    assert(SHA.test(target.sourceBlob ?? ''), `${target.component}: source blob must be a full SHA`);
    assert(SHA.test(target.testBlob ?? ''), `${target.component}: test blob must be a full SHA`);
    assert(typeof target.sourcePath === 'string' && target.sourcePath.length > 0, `${target.component}: source path is required`);
    assert(typeof target.testPath === 'string' && target.testPath.length > 0, `${target.component}: test path is required`);
    validatePinnedComponent(components.get(target.component), target.component);
    const reuse = reuseByComponent.get(target.component);
    assert(reuse, `${target.component}: source-test target has no reuse-manifest entry`);
    assert(reuse.fixturePolicy === 'NO_COPY', `${target.component}: copied upstream fixture is not authorized`);
    assert(['REJECTED', 'BEHAVIORAL_SCENARIO'].includes(reuse.classification), `${target.component}: reuse classification must remain non-copying`);
    assert(reuse.sourceBlob === target.sourceBlob && reuse.testBlob === target.testBlob, `${target.component}: reuse manifest blobs must match the source-map lock`);
    assert(reuse.sourceLicenseHash === components.get(target.component).licenseHash, `${target.component}: reuse manifest license hash must match the locked component`);
    assert(typeof reuse.canonicalSuite === 'string' && existsSync(resolve(repoRoot, reuse.canonicalSuite)), `${target.component}: canonical Vault test suite is required`);
    mappedDecisionIds.add(target.component);
  }

  for (const candidate of sourceMap.operationalCandidates) {
    const component = components.get(candidate.component);
    assert(component?.state === 'BLOCKED', `${candidate.component}: operational candidate must remain blocked until a separate authority decision`);
    assert(candidate.state === 'conditional-not-authorized', `${candidate.component}: operational candidate must be conditional-not-authorized`);
    assert(typeof candidate.trigger === 'string' && candidate.trigger.length > 0, `${candidate.component}: operational trigger is required`);
    assert(Array.isArray(candidate.productPaths) && candidate.productPaths.length > 0, `${candidate.component}: operational product paths are required`);
    assert(Array.isArray(candidate.testPaths) && candidate.testPaths.length > 0, `${candidate.component}: operational test paths are required`);
    mappedDecisionIds.add(candidate.component);
  }
  const conditionalByComponent = new Map((reuseManifest.conditionalEntries ?? []).map((item) => [item.component, item]));
  for (const candidate of sourceMap.operationalCandidates) {
    assert(conditionalByComponent.get(candidate.component)?.state === 'REJECTED', `${candidate.component}: conditional reusable test input must remain rejected`);
  }

  const decisionsById = asById(decisions.decisions ?? []);
  for (const id of mappedDecisionIds) {
    const decision = decisionsById.get(id);
    assert(decision, `${id}: source map has no adoption decision`);
    assert(['L0', 'L1', 'L2', 'L3', 'L4', 'REJECTED'].includes(decision.decision), `${id}: invalid reuse decision`);
    assert(decision.decision !== 'REPLACE', `${id}: wholesale replacement is forbidden`);
    if (decision.decision === 'L1') {
      assert(/^BLOCKED_PENDING_OSS\d\d_SCOPE$/.test(decision.status ?? ''), `${id}: L1 must remain blocked pending a separately scoped OSS pack`);
    }
    if (['L2', 'L3', 'L4'].includes(decision.decision)) {
      assert(Array.isArray(decision.obligations) && decision.obligations.length > 0, `${id}: ${decision.decision} requires explicit source/license/update/rollback obligations`);
      assert(decision.status === 'APPROVED_FOR_PRODUCT_CHANGE', `${id}: ${decision.decision} must be explicitly approved for product change`);
    }
  }
  if (requireOperationalCoverage) {
    for (const portfolio of ['OSS-09', 'OSS-10', 'OSS-11']) {
      assert(sourceMap.operationalCandidates.some((item) => item.portfolio === portfolio), `${portfolio}: operational candidate coverage is missing`);
    }
  }

  const sourceLab = validateSourceLab({ sourceMap, sourceTargets: sourceMap.sourceTestTargets, sourceRoot, repoRoot });
  return {
    schemaVersion: 'amic-vault.oss-source-map-verification.v1',
    authorityTargetsVerified: requiredPortfolios.length,
    sourceTestTargetsVerified: sourceMap.sourceTestTargets.length,
    operationalCandidatesVerified: sourceMap.operationalCandidates.length,
    decisionsVerified: mappedDecisionIds.size,
    sourceLab,
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--static') values.static = true;
    else if (value === '--source-map' || value === '--decisions' || value === '--reuse' || value === '--source-root') values[value.slice(2)] = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  return values;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = validateSourceMap({
      sourceMap: readJson(args['source-map'] ?? 'security/oss-source-map.yml'),
      decisions: readJson(args.decisions ?? 'security/oss-adoption-decisions.yml'),
      reuseManifest: readJson(args.reuse ?? 'security/oss-test-reuse.yml'),
      sourceRoot: args.static ? undefined : args['source-root'],
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`SOURCE_MAP_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
