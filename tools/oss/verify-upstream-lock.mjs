import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9-]*$/u;

function fail(message) {
  throw new Error(`upstream lock verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isWithin(parent, candidate) {
  const value = relative(parent, candidate);
  return value === '' || (!value.startsWith('..') && !value.includes('../'));
}

function relativeSafePath(value, label) {
  assert(typeof value === 'string' && value && !value.startsWith('/') && !value.split('/').includes('..'), `${label} must be a relative path without traversal`);
  return value;
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert(result.error === undefined && result.status === 0, `git ${args[0]} failed for ${cwd}`);
  return result.stdout.trim();
}

export function validateSourceLabBoundary({ sourceRoot, repoRoot = process.cwd() }) {
  assert(typeof sourceRoot === 'string' && sourceRoot, 'source root is required');
  assert(typeof repoRoot === 'string' && repoRoot, 'repository root is required');
  const requestedRoot = resolve(sourceRoot);
  assert(existsSync(requestedRoot), 'source root does not exist');
  assert(!lstatSync(requestedRoot).isSymbolicLink(), 'source root must not be a symlink');
  const labRoot = realpathSync(requestedRoot);
  const productRoot = realpathSync(resolve(repoRoot));
  assert(!isWithin(productRoot, labRoot) && !isWithin(labRoot, productRoot), 'source root must be disjoint from the product repository');
  return { labRoot, productRoot, sourceRootHash: hash(labRoot) };
}

export function validateLockRow(row, sourceRoot) {
  assert(row && typeof row === 'object', 'lock row missing');
  assert(ID.test(row.id ?? ''), 'lock row id invalid');
  assert(typeof row.officialUrl === 'string' && /^https:\/\/[a-z0-9.-]+\//iu.test(row.officialUrl), `${row.id}: official URL invalid`);
  for (const key of ['release', 'owner', 'state']) {
    assert(typeof row[key] === 'string' && row[key].trim(), `${row.id}: ${key} missing`);
  }
  assert(['PINNED', 'BLOCKED'].includes(row.state), `${row.id}: state invalid`);
  if (row.state === 'BLOCKED') {
    assert(typeof row.blockedReason === 'string' && row.blockedReason.trim(), `${row.id}: blocked reason missing`);
    return { id: row.id, state: row.state, clonePath: null };
  }
  for (const key of ['commit', 'tree', 'licensePath', 'licenseHash', 'clonePath']) {
    assert(typeof row[key] === 'string' && row[key].trim(), `${row.id}: ${key} missing`);
  }
  assert(SHA.test(row.commit), `${row.id}: commit must be 40 lower-case hex`);
  assert(SHA.test(row.tree), `${row.id}: tree must be 40 lower-case hex`);
  assert(DIGEST.test(row.licenseHash), `${row.id}: license hash invalid`);
  relativeSafePath(row.licensePath, `${row.id}: license path`);
  relativeSafePath(row.clonePath, `${row.id}: clone path`);
  const clonePath = resolve(sourceRoot, row.clonePath);
  assert(isWithin(sourceRoot, clonePath), `${row.id}: clone path escapes source root`);
  return { id: row.id, state: row.state, clonePath };
}

function verifyPinnedClone(row, sourceRoot) {
  const clonePath = resolve(sourceRoot, row.clonePath);
  assert(existsSync(clonePath) && !lstatSync(clonePath).isSymbolicLink(), `${row.id}: detached clone missing`);
  assert(runGit(['remote', 'get-url', 'origin'], clonePath) === row.officialUrl, `${row.id}: clone remote mismatch`);
  assert(runGit(['rev-parse', 'HEAD'], clonePath) === row.commit, `${row.id}: clone commit mismatch`);
  assert(runGit(['rev-parse', 'HEAD^{tree}'], clonePath) === row.tree, `${row.id}: clone tree mismatch`);
  assert(runGit(['status', '--porcelain'], clonePath) === '', `${row.id}: clone baseline dirty`);
  const licensePath = realpathSync(resolve(clonePath, row.licensePath));
  assert(licensePath.startsWith(`${clonePath}/`), `${row.id}: clone license escapes root`);
  assert(hash(readFileSync(licensePath)) === row.licenseHash, `${row.id}: clone license hash mismatch`);
}

export function validateUpstreamLock({ map, sourceRoot, repoRoot = process.cwd(), checkClones = true }) {
  assert(map?.schemaVersion === 'oss-source-map-v1', 'source map schema invalid');
  assert(map?.sourceLab?.rootEnvironment === 'OSS_RESEARCH_ROOT', 'source map root environment invalid');
  assert(Array.isArray(map.components), 'source map components missing');
  const boundary = validateSourceLabBoundary({ sourceRoot, repoRoot });
  const ids = new Set();
  const rows = map.components.map((row) => {
    const validated = validateLockRow(row, boundary.labRoot);
    assert(!ids.has(validated.id), `duplicate lock row: ${validated.id}`);
    ids.add(validated.id);
    if (checkClones && validated.state === 'PINNED') verifyPinnedClone(row, boundary.labRoot);
    return { id: validated.id, state: validated.state };
  });
  return {
    schema: 'amic-vault.upstream-lock-boundary-report.v1',
    sourceRootHash: boundary.sourceRootHash,
    componentCount: rows.length,
    pinnedCount: rows.filter((row) => row.state === 'PINNED').length,
    blockedCount: rows.filter((row) => row.state === 'BLOCKED').length,
    productBuildContextIncludesSourceLab: false,
  };
}

function parseArgs(args) {
  const result = { sourceMapPath: 'security/oss-source-map.yml' };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--source-root') result.sourceRoot = args[++index];
    else if (value === '--source-map') result.sourceMapPath = args[++index];
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = args.sourceRoot ?? process.env.OSS_RESEARCH_ROOT;
  const map = JSON.parse(readFileSync(resolve(args.sourceMapPath), 'utf8'));
  console.log(JSON.stringify(validateUpstreamLock({ map, sourceRoot }), null, 2));
}
