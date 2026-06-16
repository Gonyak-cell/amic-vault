import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const outlookOperationalFeatures = [
  'ADDIN_BOOTSTRAP',
  'AUTH_EXCHANGE',
  'GRAPH_ATTACHMENT_ACQUISITION',
  'SMART_ALERTS',
  'SEND_FILE',
  'DOCUMENT_INSERTION',
  'FOLDER_MAPPING',
  'AUTOFILE',
] as const;

export type OutlookOperationalFeature = (typeof outlookOperationalFeatures)[number];

export const outlookFeatureEnvNames: Record<OutlookOperationalFeature, string> = {
  ADDIN_BOOTSTRAP: 'OUTLOOK_ADDIN_ENABLED',
  AUTH_EXCHANGE: 'OUTLOOK_AUTH_EXCHANGE_ENABLED',
  GRAPH_ATTACHMENT_ACQUISITION: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED',
  SMART_ALERTS: 'OUTLOOK_SMART_ALERTS_ENABLED',
  SEND_FILE: 'OUTLOOK_SEND_FILE_ENABLED',
  DOCUMENT_INSERTION: 'OUTLOOK_DOCUMENT_INSERTION_ENABLED',
  FOLDER_MAPPING: 'OUTLOOK_FOLDER_MAPPING_ENABLED',
  AUTOFILE: 'OUTLOOK_AUTOFILE_ENABLED',
};

export const outlookRolloutRings = [
  'R0_ADMIN_ONLY',
  'R1_PILOT_PRACTICE',
  'R2_BROADER_PILOT',
  'R3_PRODUCTION',
] as const;

export type OutlookRolloutRing = (typeof outlookRolloutRings)[number];

export type OutlookEvidenceKind =
  | 'EV-OUTLOOK-002'
  | 'EV-OUTLOOK-003'
  | 'OPERATOR-APPROVAL'
  | 'DISABLE-REMOVE-REHEARSAL';

export const outlookEvidenceEnvNames: Record<OutlookEvidenceKind, string> = {
  'EV-OUTLOOK-002': 'OUTLOOK_MANIFEST_VALIDATION_REF',
  'EV-OUTLOOK-003': 'OUTLOOK_GRAPH_CONSENT_REF',
  'OPERATOR-APPROVAL': 'OUTLOOK_OPERATOR_APPROVAL_REF',
  'DISABLE-REMOVE-REHEARSAL': 'OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF',
};

const evidencePatterns: Record<OutlookEvidenceKind, RegExp> = {
  'EV-OUTLOOK-002': /^EVREF-OUTLOOK-002-[0-9]{8}-[A-Z0-9]{8,26}$/,
  'EV-OUTLOOK-003': /^EVREF-OUTLOOK-003-[0-9]{8}-[A-Z0-9]{8,26}$/,
  'OPERATOR-APPROVAL': /^APPROVAL-OUTLOOK-OPERATOR-[0-9]{8}-[A-Z0-9]{8,26}$/,
  'DISABLE-REMOVE-REHEARSAL': /^REHEARSAL-OUTLOOK-REMOVE-[0-9]{8}-[A-Z0-9]{8,26}$/,
};

