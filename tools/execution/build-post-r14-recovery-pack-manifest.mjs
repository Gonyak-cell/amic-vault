#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JSON_PATH = path.join(ROOT, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json');
const MD_PATH = path.join(ROOT, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md');
const LEDGER_PATH = path.join(ROOT, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json');

const MANIFEST_ID = 'POST-R14-RECOVERY-PACK-MANIFEST-V1';
const AUTHORITY_REF = 'TASK6B-TECHNICAL-GATES-AUTHORITY-20260717';
const REGISTRATION_PACK_ID = 'PACK-R14-03';
const REGISTRATION_BRANCH = 'feat/pack-r14-03-recovery-manifest';
const BASE_COMMIT = '566fd7399d2a22946a621f37e8f452bd444a9cc8';
const ORIGINAL_TREE = '1ef1af32028e998a18a6c9ee8a882068fdf7a7f3';
const ORIGINAL_OVERLAY_SHA256 = '598f98b3c929e34e74270ac5d6b5b062594a278783c30fa3d351160e30150f30';
const GENERATED_AT = '2026-07-17T09:00:00.000Z';

const EXPECTED_SOURCE_HASHES = {
  classification: 'a17a2b79040cda94a9a77fa4667ad80f295c2a1b3dc820d80918f76cfe0dac74',
  ownership: '40489d3b32fd8e1270c33d0a38fea7b739c533cd2194415437e9f6ee291fc4cb',
  units117: '0df1f6a74f348b12ec7178f9b3fe0771e5a337dae92d21c3c77d1494d00e9e04',
  activeLedger: '48bf2337de44dda4a29934ea89359ec68ace9a8a97aea702fe112515b8cb18d1',
};

const REGISTRATION_TUW_IDS = [
  'RECOVERY-MANIFEST-SCHEMA-TUW-001',
  'RECOVERY-MANIFEST-VALIDATION-TUW-002',
  'RECOVERY-MANIFEST-REGISTRATION-TUW-003',
];

const REGISTRATION_ALLOWED_CREATE = [
  'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json',
  'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md',
  'tools/execution/build-post-r14-recovery-pack-manifest.mjs',
  'tools/execution/build-post-r14-recovery-pack-manifest.spec.mjs',
];

const REGISTRATION_ALLOWED_MODIFY = [
  'docs/execution/PACKS_R4_R14.md',
  'docs/ledger/decision.md',
  'docs/ledger/execution.md',
];

const COMMON_COMMANDS = [
  'pnpm install --frozen-lockfile',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm backlog:validate',
  'pnpm docs:frozen',
  'git diff --check',
];

const GLOBAL_NOT_MODIFY = [
  'docs/package/**',
  'AGENTS.md',
  '.omo/**',
  'private G001/G002 evidence',
  'all paths and hunks not assigned to the current PACK',
  'production or external state without separately recorded authority',
];

const SUPPORT = {
  history: [
    'RECOVERY-HISTORY-INVENTORY-TUW-001',
    'RECOVERY-HISTORY-CLAIMS-TUW-002',
    'RECOVERY-HISTORY-RECONSTRUCT-TUW-003',
  ],
  lawos: [
    'RECOVERY-LAWOS-SCOPE-TUW-001',
    'RECOVERY-LAWOS-RUNNER-TUW-002',
    'RECOVERY-LAWOS-VERIFY-TUW-003',
  ],
  evidence: [
    'RECOVERY-EVIDENCE-SCHEMA-TUW-001',
    'RECOVERY-EVIDENCE-LEASE-TUW-002',
    'RECOVERY-EVIDENCE-LSP-TUW-003',
    'RECOVERY-EVIDENCE-QUEUE-TUW-004',
  ],
  foundation: [
    'RECOVERY-SHARED-FOUNDATION-TUW-001',
    'RECOVERY-SHARED-PACKAGE-TUW-002',
    'RECOVERY-SHARED-TOOLS-TUW-003',
    'RECOVERY-SHARED-GITIGNORE-TUW-004',
    'RECOVERY-SHARED-REVIEW-TUW-005',
  ],
  api: [
    'RECOVERY-SHARED-API-SCOPE-TUW-001',
    'RECOVERY-SHARED-API-APPLY-TUW-002',
    'RECOVERY-SHARED-API-REGRESSION-TUW-003',
  ],
  web: [
    'RECOVERY-SHARED-WEB-SCOPE-TUW-001',
    'RECOVERY-SHARED-WEB-APPLY-TUW-002',
    'RECOVERY-SHARED-WEB-REGRESSION-TUW-003',
  ],
  integration: [
    'RECOVERY-SHARED-INTEGRATION-SCOPE-TUW-001',
    'RECOVERY-SHARED-INTEGRATION-APPLY-TUW-002',
    'RECOVERY-SHARED-INTEGRATION-REGRESSION-TUW-003',
  ],
  worker: [
    'RECOVERY-SHARED-WORKER-SCOPE-TUW-001',
    'RECOVERY-SHARED-WORKER-APPLY-TUW-002',
    'RECOVERY-SHARED-WORKER-REGRESSION-TUW-003',
  ],
  permission: ['RECOVERY-PERMISSION-DECISION-TUW-001'],
  dr: ['RECOVERY-DR-AUTHORITY-TUW-001'],
  desktop: ['RECOVERY-DESKTOP-DECISION-TUW-001'],
  exact: [
    'RECOVERY-EXACTSHA-SCOPE-TUW-001',
    'RECOVERY-EXACTSHA-DBMATRIX-TUW-002',
    'RECOVERY-EXACTSHA-IMAGES-TUW-003',
  ],
  webqa: [
    'RECOVERY-WEBQA-RESPONSIVE-TUW-001',
    'RECOVERY-WEBQA-STATES-TUW-002',
    'RECOVERY-WEBQA-ACCESSIBILITY-TUW-003',
  ],
  desktopqa: [
    'RECOVERY-DESKTOPQA-BUILD-TUW-001',
    'RECOVERY-DESKTOPQA-SIGN-TUW-002',
    'RECOVERY-DESKTOPQA-LAUNCH-TUW-003',
  ],
  external: [
    'RECOVERY-EXTERNAL-AUTHORITY-TUW-001',
    'RECOVERY-EXTERNAL-SMOKE-TUW-002',
    'RECOVERY-EXTERNAL-ROLLBACK-TUW-003',
  ],
  baseline: [
    'RECOVERY-BASELINE8-RUN-TUW-001',
    'RECOVERY-BASELINE8-MATRIX-TUW-002',
    'RECOVERY-BASELINE8-CLAIMS-TUW-003',
  ],
  final: [
    'RECOVERY-FINAL-PLAN-REVIEW-TUW-001',
    'RECOVERY-FINAL-CODE-REVIEW-TUW-002',
    'RECOVERY-FINAL-REAL-QA-TUW-003',
    'RECOVERY-FINAL-SCOPE-REVIEW-TUW-004',
  ],
};

const BLUEPRINTS = [
  bp('T7', 'release-history', 'Recover release evidence history', 'HISTORICAL_RECOVERY', ['7'], SUPPORT.history),
  bp('T9', 'appendix-audit', 'Adjudicate seven Appendix-2 rows', 'STATUS_ADJUDICATION', ['9'], ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20']),
  bp('T10', 'small-candidate-adjudication', 'Re-adjudicate small former candidates', 'READJUDICATION', ['10'], ['A5', 'A3', 'C3', 'B5', 'G2']),
  bp('T11', 'matter-candidate-adjudication', 'Re-adjudicate Matter candidate chain', 'READJUDICATION', ['11'], ['A1', 'A2', 'A4', 'A6', 'A7', 'A10']),
  bp('T12', 'dependency-candidate-adjudication', 'Re-adjudicate dependency-bound candidates', 'READJUDICATION', ['12'], ['D1', 'F5', 'H8', 'A14', 'D2', 'D3', 'E2', 'D5']),
  bp('T8', 'lawos-reflection', 'Recover LawOS canonical reflection runner', 'CODE_RECOVERY', ['8'], ['A14', ...SUPPORT.lawos]),
  bp('T13', 'evidence-factory', 'Establish evidence factory and normalized queue', 'CONTROL_SUPPORT', ['13'], SUPPORT.evidence),
  bp('T14', 'document-diagnostics', 'Close document diagnostics evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['14'], ['F6', 'B2', 'B4', 'B6']),
  bp('T15', 'email-outlook-fixtures', 'Close email and Outlook fixture evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['15'], ['C1', 'C2', 'C8', 'C9', 'C16']),
  bp('T16', 'document-search-fixtures', 'Close document and search fixture evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['16'], ['B1', 'D6', 'D8']),
  bp('T18', 'workflow-operations', 'Close workflow and operations evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['18'], ['G5', 'G10', 'G13', 'H7', 'H13']),
  bp('T19', 'search-graph-citations', 'Close search graph citation roots', 'EVIDENCE_OR_IMPLEMENTATION', ['19'], ['D4', 'D11', 'F1', 'F4']),
  bp('T20', 'safe-local-ai', 'Close safe local AI evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['20'], ['E1', 'E6', 'E7', 'E5']),
  bp('T21', 'identity-worker-platform', 'Close identity and worker platform evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['21', '22'], ['H1', 'H2', 'H6', 'C4', 'H14']),
  bp('T23', 'performance-operations', 'Close performance and external operations evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['23'], ['B7', 'H5', 'H9', 'H12']),
  bp('T25', 'format-outlook-transport', 'Process format and Outlook transport dependencies', 'EVIDENCE_OR_IMPLEMENTATION', ['25'], ['C5', 'C6', 'B9', 'B10']),
  bp('T26', 'comparison-email-depth', 'Process comparison and email depth dependencies', 'EVIDENCE_OR_IMPLEMENTATION', ['26'], ['B11', 'C10', 'C11', 'C12', 'C13']),
  bp('T27', 'permission-local-ai', 'Process permission-scoped local AI features', 'EVIDENCE_OR_IMPLEMENTATION', ['27'], ['E3', 'E4', 'E9', 'E10', 'E11', 'E12', 'E14']),
  bp('T31', 'document-editing-core', 'Recover document editing core', 'IMPLEMENTATION', ['31'], ['B15', 'B16', 'B17']),
  bp('T32', 'redline-source-gate', 'Gate and recover redline source', 'IMPLEMENTATION', ['32'], ['B18', 'B19', 'B20']),
  bp('T33', 'permission-conflict-decision', 'Resolve A6 and A7 permission conflict', 'GOVERNANCE_DECISION', ['33'], ['A6', 'A7', ...SUPPORT.permission]),
  bp('T17', 'matter-lifecycle', 'Close Matter lifecycle evidence', 'EVIDENCE_OR_IMPLEMENTATION', ['17'], ['A8', 'A9', 'A10', 'G1', 'G7']),
  bp('T24', 'matter-closure-work', 'Process Matter closure and work dependencies', 'EVIDENCE_OR_IMPLEMENTATION', ['24'], ['A11', 'A12', 'G6', 'G8', 'G12']),
  bp('T28', 'folder-ocr-search-scale', 'Process folder OCR search scale dependencies', 'EVIDENCE_OR_IMPLEMENTATION', ['28'], ['B8', 'D7', 'D10', 'D9', 'D12', 'F12']),
  bp('T29', 'graph-knowledge-review', 'Process graph and knowledge review dependencies', 'EVIDENCE_OR_IMPLEMENTATION', ['29'], ['F2', 'F3', 'F7', 'F8', 'F9', 'F10', 'E14']),
  bp('T30A', 'contract-knowledge-prereqs', 'Process contract and knowledge prerequisites', 'EVIDENCE_OR_IMPLEMENTATION', ['30'], ['F11', 'F12', 'B14', 'F13', 'F14', 'H11']),
  bp('T34', 'controlled-content-chain', 'Resolve controlled content chain', 'GOVERNANCE_OR_IMPLEMENTATION', ['34'], ['B3', 'B19', 'B20', 'G9', 'G11']),
  bp('T35', 'm365-chain', 'Resolve M365 chain', 'EXTERNAL_GATED', ['35'], ['C7', 'C16', 'C14', 'C15', 'B13']),
  bp('T36', 'external-model-chain', 'Resolve external model chain', 'EXTERNAL_GATED', ['36'], ['E8', 'B13', 'E13']),
  bp('T37', 'aws-dr-chain', 'Resolve AWS and DR chain', 'EXTERNAL_GATED', ['37'], ['H3', 'H4', ...SUPPORT.dr]),
  bp('T38', 'desktop-capability', 'Resolve desktop capability and handoff', 'EXTERNAL_GATED', ['38'], ['B12', 'B17', ...SUPPORT.desktop]),
  bp('TLATE', 'contract-knowledge-late', 'Close late contract and knowledge dependents', 'EVIDENCE_OR_IMPLEMENTATION', ['24', '30'], ['A13', 'G3', 'G4', 'G14']),
  bp('SFOUND', 'shared-foundation', 'Recover shared foundation hunks', 'SHARED_HUNK_RECOVERY', ['3', '13'], SUPPORT.foundation),
  bp('SAPI', 'shared-api', 'Recover shared API hunks', 'SHARED_HUNK_RECOVERY', ['3'], SUPPORT.api),
  bp('SWEB', 'shared-web', 'Recover shared web hunks', 'SHARED_HUNK_RECOVERY', ['3'], SUPPORT.web),
  bp('SINTEGRATION', 'shared-integration', 'Recover shared integration hunks', 'SHARED_HUNK_RECOVERY', ['3'], SUPPORT.integration),
  bp('SWORKER', 'shared-worker', 'Recover shared worker hunks', 'SHARED_HUNK_RECOVERY', ['3'], SUPPORT.worker),
  bp('V39', 'exact-sha-validation', 'Validate exact SHA candidates', 'VERIFICATION', ['39'], SUPPORT.exact),
  bp('V40', 'rendered-web-qa', 'Run actual rendered web QA', 'MANUAL_QA', ['40'], SUPPORT.webqa),
  bp('V41', 'desktop-artifact-qa', 'Build and inspect desktop artifacts', 'EXTERNAL_GATED_QA', ['41'], SUPPORT.desktopqa),
  bp('V42', 'authorized-external-smoke', 'Run authorized external smoke only', 'EXTERNAL_GATED_QA', ['42'], SUPPORT.external),
  bp('V43', 'baseline8-final', 'Run Baseline-8 and final truth matrix', 'FINAL_VALIDATION', ['43'], SUPPORT.baseline),
  bp('VF', 'final-independent-reviews', 'Run final independent reviews', 'FINAL_REVIEW', ['F1', 'F2', 'F3', 'F4'], SUPPORT.final),
];

const PRIMARY_GROUPS = {
  T9: ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'],
  T10: ['A5', 'A3', 'C3', 'B5', 'G2'],
  T11: ['A1', 'A2', 'A4', 'A6', 'A7', 'A10'],
  T12: ['D1', 'F5', 'H8', 'A14', 'D2', 'D3', 'E2', 'D5'],
  T14: ['F6', 'B2', 'B4', 'B6'],
  T15: ['C1', 'C2', 'C8', 'C9'],
  T16: ['B1', 'D6', 'D8'],
  T17: ['A8', 'A9', 'G1', 'G7'],
  T18: ['G5', 'G10', 'G13', 'H7', 'H13'],
  T19: ['D4', 'D11', 'F1', 'F4'],
  T20: ['E1', 'E6', 'E7', 'E5'],
  T21: ['H1', 'H2', 'H6', 'C4', 'H14'],
  T23: ['B7', 'H5', 'H9', 'H12'],
  T24: ['A11', 'A12', 'G6', 'G8', 'G12'],
  T25: ['C5', 'C6', 'B9', 'B10'],
  T26: ['B11', 'C10', 'C11', 'C12', 'C13'],
  T27: ['E3', 'E4', 'E9', 'E10', 'E11', 'E12', 'E14'],
  T28: ['B8', 'D7', 'D10', 'D9', 'D12', 'F12'],
  T29: ['F2', 'F3', 'F7', 'F8', 'F9', 'F10'],
  T30A: ['F11', 'B14', 'F13', 'F14', 'H11'],
  TLATE: ['A13', 'G3', 'G4', 'G14'],
  T34: ['B3', 'G9', 'G11'],
  T35: ['C7', 'C14', 'C15', 'B13'],
  T36: ['E8', 'E13'],
  T37: ['H3', 'H4'],
  T38: ['B12'],
};

const UNIT_ROUTE_OVERRIDES = {
  A6: 'T33',
  A7: 'T33',
  A10: 'T17',
  A13: 'TLATE',
  G3: 'TLATE',
  G4: 'TLATE',
  G14: 'TLATE',
  B12: 'T38',
  B15: 'T31',
  B16: 'T31',
  B17: 'T38',
  B18: 'T32',
  B19: 'T34',
  B20: 'T34',
  B3: 'T34',
  G9: 'T34',
  G11: 'T34',
  C7: 'T35',
  C16: 'T35',
  C14: 'T35',
  C15: 'T35',
  B13: 'T36',
  E8: 'T36',
  E13: 'T36',
  H3: 'T37',
  H4: 'T37',
  E14: 'T29',
  F12: 'T30A',
};

const PACK_CANDIDATE_ROUTES = {
  'HOUSEKEEPING-GITIGNORE': 'SFOUND',
  'RECOVERY-SHARED-FOUNDATION': 'SFOUND',
  'RECOVERY-SHARED-PACKAGE': 'SFOUND',
  'RECOVERY-SHARED-TOOLS': 'SFOUND',
  'RECOVERY-SHARED-API': 'SAPI',
  'RECOVERY-SHARED-WEB': 'SWEB',
  'RECOVERY-SHARED-INTEGRATION': 'SINTEGRATION',
  'RECOVERY-SHARED-WORKER': 'SWORKER',
};

const LAWOS_PATHS = new Set([
  'docs/release/lawos-canonical-matter-reflection-tuw-plan.md',
  'package.json',
  'tools/migration/lawos-canonical-matter-reflection.mjs',
  'tools/migration/lawos-canonical-matter-reflection.spec.mjs',
]);

const CONDITIONAL_TRIGGERS = [
  trigger('D9', 'TRIGGER-D9-ADVANCED-SEARCH-ACTIVE'),
  trigger('H14', 'TRIGGER-H14-MICROSOFT-OIDC-ACTIVE'),
  trigger('B20', 'TRIGGER-B20-TRACK-CHANGES-ACTIVE'),
];

function bp(key, slug, title, mode, planTasks, tuwIds) {
  return { key, slug, title, mode, planTasks, tuwIds };
}

function trigger(unitId, triggerId) {
  return {
    unitId,
    triggerId,
    state: 'INACTIVE',
    approvalRef: null,
    rule: 'Execution and promotion are forbidden in v1; activation requires a separately registered manifest amendment with a nonempty approvalRef.',
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function fileDigest(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function decodePath(pathB64) {
  return Buffer.from(pathB64, 'base64').toString('utf8');
}

function unique(values) {
  return [...new Set(values)];
}

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

function sameSet(left, right) {
  return left.length === right.length && sorted(left).join('\0') === sorted(right).join('\0');
}

function riskFor(hunks, mode) {
  if (hunks.some((hunk) => hunk.risk === 'critical')) return 'C';
  if (hunks.some((hunk) => hunk.risk === 'high')) return 'H';
  if (['EXTERNAL_GATED', 'EXTERNAL_GATED_QA', 'FINAL_VALIDATION', 'FINAL_REVIEW'].includes(mode)) return 'C';
  return 'M';
}

function primaryMap() {
  const result = {};
  for (const [key, ids] of Object.entries(PRIMARY_GROUPS)) {
    for (const id of ids) {
      if (result[id]) throw new Error('duplicate primary TUW: ' + id);
      result[id] = key;
    }
  }
  return result;
}

function routeMap(primary) {
  return { ...primary, ...UNIT_ROUTE_OVERRIDES };
}

function packId(number) {
  return 'PACK-R14-' + String(number).padStart(2, '0');
}

function targetMigrationName(sourceName, targetOrdinal) {
  return String(targetOrdinal).padStart(4, '0') + sourceName.slice(4);
}

function focusedCommands(testPaths) {
  const unit = testPaths.filter((value) => !value.startsWith('tests/integration'));
  const integration = testPaths.filter((value) => value.startsWith('tests/integration'));
  const commands = [];
  if (unit.length) commands.push('pnpm test -- ' + unit.join(' '));
  if (integration.length) commands.push('pnpm test:integration -- ' + integration.join(' '));
  return commands;
}

function packReview(risk) {
  return {
    risk,
    requiredReviewer: risk === 'C' || risk === 'H' ? 'INDEPENDENT_CODEX' : 'AUTOMATED_DETERMINISTIC',
    humanApprovalRequired: false,
    claudeRequired: false,
    authorityRef: AUTHORITY_REF,
    invalidatedByPostReviewPush: true,
  };
}

export async function buildManifest(sourceDir) {
  if (!sourceDir) throw new Error('--source-dir is required for build');

  const classificationPath = path.join(sourceDir, 'classification.json');
  const ownershipPath = path.join(sourceDir, 'ownership.json');
  const unitsPath = path.join(sourceDir, 'units-117.json');
  const [classification, ownership, sourceUnits, ledger] = await Promise.all([
    readFile(classificationPath, 'utf8').then(JSON.parse),
    readFile(ownershipPath, 'utf8').then(JSON.parse),
    readFile(unitsPath, 'utf8').then(JSON.parse),
    readFile(LEDGER_PATH, 'utf8').then(JSON.parse),
  ]);

  const primary = primaryMap();
  const routed = routeMap(primary);
  const packByKey = {};
  const basePacks = BLUEPRINTS.map((blueprint, index) => {
    const id = packId(index + 4);
    const item = {
      ...blueprint,
      packId: id,
      sequence: index + 1,
      branch: 'feat/pack-r14-' + String(index + 4).padStart(2, '0') + '-' + blueprint.slug,
    };
    packByKey[blueprint.key] = item;
    return item;
  });

  const unitIds = ledger.units.map((unit) => unit.id);
  const sourceUnitIds = sourceUnits.units.map((unit) => unit.id);
  if (unitIds.length !== 117
    || sourceUnitIds.length !== 117
    || new Set(unitIds).size !== 117
    || new Set(sourceUnitIds).size !== 117
    || !sameSet(unitIds, sourceUnitIds)) {
    throw new Error('sealed source and active ledger must contain the same unique 117-ID set');
  }
  const unitIdSetSha256 = digest(sorted(unitIds));
  const unitById = Object.fromEntries(ledger.units.map((unit) => [unit.id, unit]));
  const primaryAssignments = sorted(unitIds).map((id) => ({
    unitId: id,
    primaryPackId: packByKey[primary[id]]?.packId ?? null,
  }));

  const hunkAssignments = ownership.hunks.map((hunk) => {
    const decoded = decodePath(hunk.pathB64);
    let disposition = 'PACK';
    let key;
    if (hunk.ownerType === 'quarantine') {
      disposition = 'QUARANTINE';
    } else if (hunk.ownerType === 'historical_base') {
      key = 'T7';
    } else if (hunk.ownerType === 'pack_candidate') {
      key = PACK_CANDIDATE_ROUTES[hunk.chosenOwner];
    } else if (hunk.ownerType === 'tuw') {
      key = hunk.chosenOwner === 'A14' && LAWOS_PATHS.has(decoded)
        ? 'T8'
        : routed[hunk.chosenOwner];
    }
    if (disposition === 'PACK' && !packByKey[key]) {
      throw new Error('unroutable hunk ' + hunk.ordinal + ' owner=' + hunk.chosenOwner);
    }
    return {
      ordinal: hunk.ordinal,
      pathB64: hunk.pathB64,
      hunkFingerprint: hunk.hunkFingerprint,
      sourceOwnerType: hunk.ownerType,
      sourceOwner: hunk.chosenOwner,
      candidateUnits: hunk.candidateUnits,
      risk: hunk.risk,
      disposition,
      packId: disposition === 'PACK' ? packByKey[key].packId : null,
    };
  });

  const hunksByPath = Map.groupBy(hunkAssignments, (item) => item.pathB64);
  const pathDispositions = ownership.paths.map((entry) => {
    const hunks = hunksByPath.get(entry.pathB64) ?? [];
    const packIds = sorted(unique(hunks.map((hunk) => hunk.packId).filter(Boolean)));
    const dispositions = unique(hunks.map((hunk) => hunk.disposition));
    return {
      pathB64: entry.pathB64,
      gitState: entry.gitState,
      classification: entry.classification,
      sharedFile: entry.sharedFile,
      sourcePathRouting: entry.pathRouting,
      disposition: dispositions.includes('QUARANTINE') ? 'QUARANTINE' : 'PACK',
      packIds,
      hunkOrdinals: hunks.map((hunk) => hunk.ordinal),
    };
  });

  const migrationDrafts = ownership.migrations.map((migration) => {
    const key = routed[migration.owner];
    if (!packByKey[key]) throw new Error('unroutable migration owner ' + migration.owner);
    return { ...migration, packId: packByKey[key].packId };
  }).sort((a, b) => {
    const packDelta = basePacks.find((pack) => pack.packId === a.packId).sequence
      - basePacks.find((pack) => pack.packId === b.packId).sequence;
    return packDelta || a.ordinal - b.ordinal;
  });

  const migrations = migrationDrafts.map((migration, index) => {
    const targetOrdinal = index + 94;
    return {
      sourceOrdinal: migration.ordinal,
      sourcePathB64: migration.pathB64,
      sourceName: migration.name,
      targetOrdinal,
      targetName: targetMigrationName(migration.name, targetOrdinal),
      targetPredecessor: targetOrdinal - 1,
      ownerUnitId: migration.owner,
      packId: migration.packId,
      renumberRequired: migration.ordinal !== targetOrdinal,
      hasDownMarker: migration.hasDownMarker,
      forwardVerification: migration.forwardVerification,
      downVerification: migration.downVerification,
      referenceUpdateListB64: migration.referenceUpdateListB64,
    };
  });

  const routePackByUnit = Object.fromEntries(unitIds.map((id) => [id, packByKey[routed[id]].packId]));
  const predecessors = Object.fromEntries(basePacks.map((pack) => [pack.packId, new Set([REGISTRATION_PACK_ID])]));

  for (const unit of ledger.units) {
    const targetPack = routePackByUnit[unit.id];
    for (const dependency of unit.dependencies) {
      if (dependency.kind !== 'hard' || !routePackByUnit[dependency.id]) continue;
      const sourcePack = routePackByUnit[dependency.id];
      if (sourcePack !== targetPack) predecessors[targetPack].add(sourcePack);
    }
  }

  const idFor = (key) => packByKey[key].packId;
  predecessors[idFor('T8')].add(idFor('T10')).add(idFor('T12'));
  for (const key of ['T7', 'T8', 'T9', 'T10', 'T11', 'T12']) {
    predecessors[idFor('T13')].add(idFor(key));
  }
  for (const pack of basePacks) {
    if (!['T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13'].includes(pack.key)
      && !pack.key.startsWith('S') && !pack.key.startsWith('V')) {
      predecessors[pack.packId].add(idFor('T13'));
    }
  }

  const migrationPackIds = unique(migrations.map((migration) => migration.packId));
  for (let index = 1; index < migrationPackIds.length; index += 1) {
    predecessors[migrationPackIds[index]].add(migrationPackIds[index - 1]);
  }

  const rowAndUnitPacks = basePacks
    .filter((pack) => !pack.key.startsWith('S') && !pack.key.startsWith('V'))
    .map((pack) => pack.packId);
  for (const predecessor of rowAndUnitPacks) predecessors[idFor('SFOUND')].add(predecessor);
  predecessors[idFor('SAPI')].add(idFor('SFOUND'));
  predecessors[idFor('SWEB')].add(idFor('SAPI'));
  predecessors[idFor('SINTEGRATION')].add(idFor('SWEB'));
  predecessors[idFor('SWORKER')].add(idFor('SINTEGRATION'));
  predecessors[idFor('V39')].add(idFor('SWORKER'));
  for (const key of ['V40', 'V41', 'V42']) predecessors[idFor(key)].add(idFor('V39'));
  for (const key of ['V40', 'V41', 'V42']) predecessors[idFor('V43')].add(idFor(key));
  predecessors[idFor('VF')].add(idFor('V43'));

  const packHunks = Map.groupBy(hunkAssignments.filter((item) => item.packId), (item) => item.packId);
  const packMigrations = Map.groupBy(migrations, (item) => item.packId);
  const pathByB64 = Object.fromEntries(ownership.paths.map((item) => [item.pathB64, item]));

  const packs = basePacks.map((pack) => {
    const hunks = packHunks.get(pack.packId) ?? [];
    const pathB64s = sorted(unique(hunks.map((hunk) => hunk.pathB64)));
    const create = [];
    const modify = [];
    for (const pathB64 of pathB64s) {
      const state = pathByB64[pathB64].gitState;
      const decoded = decodePath(pathB64);
      (state === 'untracked' ? create : modify).push(decoded);
    }
    const testPaths = sorted(unique(hunks.flatMap((hunk) => {
      const source = ownership.hunks[hunk.ordinal - 1];
      return (source.testAnchorsB64 ?? []).map(decodePath);
    })));
    const risk = riskFor(hunks, pack.mode);
    const primaryTuwIds = pack.tuwIds.filter((id) => primary[id] === pack.key);
    const supportTuwIds = pack.tuwIds.filter((id) => id.startsWith('RECOVERY-'));
    const secondaryTuwIds = pack.tuwIds.filter((id) => unitById[id] && !primaryTuwIds.includes(id));
    const packMigrationRows = packMigrations.get(pack.packId) ?? [];
    const commands = [
      'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --check',
      ...focusedCommands(testPaths),
      ...COMMON_COMMANDS,
    ];
    if (packMigrationRows.length) {
      commands.push(
        'pnpm db:migrate',
        'pnpm db:rollback',
        'pnpm db:migrate',
        'pnpm db:seed',
        'pnpm test:integration',
      );
    }
    if (pathB64s.some((value) => decodePath(value).startsWith('workers/ingestion/'))) {
      commands.push(
        "python3 -m pip install -e 'workers/ingestion[test]'",
        'python3 -m pytest workers/ingestion/tests',
      );
    }
    return {
      packId: pack.packId,
      sequence: pack.sequence,
      branch: pack.branch,
      title: pack.title,
      objective: pack.title + ' under exact hunk, dependency, evidence, and claim boundaries.',
      mode: pack.mode,
      planTasks: pack.planTasks,
      tuwIds: pack.tuwIds,
      primaryTuwIds,
      secondaryTuwIds,
      supportTuwIds,
      scopeCountException: null,
      predecessorPackIds: sorted(predecessors[pack.packId]),
      review: packReview(risk),
      files: {
        create: sorted(create),
        modify: sorted(modify),
        sharedPathHunkSelectors: Object.fromEntries(pathB64s
          .filter((pathB64) => pathByB64[pathB64].sharedFile)
          .map((pathB64) => [
            decodePath(pathB64),
            hunks.filter((hunk) => hunk.pathB64 === pathB64).map((hunk) => hunk.hunkFingerprint),
          ])),
        notModify: GLOBAL_NOT_MODIFY,
      },
      hunkOrdinals: hunks.map((hunk) => hunk.ordinal),
      migrationSourceOrdinals: packMigrationRows.map((migration) => migration.sourceOrdinal),
      migrationTargetOrdinals: packMigrationRows.map((migration) => migration.targetOrdinal),
      verification: {
        focusedTestPaths: testPaths,
        commands: unique(commands),
        failCountRequired: 0,
        skipCountRequired: 0,
        exactHeadRequired: true,
      },
      evidenceTarget: '.omo/evidence/ulw/amic-vault-117-recovery-20260716/'
        + 'G003-g03-complete-tasks-6a-4-5-and-6b-aft/a1/' + pack.packId + '.txt',
      repoSafeReceipt: 'docs/execution/recovery-receipts/' + pack.packId + '.json',
      stopConditions: [
        'exact predecessor or hunk fingerprint mismatch',
        'unlisted path, hunk, migration, dependency, or package change',
        'missing, failing, stale, skipped, or post-push-invalidated technical gate',
        'permission, audit, privacy, policy, source, trigger, or external authority uncertainty',
        'private evidence or sensitive content would enter Git',
        'the same failure repeats three times',
      ],
    };
  });

  const payload = {
    manifestId: MANIFEST_ID,
    generatedAt: GENERATED_AT,
    baseCommit: BASE_COMMIT,
    originalPreservation: {
      tree: ORIGINAL_TREE,
      trackedOverlaySha256: ORIGINAL_OVERLAY_SHA256,
      counts: { staged: 0, trackedModified: 509, expandedUntracked: 384, uniqueDirty: 893 },
    },
    sourceInputs: {
      classification: {
        sha256: await fileDigest(classificationPath),
        entries: classification.counts.entries,
        dirty: classification.counts.dirty,
        ignored: classification.counts.ignored,
      },
      ownership: {
        sha256: await fileDigest(ownershipPath),
        paths: ownership.paths.length,
        hunks: ownership.hunks.length,
        migrations: ownership.migrations.length,
      },
      units117: {
        sha256: await fileDigest(unitsPath),
        units: sourceUnits.units.length,
        idSetSha256: unitIdSetSha256,
      },
      activeLedger: {
        sha256: await fileDigest(LEDGER_PATH),
        units: ledger.units.length,
        idSetSha256: unitIdSetSha256,
        phase: ledger.phase,
      },
    },
    governance: {
      authorityRef: AUTHORITY_REF,
      authorityEvidence: '.omo/evidence/ulw/amic-vault-117-recovery-20260716/'
        + 'G003-g03-complete-tasks-6a-4-5-and-6b-aft/a1/task-6b-technical-gates-authority-receipt.json',
      currentRulePrecedence: 'Direct operator authority for this aggregate goal supersedes legacy Claude, human-approval, and no-self-merge clauses only; all technical, security, scope, evidence, and stop gates remain mandatory.',
      reviewPolicy: 'Exact-head automated and deterministic gates plus independent Codex review for Risk C/H.',
      mergePolicy: 'Codex may mechanically merge only after all exact-head gates pass; a push invalidates review and gates.',
      docsPackageReadOnly: true,
      privateEvidenceNoDereference: true,
      claimBoundary: 'Manifest registration is not product implementation, migration execution, deployment, external release, or go-live.',
    },
    registrationPack: {
      packId: REGISTRATION_PACK_ID,
      branch: REGISTRATION_BRANCH,
      tuwIds: REGISTRATION_TUW_IDS,
      allowedCreate: REGISTRATION_ALLOWED_CREATE,
      allowedModify: REGISTRATION_ALLOWED_MODIFY,
    },
    unitUniverse: {
      unitIds: sorted(unitIds),
      primaryAssignments,
      hunkExecutionPackByUnit: Object.fromEntries(sorted(unitIds).map((id) => [id, routePackByUnit[id]])),
      dependencies: Object.fromEntries(sorted(unitIds).map((id) => [
        id,
        unitById[id].dependencies.map((dependency) => ({
          id: dependency.id,
          kind: dependency.kind,
          sourceText: dependency.sourceText,
          resolutionRef: dependency.resolutionRef,
        })),
      ])),
    },
    packs,
    hunkAssignments,
    pathDispositions,
    migrations,
    conditionalTriggers: CONDITIONAL_TRIGGERS,
    quarantines: {
      hunkOrdinals: hunkAssignments.filter((item) => item.disposition === 'QUARANTINE').map((item) => item.ordinal),
      pathB64s: pathDispositions.filter((item) => item.disposition === 'QUARANTINE').map((item) => item.pathB64),
      rule: 'Quarantined entries never enter any PACK without a separately registered manifest amendment.',
    },
    prohibitions: [
      'no docs/package change',
      'no private evidence publication or dereference',
      'no unassigned path or hunk staging',
      'no migration execution by manifest registration',
      'no product completion inherited from bootstrap or historical evidence',
      'no conditional unit execution without active written trigger',
      'no external operation without separately scoped authority',
      'no skipped or reduced technical gate',
      'no deployment, release, or go-live claim from this manifest',
    ],
  };

  return {
    schemaVersion: 'post-r14-recovery-pack-manifest/v1',
    status: 'AUTHORIZED_TECHNICAL_GATES_ONLY',
    payloadSha256: digest(payload),
    payload,
  };
}

export function validateManifest(manifest) {
  const errors = [];
  const fail = (code, detail) => errors.push({ code, detail });
  if (manifest.schemaVersion !== 'post-r14-recovery-pack-manifest/v1') fail('SCHEMA_VERSION', manifest.schemaVersion);
  if (manifest.status !== 'AUTHORIZED_TECHNICAL_GATES_ONLY') fail('STATUS', manifest.status);
  if (manifest.payloadSha256 !== digest(manifest.payload)) fail('PAYLOAD_HASH', 'payload hash mismatch');

  const payload = manifest.payload ?? {};
  if (payload.manifestId !== MANIFEST_ID) fail('MANIFEST_ID', payload.manifestId);
  if (payload.baseCommit !== BASE_COMMIT) fail('BASE_COMMIT', payload.baseCommit);
  if (payload.originalPreservation?.tree !== ORIGINAL_TREE
    || payload.originalPreservation?.trackedOverlaySha256 !== ORIGINAL_OVERLAY_SHA256) {
    fail('PRESERVATION_ANCHOR', 'original tree or overlay digest drift');
  }

  const packs = payload.packs ?? [];
  const packIds = packs.map((pack) => pack.packId);
  const branches = packs.map((pack) => pack.branch);
  const expectedPackIds = Array.from({ length: 43 }, (_, index) => packId(index + 4));
  const expectedSequences = Array.from({ length: 43 }, (_, index) => index + 1);
  if (!sameSet(packIds, expectedPackIds)) fail('PACK_ID_SET', packIds.length);
  if (!sameSet(packs.map((pack) => pack.sequence), expectedSequences)) {
    fail('PACK_SEQUENCE_SET', packs.length);
  }
  if (new Set(packIds).size !== packIds.length) fail('PACK_ID_DUPLICATE', 'duplicate PACK ID');
  if (new Set(branches).size !== branches.length) fail('BRANCH_DUPLICATE', 'duplicate branch');
  const packById = Object.fromEntries(packs.map((pack) => [pack.packId, pack]));
  for (const pack of packs) {
    if (!/^PACK-R14-\d{2}$/.test(pack.packId)) fail('PACK_ID_FORMAT', pack.packId);
    if (!/^feat\/pack-r14-\d{2}-[a-z0-9-]+$/.test(pack.branch)) fail('BRANCH_FORMAT', pack.branch);
    if (!pack.branch.startsWith('feat/pack-r14-' + pack.packId.slice(-2) + '-')) {
      fail('BRANCH_PACK_MISMATCH', pack.packId);
    }
    if (pack.sequence !== Number(pack.packId.slice(-2)) - 3) fail('PACK_SEQUENCE', pack.packId);
    if ((pack.tuwIds.length < 3 || pack.tuwIds.length > 8) && !pack.scopeCountException?.authorityRef) {
      fail('PACK_SIZE', pack.packId + ':' + pack.tuwIds.length);
    }
    if (new Set(pack.tuwIds).size !== pack.tuwIds.length) fail('PACK_TUW_DUPLICATE', pack.packId);
    const partition = [...pack.primaryTuwIds, ...pack.secondaryTuwIds, ...pack.supportTuwIds];
    if (new Set(partition).size !== partition.length || !sameSet(partition, pack.tuwIds)) {
      fail('PACK_TUW_PARTITION', pack.packId);
    }
    const expectedReviewer = ['C', 'H'].includes(pack.review?.risk)
      ? 'INDEPENDENT_CODEX'
      : 'AUTOMATED_DETERMINISTIC';
    if (pack.review?.requiredReviewer !== expectedReviewer) fail('RISK_C_REVIEWER', pack.packId);
    if (pack.review?.humanApprovalRequired !== false || pack.review?.claudeRequired !== false) {
      fail('REVIEW_AUTHORITY_DRIFT', pack.packId);
    }
    if (pack.review?.authorityRef !== AUTHORITY_REF || pack.review?.invalidatedByPostReviewPush !== true) {
      fail('REVIEW_POLICY', pack.packId);
    }
    if (new Set(pack.predecessorPackIds).size !== pack.predecessorPackIds.length
      || !pack.predecessorPackIds.includes(REGISTRATION_PACK_ID)) {
      fail('PREDECESSOR_SET', pack.packId);
    }
    for (const predecessor of pack.predecessorPackIds) {
      if (predecessor === REGISTRATION_PACK_ID) continue;
      if (!packById[predecessor]) fail('UNKNOWN_PREDECESSOR', pack.packId + ':' + predecessor);
      else if (packById[predecessor].sequence >= pack.sequence) fail('PACK_ORDER', predecessor + '->' + pack.packId);
    }
    const requiredCommands = [
      'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --check',
      ...COMMON_COMMANDS,
    ];
    if (!requiredCommands.every((command) => pack.verification?.commands.includes(command))
      || pack.verification?.failCountRequired !== 0
      || pack.verification?.skipCountRequired !== 0
      || pack.verification?.exactHeadRequired !== true) {
      fail('PACK_VERIFICATION', pack.packId);
    }
    if (pack.evidenceTarget?.endsWith('/' + pack.packId + '.txt') !== true
      || pack.repoSafeReceipt !== 'docs/execution/recovery-receipts/' + pack.packId + '.json'
      || !Array.isArray(pack.stopConditions)
      || pack.stopConditions.length < 6) {
      fail('PACK_EVIDENCE_CONTRACT', pack.packId);
    }
  }

  const unitIds = payload.unitUniverse?.unitIds ?? [];
  const assignments = payload.unitUniverse?.primaryAssignments ?? [];
  if (unitIds.length !== 117 || new Set(unitIds).size !== 117) fail('UNIT_UNIVERSE', unitIds.length);
  const unitIdSetSha256 = digest(sorted(unitIds));
  if (payload.sourceInputs?.units117?.idSetSha256 !== unitIdSetSha256
    || payload.sourceInputs?.activeLedger?.idSetSha256 !== unitIdSetSha256) {
    fail('UNIT_ID_SET_HASH', 'sealed source and active ledger ID sets differ');
  }
  if (assignments.length !== 117 || new Set(assignments.map((item) => item.unitId)).size !== 117) {
    fail('PRIMARY_ASSIGNMENT_COVERAGE', assignments.length);
  }
  if (sorted(assignments.map((item) => item.unitId)).join('\0') !== sorted(unitIds).join('\0')) {
    fail('PRIMARY_ASSIGNMENT_SET', 'primary set mismatch');
  }
  for (const assignment of assignments) {
    const pack = packById[assignment.primaryPackId];
    if (!pack || !pack.primaryTuwIds.includes(assignment.unitId)) {
      fail('PRIMARY_ASSIGNMENT_PACK', assignment.unitId);
    }
  }

  const executionPackByUnit = payload.unitUniverse?.hunkExecutionPackByUnit ?? {};
  if (!sameSet(Object.keys(executionPackByUnit), unitIds)) fail('EXECUTION_ROUTE_SET', 'unit keys mismatch');
  for (const id of unitIds) {
    const pack = packById[executionPackByUnit[id]];
    if (!pack || !pack.tuwIds.includes(id)) fail('EXECUTION_ROUTE_PACK', id);
  }

  const dependencies = payload.unitUniverse?.dependencies ?? {};
  if (!sameSet(Object.keys(dependencies), unitIds)) fail('DEPENDENCY_SET', 'unit keys mismatch');
  for (const id of unitIds) {
    if (!Array.isArray(dependencies[id])) fail('DEPENDENCY_MISSING', id);
    for (const dependency of dependencies[id] ?? []) {
      if (!['hard', 'soft', 'conditional', 'external'].includes(dependency.kind)) {
        fail('DEPENDENCY_KIND', id + ':' + dependency.kind);
      }
      if (!/^(?:[A-H]\d{1,2}|CAP-[A-Z0-9-]+)$/.test(dependency.id)) {
        fail('DEPENDENCY_ID', id + ':' + dependency.id);
      }
      if (dependency.kind === 'hard' && executionPackByUnit[dependency.id]) {
        const dependentPack = packById[executionPackByUnit[id]];
        const dependencyPackId = executionPackByUnit[dependency.id];
        if (dependentPack?.packId !== dependencyPackId
          && !dependentPack?.predecessorPackIds.includes(dependencyPackId)) {
          fail('HARD_DEPENDENCY_PREDECESSOR', dependency.id + '->' + id);
        }
      }
    }
  }

  const hunks = payload.hunkAssignments ?? [];
  if (hunks.length !== 4801) fail('HUNK_COUNT', hunks.length);
  if (!sameSet(hunks.map((item) => item.ordinal), Array.from({ length: 4801 }, (_, index) => index + 1))) {
    fail('HUNK_ORDINAL_SET', 'not 1-4801');
  }
  if (new Set(hunks.map((item) => item.ordinal)).size !== hunks.length) fail('HUNK_ORDINAL_DUPLICATE', 'duplicate');
  if (new Set(hunks.map((item) => item.hunkFingerprint)).size !== hunks.length) fail('HUNK_FINGERPRINT_DUPLICATE', 'duplicate');
  const hunkByOrdinal = Object.fromEntries(hunks.map((hunk) => [hunk.ordinal, hunk]));
  const listedHunks = new Map();
  for (const pack of packs) {
    for (const ordinal of pack.hunkOrdinals) {
      if (!hunkByOrdinal[ordinal]) fail('PACK_UNKNOWN_HUNK', pack.packId + ':' + ordinal);
      if (listedHunks.has(ordinal)) fail('HUNK_MULTI_PACK', String(ordinal));
      listedHunks.set(ordinal, pack.packId);
    }
  }
  for (const hunk of hunks) {
    if (hunk.disposition === 'PACK') {
      if (!packById[hunk.packId]) fail('HUNK_UNKNOWN_PACK', String(hunk.ordinal));
      if (listedHunks.get(hunk.ordinal) !== hunk.packId) fail('HUNK_PACK_MISMATCH', String(hunk.ordinal));
    } else if (hunk.disposition !== 'QUARANTINE' || hunk.packId !== null) {
      fail('HUNK_DISPOSITION', String(hunk.ordinal));
    }
  }

  const paths = payload.pathDispositions ?? [];
  if (paths.length !== 893 || new Set(paths.map((item) => item.pathB64)).size !== 893) {
    fail('PATH_COVERAGE', paths.length);
  }
  const hunksByPath = Map.groupBy(hunks, (item) => item.pathB64);
  const pathByB64 = Object.fromEntries(paths.map((entry) => [entry.pathB64, entry]));
  if (!sameSet(unique(hunks.map((item) => item.pathB64)), paths.map((entry) => entry.pathB64))) {
    fail('HUNK_PATH_SET', 'hunk and path universes differ');
  }
  for (const entry of paths) {
    const decoded = decodePath(entry.pathB64);
    if (decoded.startsWith('docs/package/') || decoded.startsWith('.omo/')) fail('FORBIDDEN_PATH', decoded);
    if (entry.gitState === 'untracked' && entry.packIds.length > 1) fail('UNTRACKED_MULTI_PACK', decoded);
    const pathHunks = hunksByPath.get(entry.pathB64) ?? [];
    const expectedPackIdsForPath = sorted(unique(pathHunks.map((hunk) => hunk.packId).filter(Boolean)));
    const expectedDisposition = pathHunks.some((hunk) => hunk.disposition === 'QUARANTINE')
      ? 'QUARANTINE'
      : 'PACK';
    if (!sameSet(entry.hunkOrdinals, pathHunks.map((hunk) => hunk.ordinal))
      || !sameSet(entry.packIds, expectedPackIdsForPath)
      || entry.disposition !== expectedDisposition) {
      fail('PATH_REVERSE_MAPPING', decoded);
    }
  }
  for (const pack of packs) {
    const packHunks = hunks.filter((hunk) => hunk.packId === pack.packId);
    const expectedPaths = sorted(unique(packHunks.map((hunk) => hunk.pathB64)));
    const listedPaths = [...pack.files.create, ...pack.files.modify]
      .map((value) => Buffer.from(value, 'utf8').toString('base64'));
    if (!sameSet(listedPaths, expectedPaths)) fail('PACK_FILE_SET', pack.packId);
    if (new Set(listedPaths).size !== listedPaths.length) fail('PACK_FILE_DUPLICATE', pack.packId);
    for (const file of pack.files.create) {
      const row = pathByB64[Buffer.from(file, 'utf8').toString('base64')];
      if (row?.gitState !== 'untracked') fail('PACK_CREATE_STATE', pack.packId + ':' + file);
    }
    for (const file of pack.files.modify) {
      const row = pathByB64[Buffer.from(file, 'utf8').toString('base64')];
      if (!row || row.gitState === 'untracked') fail('PACK_MODIFY_STATE', pack.packId + ':' + file);
    }
    const expectedShared = Object.fromEntries(expectedPaths
      .filter((pathB64) => pathByB64[pathB64]?.sharedFile)
      .map((pathB64) => [
        decodePath(pathB64),
        packHunks.filter((hunk) => hunk.pathB64 === pathB64).map((hunk) => hunk.hunkFingerprint),
      ]));
    if (digest(pack.files.sharedPathHunkSelectors) !== digest(expectedShared)) {
      fail('SHARED_HUNK_SELECTOR', pack.packId);
    }
  }

  const migrations = payload.migrations ?? [];
  const sourceOrdinals = migrations.map((item) => item.sourceOrdinal);
  const targetOrdinals = migrations.map((item) => item.targetOrdinal);
  if (migrations.length !== 86) fail('MIGRATION_COUNT', migrations.length);
  if ([...sourceOrdinals].sort((a, b) => a - b).join(',') !== Array.from({ length: 86 }, (_, index) => index + 94).join(',')) {
    fail('MIGRATION_SOURCE_SET', 'not 94-179');
  }
  if ([...targetOrdinals].sort((a, b) => a - b).join(',') !== Array.from({ length: 86 }, (_, index) => index + 94).join(',')) {
    fail('MIGRATION_TARGET_SET', 'not 94-179');
  }
  let priorSequence = -1;
  for (const [index, migration] of migrations.entries()) {
    const pack = packById[migration.packId];
    if (!pack) fail('MIGRATION_UNKNOWN_PACK', migration.sourceName);
    else {
      if (pack.sequence < priorSequence) fail('MIGRATION_PACK_ORDER', migration.sourceName);
      priorSequence = pack.sequence;
    }
    if (!migration.hasDownMarker) fail('MIGRATION_DOWN', migration.sourceName);
    if (migration.targetOrdinal !== index + 94 || migration.targetPredecessor !== migration.targetOrdinal - 1) {
      fail('MIGRATION_CHAIN', migration.sourceName);
    }
    if (migration.targetName !== targetMigrationName(migration.sourceName, migration.targetOrdinal)) {
      fail('MIGRATION_TARGET_NAME', migration.targetName);
    }
    if (executionPackByUnit[migration.ownerUnitId] !== migration.packId) {
      fail('MIGRATION_UNIT_PACK', migration.sourceName);
    }
    if (!pathByB64[migration.sourcePathB64]?.packIds.includes(migration.packId)) {
      fail('MIGRATION_PATH_PACK', migration.sourceName);
    }
  }
  for (const pack of packs) {
    const packMigrations = migrations.filter((migration) => migration.packId === pack.packId);
    if (!sameSet(pack.migrationSourceOrdinals, packMigrations.map((migration) => migration.sourceOrdinal))
      || !sameSet(pack.migrationTargetOrdinals, packMigrations.map((migration) => migration.targetOrdinal))) {
      fail('PACK_MIGRATION_MAPPING', pack.packId);
    }
    if (packMigrations.length) {
      const requiredDbCommands = [
        'pnpm db:migrate',
        'pnpm db:rollback',
        'pnpm db:seed',
        'pnpm test:integration',
      ];
      if (!requiredDbCommands.every((command) => pack.verification.commands.includes(command))) {
        fail('PACK_MIGRATION_VERIFICATION', pack.packId);
      }
    }
  }

  const triggers = payload.conditionalTriggers ?? [];
  if (triggers.length !== 3 || new Set(triggers.map((item) => item.unitId)).size !== 3) {
    fail('TRIGGER_SET', triggers.length);
  }
  for (const id of ['D9', 'H14', 'B20']) {
    const triggerRow = triggers.find((item) => item.unitId === id);
    if (!triggerRow) fail('TRIGGER_MISSING', id);
    else {
      if (triggerRow.state !== 'INACTIVE') fail('TRIGGER_STATE', id);
      if (triggerRow.state === 'ACTIVE' && !triggerRow.approvalRef) fail('TRIGGER_APPROVAL', id);
      if (triggerRow.state === 'INACTIVE' && triggerRow.approvalRef !== null) fail('TRIGGER_INACTIVE_REF', id);
      if (triggerRow.triggerId !== CONDITIONAL_TRIGGERS.find((row) => row.unitId === id).triggerId) {
        fail('TRIGGER_ID', id);
      }
    }
  }
  if (payload.governance?.authorityRef !== AUTHORITY_REF) fail('AUTHORITY_REF', payload.governance?.authorityRef);
  if (payload.governance?.docsPackageReadOnly !== true
    || payload.governance?.privateEvidenceNoDereference !== true) {
    fail('GOVERNANCE_BOUNDARY', 'read-only or private-evidence boundary drift');
  }
  const registrationPack = payload.registrationPack ?? {};
  if (registrationPack.packId !== REGISTRATION_PACK_ID
    || registrationPack.branch !== REGISTRATION_BRANCH
    || !sameSet(registrationPack.tuwIds ?? [], REGISTRATION_TUW_IDS)
    || !sameSet(registrationPack.allowedCreate ?? [], REGISTRATION_ALLOWED_CREATE)
    || !sameSet(registrationPack.allowedModify ?? [], REGISTRATION_ALLOWED_MODIFY)) {
    fail('REGISTRATION_PACK', 'registration contract drift');
  }
  const sourceInputs = payload.sourceInputs ?? {};
  for (const [key, expectedHash] of Object.entries(EXPECTED_SOURCE_HASHES)) {
    if (sourceInputs[key]?.sha256 !== expectedHash) fail('SOURCE_HASH', key);
  }
  if (sourceInputs.classification?.entries !== 57066
    || sourceInputs.classification?.dirty !== 893
    || sourceInputs.classification?.ignored !== 56173
    || sourceInputs.units117?.units !== 117
    || sourceInputs.activeLedger?.units !== 117
    || sourceInputs.activeLedger?.phase !== 'BOOTSTRAP_IMPORT'
    || sourceInputs.ownership?.paths !== 893
    || sourceInputs.ownership?.hunks !== 4801
    || sourceInputs.ownership?.migrations !== 86) {
    fail('SOURCE_COUNTS', 'ownership counts');
  }
  const expectedQuarantineHunks = hunks
    .filter((item) => item.disposition === 'QUARANTINE')
    .map((item) => item.ordinal);
  const expectedQuarantinePaths = paths
    .filter((item) => item.disposition === 'QUARANTINE')
    .map((item) => item.pathB64);
  if (!sameSet(payload.quarantines?.hunkOrdinals ?? [], expectedQuarantineHunks)
    || !sameSet(payload.quarantines?.pathB64s ?? [], expectedQuarantinePaths)) {
    fail('QUARANTINE_MAPPING', 'quarantine reverse mapping drift');
  }
  return { ok: errors.length === 0, errors };
}

export function renderMarkdown(manifest) {
  const payload = manifest.payload;
  const renumbered = payload.migrations.filter((item) => item.renumberRequired).length;
  const lines = [
    '# Post-R14 Recovery PACK Manifest',
    '',
    'Status: AUTHORIZED_TECHNICAL_GATES_ONLY',
    '',
    '- Manifest: ' + payload.manifestId,
    '- Payload SHA-256: ' + manifest.payloadSha256,
    '- Registration PACK: ' + payload.registrationPack.packId,
    '- Registration branch: ' + payload.registrationPack.branch,
    '- Exact base: ' + payload.baseCommit,
    '- Authority: ' + payload.governance.authorityRef,
    '- Primary TUW coverage: 117/117',
    '- Dirty-path coverage: 893/893',
    '- Ownership-record coverage: 4801/4801',
    '- Migration coverage: 86/86; renumbered in dependency/PACK order: ' + renumbered,
    '',
    'This manifest is an execution authorization map only. It is not product implementation,',
    'migration execution, deployment, external release, or go-live evidence.',
    '',
    '## PACK sequence',
    '',
    '| Seq | PACK | Branch | Mode | TUWs | Primary | Risk |',
    '|---:|---|---|---|---:|---:|---|',
  ];
  for (const pack of payload.packs) {
    lines.push('| ' + pack.sequence + ' | ' + pack.packId + ' | ' + pack.branch + ' | '
      + pack.mode + ' | ' + pack.tuwIds.length + ' | ' + pack.primaryTuwIds.length
      + ' | ' + pack.review.risk + ' |');
  }
  lines.push(
    '',
    '## Migration decision',
    '',
    'The dirty overlay migration filenames are not mergeable in their existing feature order:',
    'source ordinal 0094 begins with H11 while its hard C11 dependency is later. The manifest',
    'therefore preserves all 86 source files by hash/owner but assigns target ordinals 0094-0179',
    'in dependency-valid PACK order. Each migration lands with its execution PACK, its down path,',
    'reference updates, fresh database up/down/up proof, and full integration proof.',
    '',
    '## Review and merge',
    '',
    'Risk C/H PACKs require independent Codex review plus every exact-head automated and',
    'deterministic gate. Claude and human approval waits are waived only by the recorded',
    'aggregate-goal authority. Any post-review push invalidates review and gates.',
    '',
    '## Global prohibitions',
    '',
  );
  for (const item of payload.prohibitions) lines.push('- ' + item);
  lines.push('');
  return lines.join('\n');
}

async function writeOutputs(manifest) {
  const json = JSON.stringify(manifest, null, 2) + '\n';
  const md = renderMarkdown(manifest);
  await Promise.all([writeFile(JSON_PATH, json), writeFile(MD_PATH, md)]);
  return { json, md };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const sourceDir = argValue('--source-dir');
  if (process.argv.includes('--build')) {
    const manifest = await buildManifest(sourceDir);
    const result = validateManifest(manifest);
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    await writeOutputs(manifest);
    console.log(JSON.stringify({
      ok: true,
      code: 'BUILD_OK',
      payloadSha256: manifest.payloadSha256,
      packs: manifest.payload.packs.length,
      units: manifest.payload.unitUniverse.unitIds.length,
      paths: manifest.payload.pathDispositions.length,
      hunks: manifest.payload.hunkAssignments.length,
      migrations: manifest.payload.migrations.length,
    }));
    return;
  }

  const manifest = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  const result = validateManifest(manifest);
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  if (process.argv.includes('--check') && sourceDir) {
    const rebuilt = await buildManifest(sourceDir);
    const expectedJson = JSON.stringify(rebuilt, null, 2) + '\n';
    const expectedMd = renderMarkdown(rebuilt);
    const [actualJson, actualMd] = await Promise.all([readFile(JSON_PATH, 'utf8'), readFile(MD_PATH, 'utf8')]);
    if (actualJson !== expectedJson || actualMd !== expectedMd) {
      console.error(JSON.stringify({ ok: false, code: 'CHECK_DRIFT', writes: 0 }));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({
    ok: true,
    code: 'CHECK_OK',
    payloadSha256: manifest.payloadSha256,
    packs: manifest.payload.packs.length,
    units: manifest.payload.unitUniverse.unitIds.length,
    paths: manifest.payload.pathDispositions.length,
    hunks: manifest.payload.hunkAssignments.length,
    migrations: manifest.payload.migrations.length,
    writes: 0,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
