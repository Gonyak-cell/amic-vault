import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSourceLabBoundary, validateUpstreamLock } from './verify-upstream-lock.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const SECRET = /(authorization:\s*bearer\s+|(?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s"']+/giu;

function fail(message) {
  throw new Error(`upstream baseline failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function redactLog(value) {
  return String(value ?? '').replace(SECRET, '$1[REDACTED]');
}

export function classifyResult(result) {
  if (result.error?.code === 'ETIMEDOUT') return 'ENVIRONMENT_BLOCKED';
  if (result.error) return 'ENVIRONMENT_BLOCKED';
  if (result.status === 0) return 'PASS';
  return 'TEST_FAILURE';
}

export function runUpstreamBaseline({ map, component, sourceRoot, command, outDir, timeoutMs = 120_000, repoRoot = process.cwd(), run = spawnSync }) {
  assert(map && Array.isArray(map.components), 'source map is required');
  assert(component && typeof component === 'object', 'component is required');
  assert(component.state === 'PINNED', 'only a pinned component can run a baseline');
  assert(SHA.test(component.commit) && SHA.test(component.tree), `${component.id}: source pin invalid`);
  assert(Array.isArray(command) && command.length > 0 && command.every((value) => typeof value === 'string' && value), 'command must be a nonempty argument array');
  assert(typeof outDir === 'string' && outDir, 'output directory is required');
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 1_800_000, 'timeout must be between 1ms and 30min');
  assert(map.components.find((row) => row.id === component.id) === component, `${component.id}: component must be the exact source-map row`);
  validateUpstreamLock({ map, sourceRoot, repoRoot });
  const boundary = validateSourceLabBoundary({ sourceRoot, repoRoot });
  const clonePath = resolve(boundary.labRoot, component.clonePath);
  assert(clonePath.startsWith(`${boundary.labRoot}/`) && existsSync(clonePath), `${component.id}: clone is unavailable`);
  const result = run(command[0], command.slice(1), { cwd: clonePath, encoding: 'utf8', timeout: timeoutMs, env: { PATH: process.env.PATH ?? '' } });
  const stdout = redactLog(result.stdout);
  const stderr = redactLog(result.stderr);
  const manifest = {
    schema: 'amic-vault.upstream-baseline.v1',
    component: component.id,
    source: { commit: component.commit, tree: component.tree, licenseHash: component.licenseHash },
    command,
    timeoutMs,
    outcome: classifyResult(result),
    exitCode: Number.isInteger(result.status) ? result.status : null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    logs: { stdoutSha256: digest(stdout), stderrSha256: digest(stderr), stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr) },
  };
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function parseArgs(args) {
  const result = { command: [] };
  let commandMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (commandMode) result.command.push(value);
    else if (value === '--component') result.componentId = args[++index];
    else if (value === '--source-root') result.sourceRoot = args[++index];
    else if (value === '--source-map') result.sourceMapPath = args[++index];
    else if (value === '--out') result.outDir = args[++index];
    else if (value === '--timeout-ms') result.timeoutMs = Number(args[++index]);
    else if (value === '--') commandMode = true;
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const map = JSON.parse(readFileSync(resolve(args.sourceMapPath ?? 'security/oss-source-map.yml'), 'utf8'));
  const component = map.components.find((value) => value.id === args.componentId);
  const manifest = runUpstreamBaseline({ map, component, sourceRoot: args.sourceRoot ?? process.env.OSS_RESEARCH_ROOT, command: args.command, outDir: args.outDir, timeoutMs: args.timeoutMs });
  console.log(JSON.stringify({ component: manifest.component, outcome: manifest.outcome, exitCode: manifest.exitCode, logs: manifest.logs }, null, 2));
}