const unsafeEvidenceValuePatterns = [
  /https?:\/\//i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /[a-z0-9.-]+\.[a-z]{2,}/i,
  /@/,
  /[/?#:]/,
  /\b(access|refresh|token|cookie|secret|password)\b/i,
];

const forbiddenRepositoryPatterns = [
  { code: 'M365_TENANT_DOMAIN', pattern: /[a-z0-9.-]+\.onmicrosoft\.com/i },
  {
    code: 'M365_TENANT_LOGIN_URL',
    pattern:
      /login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  },
  { code: 'M365_ADMIN_URL', pattern: /admin\.microsoft\.com/i },
  { code: 'AZURE_PORTAL_URL', pattern: /portal\.azure\.com/i },
  { code: 'ENTRA_PORTAL_URL', pattern: /entra\.microsoft\.com/i },
  {
    code: 'TENANT_OR_CLIENT_UUID',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  },
  { code: 'PRIVATE_KEY', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: 'ACCESS_TOKEN_ASSIGNMENT', pattern: /access[_-]?token\s*[:=]\s*['"][^'"]+['"]/i },
  { code: 'REFRESH_TOKEN_ASSIGNMENT', pattern: /refresh[_-]?token\s*[:=]\s*['"][^'"]+['"]/i },
  { code: 'SECRET_ASSIGNMENT', pattern: /secret\s*[:=]\s*['"][^'"]+['"]/i },
  { code: 'PASSWORD_ASSIGNMENT', pattern: /password\s*[:=]\s*['"][^'"]+['"]/i },
];

const graphDependentFeatures = new Set<OutlookOperationalFeature>([
  'GRAPH_ATTACHMENT_ACQUISITION',
]);

const ringAllowedFeatures: Record<OutlookRolloutRing, ReadonlySet<OutlookOperationalFeature>> = {
  R0_ADMIN_ONLY: new Set(['ADDIN_BOOTSTRAP', 'AUTH_EXCHANGE', 'SMART_ALERTS']),
  R1_PILOT_PRACTICE: new Set([
    'ADDIN_BOOTSTRAP',
    'AUTH_EXCHANGE',
    'GRAPH_ATTACHMENT_ACQUISITION',
    'SMART_ALERTS',
    'SEND_FILE',
    'DOCUMENT_INSERTION',
  ]),
  R2_BROADER_PILOT: new Set([
    'ADDIN_BOOTSTRAP',
    'AUTH_EXCHANGE',
    'GRAPH_ATTACHMENT_ACQUISITION',
    'SMART_ALERTS',
    'SEND_FILE',
    'DOCUMENT_INSERTION',
    'FOLDER_MAPPING',
  ]),
  R3_PRODUCTION: new Set(outlookOperationalFeatures),
};

export type OutlookOperationalFailureCode =
  | 'AUDIT_UNAVAILABLE'
  | 'DOCS_PACKAGE_MODIFIED'
  | 'DIRECT_OUTLOOK_ENV_READ'
  | 'INCONSISTENT_FEATURE_FLAGS'
  | 'MALFORMED_EVIDENCE_REF'
  | 'MISSING_GRAPH_CONSENT_REF'
  | 'MISSING_MANIFEST_VALIDATION_REF'
  | 'MISSING_OPERATOR_APPROVAL_REF'
  | 'MISSING_ROLLBACK_REHEARSAL_REF'
  | 'MISSING_ROLLOUT_RING'
  | 'RING_FEATURE_NOT_ALLOWED'
  | 'SENSITIVE_PATTERN_DETECTED'
  | 'UNKNOWN_ROLLOUT_RING';

export interface OutlookOperationalFailure {
  code: OutlookOperationalFailureCode;
  feature?: OutlookOperationalFeature;
  evidenceKind?: OutlookEvidenceKind;
  file?: string;
  patternCode?: string;
}

export interface OutlookOperationalCheckInput {
  target: 'pr' | 'staging' | 'production';
  mode: 'advisory' | 'enforce';
  env: Record<string, string | undefined>;
  repoRoot?: string;
}

export interface OutlookOperationalCheckReport {
  status: 'pass' | 'fail';
  target: OutlookOperationalCheckInput['target'];
  mode: OutlookOperationalCheckInput['mode'];
  ring: OutlookRolloutRing | null;
  enabledFeatures: OutlookOperationalFeature[];
  failures: OutlookOperationalFailure[];
  sensitiveValuesPrinted: false;
}

export interface OutlookEvidenceRefDecision {
  kind: OutlookEvidenceKind;
  present: boolean;
  validFormat: boolean;
}

export function parseOutlookEvidenceRef(
  kind: OutlookEvidenceKind,
  value: string | undefined,
): OutlookEvidenceRefDecision {
  if (!value) return { kind, present: false, validFormat: false };
  if (unsafeEvidenceValuePatterns.some((pattern) => pattern.test(value))) {
    return { kind, present: true, validFormat: false };
  }
  return { kind, present: true, validFormat: evidencePatterns[kind].test(value) };
}

export function evaluateOutlookOperationalGate(
  input: OutlookOperationalCheckInput,
): OutlookOperationalCheckReport {
  const enabledFeatures = outlookOperationalFeatures.filter(
    (feature) => input.env[outlookFeatureEnvNames[feature]] === 'true',
  );
  const ring = parseRing(input.env.OUTLOOK_ROLLOUT_RING);
  const failures: OutlookOperationalFailure[] = [];
  const enforce = input.mode === 'enforce' || input.target === 'production';

  if (enabledFeatures.length > 0 && !enabledFeatures.includes('ADDIN_BOOTSTRAP')) {
    failures.push({ code: 'INCONSISTENT_FEATURE_FLAGS' });
  }

  for (const kind of Object.keys(outlookEvidenceEnvNames) as OutlookEvidenceKind[]) {
    const evidence = parseOutlookEvidenceRef(kind, input.env[outlookEvidenceEnvNames[kind]]);
    if (evidence.present && !evidence.validFormat) {
      failures.push({ code: 'MALFORMED_EVIDENCE_REF', evidenceKind: kind });
    }
  }

  if (enforce && enabledFeatures.length > 0) {
    if (!input.env.OUTLOOK_ROLLOUT_RING) {
      failures.push({ code: 'MISSING_ROLLOUT_RING' });
    } else if (!ring) {
      failures.push({ code: 'UNKNOWN_ROLLOUT_RING' });
    }

    requireEvidence(input.env, 'OPERATOR-APPROVAL', 'MISSING_OPERATOR_APPROVAL_REF', failures);
    requireEvidence(input.env, 'EV-OUTLOOK-002', 'MISSING_MANIFEST_VALIDATION_REF', failures);
    requireEvidence(
      input.env,
      'DISABLE-REMOVE-REHEARSAL',
      'MISSING_ROLLBACK_REHEARSAL_REF',
      failures,
    );

    if (enabledFeatures.some((feature) => graphDependentFeatures.has(feature))) {
      requireEvidence(input.env, 'EV-OUTLOOK-003', 'MISSING_GRAPH_CONSENT_REF', failures);
    }

    if (ring) {
      for (const feature of enabledFeatures) {
        if (!ringAllowedFeatures[ring].has(feature)) {
          failures.push({ code: 'RING_FEATURE_NOT_ALLOWED', feature });
        }
      }
    }

    if (input.env.OUTLOOK_AUDIT_AVAILABLE !== 'true') {
      failures.push({ code: 'AUDIT_UNAVAILABLE' });
    }
  }

  if (input.repoRoot && docsPackageModified(input.repoRoot)) {
    failures.push({ code: 'DOCS_PACKAGE_MODIFIED' });
  }

  if (input.repoRoot) {
    for (const failure of scanOperationalFiles(input.repoRoot)) {
      failures.push(failure);
    }
    for (const failure of scanDirectOutlookEnvReads(input.repoRoot)) {
      failures.push(failure);
    }
  }

  return {
    status: failures.length > 0 ? 'fail' : 'pass',
    target: input.target,
    mode: input.mode,
    ring,
    enabledFeatures,
    failures,
    sensitiveValuesPrinted: false,
  };
}

export function scanOperationalFiles(repoRoot: string): OutlookOperationalFailure[] {
  const files = collectOperationalScanFiles(repoRoot);
  return scanFiles(repoRoot, files);
}

export function scanFiles(repoRoot: string, files: readonly string[]): OutlookOperationalFailure[] {
  const failures: OutlookOperationalFailure[] = [];
  for (const file of files) {
    if (isTestFixtureFile(file)) continue;
    const absolutePath = path.join(repoRoot, file);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, 'utf8');
    failures.push(...scanContent(file, content));
  }
  return failures;
}

