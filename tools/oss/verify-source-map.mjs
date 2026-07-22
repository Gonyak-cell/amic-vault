import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const PORTFOLIOS = Array.from({ length: 11 }, (_, index) => `OSS-${String(index + 1).padStart(2, '0')}`);

function fail(message) { throw new Error(`source map verification failed: ${message}`); }
function assert(condition, message) { if (!condition) fail(message); }
function byId(items) { return new Map(items.map((item) => [item.id, item])); }

function verifyLab(sourceMap, sourceRoot, repoRoot) {
  if (!sourceRoot) return { status: 'NOT_RUN_STATIC_CI' };
  const root = resolve(sourceRoot);
  const productRoot = resolve(repoRoot);
  assert(root !== productRoot && !root.startsWith(`${productRoot}/`), 'source root overlaps product worktree');
  for (const component of sourceMap.components.filter(({ state }) => state === 'PINNED')) {
    const clone = resolve(root, component.clonePath);
    assert(existsSync(clone), `${component.id}: pinned clone missing`);
    assert(execFileSync('git', ['-C', clone, 'status', '--porcelain'], { encoding: 'utf8' }).trim() === '', `${component.id}: clone dirty`);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === component.commit, `${component.id}: head mismatch`);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}^{tree}`], { encoding: 'utf8' }).trim() === component.tree, `${component.id}: tree mismatch`);
    const license = createHash('sha256').update(execFileSync('git', ['-C', clone, 'show', `${component.commit}:${component.licensePath}`], { encoding: 'buffer' })).digest('hex');
    assert(`sha256:${license}` === component.licenseHash, `${component.id}: license mismatch`);
  }
  for (const target of sourceMap.sourceTestTargets) {
    const component = sourceMap.components.find(({ id }) => id === target.component);
    const clone = resolve(root, component.clonePath);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}:${target.sourcePath}`], { encoding: 'utf8' }).trim() === target.sourceBlob, `${target.component}: source blob mismatch`);
    assert(execFileSync('git', ['-C', clone, 'rev-parse', `${component.commit}:${target.testPath}`], { encoding: 'utf8' }).trim() === target.testBlob, `${target.component}: test blob mismatch`);
  }
  return { status: 'VERIFIED', pinnedCloneCount: sourceMap.components.filter(({ state }) => state === 'PINNED').length };
}

export function validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot = process.cwd(), sourceRoot, exists = existsSync } = {}) {
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
  const reuse = byId((reuseManifest.entries ?? []).map((row) => ({ ...row, id: row.component })));
  const decisionById = byId(decisions.decisions ?? []);
  const requiredDecisions = new Set();
  for (const row of sourceMap.sourceTestTargets ?? []) {
    const component = components.get(row.component);
    assert(component?.state === 'PINNED' && SHA.test(component.commit ?? '') && SHA.test(component.tree ?? '') && DIGEST.test(component.licenseHash ?? '') && component.owner, `${row.component}: incomplete pinned provenance`);
    assert(SHA.test(row.sourceBlob ?? '') && SHA.test(row.testBlob ?? '') && row.sourcePath && row.testPath, `${row.component}: invalid source/test pin`);
    const parity = reuse.get(row.component);
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
    if (decision.decision === 'L1') assert(/^BLOCKED_PENDING_OSS\d\d_SCOPE$/u.test(decision.status ?? ''), `${id}: L1 must remain separately scoped`);
    if (['L2', 'L3', 'L4'].includes(decision.decision)) assert(decision.status === 'APPROVED_FOR_PRODUCT_CHANGE' && decision.obligations?.length, `${id}: advanced adoption obligations missing`);
  }
  for (const portfolio of ['OSS-09', 'OSS-10', 'OSS-11']) assert((sourceMap.operationalNoCandidateTargets ?? []).some((row) => row.portfolio === portfolio), `${portfolio}: operational coverage missing`);
  return { schemaVersion: 'amic-vault.source-map-report.v1', authorityTargetsVerified: PORTFOLIOS.length, sourceTestTargetsVerified: sourceMap.sourceTestTargets.length, conditionalTargetsVerified: (sourceMap.noCandidateTargets?.length ?? 0) + (sourceMap.operationalNoCandidateTargets?.length ?? 0), decisionsVerified: requiredDecisions.size, sourceLab: verifyLab(sourceMap, sourceRoot, repoRoot) };
}

function args(argv) { const value = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (token === '--static') value.static = true; else if (['--source-map', '--decisions', '--reuse', '--source-root'].includes(token)) value[token.slice(2)] = argv[++i]; else fail(`unknown argument ${token}`); } return value; }
const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) { try { const value = args(process.argv.slice(2)); console.log(JSON.stringify(validateSourceMap({ sourceMap: JSON.parse(readFileSync(value['source-map'] ?? 'security/oss-source-map.yml', 'utf8')), decisions: JSON.parse(readFileSync(value.decisions ?? 'security/oss-adoption-decisions.yml', 'utf8')), reuseManifest: JSON.parse(readFileSync(value.reuse ?? 'security/oss-test-reuse.yml', 'utf8')), sourceRoot: value.static ? undefined : value['source-root'] }))); } catch (error) { process.stderr.write(`SOURCE_MAP_INVALID: ${error.message}\n`); process.exitCode = 1; } }
