import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PRODUCT_PREFIXES = ['apps/', 'packages/', 'workers/', 'db/', 'infra/'];
const DEPENDENCY = /(^|\/)(package\.json|pnpm-lock\.yaml|pyproject\.toml|uv\.lock|requirements(?:-[^/]+)?\.txt)$/u;
const PACKAGE_DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies', 'pnpm', 'resolutions', 'packageManager'];

function product(file) {
  return PRODUCT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function approved(decisions, file) {
  return (decisions.l0IneligiblePaths ?? []).includes(file)
    || (decisions.decisions ?? []).some((row) => ['L1', 'L2', 'L3', 'L4'].includes(row.decision)
      && row.status === 'APPROVED_FOR_PRODUCT_CHANGE'
      && row.approvedPaths?.includes(file));
}

function approvedDependency(decisions, file) {
  return (decisions.decisions ?? []).some((row) => row.decision === 'L1'
    && row.status === 'APPROVED_FOR_PRODUCT_CHANGE'
    && row.approvedDependencyPaths?.includes(file));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function dependencySurface(text) {
  const manifest = JSON.parse(text);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('package manifest must be an object');
  return stable(Object.fromEntries(PACKAGE_DEPENDENCY_KEYS.filter((key) => Object.hasOwn(manifest, key)).map((key) => [key, manifest[key]])));
}

export function packageDependencyManifestChanged(before, after) {
  if (before === undefined || after === undefined) return true;
  try {
    return JSON.stringify(dependencySurface(before)) !== JSON.stringify(dependencySurface(after));
  } catch {
    return true;
  }
}

export function evaluateReuseFirst({ changedFiles, addedFiles = changedFiles, dependencyChangedFiles = changedFiles.filter((file) => DEPENDENCY.test(file)), decisions }) {
  const dependencyChanges = new Set(dependencyChangedFiles);
  const violations = [];
  for (const file of changedFiles) {
    if (/^(clones|reproductions|baselines)\//u.test(file)) violations.push({ file, code: 'SOURCE_LAB_BUILD_CONTEXT_FORBIDDEN' });
    if (dependencyChanges.has(file) && !approvedDependency(decisions, file)) violations.push({ file, code: 'NEW_DEPENDENCY_REQUIRES_SCOPED_DECISION' });
  }
  for (const file of addedFiles) {
    if (product(file) && !approved(decisions, file)) violations.push({ file, code: 'NEW_PRODUCT_FILE_REQUIRES_L0_L4_DECISION' });
  }
  return {
    schemaVersion: 'amic-vault.reuse-first-report.v1',
    status: violations.length ? 'FAIL' : 'PASS',
    changedFileCount: changedFiles.length,
    violations,
    reviewSignals: ['Text similarity is a human-review signal only and never authorizes copied OSS source.'],
  };
}

function refFile(base, file) {
  try {
    return execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });
  } catch {
    return undefined;
  }
}

function workingFile(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function dependencyChanged(base, file) {
  if (!DEPENDENCY.test(file)) return false;
  if (!file.endsWith('package.json')) return true;
  return packageDependencyManifestChanged(refFile(base, file), workingFile(file));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const [baseFlag, base, decisionsFlag, decisionsPath = 'security/oss-adoption-decisions.yml'] = process.argv.slice(2);
    if (baseFlag !== '--base' || !/^[a-f0-9]{40}$/u.test(base) || decisionsFlag !== '--decisions') throw new Error('usage: --base <full-sha> --decisions <path>');
    const changedFiles = execFileSync('git', ['diff', '--name-only', `${base}..HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const addedFiles = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', `${base}..HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const dependencyChangedFiles = changedFiles.filter((file) => dependencyChanged(base, file));
    const report = evaluateReuseFirst({ changedFiles, addedFiles, dependencyChangedFiles, decisions: JSON.parse(readFileSync(decisionsPath, 'utf8')) });
    console.log(JSON.stringify(report));
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`REUSE_FIRST_GATE_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