export function scanChangedFileAdditions(
  repoRoot: string,
  files: readonly string[],
): OutlookOperationalFailure[] {
  const failures: OutlookOperationalFailure[] = [];
  const untracked = new Set(untrackedFiles(repoRoot));
  for (const file of files) {
    if (isTestFixtureFile(file)) continue;
    const absolutePath = path.join(repoRoot, file);
    if (!existsSync(absolutePath)) continue;
    const content = untracked.has(file) ? readFileSync(absolutePath, 'utf8') : addedLines(repoRoot, file);
    failures.push(...scanContent(file, content));
  }
  return failures;
}

export function scanDirectOutlookEnvReads(repoRoot: string): OutlookOperationalFailure[] {
  const moduleDir = 'apps/api/src/modules/outlook';
  const files = new Set<string>();
  collectFiles(path.join(repoRoot, moduleDir), moduleDir, files);
  const failures: OutlookOperationalFailure[] = [];
  for (const file of files) {
    if (isTestFixtureFile(file)) continue;
    if (file.endsWith('/outlook-operational-gate.ts')) continue;
    if (!file.endsWith('.ts')) continue;
    const content = readFileSync(path.join(repoRoot, file), 'utf8');
    if (/process\.env\.OUTLOOK_[A-Z0-9_]+/.test(content)) {
      failures.push({ code: 'DIRECT_OUTLOOK_ENV_READ', file });
    }
  }
  return failures;
}

