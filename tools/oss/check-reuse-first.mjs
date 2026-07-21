import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PRODUCT_PREFIXES = ['apps/', 'packages/', 'workers/', 'db/', 'infra/'];
const DEPENDENCY_FILES = /(^|\/)(package\.json|pnpm-lock\.yaml|pyproject\.toml|uv\.lock|requirements(?:-[^/]+)?\.txt)$/;
const SOURCE_LAB_PATH = /^(clones|reproductions|baselines)\//;

function isProductFile(file) {
  return PRODUCT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isDependencyFile(file) {
  return DEPENDENCY_FILES.test(file);
}

function approvedForFile(decisions, file) {
  if (Array.isArray(decisions.l0IneligiblePaths) && decisions.l0IneligiblePaths.includes(file)) return true;
  return (decisions.decisions ?? []).some((decision) => (
    ['L1', 'L2', 'L3', 'L4'].includes(decision.decision)
      && decision.status === 'APPROVED_FOR_PRODUCT_CHANGE'
      && Array.isArray(decision.approvedPaths)
      && decision.approvedPaths.includes(file)
  ));
}

/** Text similarity is intentionally only a review signal: authority and pin
 * metadata, not an opaque similarity score, decide whether a file is allowed. */
export function evaluateReuseFirst({ changedFiles, addedFiles = changedFiles, decisions }) {
  const violations = [];
  for (const file of changedFiles) {
    if (SOURCE_LAB_PATH.test(file)) violations.push({ file, code: 'SOURCE_LAB_BUILD_CONTEXT_FORBIDDEN' });
    if (isDependencyFile(file)) violations.push({ file, code: 'NEW_DEPENDENCY_REQUIRES_SCOPED_DECISION' });
  }
  for (const file of addedFiles) {
    if (isProductFile(file) && !approvedForFile(decisions, file)) {
      violations.push({ file, code: 'NEW_PRODUCT_FILE_REQUIRES_L0_L4_DECISION' });
    }
  }
  return {
    schemaVersion: 'amic-vault.reuse-first-gate.v1',
    changedFileCount: changedFiles.length,
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violations,
    reviewSignals: ['Text similarity is a human-review signal only; it does not authorize copied OSS source or fixtures.'],
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--base' || value === '--decisions') values[value.slice(2)] = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!/^[0-9a-f]{40}$/.test(values.base ?? '')) throw new Error('--base must be an immutable full commit SHA');
  return values;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const changedFiles = execFileSync('git', ['diff', '--name-only', `${args.base}..HEAD`], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
    const addedFiles = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', `${args.base}..HEAD`], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
    const decisions = JSON.parse(readFileSync(args.decisions ?? 'security/oss-adoption-decisions.yml', 'utf8'));
    const report = evaluateReuseFirst({ changedFiles, addedFiles, decisions });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`REUSE_FIRST_GATE_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
