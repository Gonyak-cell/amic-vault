import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const evidenceRef = 'SYNTH-UAT-TECH-2026-06-14-001';
const uatIds = Array.from({ length: 20 }, (_, index) => `UAT-${String(index + 1).padStart(3, '0')}`);

const requiredFiles = [
  'docs/release/synthetic-uat-evidence.md',
  'docs/release/uat-checklist.md',
  'docs/release/uat-evidence-template.md',
  'docs/release/evidence-register.md',
  'docs/release/remaining-launch-tuw.md',
  'docs/release/launch-blocker-ledger.md',
  'docs/release/launch-control-sheet.md',
  'docs/release/launch-execution-plan.md',
  'docs/release/launch-readiness-pack.md',
  'package.json',
  '.github/workflows/ci.yml',
];

const forbiddenSecretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
  /cookie\s*[:=]\s*['"][^'"]+['"]/i,
  /token\s*[:=]\s*['"][^'"]+['"]/i,
];

const commandMarkers = [
  'pnpm release:smoke -- --dry-run',
  'pnpm test:integration',
  'pnpm search:eval:korean',
  'pnpm eval:contract-gate',
  'pnpm docs:frozen',
  'pnpm launch:readiness',
  'pnpm launch:execution',
];

const runCommands = [
  ['pnpm', ['release:smoke', '--', '--dry-run']],
  ['pnpm', ['test:integration']],
  ['pnpm', ['search:eval:korean']],
  ['pnpm', ['eval:contract-gate']],
  ['pnpm', ['docs:frozen']],
  ['pnpm', ['launch:readiness']],
  ['pnpm', ['launch:execution']],
];

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing synthetic UAT evidence file: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8');
}

function assertContains(content, needle, file) {
  if (!content.includes(needle)) {
    throw new Error(`${file} must contain ${needle}`);
  }
}

function assertNoForbiddenSecrets(content, file) {
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(content)) {
      throw new Error(`${file} appears to contain a forbidden secret pattern`);
    }
  }
}

function runCheck() {
  const contents = new Map();
  for (const file of requiredFiles) {
    const content = readRequired(file);
    contents.set(file, content);
    assertNoForbiddenSecrets(content, file);
  }

  const evidence = contents.get('docs/release/synthetic-uat-evidence.md');
  for (const uatId of uatIds) {
    const evId = `EV-UAT-${uatId.slice(4)}`;
    assertContains(evidence, uatId, 'docs/release/synthetic-uat-evidence.md');
    assertContains(evidence, evId, 'docs/release/synthetic-uat-evidence.md');
    assertContains(contents.get('docs/release/uat-checklist.md'), uatId, 'docs/release/uat-checklist.md');
    assertContains(contents.get('docs/release/uat-checklist.md'), evId, 'docs/release/uat-checklist.md');
    assertContains(contents.get('docs/release/uat-evidence-template.md'), uatId, 'docs/release/uat-evidence-template.md');
    assertContains(contents.get('docs/release/uat-evidence-template.md'), evId, 'docs/release/uat-evidence-template.md');
    assertContains(contents.get('docs/release/evidence-register.md'), evId, 'docs/release/evidence-register.md');
  }

  for (const marker of commandMarkers) {
    assertContains(evidence, marker, 'docs/release/synthetic-uat-evidence.md');
  }
  for (const expected of [
    evidenceRef,
    'technical-pass',
    'Product acceptance remains blocked by LRB-011',
    'No raw screenshots',
    'customer documents are committed',
  ]) {
    assertContains(evidence, expected, 'docs/release/synthetic-uat-evidence.md');
  }

  assertContains(contents.get('docs/release/launch-blocker-ledger.md'), evidenceRef, 'docs/release/launch-blocker-ledger.md');
  assertContains(contents.get('docs/release/launch-control-sheet.md'), 'pnpm release:uat', 'docs/release/launch-control-sheet.md');
  assertContains(contents.get('docs/release/remaining-launch-tuw.md'), 'REL-UAT-TECH-EVIDENCE-TUW-007C', 'docs/release/remaining-launch-tuw.md');
  assertContains(contents.get('docs/release/launch-execution-plan.md'), 'docs/release/synthetic-uat-evidence.md', 'docs/release/launch-execution-plan.md');
  assertContains(contents.get('docs/release/launch-readiness-pack.md'), 'docs/release/synthetic-uat-evidence.md', 'docs/release/launch-readiness-pack.md');
  assertContains(contents.get('package.json'), '"release:uat"', 'package.json');
  assertContains(contents.get('.github/workflows/ci.yml'), 'pnpm release:uat', '.github/workflows/ci.yml');

  const docsPackageDiff = execFileSync('git', ['diff', '--name-only', '--', 'docs/package'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  if (docsPackageDiff.length > 0) {
    throw new Error(`docs/package must remain frozen, but diff exists:\n${docsPackageDiff}`);
  }
}

function runEvidenceCommands() {
  for (const [command, args] of runCommands) {
    const printable = [command, ...args].join(' ');
    console.log(`\n> ${printable}`);
    const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`Synthetic UAT evidence command failed: ${printable}`);
    }
  }
}

const args = new Set(process.argv.slice(2));
if (args.has('--run')) {
  runEvidenceCommands();
}

runCheck();

if (args.has('--json')) {
  console.log(
    JSON.stringify(
      {
        evidenceRef,
        status: 'technical-pass',
        uatCount: uatIds.length,
        productAcceptance: 'blocked by LRB-011',
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Synthetic UAT evidence verified: ${evidenceRef}`);
}