export function changedFiles(repoRoot: string): string[] {
  const outputs = [
    runGit(repoRoot, ['diff', '--name-only']),
    runGit(repoRoot, ['diff', '--name-only', '--cached']),
    runGit(repoRoot, ['diff', '--name-only', 'origin/main...HEAD']),
    runGit(repoRoot, ['ls-files', '--others', '--exclude-standard']),
  ];
  return [...new Set(outputs.flatMap((output) => output.split('\n').filter(Boolean)))];
}

export function collectOperationalScanFiles(repoRoot: string): string[] {
  const operationalFiles = [
    'docs/release/outlook-addin-deployment-runbook.md',
    'docs/release/outlook-addin-verification-matrix.md',
    'docs/release/outlook-addin-graph-scope-matrix.md',
    'docs/release/outlook-operational-gates.md',
    'docs/release/evidence-register.md',
    'docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md',
    'docs/execution/PACKS_R4_R14.md',
    'tools/release/check-outlook-deployment.mjs',
    'tools/release/check-outlook-verification.mjs',
    'tools/release/check-outlook-operational.ts',
    'tools/release/check-outlook-redaction.ts',
    'tools/release/outlook-operational-policy.ts',
    'apps/api/src/modules/outlook/outlook-operational-gate.ts',
    '.github/workflows',
  ];
  const files = new Set<string>();
  for (const file of operationalFiles) {
    const absolutePath = path.join(repoRoot, file);
    if (file.endsWith('workflows')) {
      collectFiles(absolutePath, file, files);
    } else if (existsSync(absolutePath)) {
      files.add(file);
    }
  }
  return [...files].filter((file) => !file.startsWith('docs/package/'));
}

function scanContent(file: string, content: string): OutlookOperationalFailure[] {
  const failures: OutlookOperationalFailure[] = [];
  const urls = content.match(/https?:\/\/[^\s)'"<>]+/g) ?? [];
  for (const url of urls) {
    const normalized = url.toLowerCase();
    if (
      !normalized.startsWith('https://learn.microsoft.com/') &&
      !normalized.startsWith('https://localhost:') &&
      !normalized.startsWith('http://localhost:')
    ) {
      failures.push({ code: 'SENSITIVE_PATTERN_DETECTED', file, patternCode: 'EXTERNAL_URL' });
    }
  }
  for (const rule of forbiddenRepositoryPatterns) {
    if (rule.pattern.test(content)) {
      failures.push({ code: 'SENSITIVE_PATTERN_DETECTED', file, patternCode: rule.code });
    }
  }
  return failures;
}

function requireEvidence(
  env: Record<string, string | undefined>,
  kind: OutlookEvidenceKind,
  missingCode: OutlookOperationalFailureCode,
  failures: OutlookOperationalFailure[],
): void {
  const evidence = parseOutlookEvidenceRef(kind, env[outlookEvidenceEnvNames[kind]]);
  if (!evidence.present) {
    failures.push({ code: missingCode, evidenceKind: kind });
  } else if (!evidence.validFormat) {
    failures.push({ code: 'MALFORMED_EVIDENCE_REF', evidenceKind: kind });
  }
}

function parseRing(value: string | undefined): OutlookRolloutRing | null {
  return outlookRolloutRings.find((ring) => ring === value) ?? null;
}

function docsPackageModified(repoRoot: string): boolean {
  return changedFiles(repoRoot).some((file) => file.startsWith('docs/package/'));
}

function addedLines(repoRoot: string, file: string): string {
  const outputs = [
    runGit(repoRoot, ['diff', '--unified=0', '--', file]),
    runGit(repoRoot, ['diff', '--cached', '--unified=0', '--', file]),
    runGit(repoRoot, ['diff', '--unified=0', 'origin/main...HEAD', '--', file]),
  ];
  return outputs
    .flatMap((output) => output.split('\n'))
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

function untrackedFiles(repoRoot: string): string[] {
  return runGit(repoRoot, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean);
}

function collectFiles(absoluteDir: string, relativeDir: string, output: Set<string>): void {
  if (!existsSync(absoluteDir)) return;
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectFiles(absolutePath, relativePath, output);
    } else if (entry.isFile() && /\.(md|mjs|ts|tsx|json|ya?ml|xml|js)$/.test(entry.name)) {
      output.add(relativePath);
    }
  }
}

function isTestFixtureFile(file: string): boolean {
  return file.endsWith('.spec.ts') || file.endsWith('.test.ts') || file.endsWith('.test.tsx');
}

function runGit(repoRoot: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}
