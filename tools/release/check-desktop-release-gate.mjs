import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const fixtureDir = path.join(repoRoot, 'tests/fixtures/desktop-release-gate');

const failureFixtures = new Map([
  ['missing-digest.json', 'MISSING_DIGEST'],
  ['unsigned-customer-artifact.json', 'UNSIGNED_CUSTOMER_ARTIFACT'],
  ['wrong-channel-update.json', 'WRONG_CHANNEL_UPDATE'],
  ['missing-rollback-ref.json', 'MISSING_ROLLBACK_REF'],
  ['private-endpoint-token-evidence.json', 'PRIVATE_ENDPOINT_OR_TOKEN'],
]);

const forbiddenEvidencePatterns = [
  {
    code: 'PRIVATE_ENDPOINT_OR_TOKEN',
    pattern:
      /https?:\/\/(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})(?::\d+)?(?:[/?#][^\s)"'|]*)?/i,
  },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /https?:\/\/private\.example\.invalid(?::\d+)?(?:[/?#][^\s)"'|]*)?/i },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /https?:\/\/[^/\s)"'|]+\.local(?::\d+)?(?:[/?#][^\s)"'|]*)?/i },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /AKIA[0-9A-Z]{16}/ },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /ghp_[0-9A-Za-z]{20,}/ },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /sk-[A-Za-z0-9]{20,}/ },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{10,}/i },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /\b(?:token|cookie|password|secret)=\S+/i },
  { code: 'PRIVATE_ENDPOINT_OR_TOKEN', pattern: /\bsynthetic-token-marker\b/i },
];

class GateError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function readText(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new GateError('MISSING_REQUIRED_FILE', `Missing required file: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8');
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function assertContains(content, needle, file) {
  if (!content.includes(needle)) {
    throw new GateError('MISSING_REQUIRED_MARKER', `${file} must contain ${needle}`);
  }
}

function assertNoForbiddenEvidence(content, file) {
  for (const { code, pattern } of forbiddenEvidencePatterns) {
    if (pattern.test(content)) {
      throw new GateError(code, `${file} contains a private endpoint, token, or secret-shaped value`);
    }
  }
}

function assertDigest(value, fieldName) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(value)) {
    throw new GateError('MISSING_DIGEST', `${fieldName} must be a sha256 digest`);
  }
}

function assertSignedCustomerArtifact(artifact) {
  if (artifact?.customerArtifact === false) return;
  if (artifact?.signed !== true || typeof artifact?.signatureRef !== 'string' || artifact.signatureRef.length === 0) {
    throw new GateError(
      'UNSIGNED_CUSTOMER_ARTIFACT',
      'Customer desktop artifacts must be signed and have a non-secret signature reference',
    );
  }
}

function assertUpdatePolicy(update, artifactChannel) {
  if (update?.enabled !== true) return;
  assertDigest(update.digest, 'update.digest');
  if (update.manifestSigned !== true || update.artifactSigned !== true) {
    throw new GateError('UNSIGNED_CUSTOMER_ARTIFACT', 'Enabled desktop updates must use signed manifests and artifacts');
  }
  if (update.channel !== artifactChannel || update.artifactChannel !== artifactChannel) {
    throw new GateError('WRONG_CHANNEL_UPDATE', 'Desktop update channel must match the approved artifact channel');
  }
}

function assertRollback(rollback) {
  if (typeof rollback?.ref !== 'string' || !rollback.ref.startsWith('RB-DESKTOP-NATIVE-')) {
    throw new GateError('MISSING_ROLLBACK_REF', 'Desktop release gate requires an RB-DESKTOP-NATIVE rollback ref');
  }
  if (rollback.browserPwaFallback !== true) {
    throw new GateError('MISSING_ROLLBACK_REF', 'Desktop release gate requires browser/PWA fallback confirmation');
  }
}

function validateFixture(fixture, fileLabel) {
  const artifact = fixture.artifact ?? {};
  const release = fixture.release ?? {};
  const update = fixture.update ?? {};
  const rollback = fixture.rollback ?? {};

  assertDigest(artifact.digest, 'artifact.digest');
  assertSignedCustomerArtifact(artifact);
  assertUpdatePolicy(update, artifact.channel);
  assertRollback(rollback);

  if (release.serverProductionDeploy === true) {
    throw new GateError(
      'SERVER_PRODUCTION_DEPLOY_COUPLED',
      'Desktop artifact release must remain separate from server production deploy',
    );
  }

  assertNoForbiddenEvidence(JSON.stringify(fixture), fileLabel);
}

function validateLiveDocs() {
  const requiredFiles = [
    '.github/workflows/desktop.yml',
    'docs/release/evidence-register.md',
    'docs/release/rollback-runbook.md',
    'package.json',
    'tools/release/check-desktop-release-gate.mjs',
  ];
  for (const file of requiredFiles) {
    readText(file);
  }

  const evidenceRegister = readText('docs/release/evidence-register.md');
  const rollbackRunbook = readText('docs/release/rollback-runbook.md');
  const workflow = readText('.github/workflows/desktop.yml');
  const packageJson = readText('package.json');

  for (const expected of [
    'EV-DESKTOP-005',
    'EV-DESKTOP-006',
    'EV-DESKTOP-007',
    'EV-DESKTOP-008',
    'EV-DESKTOP-009',
    'DESKTOP-ARTIFACT-DIGEST-REF',
    'DESKTOP-ARTIFACT-SIGNATURE-REF',
    'DESKTOP-ROLLBACK-BROWSER-FALLBACK-REF',
    'DESKTOP-SERVER-PROD-SEPARATION-REF',
  ]) {
    assertContains(evidenceRegister, expected, 'docs/release/evidence-register.md');
  }

  for (const expected of [
    'RB-DESKTOP-NATIVE-001',
    'browser/PWA fallback',
    'No desktop native rollback may deploy server production',
    'DESKTOP-ROLLBACK-BROWSER-FALLBACK-REF',
  ]) {
    assertContains(rollbackRunbook, expected, 'docs/release/rollback-runbook.md');
  }

  for (const expected of [
    'pnpm --filter @amic-vault/desktop validate',
    'pnpm --filter @amic-vault/desktop test',
    'node tools/release/check-desktop-capabilities.mjs',
    'node tools/release/check-desktop-local-storage.mjs',
    'pnpm desktop:release-gate',
    'pnpm desktop:release-gate -- --self-test',
  ]) {
    assertContains(workflow, expected, '.github/workflows/desktop.yml');
  }

  assertContains(packageJson, '"desktop:release-gate"', 'package.json');
  assertNoForbiddenEvidence(evidenceRegister, 'docs/release/evidence-register.md');
  assertNoForbiddenEvidence(rollbackRunbook, 'docs/release/rollback-runbook.md');
}

function validateFixtureFile(filePath, expectedFailureCode) {
  try {
    validateFixture(readJsonFile(filePath), path.relative(repoRoot, filePath));
    if (expectedFailureCode) {
      throw new GateError(
        'EXPECTED_FAILURE_NOT_RAISED',
        `${path.basename(filePath)} was expected to fail with ${expectedFailureCode}`,
      );
    }
  } catch (error) {
    if (!expectedFailureCode) throw error;
    if (error.code !== expectedFailureCode) {
      throw new GateError(
        'UNEXPECTED_FAILURE_CODE',
        `${path.basename(filePath)} failed with ${error.code ?? error.message}, expected ${expectedFailureCode}`,
      );
    }
    console.log(`${path.basename(filePath)} rejected with ${expectedFailureCode}`);
    return;
  }
  console.log(`${path.basename(filePath)} accepted`);
}

function runSelfTest() {
  if (!existsSync(fixtureDir)) {
    throw new GateError('MISSING_REQUIRED_FILE', 'Missing tests/fixtures/desktop-release-gate');
  }
  validateFixtureFile(path.join(fixtureDir, 'pass.json'));
  const fixtureFiles = readdirSync(fixtureDir).filter((fileName) => fileName.endsWith('.json'));
  for (const [fileName, expectedCode] of failureFixtures) {
    if (!fixtureFiles.includes(fileName)) {
      throw new GateError('MISSING_REQUIRED_FILE', `Missing fixture ${fileName}`);
    }
    validateFixtureFile(path.join(fixtureDir, fileName), expectedCode);
  }
  console.log('Desktop release gate synthetic fixtures verified.');
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
  } else if (argValue('--fixture')) {
    validateFixtureFile(path.resolve(repoRoot, argValue('--fixture')), argValue('--expect-fail'));
  } else {
    validateLiveDocs();
    console.log('Desktop release gate documents verified.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
