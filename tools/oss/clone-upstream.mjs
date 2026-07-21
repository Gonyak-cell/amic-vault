import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSourceLabBoundary } from './verify-upstream-lock.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[a-z0-9][a-z0-9-]*$/u;

function fail(message) {
  throw new Error(`upstream clone failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

export function validateCloneRequest({ id, officialUrl, ref, release, licensePath }) {
  assert(ID.test(id ?? ''), 'component id invalid');
  assert(typeof officialUrl === 'string' && /^https:\/\/(github\.com|gitlab\.com)\//u.test(officialUrl), `${id}: official GitHub or GitLab URL required`);
  assert(SHA.test(ref ?? ''), `${id}: ref must be a full lower-case commit SHA`);
  assert(typeof release === 'string' && release.trim(), `${id}: release/tag required`);
  assert(typeof licensePath === 'string' && licensePath && !licensePath.startsWith('/') && !licensePath.split('/').includes('..'), `${id}: license path invalid`);
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert(result.error === undefined && result.status === 0, `git ${args[0]} failed`);
  return result.stdout.trim();
}

export function cloneUpstream({ id, officialUrl, ref, release, licensePath, sourceRoot, repoRoot = process.cwd() }) {
  validateCloneRequest({ id, officialUrl, ref, release, licensePath });
  const boundary = validateSourceLabBoundary({ sourceRoot, repoRoot });
  const clonePath = resolve(boundary.labRoot, 'clones', id);
  const cloneParent = resolve(boundary.labRoot, 'clones');
  mkdirSync(cloneParent, { recursive: true });
  if (existsSync(clonePath)) {
    assert(!lstatSync(clonePath).isSymbolicLink() && existsSync(join(clonePath, '.git')), `${id}: existing clone path is not a Git repository`);
    assert(runGit(['remote', 'get-url', 'origin'], clonePath) === officialUrl, `${id}: existing clone remote does not match official URL`);
  } else {
    runGit(['clone', '--no-checkout', '--filter=blob:none', officialUrl, clonePath], boundary.labRoot);
  }
  runGit(['fetch', '--depth=1', 'origin', ref], clonePath);
  runGit(['checkout', '--detach', 'FETCH_HEAD'], clonePath);
  assert(!lstatSync(clonePath).isSymbolicLink(), `${id}: clone path is a symlink`);
  const head = runGit(['rev-parse', 'HEAD'], clonePath);
  const tree = runGit(['rev-parse', 'HEAD^{tree}'], clonePath);
  const dirty = runGit(['status', '--porcelain'], clonePath);
  assert(head === ref, `${id}: fetched HEAD does not match requested commit`);
  assert(SHA.test(tree), `${id}: resolved tree invalid`);
  assert(dirty === '', `${id}: detached baseline is dirty`);
  const requestedLicensePath = resolve(clonePath, licensePath);
  assert(requestedLicensePath.startsWith(`${clonePath}/`) && existsSync(requestedLicensePath) && statSync(requestedLicensePath).isFile(), `${id}: license file missing`);
  const resolvedLicensePath = realpathSync(requestedLicensePath);
  assert(resolvedLicensePath.startsWith(`${clonePath}/`), `${id}: license path escapes clone`);
  return {
    id,
    officialUrl,
    release,
    commit: head,
    tree,
    licensePath,
    licenseHash: sha256(readFileSync(resolvedLicensePath)),
    clonePath: `clones/${id}`,
    owner: 'engineering',
    state: 'PINNED',
  };
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--id') result.id = args[++index];
    else if (value === '--url') result.officialUrl = args[++index];
    else if (value === '--ref') result.ref = args[++index];
    else if (value === '--release') result.release = args[++index];
    else if (value === '--license') result.licensePath = args[++index];
    else if (value === '--source-root') result.sourceRoot = args[++index];
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(cloneUpstream({ ...args, sourceRoot: args.sourceRoot ?? process.env.OSS_RESEARCH_ROOT }), null, 2));
}
