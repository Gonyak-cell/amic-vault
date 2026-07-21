import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyResult, redactLog } from './run-upstream-baseline.mjs';
import { validateSourceLabBoundary, validateUpstreamLock } from './verify-upstream-lock.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const OUTCOMES = new Set(['PASS', 'TEST_FAILURE', 'ENVIRONMENT_BLOCKED']);

function fail(message) {
  throw new Error(`upstream baseline verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function safePath(value, label) {
  assert(typeof value === 'string' && value && !value.startsWith('/') && !value.split('/').includes('..'), `${label} must be a relative path without traversal`);
  return value;
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert(result.error === undefined && result.status === 0, `git ${args[0]} failed`);
  return result.stdout.trim();
}

export function validateBaselineRecord(component) {
  const baseline = component?.baseline;
  assert(baseline && typeof baseline === 'object' && !Array.isArray(baseline), `${component?.id ?? 'unknown'}: baseline record missing`);
  assert(Array.isArray(baseline.command) && baseline.command.length > 0 && baseline.command.every((value) => typeof value === 'string' && value), `${component.id}: baseline command invalid`);
  assert(Number.isInteger(baseline.timeoutMs) && baseline.timeoutMs > 0 && baseline.timeoutMs <= 1_800_000, `${component.id}: baseline timeout invalid`);
  assert(OUTCOMES.has(baseline.outcome), `${component.id}: baseline outcome invalid`);
  assert(baseline.exitCode === null || Number.isInteger(baseline.exitCode), `${component.id}: baseline exit code invalid`);
  assert(typeof baseline.timedOut === 'boolean', `${component.id}: baseline timedOut invalid`);
  for (const key of ['stdoutSha256', 'stderrSha256']) assert(DIGEST.test(baseline.logs?.[key] ?? ''), `${component.id}: baseline ${key} invalid`);
  for (const key of ['stdoutBytes', 'stderrBytes']) assert(Number.isInteger(baseline.logs?.[key]) && baseline.logs[key] >= 0, `${component.id}: baseline ${key} invalid`);
  return baseline;
}

export function validateStaticSourceMap(map) {
  assert(map?.schemaVersion === 'oss-source-map-v1', 'source map schema invalid');
  assert(map?.sourceLab?.rootEnvironment === 'OSS_RESEARCH_ROOT', 'source map root environment invalid');
  assert(Array.isArray(map.components) && map.components.length > 0, 'source map components missing');
  const ids = new Set();
  let pinnedCount = 0;
  let blockedCount = 0;
  for (const component of map.components) {
    assert(typeof component?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/u.test(component.id), 'component id invalid');
    assert(!ids.has(component.id), `duplicate component: ${component.id}`);
    ids.add(component.id);
    assert(typeof component.officialUrl === 'string' && /^https:\/\/[a-z0-9.-]+\//iu.test(component.officialUrl), `${component.id}: official URL invalid`);
    assert(typeof component.release === 'string' && component.release, `${component.id}: release missing`);
    assert(typeof component.owner === 'string' && component.owner, `${component.id}: owner missing`);
    if (component.state === 'BLOCKED') {
      assert(typeof component.blockedReason === 'string' && component.blockedReason, `${component.id}: blocked reason missing`);
      blockedCount += 1;
      continue;
    }
    assert(component.state === 'PINNED', `${component.id}: state invalid`);
    for (const key of ['commit', 'tree']) assert(SHA.test(component[key] ?? ''), `${component.id}: ${key} invalid`);
    assert(DIGEST.test(component.licenseHash ?? ''), `${component.id}: license hash invalid`);
    safePath(component.licensePath, `${component.id}: license path`);
    safePath(component.clonePath, `${component.id}: clone path`);
    validateBaselineRecord(component);
    pinnedCount += 1;
  }
  return { schema: 'amic-vault.upstream-baseline-static.v1', componentCount: map.components.length, pinnedCount, blockedCount };
}

function verifyReproductionClone(component, clonePath) {
  assert(existsSync(clonePath) && !lstatSync(clonePath).isSymbolicLink(), `${component.id}: reproduction clone missing`);
  assert(runGit(['remote', 'get-url', 'origin'], clonePath) === component.officialUrl, `${component.id}: reproduction remote mismatch`);
  assert(runGit(['rev-parse', 'HEAD'], clonePath) === component.commit, `${component.id}: reproduction commit mismatch`);
  assert(runGit(['rev-parse', 'HEAD^{tree}'], clonePath) === component.tree, `${component.id}: reproduction tree mismatch`);
  assert(runGit(['status', '--porcelain'], clonePath) === '', `${component.id}: reproduction clone dirty`);
  const licensePath = realpathSync(resolve(clonePath, component.licensePath));
  assert(licensePath.startsWith(`${clonePath}/`) && statSync(licensePath).isFile(), `${component.id}: reproduction license invalid`);
  assert(digest(readFileSync(licensePath)) === component.licenseHash, `${component.id}: reproduction license hash mismatch`);
}

export function createReproductionReport({ component, reproduction }) {
  const baseline = validateBaselineRecord(component);
  const fields = ['outcome', 'exitCode', 'timedOut'];
  const logs = ['stdoutSha256', 'stderrSha256', 'stdoutBytes', 'stderrBytes'];
  const reproduced = fields.every((key) => reproduction[key] === baseline[key])
    && logs.every((key) => reproduction.logs?.[key] === baseline.logs[key]);
  return {
    schema: 'amic-vault.upstream-baseline-reproduction.v1',
    component: component.id,
    source: { commit: component.commit, tree: component.tree, licenseHash: component.licenseHash },
    baseline: { command: baseline.command, timeoutMs: baseline.timeoutMs, outcome: baseline.outcome, exitCode: baseline.exitCode, timedOut: baseline.timedOut, logs: baseline.logs },
    reproduction,
    result: reproduced ? 'REPRODUCED' : 'DRIFT_DETECTED',
  };
}

export function reproduceBaseline({ map, componentId, sourceRoot, outDir, repoRoot = process.cwd(), run = spawnSync }) {
  validateStaticSourceMap(map);
  validateUpstreamLock({ map, sourceRoot, repoRoot });
  const component = map.components.find((row) => row.id === componentId);
  assert(component?.state === 'PINNED', `${componentId}: pinned component required`);
  const baseline = validateBaselineRecord(component);
  const boundary = validateSourceLabBoundary({ sourceRoot, repoRoot });
  const parent = resolve(boundary.labRoot, 'reproductions');
  const clonePath = resolve(parent, component.id);
  assert(relative(boundary.labRoot, clonePath).startsWith('reproductions/'), `${component.id}: reproduction path escapes source lab`);
  assert(!existsSync(clonePath), `${component.id}: reproduction clone already exists; use a fresh source lab for a new replay`);
  mkdirSync(parent, { recursive: true });
  runGit(['clone', '--no-checkout', '--filter=blob:none', component.officialUrl, clonePath], boundary.labRoot);
  runGit(['fetch', '--depth=1', 'origin', component.commit], clonePath);
  runGit(['checkout', '--detach', 'FETCH_HEAD'], clonePath);
  verifyReproductionClone(component, clonePath);
  const result = run(baseline.command[0], baseline.command.slice(1), { cwd: clonePath, encoding: 'utf8', timeout: baseline.timeoutMs, env: { PATH: process.env.PATH ?? '' } });
  const stdout = redactLog(result.stdout);
  const stderr = redactLog(result.stderr);
  const reproduction = { outcome: classifyResult(result), exitCode: Number.isInteger(result.status) ? result.status : null, timedOut: result.error?.code === 'ETIMEDOUT', logs: { stdoutSha256: digest(stdout), stderrSha256: digest(stderr), stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr) } };
  const report = createReproductionReport({ component, reproduction });
  assert(report.result === 'REPRODUCED', `${component.id}: baseline result drifted`);
  verifyReproductionClone(component, clonePath);
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(resolve(outDir, 'reproduction.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseArgs(args) {
  const result = { sourceMapPath: 'security/oss-source-map.yml' };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--source-map') result.sourceMapPath = args[++index];
    else if (value === '--source-root') result.sourceRoot = args[++index];
    else if (value === '--component') result.componentId = args[++index];
    else if (value === '--out') result.outDir = args[++index];
    else if (value === '--static') result.static = true;
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const map = JSON.parse(readFileSync(resolve(args.sourceMapPath), 'utf8'));
  const result = args.static
    ? validateStaticSourceMap(map)
    : reproduceBaseline({ map, componentId: args.componentId, sourceRoot: args.sourceRoot ?? process.env.OSS_RESEARCH_ROOT, outDir: args.outDir });
  console.log(JSON.stringify(result, null, 2));
}
