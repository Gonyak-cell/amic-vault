import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const HIGH_CRITICAL = new Set(['HIGH', 'CRITICAL']);
const GITLEAKS_VERSION = '8.30.0';
const TRIVY_VERSION = '0.70.0';
const SEMGREP_VERSION = '1.164.0';
const SEMGREP_IMAGE = 'semgrep/semgrep@sha256:207983631beecdbe7fa29196c7f4a7a5f29033933cdb76c687ce4a672e07618d';
const GITLEAKS_IGNORE = /^[a-f0-9]{40}:[A-Za-z0-9_./()\-]+:generic-api-key:[1-9][0-9]*$/u;

function fail(message) {
  throw new Error(`security scan policy failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function safePath(value) {
  assert(typeof value === 'string' && value && !value.startsWith('/') && !value.includes('..'), 'scanner path must be repository-relative');
  return value;
}

export function parseImageSpec(value) {
  const separator = value.indexOf('=');
  assert(separator > 0, `image must use name=docker:sha256:<digest>: ${value}`);
  const name = value.slice(0, separator);
  const reference = value.slice(separator + 1);
  assert(/^[a-z][a-z0-9-]*$/u.test(name), `invalid image name: ${name}`);
  const digest = reference.slice('docker:'.length);
  assert(reference.startsWith('docker:sha256:') && /^sha256:[a-f0-9]{64}$/u.test(digest), `${name}: image must use an immutable local digest`);
  return { name, reference, digest };
}

export function validateScannerException(value, now = new Date()) {
  for (const key of ['id', 'tool', 'findingId', 'owner', 'issuedAt', 'expiresAt', 'evidenceHash']) {
    assert(typeof value?.[key] === 'string' && value[key].trim(), `scanner exception ${key} missing`);
  }
  assert(value.decision === 'VEX_APPROVED', 'scanner exception decision must be VEX_APPROVED');
  assert(DATE.test(value.issuedAt) && DATE.test(value.expiresAt), 'scanner exception dates invalid');
  assert(new Date(`${value.issuedAt}T00:00:00.000Z`) <= now, 'scanner exception issuedAt is in the future');
  assert(new Date(`${value.expiresAt}T00:00:00.000Z`) >= now, 'scanner exception expired');
}

export function validateGitleaksIgnoreContents(contents) {
  assert(typeof contents === 'string', 'Gitleaks ignore content must be text');
  const lines = contents.split('\n').map((line) => line.trim()).filter(Boolean);
  assert(lines.length > 0, 'Gitleaks ignore list must not be empty');
  for (const line of lines) {
    assert(GITLEAKS_IGNORE.test(line), 'Gitleaks ignore must be an exact historical generic-api-key fingerprint');
  }
  return lines;
}

export function normalizeGitleaks(raw, scanScope) {
  assert(Array.isArray(raw), 'Gitleaks JSON must be an array');
  assert(['history', 'working-tree'].includes(scanScope), 'Gitleaks scan scope invalid');
  return raw.map((finding) => ({
    tool: 'gitleaks',
    scanScope,
    findingId: String(finding.RuleID ?? ''),
    path: safePath(String(finding.File ?? '')),
    line: Number.isInteger(finding.StartLine) ? finding.StartLine : null,
    fingerprintHash: hash(String(finding.Fingerprint ?? '')),
    severity: 'HIGH',
    decision: 'BLOCKED',
    owner: 'security-oss',
  }));
}

export function normalizeSemgrep(raw) {
  assert(Array.isArray(raw?.results), 'Semgrep results missing');
  return raw.results.map((finding) => ({
    tool: 'semgrep',
    findingId: String(finding.check_id ?? ''),
    path: safePath(String(finding.path ?? '')),
    line: Number.isInteger(finding.start?.line) ? finding.start.line : null,
    severity: String(finding.extra?.severity ?? 'ERROR').toUpperCase(),
    decision: 'BLOCKED',
    owner: 'security-oss',
  }));
}

export function normalizeTrivy(raw, { imageDigest } = {}) {
  assert(Array.isArray(raw?.Results), 'Trivy results missing');
  const findings = [];
  for (const result of raw.Results) {
    const path = imageDigest ? `image:${imageDigest}` : safePath(String(result.Target ?? ''));
    for (const finding of [...(result.Vulnerabilities ?? []), ...(result.Misconfigurations ?? []), ...(result.Secrets ?? [])]) {
      const severity = String(finding.Severity ?? 'UNKNOWN').toUpperCase();
      findings.push({
        tool: 'trivy',
        findingId: String(finding.VulnerabilityID ?? finding.ID ?? finding.RuleID ?? ''),
        path,
        severity,
        decision: HIGH_CRITICAL.has(severity) ? 'BLOCKED' : 'NOT_REQUIRED',
        owner: HIGH_CRITICAL.has(severity) ? 'security-oss' : null,
      });
    }
  }
  return findings;
}

export function summarizeFindings(findings) {
  const productionHighCritical = findings.filter((finding) => HIGH_CRITICAL.has(finding.severity));
  const unclassified = productionHighCritical.filter((finding) => !['BLOCKED', 'VEX_APPROVED'].includes(finding.decision));
  const blocked = productionHighCritical.filter((finding) => finding.decision === 'BLOCKED');
  assert(unclassified.length === 0, 'unclassified production High/Critical finding');
  return {
    findingCount: findings.length,
    productionHighCritical: { unclassified: unclassified.length, blocked: blocked.length, releaseSafe: blocked.length === 0 },
    findings,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert(result.error === undefined, `${command} failed to start`);
  return result;
}

function assertVersion(command, args, expected) {
  const result = run(command, args);
  assert(result.status === 0 && result.stdout.includes(expected), `${command}: expected version ${expected}`);
}

function gitIdentity(repoRoot) {
  const sha = run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  const tree = run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot });
  assert(sha.status === 0 && tree.status === 0, 'cannot resolve source SHA/tree');
  return { sourceSha: sha.stdout.trim(), sourceTree: tree.stdout.trim() };
}

export function runSecurityScans({ repoRoot = process.cwd(), outDir, gitleaksBinary, trivyBinary, semgrepImage = SEMGREP_IMAGE, images = [] } = {}) {
  assert(typeof outDir === 'string' && outDir, 'outDir is required');
  assert(typeof gitleaksBinary === 'string' && gitleaksBinary, 'gitleaksBinary is required');
  assert(typeof trivyBinary === 'string' && trivyBinary, 'trivyBinary is required');
  const root = resolve(repoRoot);
  const parsedImages = images.map(parseImageSpec);
  assert(new Set(parsedImages.map((image) => image.name)).size === parsedImages.length, 'image names must be unique');
  mkdirSync(outDir, { recursive: true });
  assert(!existsSync(join(root, '.trivyignore')), '.trivyignore is forbidden without an approved mapped VEX exception');
  validateGitleaksIgnoreContents(readFileSync(join(root, '.gitleaksignore'), 'utf8'));
  assertVersion(gitleaksBinary, ['version'], GITLEAKS_VERSION);
  assertVersion(trivyBinary, ['--version'], TRIVY_VERSION);
  const semgrepVersion = run('docker', ['run', '--rm', semgrepImage, 'semgrep', '--version']);
  assert(semgrepVersion.status === 0 && semgrepVersion.stdout.includes(SEMGREP_VERSION), 'Semgrep image version mismatch');
  const scratch = mkdtempSync(join(tmpdir(), 'amic-security-scan-'));
  try {
    const gitleaksHistoryPath = join(scratch, 'gitleaks-history.json');
    const gitleaksHistory = run(gitleaksBinary, ['detect', '--source', root, '--config', join(root, '.gitleaks.toml'), '--gitleaks-ignore-path', join(root, '.gitleaksignore'), '--no-banner', '--redact', '--report-format', 'json', '--report-path', gitleaksHistoryPath]);
    assert([0, 1].includes(gitleaksHistory.status), 'Gitleaks history scan returned an unexpected exit code');
    const gitleaksWorkingTreePath = join(scratch, 'gitleaks-working-tree.json');
    const gitleaksWorkingTree = run(gitleaksBinary, ['protect', '--source', root, '--config', join(root, '.gitleaks.toml'), '--gitleaks-ignore-path', join(root, '.gitleaksignore'), '--no-banner', '--redact', '--report-format', 'json', '--report-path', gitleaksWorkingTreePath]);
    assert([0, 1].includes(gitleaksWorkingTree.status), 'Gitleaks working-tree scan returned an unexpected exit code');
    const semgrep = run('docker', ['run', '--rm', '-v', `${root}:/src:ro`, '-w', '/src', semgrepImage, 'semgrep', 'scan', '--no-git-ignore', '--config', '.semgrep.yml', '--json', '--quiet', '--metrics=off', '.']);
    assert([0, 1].includes(semgrep.status), 'Semgrep returned an unexpected exit code');
    const trivyPath = join(scratch, 'trivy.json');
    const trivy = run(trivyBinary, ['fs', '--scanners', 'misconfig,secret', '--skip-db-update', '--skip-java-db-update', '--skip-check-update', '--offline-scan', '--disable-telemetry', '--skip-version-check', '--format', 'json', '--output', trivyPath, root]);
    assert(trivy.status === 0, 'Trivy filesystem scan failed');
    const imageFindings = parsedImages.flatMap((image) => {
      const imagePath = join(scratch, `${image.name}-trivy.json`);
      // The policy input carries the explicit local `docker:` transport so the
      // caller cannot accidentally pass a mutable tag. Trivy's image command
      // consumes the corresponding Docker image ID without that transport.
      const imageScan = run(trivyBinary, ['image', '--scanners', 'misconfig,secret', '--skip-db-update', '--skip-java-db-update', '--skip-check-update', '--offline-scan', '--disable-telemetry', '--skip-version-check', '--format', 'json', '--output', imagePath, image.digest]);
      assert(imageScan.status === 0, `Trivy image scan failed for ${image.name}`);
      return normalizeTrivy(JSON.parse(readFileSync(imagePath, 'utf8')), { imageDigest: image.digest });
    });
    const findings = [
      ...normalizeGitleaks(JSON.parse(readFileSync(gitleaksHistoryPath, 'utf8')), 'history'),
      ...normalizeGitleaks(JSON.parse(readFileSync(gitleaksWorkingTreePath, 'utf8')), 'working-tree'),
      ...normalizeSemgrep(JSON.parse(semgrep.stdout)),
      ...normalizeTrivy(JSON.parse(readFileSync(trivyPath, 'utf8'))),
      ...imageFindings,
    ];
    const result = { schema: 'amic-vault.security-scan-summary.v1', ...gitIdentity(root), toolPins: { gitleaks: GITLEAKS_VERSION, semgrep: { version: SEMGREP_VERSION, image: semgrepImage }, trivy: TRIVY_VERSION }, ...summarizeFindings(findings) };
    writeFileSync(resolve(outDir, 'security-scan-summary.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--out') result.outDir = args[++index];
    else if (value === '--gitleaks') result.gitleaksBinary = args[++index];
    else if (value === '--trivy') result.trivyBinary = args[++index];
    else if (value === '--image') (result.images ??= []).push(args[++index]);
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const result = runSecurityScans(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ status: 'ok', sourceSha: result.sourceSha, sourceTree: result.sourceTree, findingCount: result.findingCount, productionHighCritical: result.productionHighCritical }, null, 2));
}
