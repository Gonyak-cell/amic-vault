#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JSON_PATH = path.join(ROOT, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json');
const MD_PATH = path.join(ROOT, 'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md');
const PACK_REGISTRY_PATH = path.join(ROOT, 'docs/execution/PACKS_R4_R14.md');
const DECISION_LEDGER_PATH = path.join(ROOT, 'docs/ledger/decision.md');
const LEDGER_PATH = path.join(ROOT, 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json');

const SCHEMA_VERSION = 'post-r14-recovery-pack-manifest/v2';
const MANIFEST_ID = 'POST-R14-RECOVERY-PACK-MANIFEST-V2';
const CANONICAL_PAYLOAD_SHA256 = '29234d987b46d10774f49bda9a74f8bac7c72e81a4ea0cf2001cbc60fb1a281e';
const TEST_ANCHOR_SOURCE_CONTRACT_SHA256 = 'b1d4ae82dceb1b337905f725167cef001007c18643be4d985f4d1909fbd99e20';
const HISTORICAL_BASE_SOURCE_CONTRACT_SHA256 = 'dbfeb6a1fd47052b65c15352ecef132062b643efc2f88e199d6681217fafa3e1';
const BASE_PATH_COLLISION_SOURCE_CONTRACT_SHA256 = '0a13126c84eb30f53095b4aae2ac0d530419d00fa56aa2a92b6901b7aa524467';
const AUTHORITY_REF = 'TASK6B-TECHNICAL-GATES-AUTHORITY-20260717';
const AMENDMENT_AUTHORITY_REF = 'DIRECT-OPERATOR-AGGREGATE-EXECUTION-20260717';
const REGISTRATION_PACK_ID = 'PACK-R14-03';
const REGISTRATION_BRANCH = 'feat/pack-r14-03-recovery-manifest';
const AMENDMENT_PACK_ID = 'PACK-R14-03-AMENDMENT-01';
const AMENDMENT_REGISTRY_HEADING = '## ' + AMENDMENT_PACK_ID + ' — Recovery manifest v2 correction';
const AMENDMENT_BRANCH = 'feat/pack-r14-03-recovery-manifest-v2';
const BASE_COMMIT = '5c722f8a4b1f0a4c99b41089664c98ad151db2b8';
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

const AMENDMENT_TUW_IDS = [
  'RECOVERY-MANIFEST-HISTORY-SOURCE-TUW-004',
  'RECOVERY-MANIFEST-CONTROL-PLANE-TUW-005',
  'RECOVERY-MANIFEST-AMENDMENT-VALIDATION-TUW-006',
];

const AMENDMENT_ALLOWED_CREATE = [];

const AMENDMENT_ALLOWED_MODIFY = [
  'docs/execution/PACKS_R4_R14.md',
  'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json',
  'docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md',
  'docs/ledger/decision.md',
  'docs/ledger/execution.md',
  'tools/execution/build-post-r14-recovery-pack-manifest.mjs',
  'tools/execution/build-post-r14-recovery-pack-manifest.spec.mjs',
];

const EXECUTION_LEDGER_PATH = 'docs/ledger/execution.md';
const FOCUSED_ASSERT_COMMAND = 'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --assert-focused-test ';
const FOCUSED_RUN_COMMAND = 'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --run-focused-test ';
const ISOLATED_POSTGRES_PORT_BASE = 55_432;
const ISOLATED_MINIO_PORT_BASE = 59_000;
const ISOLATED_INGESTION_PORT_BASE = 58_000;
const TRANSITION_CONTROL_PLANE_PATHS = [
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json',
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json',
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md',
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_TRANSITION_JOURNAL.json',
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

const BASE_COLLISION_SUPERSESSION_REFS = {
  'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md':
    'PACK-R14-02-117-ACTIVE-PLAN-POINTER-SUPERSEDES-LEGACY-110-POINTER',
  'tools/execution/build-tuw-status-ledger.mjs':
    'PACK-R14-02-117-CONTROL-PLANE-BUILDER-SUPERSEDES-LEGACY-110-BUILDER',
};

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
  bp('T8', 'lawos-reflection', 'Recover LawOS canonical reflection runner', 'CODE_RECOVERY', ['8'], ['A14', ...SUPPORT.lawos]),
  bp('T12', 'dependency-candidate-adjudication', 'Re-adjudicate dependency-bound candidates', 'READJUDICATION', ['12'], ['D1', 'F5', 'H8', 'A14', 'D2', 'D3', 'E2', 'D5']),
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

// Primary ownership remains unique, but a row can require fresh adjudication
// after later evidence, implementation, or authority work. Keep that journal
// contract explicit and ordered instead of deriving it from ownership.
const TRANSITION_GROUPS = {
  T9: ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'],
  T10: ['A5', 'A3', 'C3', 'B5', 'G2'],
  T11: ['A1', 'A2', 'A4', 'A6', 'A7', 'A10'],
  T12: ['D1', 'F5', 'H8', 'A14', 'D2', 'D3', 'E2', 'D5'],
  T14: ['F6', 'B2', 'B4', 'B6'],
  T15: ['C1', 'C2', 'C8', 'C9', 'C16'],
  T16: ['B1', 'D6', 'D8'],
  T17: ['A8', 'A9', 'A10', 'G1', 'G7'],
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
  T31: ['B15', 'B16'],
  T32: ['B18', 'B19', 'B20'],
  T33: ['A6', 'A7'],
  T34: ['B3', 'B19', 'B20', 'G9', 'G11'],
  T35: ['C7', 'C16', 'C14', 'C15', 'B13'],
  T36: ['E8', 'B13', 'E13'],
  T37: ['H3', 'H4'],
  T38: ['B12', 'B17'],
  TLATE: ['A13', 'G3', 'G4', 'G14'],
};

const NON_COMPLETE_TRANSITION_GROUPS = {
  T9: ['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'],
  T11: ['A6', 'A7', 'A10'],
  T15: ['C16'],
  T21: ['H14'],
  T28: ['D9'],
  T32: ['B19', 'B20'],
  T34: ['B20'],
  T35: ['B13'],
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

const NON_OVERLAY_SOURCES = [
  {
    sourceId: 'TASK7-RELEASE-HISTORY-19',
    packKey: 'T7',
    kind: 'GIT_COMMIT_RANGE',
    sourceBaseCommit: '804b47cd208ce6c889c8731cfa64765c983b2997',
    sourceEndCommit: 'aa50fbca8b86fab218a5055726352420bfddfe57',
    commits: [
      '55f61f0f168737692db288080a2a09b90f200c77',
      '1640d8e93a6a1bfa861b0c34bbaa0471c7489c95',
      'bcaab0bb66dae6af267f79c2431c4cab452e0b7d',
      'a2d61babf540410a15733eb2a138d5cc30bfc699',
      '2695342fd46739eecb247094e1648668a7edad12',
      'a96cd3c329ea7d04c496291b7b86477e361a7b71',
      '06dd1ea8b21adf29b2760b60d28d4cc90f4daca6',
      '56246dc6c4cde7587efa2ef30c523d887e126925',
      '1fb4ce4b060b6fbfe2511e9b1e16a0ecba242fbe',
      '02725551258e30b471d317d5fca6e638d5fbdf68',
      '6d7e2fb02b23e6a3debd13349132beb6b07abafa',
      '0fd646e08d67b5fcfbfd0490dc46c9237f95e7a4',
      '4cb7cccd309965427665eaf581f5c2d791210f38',
      'bc61fe63ed32d18490c5d6895b102e51315a724a',
      '91c84f4103157fea3f55def09e5acd419414dabc',
      'd2006aa3362c0eea17ab20da58ae19f8c18c18f5',
      '4dde267f8f56834f477d52a31ca4156aea85f358',
      'b86a2c3a40b517f7361db918980f25d9a29eb0cb',
      'aa50fbca8b86fab218a5055726352420bfddfe57',
    ],
    reconstructionMode: 'PRESERVE_COMMIT_SEQUENCE',
    pathActions: [
      { path: 'docs/release/matter-identity-production-closeout.md', action: 'CREATE' },
      { path: 'docs/release/matter-lambda-path-normalization-closeout.md', action: 'CREATE' },
      { path: 'docs/release/production-customer-document-import-execute-closeout.md', action: 'CREATE' },
      { path: 'docs/release/production-source-cutover-next-gate-plan.md', action: 'CREATE' },
      { path: 'docs/release/production-source-cutover-preflight-closeout.md', action: 'CREATE' },
    ],
    claimBoundary: 'Historical release evidence only; every statement must be classified historical, current, or non-claim before merge.',
  },
  {
    sourceId: 'TASK8-LAWOS-REFLECTION-0B39414',
    packKey: 'T8',
    kind: 'GIT_COMMIT',
    sourceBaseCommit: 'aa50fbca8b86fab218a5055726352420bfddfe57',
    sourceEndCommit: '0b39414d4de746597e8f3c6ff64f7c1989789135',
    commits: ['0b39414d4de746597e8f3c6ff64f7c1989789135'],
    reconstructionMode: 'PRESERVE_SINGLE_COMMIT_THEN_APPLY_OWNED_OVERLAY_HUNKS',
    pathActions: [
      { path: 'docs/release/lawos-canonical-matter-reflection-tuw-plan.md', action: 'CREATE' },
      { path: 'package.json', action: 'MODIFY' },
      { path: 'tools/migration/lawos-canonical-matter-reflection.mjs', action: 'CREATE' },
      { path: 'tools/migration/lawos-canonical-matter-reflection.spec.mjs', action: 'CREATE' },
    ],
    claimBoundary: 'Repo-local dry-run and fail-closed reflection only; no live target execution, deployment, release, or go-live claim.',
  },
];

const CONDITIONAL_TRIGGERS = [
  trigger('D9', 'TRIGGER-D9-ADVANCED-SEARCH-ACTIVE'),
  trigger('H14', 'TRIGGER-H14-MICROSOFT-OIDC-ACTIVE'),
  trigger('B20', 'TRIGGER-B20-TRACK-CHANGES-ACTIVE'),
];
const INACTIVE_TRIGGER_UNIT_IDS = new Set(
  CONDITIONAL_TRIGGERS.filter((row) => row.state === 'INACTIVE').map((row) => row.unitId),
);

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

function sameSequence(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function executableCommandText(command) {
  if (!command.startsWith("bash -c '") || !command.endsWith("'")) return command;
  return command.slice("bash -c '".length, -1).replaceAll("'\"'\"'", "'");
}

const FOCUSED_VITEST_ROUTES = [
  ['apps/api/', '@amic-vault/api'],
  ['apps/web/', '@amic-vault/web'],
  ['apps/desktop/', '@amic-vault/desktop'],
  ['packages/ai/', '@amic-vault/ai'],
  ['packages/domain/', '@amic-vault/domain'],
  ['packages/shared/', '@amic-vault/shared'],
];

const TEST_ANCHOR_ALIASES = {
  'tests/document-edit-bridge.spec.ts': 'apps/desktop/tests/document-edit-bridge.spec.ts',
  'tests/test_clause_tree.py': 'workers/ingestion/tests/test_clause_tree.py',
  'tests/test_contract_parser.py': 'workers/ingestion/tests/test_contract_parser.py',
  'tests/test_report_synthesis.py': 'workers/ingestion/tests/test_report_synthesis.py',
};

const PLANNED_ACCEPTANCE_TEST_GAPS = [
  {
    path: 'tests/integration/search-permission/search-email.spec.ts',
    ownerUnitId: 'D8',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#D8',
  },
  {
    path: 'apps/api/src/modules/dd/dd-ai-mapping.service.spec.ts',
    ownerUnitId: 'E12',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#E12',
  },
  {
    path: 'tests/integration/document-access/comparison-ai.spec.ts',
    ownerUnitId: 'B13',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#B13',
  },
  {
    path: 'tests/integration/document-access/email-egress-dlp.spec.ts',
    ownerUnitId: 'C14',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#C14',
  },
  {
    path: 'apps/api/src/modules/ai/features/ai-drafting.service.spec.ts',
    ownerUnitId: 'E13',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#E13',
  },
  {
    path: 'tests/integration/ai-drafting.spec.ts',
    ownerUnitId: 'E13',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#E13',
  },
  {
    path: 'tests/integration/redline.spec.ts',
    ownerUnitId: 'B19',
    sourceRef: 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md#B19',
  },
];

const TEST_ANCHOR_DISPOSITIONS = [
  'AVAILABLE_AT_BASE',
  'PROVIDED_BY_CURRENT_PACK',
  'PLANNED_CURRENT_PACK_CREATE',
  'PROVIDED_BY_PREDECESSOR_PACK',
  'DEFERRED_PROVIDER_PACK',
  'PLANNED_ACCEPTANCE_TEST_GAP',
  'BLOCKED_INACTIVE_TRIGGER',
  'NON_EXECUTABLE_ANCHOR',
];

let cachedBasePaths;

const STATIC_TEST_SKIP_PATTERN = /(?:\b(?:describe|it|test)\.(?:skip|todo|only|skipIf|todoIf|runIf|fails)\b|\.\s*fails\b|\b(?:xdescribe|xit|xtest)\s*\(|\b(?:describe|it|test)\s*\([^\n]*\{[^\n}]*(?:skip|todo|fails)\s*:\s*(?:true|['"])[^\n}]*\}|@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.(?:skip|xfail|importorskip)\s*\(|\bpytestmark\s*=|\bskip\s*:\s*true\b|\bfails\s*:)/;

function isVitestPath(value) {
  return /\.(?:spec|test)\.(?:js|jsx|ts|tsx)$/.test(value);
}

function isIntegrationSelector(value) {
  if (!value.startsWith('tests/integration')) return false;
  return value === 'tests/integration'
    || value.endsWith('.spec.ts')
    || !path.posix.basename(value).includes('.');
}

function isIntegrationDirectorySelector(value) {
  return isIntegrationSelector(value) && !value.endsWith('.spec.ts');
}

function testRunner(value) {
  if (isIntegrationSelector(value)) return 'INTEGRATION';
  if (FOCUSED_VITEST_ROUTES.some(([prefix]) => value.startsWith(prefix)) && isVitestPath(value)) {
    return 'WORKSPACE_VITEST';
  }
  if (isVitestPath(value)) return 'ROOT_VITEST';
  if (value.endsWith('.spec.mjs')) return 'NODE_TEST';
  if (/(^|\/)test_[^/]+\.py$/.test(value)) return 'PYTEST';
  return null;
}

function testCommandSelector(value) {
  const route = FOCUSED_VITEST_ROUTES.find(([prefix]) => value.startsWith(prefix));
  return route && isVitestPath(value) ? value.slice(route[0].length) : value;
}

function basePathSet() {
  if (cachedBasePaths) return cachedBasePaths;
  const result = gitResult(['ls-tree', '-r', '--name-only', BASE_COMMIT], ROOT);
  if (result.status !== 0) {
    throw new Error('cannot read exact base tree ' + BASE_COMMIT + ': ' + result.stderr.trim());
  }
  cachedBasePaths = new Set(result.stdout.split('\n').filter(Boolean));
  return cachedBasePaths;
}

function basePathSha256(relativePath) {
  const result = gitBufferResult(['show', BASE_COMMIT + ':' + relativePath], ROOT);
  if (result.status !== 0) {
    throw new Error('cannot read exact base path ' + relativePath + ': '
      + result.stderr.toString('utf8').trim());
  }
  return createHash('sha256').update(result.stdout).digest('hex');
}

async function integrationSpecFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await integrationSpecFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.spec.ts')) files.push(entryPath);
  }
  return files.sort();
}

async function lstatWithoutSymlinkComponents(root, normalizedPath) {
  let current = root;
  let currentStat;
  for (const component of normalizedPath.split('/')) {
    current = path.join(current, component);
    currentStat = await lstat(current);
    if (currentStat.isSymbolicLink()) {
      throw new Error('focused test path must not contain a symlink: ' + normalizedPath);
    }
  }
  return currentStat;
}

export async function assertFocusedTestPath(testPath, { root = ROOT } = {}) {
  if (!testPath || path.isAbsolute(testPath)) throw new Error('focused test path must be relative');
  const normalized = path.posix.normalize(testPath);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('focused test path escapes repository root: ' + testPath);
  }
  const absolutePath = path.join(root, normalized);
  const stat = await lstatWithoutSymlinkComponents(root, normalized);

  let files;
  if (isIntegrationDirectorySelector(normalized)) {
    if (!stat.isDirectory()) throw new Error('integration selector is not a directory: ' + testPath);
    files = await integrationSpecFiles(absolutePath);
    if (files.length === 0) throw new Error('integration selector has no .spec.ts descendants: ' + testPath);
  } else {
    if (!stat.isFile()) throw new Error('focused test path is not a regular file: ' + testPath);
    files = [absolutePath];
  }

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (STATIC_TEST_SKIP_PATTERN.test(source)) {
      throw new Error('focused test contains a static exclusion or expected-failure marker: '
        + path.relative(root, file));
    }
  }
  return {
    path: normalized,
    files: files.map((file) => path.relative(root, file).split(path.sep).join('/')),
  };
}

function packPredecessorClosure(pack, packById) {
  const closure = new Set();
  const pending = [...pack.predecessorPackIds];
  while (pending.length) {
    const predecessorId = pending.pop();
    if (closure.has(predecessorId)) continue;
    closure.add(predecessorId);
    const predecessor = packById[predecessorId];
    if (predecessor) pending.push(...predecessor.predecessorPackIds);
  }
  return closure;
}

function providerPackIdsForTestAnchor(canonicalPath, providersByPath) {
  const directorySelector = isIntegrationDirectorySelector(canonicalPath);
  return sorted(unique([...providersByPath]
    .filter(([providedPath]) => providedPath === canonicalPath
      || (directorySelector
        && providedPath.startsWith(canonicalPath + '/')
        && providedPath.endsWith('.spec.ts')))
    .flatMap(([, providerIds]) => providerIds)));
}

function conditionalTriggerUnitsForTestAnchor(canonicalPath, blockedTriggerUnitsByPath) {
  const directorySelector = isIntegrationDirectorySelector(canonicalPath);
  return sorted(unique([...blockedTriggerUnitsByPath]
    .filter(([blockedPath]) => blockedPath === canonicalPath
      || (directorySelector
        && blockedPath.startsWith(canonicalPath + '/')
        && blockedPath.endsWith('.spec.ts')))
    .flatMap(([, unitIds]) => unitIds)));
}

function blockedTriggerUnitMap(hunks) {
  const result = new Map();
  for (const hunk of hunks) {
    if (hunk.quarantineReason !== 'INACTIVE_CONDITIONAL_TRIGGER') continue;
    const blockedPath = decodePath(hunk.pathB64);
    result.set(blockedPath, sorted(unique([
      ...(result.get(blockedPath) ?? []),
      hunk.sourceOwner,
    ])));
  }
  return result;
}

function classifyTestAnchors(pack, {
  basePaths,
  providersByPath,
  packById,
  blockedTriggerUnitsByPath,
}) {
  const predecessorIds = packPredecessorClosure(pack, packById);
  const gapByPath = Object.fromEntries(PLANNED_ACCEPTANCE_TEST_GAPS.map((gap) => [gap.path, gap]));
  const records = pack.verification.rawTestAnchorPaths.map((sourcePath) => {
    const canonicalPath = TEST_ANCHOR_ALIASES[sourcePath] ?? sourcePath;
    const syntacticRunner = testRunner(canonicalPath);
    const directorySelector = syntacticRunner === 'INTEGRATION'
      && isIntegrationDirectorySelector(canonicalPath);
    const providerPackIds = providerPackIdsForTestAnchor(canonicalPath, providersByPath);
    const blockedTriggerUnitIds = conditionalTriggerUnitsForTestAnchor(
      canonicalPath,
      blockedTriggerUnitsByPath,
    );
    const predecessorProviderPackIds = providerPackIds.filter((id) => predecessorIds.has(id));
    const availableAtBase = basePaths.has(canonicalPath)
      || (directorySelector && [...basePaths].some((basePath) =>
        basePath.startsWith(canonicalPath + '/') && basePath.endsWith('.spec.ts')));
    const runner = directorySelector && !availableAtBase && providerPackIds.length === 0
      && blockedTriggerUnitIds.length === 0
      ? null
      : syntacticRunner;
    let disposition;
    if (!runner) disposition = 'NON_EXECUTABLE_ANCHOR';
    else if (gapByPath[canonicalPath] && providerPackIds.includes(pack.packId)) {
      disposition = 'PLANNED_CURRENT_PACK_CREATE';
    }
    else if (availableAtBase) disposition = 'AVAILABLE_AT_BASE';
    else if (providerPackIds.includes(pack.packId)) disposition = 'PROVIDED_BY_CURRENT_PACK';
    else if (predecessorProviderPackIds.length) disposition = 'PROVIDED_BY_PREDECESSOR_PACK';
    else if (gapByPath[canonicalPath]) disposition = 'PLANNED_ACCEPTANCE_TEST_GAP';
    else if (providerPackIds.length) disposition = 'DEFERRED_PROVIDER_PACK';
    else if (blockedTriggerUnitIds.length) disposition = 'BLOCKED_INACTIVE_TRIGGER';
    else disposition = 'UNRESOLVED_EXECUTABLE_ANCHOR';
    const gap = gapByPath[canonicalPath];
    return {
      sourcePath,
      canonicalPath,
      aliasApplied: sourcePath !== canonicalPath,
      runner,
      disposition,
      providerPackIds,
      predecessorProviderPackIds,
      blockedTriggerUnitIds,
      plannedOwnerUnitId: gap?.ownerUnitId ?? null,
    };
  });
  for (const gap of PLANNED_ACCEPTANCE_TEST_GAPS) {
    const providerPackIds = providersByPath.get(gap.path) ?? [];
    if (!providerPackIds.includes(pack.packId)
      || records.some((record) => record.canonicalPath === gap.path)) continue;
    records.push({
      sourcePath: null,
      canonicalPath: gap.path,
      aliasApplied: false,
      runner: testRunner(gap.path),
      disposition: 'PLANNED_CURRENT_PACK_CREATE',
      providerPackIds,
      predecessorProviderPackIds: [],
      blockedTriggerUnitIds: [],
      plannedOwnerUnitId: gap.ownerUnitId,
    });
  }
  return records;
}

function testAnchorDispositionPaths(records) {
  return Object.fromEntries(TEST_ANCHOR_DISPOSITIONS.map((disposition) => [
    disposition,
    sorted(unique(records
      .filter((record) => record.disposition === disposition)
      .map((record) => record.canonicalPath))),
  ]));
}

function focusedCommands(testPaths) {
  return testPaths.flatMap((testPath) => {
    if (!testRunner(testPath)) {
      throw new Error('focused test path has no executable runner: ' + testPath);
    }
    return [
      FOCUSED_ASSERT_COMMAND + shellQuote(testPath),
      FOCUSED_RUN_COMMAND + shellQuote(testPath),
    ];
  });
}

function focusedRunnerInvocation(testPath) {
  const runner = testRunner(testPath);
  const route = FOCUSED_VITEST_ROUTES.find(
    ([prefix]) => testPath.startsWith(prefix) && isVitestPath(testPath),
  );
  if (runner === 'WORKSPACE_VITEST') {
    return {
      runner,
      command: 'pnpm',
      args: ['--filter', route[1], 'test', '--', testCommandSelector(testPath),
        '--passWithNoTests=false'],
    };
  }
  if (runner === 'ROOT_VITEST') {
    return {
      runner,
      command: 'pnpm',
      args: ['exec', 'vitest', 'run', testPath, '--passWithNoTests=false'],
    };
  }
  if (runner === 'NODE_TEST') {
    return {
      runner,
      command: 'node',
      args: ['--test', '--test-reporter=tap', testPath],
    };
  }
  if (runner === 'PYTEST') {
    return {
      runner,
      command: 'python3',
      args: ['-m', 'pytest', testPath, '-rA'],
    };
  }
  if (runner === 'INTEGRATION') {
    return {
      runner,
      command: 'pnpm',
      args: ['test:integration', '--', testPath],
    };
  }
  throw new Error('focused test path has no executable runner: ' + testPath);
}

function stripAnsi(value) {
  return value.replaceAll(
    new RegExp(String.fromCodePoint(27) + '\\[[0-?]*[ -/]*[@-~]', 'g'),
    '',
  );
}

function namedCounts(value, names) {
  return Object.fromEntries(names.map((name) => {
    const match = new RegExp('(?:^|\\s)(\\d+)\\s+' + name + '\\b', 'i').exec(value);
    return [name, match ? Number(match[1]) : 0];
  }));
}

export function validateFocusedTestResult(runner, {
  status,
  stdout = '',
  stderr = '',
} = {}) {
  const output = stripAnsi(stdout + '\n' + stderr);
  if (status !== 0) {
    throw new Error('focused ' + runner + ' runner exited with status ' + String(status));
  }

  let counts;
  if (runner === 'NODE_TEST') {
    const values = Object.fromEntries(
      ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((name) => {
        const matches = [...output.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gm'))];
        return [name, matches.length ? Number(matches.at(-1)[1]) : 0];
      }),
    );
    counts = {
      executed: values.tests,
      passed: values.pass,
      failed: values.fail + values.cancelled,
      skipped: values.skipped,
      todo: values.todo,
      xfail: 0,
      xpass: 0,
      deselected: 0,
    };
  } else if (runner === 'PYTEST') {
    const summaryLines = output.split('\n').filter((line) =>
      /\b(?:passed|failed|error|errors|skipped|xfailed|xpassed|deselected)\b/.test(line));
    const summary = summaryLines.at(-1) ?? '';
    const values = namedCounts(summary, [
      'passed', 'failed', 'error', 'errors', 'skipped', 'xfailed', 'xpassed', 'deselected',
    ]);
    counts = {
      executed: values.passed + values.failed + values.error + values.errors
        + values.skipped + values.xfailed + values.xpassed,
      passed: values.passed,
      failed: values.failed + values.error + values.errors,
      skipped: values.skipped,
      todo: 0,
      xfail: values.xfailed,
      xpass: values.xpassed,
      deselected: values.deselected,
    };
  } else {
    const summaryLines = output.split('\n').filter((line) =>
      /^\s*Tests\s+/.test(line));
    const summary = summaryLines.at(-1) ?? '';
    const values = namedCounts(summary, [
      'passed', 'failed', 'skipped', 'todo', 'pending', 'cancelled',
    ]);
    const totalMatch = /\((\d+)\)\s*$/.exec(summary);
    counts = {
      executed: totalMatch ? Number(totalMatch[1])
        : values.passed + values.failed + values.skipped + values.todo + values.pending,
      passed: values.passed,
      failed: values.failed + values.cancelled,
      skipped: values.skipped + values.pending,
      todo: values.todo,
      xfail: 0,
      xpass: 0,
      deselected: 0,
    };
  }

  if (counts.executed < 1
    || counts.passed < 1
    || counts.failed !== 0
    || counts.skipped !== 0
    || counts.todo !== 0
    || counts.xfail !== 0
    || counts.xpass !== 0
    || counts.deselected !== 0
    || counts.passed !== counts.executed) {
    throw new Error('focused ' + runner + ' result violates zero-exclusion contract: '
      + JSON.stringify(counts));
  }
  return counts;
}

export async function runFocusedTest(testPath, { cwd = ROOT, env = process.env } = {}) {
  const assertion = await assertFocusedTestPath(testPath, { root: cwd });
  const invocation = focusedRunnerInvocation(assertion.path);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error('focused ' + invocation.runner + ' runner could not start: '
      + result.error.message);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const counts = validateFocusedTestResult(invocation.runner, {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  console.log(JSON.stringify({
    ok: true,
    code: 'FOCUSED_TEST_RUN_OK',
    path: assertion.path,
    runner: invocation.runner,
    counts,
  }));
  return { ...assertion, runner: invocation.runner, counts };
}

export function cleanupGuaranteedShellCommand({
  lockPath,
  preflightCommands,
  commands,
  cleanupCommands,
}) {
  if (!lockPath || !preflightCommands?.length || !cleanupCommands?.length || !commands?.length) {
    throw new Error('cleanup-guaranteed shell command requires lock, preflight, body, and cleanup');
  }
  const cleanupLines = cleanupCommands.flatMap((command, index) => [
    '  cleanup_step_status=0',
    '  ' + command + ' || cleanup_step_status=$?',
    '  if [ "$cleanup_step_status" -ne 0 ] && [ "$cleanup_status" -eq 0 ]; then',
    '    cleanup_status=$cleanup_step_status',
    '    cleanup_step=' + shellQuote(String(index + 1)),
    '  fi',
  ]);
  const body = [
    'set -euo pipefail',
    'umask 077',
    'lock_path=' + shellQuote(lockPath),
    'if ! mkdir "$lock_path"; then',
    '  echo "isolated verification lock is already held: $lock_path" >&2',
    '  exit 73',
    'fi',
    'cleanup() {',
    '  status=$?',
    '  trap - EXIT HUP INT TERM',
    '  set +e',
    '  cleanup_status=0',
    '  cleanup_step=0',
    ...cleanupLines,
    '  lock_status=0',
    '  rmdir "$lock_path" || lock_status=$?',
    '  if [ "$cleanup_status" -ne 0 ] || [ "$lock_status" -ne 0 ]; then',
    '    echo "isolated verification cleanup failed: step=$cleanup_step cleanup=$cleanup_status lock=$lock_status" >&2',
    '    if [ "$status" -eq 0 ]; then',
    '      if [ "$cleanup_status" -ne 0 ]; then status=$cleanup_status; else status=$lock_status; fi',
    '    fi',
    '  fi',
    '  exit "$status"',
    '}',
    'trap cleanup EXIT',
    "trap 'exit 129' HUP",
    "trap 'exit 130' INT",
    "trap 'exit 143' TERM",
    ...preflightCommands,
    ...commands,
  ].join('\n');
  return 'bash -c ' + shellQuote(body);
}

function isolatedDatabaseVerification(pack) {
  const postgresPort = ISOLATED_POSTGRES_PORT_BASE + pack.sequence;
  const minioApiPort = ISOLATED_MINIO_PORT_BASE + (pack.sequence * 2);
  const minioConsolePort = minioApiPort + 1;
  const ingestionPort = ISOLATED_INGESTION_PORT_BASE + pack.sequence;
  const projectName = 'amic-vault-' + pack.packId.toLowerCase();
  const bucket = 'amic-vault-dev';
  const lockPath = '/tmp/' + projectName + '-isolated.lock';
  const overridePath = lockPath + '/compose.override.yml';
  const environment = [
    ['DATABASE_URL', 'postgres://amic_vault:amic_vault_dev_password@127.0.0.1:'
      + postgresPort + '/amic_vault'],
    ['APP_DATABASE_URL', 'postgres://vault_app:vault_app_dev_password@127.0.0.1:'
      + postgresPort + '/amic_vault'],
    ['S3_ENDPOINT', 'http://127.0.0.1:' + minioApiPort],
    ['S3_BUCKET', bucket],
    ['S3_ACCESS_KEY_ID', 'amic-vault-minio'],
    ['S3_SECRET_ACCESS_KEY', 'amic-vault-minio-dev-password'],
    ['INGESTION_WORKER_URL', 'http://127.0.0.1:' + ingestionPort],
  ].map(([name, value]) => name + '=' + shellQuote(value)).join(' ');
  const composeEnvironment = [
    ['POSTGRES_PORT', String(postgresPort)],
    ['MINIO_API_PORT', String(minioApiPort)],
    ['MINIO_CONSOLE_PORT', String(minioConsolePort)],
    ['INGESTION_WORKER_PORT', String(ingestionPort)],
    ['S3_BUCKET', bucket],
  ].map(([name, value]) => name + '=' + shellQuote(value)).join(' ');
  const composeBase = composeEnvironment + ' docker compose -p ' + shellQuote(projectName)
    + ' -f infra/docker-compose.dev.yml';
  const compose = composeBase + ' -f ' + shellQuote(overridePath);
  const composeDown = composeBase + ' down -v --remove-orphans --rmi local';
  const overrideYaml = [
    'services:',
    '  postgres:',
    '    ports: !override',
    '      - "127.0.0.1:' + postgresPort + ':5432"',
    '  minio:',
    '    ports: !override',
    '      - "127.0.0.1:' + minioApiPort + ':9000"',
    '      - "127.0.0.1:' + minioConsolePort + ':9001"',
    '  ingestion:',
    '    ports: !override',
    '      - "127.0.0.1:' + ingestionPort + ':8000"',
    '',
  ].join('\n');
  return {
    projectName,
    postgresPort,
    minioApiPort,
    minioConsolePort,
    ingestionPort,
    lockPath,
    overridePath,
    hostBinding: '127.0.0.1',
    run: (command) => environment + ' ' + command,
    composePreclean: composeDown,
    writeOverride: 'set -C; : > ' + shellQuote(overridePath)
      + '; set +C; printf %s ' + shellQuote(overrideYaml) + ' >> ' + shellQuote(overridePath),
    composeUp: compose + ' up -d --wait --build --force-recreate --renew-anon-volumes',
    composeDown,
  };
}

function verificationCommands(pack, focusedTestPaths) {
  const pythonBootstrapRequired = focusedTestPaths.some(
    (testPath) => testRunner(testPath) === 'PYTEST',
  );
  const integrationPaths = focusedTestPaths.filter(isIntegrationSelector);
  const nonIntegrationPaths = focusedTestPaths.filter((testPath) => !isIntegrationSelector(testPath));
  const commands = [
    'node tools/execution/build-post-r14-recovery-pack-manifest.mjs --check --committed-only',
    COMMON_COMMANDS[0],
    ...(pythonBootstrapRequired ? ["python3 -m pip install -e 'workers/ingestion[test]'"] : []),
    ...focusedCommands(nonIntegrationPaths),
    ...COMMON_COMMANDS.slice(1),
  ];
  if (pack.migrationSourceOrdinals.length || integrationPaths.length) {
    const database = isolatedDatabaseVerification(pack);
    const integrationCommands = focusedCommands(integrationPaths);
    commands.push(...integrationCommands.filter(
      (command) => command.startsWith(FOCUSED_ASSERT_COMMAND),
    ));
    const isolatedCommands = [database.composeUp, database.run('pnpm db:migrate')];
    if (pack.migrationSourceOrdinals.length) {
      isolatedCommands.push(database.run('pnpm db:rollback'), database.run('pnpm db:migrate'));
    }
    isolatedCommands.push(
      database.run('pnpm db:seed'),
      ...integrationCommands
        .filter((command) => command.startsWith(FOCUSED_RUN_COMMAND))
        .map((command) => database.run(command)),
    );
    if (pack.migrationSourceOrdinals.length && !integrationPaths.includes('tests/integration')) {
      isolatedCommands.push(database.run(
        FOCUSED_RUN_COMMAND + shellQuote('tests/integration'),
      ));
    }
    commands.push(cleanupGuaranteedShellCommand({
      lockPath: database.lockPath,
      preflightCommands: [
        database.composePreclean,
        'rm -f ' + shellQuote(database.overridePath),
        database.writeOverride,
      ],
      commands: isolatedCommands,
      cleanupCommands: [
        database.composeDown,
        'rm -f ' + shellQuote(database.overridePath),
      ],
    }));
  }
  if ([...pack.files.create, ...pack.files.modify]
    .some((file) => file.startsWith('workers/ingestion/'))) {
    if (!commands.includes("python3 -m pip install -e 'workers/ingestion[test]'")) {
      commands.splice(2, 0, "python3 -m pip install -e 'workers/ingestion[test]'");
    }
    commands.push('python3 -m pytest workers/ingestion/tests');
  }
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

function topologicallyOrderMigrationDrafts(rows, unitById, packSequenceById) {
  const rowsByPack = Map.groupBy(rows, (row) => row.packId);
  const ordered = [];
  const packIds = [...rowsByPack.keys()].sort(
    (left, right) => packSequenceById[left] - packSequenceById[right],
  );
  for (const packId of packIds) {
    const packRows = rowsByPack.get(packId);
    const byOrdinal = Object.fromEntries(packRows.map((row) => [row.ordinal, row]));
    const outgoing = new Map(packRows.map((row) => [row.ordinal, new Set()]));
    const indegree = new Map(packRows.map((row) => [row.ordinal, 0]));
    const addEdge = (from, to) => {
      if (from === to || outgoing.get(from).has(to)) return;
      outgoing.get(from).add(to);
      indegree.set(to, indegree.get(to) + 1);
    };
    const rowsByOwner = Map.groupBy(packRows, (row) => row.owner);
    for (const ownerRows of rowsByOwner.values()) {
      const sourceOrdered = [...ownerRows].sort((left, right) => left.ordinal - right.ordinal);
      for (let index = 1; index < sourceOrdered.length; index += 1) {
        addEdge(sourceOrdered[index - 1].ordinal, sourceOrdered[index].ordinal);
      }
    }
    for (const row of packRows) {
      for (const dependency of unitById[row.owner]?.dependencies ?? []) {
        if (dependency.kind !== 'hard') continue;
        for (const dependencyRow of rowsByOwner.get(dependency.id) ?? []) {
          addEdge(dependencyRow.ordinal, row.ordinal);
        }
      }
    }
    const ready = packRows
      .filter((row) => indegree.get(row.ordinal) === 0)
      .map((row) => row.ordinal)
      .sort((left, right) => left - right);
    const packOrdered = [];
    while (ready.length) {
      const ordinal = ready.shift();
      packOrdered.push(byOrdinal[ordinal]);
      for (const target of outgoing.get(ordinal)) {
        indegree.set(target, indegree.get(target) - 1);
        if (indegree.get(target) === 0) {
          ready.push(target);
          ready.sort((left, right) => left - right);
        }
      }
    }
    if (packOrdered.length !== packRows.length) {
      throw new Error('migration hard-dependency cycle inside ' + packId);
    }
    ordered.push(...packOrdered);
  }
  return ordered;
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
  const nonOverlaySources = NON_OVERLAY_SOURCES.map(({ packKey, ...source }) => ({
    ...source,
    packId: packByKey[packKey].packId,
  }));
  const sourcesByPack = Map.groupBy(nonOverlaySources, (source) => source.packId);

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

  const exactBasePaths = basePathSet();
  const classificationByPathB64 = Object.fromEntries(
    classification.entries.map((entry) => [entry.pathB64, entry]),
  );
  const basePathCollisionDrafts = ownership.paths
    .filter((entry) => entry.gitState === 'untracked'
      && exactBasePaths.has(decodePath(entry.pathB64))
      && ownership.hunks.some((hunk) => hunk.pathB64 === entry.pathB64
        && !['historical_base', 'quarantine'].includes(hunk.ownerType)))
    .map((entry) => {
      const collisionPath = decodePath(entry.pathB64);
      const source = classificationByPathB64[entry.pathB64];
      if (!source?.sha256) throw new Error('missing sealed overlay hash for ' + collisionPath);
      const baseSha256 = basePathSha256(collisionPath);
      const identical = baseSha256 === source.sha256;
      const supersessionRef = BASE_COLLISION_SUPERSESSION_REFS[collisionPath] ?? null;
      if (!identical && !supersessionRef) {
        throw new Error('unapproved differing exact-base collision: ' + collisionPath);
      }
      return {
        path: collisionPath,
        pathB64: entry.pathB64,
        originalGitState: entry.gitState,
        overlaySha256: source.sha256,
        baseSha256,
        resolution: identical
          ? 'QUARANTINE_IDENTICAL_AT_AMENDMENT_BASE'
          : 'QUARANTINE_STALE_OVERLAY_SUPERSEDED_BY_AMENDMENT_BASE',
        resolutionRef: identical ? 'EXACT_SHA256_EQUALITY' : supersessionRef,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const baseCollisionByPathB64 = Object.fromEntries(
    basePathCollisionDrafts.map((collision) => [collision.pathB64, collision]),
  );

  const hunkAssignments = ownership.hunks.map((hunk) => {
    const decoded = decodePath(hunk.pathB64);
    let disposition = 'PACK';
    let key;
    let quarantineReason = null;
    if (hunk.ownerType === 'quarantine') {
      disposition = 'QUARANTINE';
      quarantineReason = 'SOURCE_CLASSIFICATION_QUARANTINE';
    } else if (hunk.ownerType === 'historical_base') {
      disposition = 'QUARANTINE';
      quarantineReason = 'STALE_HISTORICAL_BASE_REPLACED_BY_REGISTERED_GIT_HISTORY_SOURCE';
    } else if (hunk.ownerType === 'pack_candidate') {
      key = PACK_CANDIDATE_ROUTES[hunk.chosenOwner];
    } else if (hunk.ownerType === 'tuw') {
      key = hunk.chosenOwner === 'A14' && LAWOS_PATHS.has(decoded)
        ? 'T8'
        : routed[hunk.chosenOwner];
    }
    const supersededPackId = packByKey[key]?.packId ?? null;
    if (disposition === 'PACK' && baseCollisionByPathB64[hunk.pathB64]) {
      disposition = 'QUARANTINE';
      quarantineReason = baseCollisionByPathB64[hunk.pathB64].resolution
        === 'QUARANTINE_IDENTICAL_AT_AMENDMENT_BASE'
        ? 'OVERLAY_IDENTICAL_TO_AMENDMENT_BASE'
        : 'STALE_OVERLAY_SUPERSEDED_BY_AMENDMENT_BASE';
    }
    const inactiveTrigger = hunk.ownerType === 'tuw'
      && INACTIVE_TRIGGER_UNIT_IDS.has(hunk.chosenOwner);
    if (disposition === 'PACK' && inactiveTrigger) {
      disposition = 'QUARANTINE';
      quarantineReason = 'INACTIVE_CONDITIONAL_TRIGGER';
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
      quarantineReason,
      supersededPackId: baseCollisionByPathB64[hunk.pathB64] ? supersededPackId : null,
      blockedPackId: quarantineReason === 'INACTIVE_CONDITIONAL_TRIGGER'
        ? supersededPackId
        : null,
      activationTriggerId: quarantineReason === 'INACTIVE_CONDITIONAL_TRIGGER'
        ? CONDITIONAL_TRIGGERS.find((row) => row.unitId === hunk.chosenOwner).triggerId
        : null,
    };
  });
  const blockedTriggerUnitsByPath = blockedTriggerUnitMap(hunkAssignments);

  const basePathCollisions = basePathCollisionDrafts.map((collision) => {
    const collisionHunks = hunkAssignments.filter((hunk) => hunk.pathB64 === collision.pathB64);
    return {
      ...collision,
      hunkOrdinals: collisionHunks.map((hunk) => hunk.ordinal),
      supersededPackIds: sorted(unique(collisionHunks
        .map((hunk) => hunk.supersededPackId)
        .filter(Boolean))),
      rawTestAnchorPaths: sorted(unique(collisionHunks.flatMap((hunk) =>
        (ownership.hunks[hunk.ordinal - 1].testAnchorsB64 ?? []).map(decodePath)))),
      testAnchorDisposition: 'QUARANTINED_WITH_SUPERSEDED_OVERLAY',
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
      baseCollisionResolution: baseCollisionByPathB64[entry.pathB64]?.resolution ?? null,
      packIds,
      hunkOrdinals: hunks.map((hunk) => hunk.ordinal),
    };
  });

  const migrationDrafts = ownership.migrations.map((migration) => {
    const key = routed[migration.owner];
    if (!packByKey[key]) throw new Error('unroutable migration owner ' + migration.owner);
    return {
      ...migration,
      packId: packByKey[key].packId,
      blockedByInactiveTrigger: INACTIVE_TRIGGER_UNIT_IDS.has(migration.owner),
    };
  });
  const packSequenceById = Object.fromEntries(
    basePacks.map((pack) => [pack.packId, pack.sequence]),
  );
  const activeMigrationDrafts = topologicallyOrderMigrationDrafts(
    migrationDrafts.filter((migration) => !migration.blockedByInactiveTrigger),
    unitById,
    packSequenceById,
  );
  const blockedMigrationDrafts = migrationDrafts
    .filter((migration) => migration.blockedByInactiveTrigger)
    .sort((left, right) => left.ordinal - right.ordinal);
  const migrationRow = (migration, targetOrdinal) => {
    const blocked = migration.blockedByInactiveTrigger;
    return {
      sourceOrdinal: migration.ordinal,
      sourcePathB64: migration.pathB64,
      sourceName: migration.name,
      executionDisposition: blocked ? 'BLOCKED_INACTIVE_TRIGGER' : 'PACK',
      targetOrdinal: blocked ? null : targetOrdinal,
      targetName: blocked ? null : targetMigrationName(migration.name, targetOrdinal),
      targetPredecessor: blocked ? null : targetOrdinal - 1,
      ownerUnitId: migration.owner,
      packId: blocked ? null : migration.packId,
      blockedPackId: blocked ? migration.packId : null,
      activationTriggerId: blocked
        ? CONDITIONAL_TRIGGERS.find((row) => row.unitId === migration.owner).triggerId
        : null,
      renumberRequired: blocked ? null : migration.ordinal !== targetOrdinal,
      hasDownMarker: migration.hasDownMarker,
      forwardVerification: migration.forwardVerification,
      downVerification: migration.downVerification,
      referenceUpdateListB64: migration.referenceUpdateListB64,
    };
  };
  const migrations = [
    ...activeMigrationDrafts.map((migration, index) => migrationRow(migration, index + 94)),
    ...blockedMigrationDrafts.map((migration) => migrationRow(migration, null)),
  ];

  const routePackByUnit = Object.fromEntries(unitIds.map((id) => [id, packByKey[routed[id]].packId]));
  const predecessors = Object.fromEntries(basePacks.map((pack) => [
    pack.packId,
    new Set([REGISTRATION_PACK_ID, AMENDMENT_PACK_ID]),
  ]));

  for (const unit of ledger.units) {
    const targetPack = routePackByUnit[unit.id];
    for (const dependency of unit.dependencies) {
      if (dependency.kind !== 'hard' || !routePackByUnit[dependency.id]) continue;
      const sourcePack = routePackByUnit[dependency.id];
      if (sourcePack !== targetPack) predecessors[targetPack].add(sourcePack);
    }
  }

  const idFor = (key) => packByKey[key].packId;
  predecessors[idFor('T8')].add(idFor('T10'));
  predecessors[idFor('T12')].add(idFor('T8'));
  for (const key of ['T7', 'T8', 'T9', 'T10', 'T11', 'T12']) {
    predecessors[idFor('T13')].add(idFor(key));
  }
  for (const pack of basePacks) {
    if (!['T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13'].includes(pack.key)
      && !pack.key.startsWith('S') && !pack.key.startsWith('V')) {
      predecessors[pack.packId].add(idFor('T13'));
    }
  }

  const migrationPackIds = unique(migrations.map((migration) => migration.packId).filter(Boolean));
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
    const overlayCreate = [];
    const overlayModify = [];
    for (const pathB64 of pathB64s) {
      const state = pathByB64[pathB64].gitState;
      const decoded = decodePath(pathB64);
      (state === 'untracked' ? overlayCreate : overlayModify).push(decoded);
    }
    const packSources = sourcesByPack.get(pack.packId) ?? [];
    const sourceCreate = sorted(packSources.flatMap((source) => source.pathActions
      .filter((item) => item.action === 'CREATE')
      .map((item) => item.path)));
    const sourceModify = sorted(packSources.flatMap((source) => source.pathActions
      .filter((item) => item.action === 'MODIFY')
      .map((item) => item.path)));
    const plannedTestCreate = sorted(PLANNED_ACCEPTANCE_TEST_GAPS
      .filter((gap) => routePackByUnit[gap.ownerUnitId] === pack.packId)
      .map((gap) => gap.path));
    const effectiveActions = new Map();
    for (const file of sourceModify) effectiveActions.set(file, 'MODIFY');
    for (const file of sourceCreate) effectiveActions.set(file, 'CREATE');
    for (const file of overlayModify) {
      if (!effectiveActions.has(file)) effectiveActions.set(file, 'MODIFY');
    }
    for (const file of overlayCreate) effectiveActions.set(file, 'CREATE');
    for (const file of plannedTestCreate) effectiveActions.set(file, 'CREATE');
    const create = sorted([...effectiveActions]
      .filter(([, action]) => action === 'CREATE')
      .map(([file]) => file));
    const modify = sorted([...effectiveActions]
      .filter(([, action]) => action === 'MODIFY')
      .map(([file]) => file));
    const rawTestAnchorPaths = sorted(unique(hunks.flatMap((hunk) => {
      const source = ownership.hunks[hunk.ordinal - 1];
      return (source.testAnchorsB64 ?? []).map(decodePath);
    })));
    const risk = riskFor(hunks, pack.mode);
    const primaryTuwIds = pack.tuwIds.filter((id) => primary[id] === pack.key);
    const supportTuwIds = pack.tuwIds.filter((id) => id.startsWith('RECOVERY-'));
    const secondaryTuwIds = pack.tuwIds.filter((id) => unitById[id] && !primaryTuwIds.includes(id));
    const conditionalBlockedTuwIds = pack.tuwIds.filter(
      (id) => INACTIVE_TRIGGER_UNIT_IDS.has(id),
    );
    const transitionTuwIds = TRANSITION_GROUPS[pack.key] ?? [];
    const nonCompleteOnlyTransitionTuwIds = NON_COMPLETE_TRANSITION_GROUPS[pack.key] ?? [];
    const packMigrationRows = packMigrations.get(pack.packId) ?? [];
    const repoSafeReceipt = 'docs/execution/recovery-receipts/' + pack.packId + '.json';
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
      conditionalBlockedTuwIds,
      scopeCountException: null,
      predecessorPackIds: sorted(predecessors[pack.packId]),
      review: packReview(risk),
      files: {
        create: sorted(create),
        modify: sorted(modify),
        overlayCreate: sorted(overlayCreate),
        overlayModify: sorted(overlayModify),
        sourceCreate,
        sourceModify,
        plannedTestCreate,
        sharedPathHunkSelectors: Object.fromEntries(pathB64s
          .filter((pathB64) => pathByB64[pathB64].sharedFile)
          .map((pathB64) => [
            decodePath(pathB64),
            hunks.filter((hunk) => hunk.pathB64 === pathB64).map((hunk) => hunk.hunkFingerprint),
          ])),
        notModify: GLOBAL_NOT_MODIFY,
      },
      hunkOrdinals: hunks.map((hunk) => hunk.ordinal),
      nonOverlaySourceIds: packSources.map((source) => source.sourceId),
      migrationSourceOrdinals: packMigrationRows.map((migration) => migration.sourceOrdinal),
      migrationTargetOrdinals: packMigrationRows.map((migration) => migration.targetOrdinal),
      verification: {
        rawTestAnchorPaths,
        testAnchorDispositions: {},
        focusedTestPaths: [],
        deferredTestPaths: [],
        requiredPlannedTestGaps: [],
        isolatedDatabase: null,
        commands: [],
        failCountRequired: 0,
        skipCountRequired: 0,
        exactHeadRequired: true,
      },
      evidenceTarget: '.omo/evidence/ulw/amic-vault-117-recovery-20260716/'
        + '<active-goal-id>/a<attempt>/' + pack.packId + '.txt',
      repoSafeReceipt,
      controlPlane: {
        candidateBookkeeping: {
          create: [repoSafeReceipt],
          modify: [EXECUTION_LEDGER_PATH],
          executionLedgerExactEofAppend: true,
          mustPrecedeTransitions: true,
          payloadMixingAllowed: true,
        },
        transitionTuwIds,
        nonCompleteOnlyTransitionTuwIds,
        transitionCommit: {
          exactPaths: TRANSITION_CONTROL_PLANE_PATHS,
          oneRowPerCommit: true,
          payloadMixingForbidden: true,
          postTransitionNonControlPlaneChangeForbidden: true,
        },
      },
      stopConditions: [
        'exact predecessor or hunk fingerprint mismatch',
        'unlisted path, hunk, migration, dependency, or package change',
        'missing, failing, stale, skipped, or post-push-invalidated technical gate',
        'permission, audit, privacy, policy, source, trigger, or external authority uncertainty',
        'private evidence or sensitive content would enter Git',
        'a planned acceptance-test gap is treated as executable or passing evidence',
        'a TUW with a required planned acceptance-test gap receives a completion claim',
        'an exact-base collision is recreated, overwritten, or removed from its sealed quarantine',
        'isolated database infrastructure is not cleaned up after success or failure',
        'the same failure repeats three times',
      ],
    };
  });

  const packById = Object.fromEntries(packs.map((pack) => [pack.packId, pack]));
  const pathDispositionByB64 = Object.fromEntries(
    pathDispositions.map((entry) => [entry.pathB64, entry]),
  );
  for (const source of nonOverlaySources) {
    for (const pathAction of source.pathActions) {
      const pathB64 = Buffer.from(pathAction.path, 'utf8').toString('base64');
      for (const consumerPackId of pathDispositionByB64[pathB64]?.packIds ?? []) {
        if (consumerPackId === source.packId) continue;
        packById[consumerPackId].predecessorPackIds = sorted(unique([
          ...packById[consumerPackId].predecessorPackIds,
          source.packId,
        ]));
      }
    }
  }
  const providersByPath = new Map();
  for (const pack of packs) {
    for (const file of [...pack.files.create, ...pack.files.modify]) {
      const providers = providersByPath.get(file) ?? [];
      providers.push(pack.packId);
      providersByPath.set(file, sorted(unique(providers)));
    }
  }
  for (const pack of packs) {
    const earlierProviderPackIds = sorted(unique(pack.verification.rawTestAnchorPaths
      .flatMap((sourcePath) => providerPackIdsForTestAnchor(
        TEST_ANCHOR_ALIASES[sourcePath] ?? sourcePath,
        providersByPath,
      ))
      .filter((providerPackId) => providerPackId !== pack.packId
        && packById[providerPackId]?.sequence < pack.sequence)));
    pack.predecessorPackIds = sorted(unique([
      ...pack.predecessorPackIds,
      ...earlierProviderPackIds,
    ]));
  }
  const plannedAcceptanceTestGaps = PLANNED_ACCEPTANCE_TEST_GAPS.map((gap) => ({
    ...gap,
    ownerPackId: routePackByUnit[gap.ownerUnitId],
    state: 'PLANNED_NOT_YET_CREATED',
    blocksCompletionClaim: true,
  }));
  for (const pack of packs) {
    const records = classifyTestAnchors(pack, {
      basePaths: exactBasePaths,
      providersByPath,
      packById,
      blockedTriggerUnitsByPath,
    });
    const unresolved = records.filter((record) => record.disposition === 'UNRESOLVED_EXECUTABLE_ANCHOR');
    if (unresolved.length) {
      throw new Error(pack.packId + ' has unresolved executable test anchors: '
        + unresolved.map((record) => record.sourcePath).join(', '));
    }
    const focusedTestPaths = sorted(unique(records
      .filter((record) => [
        'AVAILABLE_AT_BASE',
        'PROVIDED_BY_CURRENT_PACK',
        'PLANNED_CURRENT_PACK_CREATE',
        'PROVIDED_BY_PREDECESSOR_PACK',
      ].includes(record.disposition))
      .map((record) => record.canonicalPath)));
    pack.verification.testAnchorDispositions = testAnchorDispositionPaths(records);
    pack.verification.focusedTestPaths = focusedTestPaths;
    pack.verification.deferredTestPaths = sorted(unique(records
      .filter((record) => record.disposition === 'DEFERRED_PROVIDER_PACK')
      .map((record) => record.canonicalPath)));
    pack.verification.requiredPlannedTestGaps = plannedAcceptanceTestGaps
      .filter((gap) => pack.tuwIds.includes(gap.ownerUnitId));
    const databaseRequired = pack.migrationSourceOrdinals.length > 0
      || focusedTestPaths.some(isIntegrationSelector);
    if (databaseRequired) {
      const database = isolatedDatabaseVerification(pack);
      pack.verification.isolatedDatabase = {
        projectName: database.projectName,
        postgresPort: database.postgresPort,
        minioApiPort: database.minioApiPort,
        minioConsolePort: database.minioConsolePort,
        ingestionPort: database.ingestionPort,
        ingestionWorkerUrl: 'http://127.0.0.1:' + database.ingestionPort,
        hostBinding: database.hostBinding,
        lockPath: database.lockPath,
        overridePath: database.overridePath,
        bucket: 'amic-vault-dev',
        freshVolumesRequired: true,
        precleanRequired: true,
        forceBuildRequired: true,
        forceRecreateRequired: true,
        cleanupExecutor: 'BASH_EXIT_TRAP_STATUS_PRESERVING',
        cleanupRequiredOnSuccessOrFailure: true,
      };
    }
    pack.verification.commands = verificationCommands(pack, focusedTestPaths);
  }

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
      amendmentAuthorityRef: AMENDMENT_AUTHORITY_REF,
      amendmentAuthorityEvidence: '.omo/evidence/ulw/amic-vault-117-recovery-20260716/'
        + 'G004-g04-complete-tasks-7-12-after-g03-re/a1/'
        + 'PACK-R14-03-AMENDMENT-01-AUTHORITY-20260717.json',
      executionBaseRule: 'Each PACK starts from current origin/main containing every registered predecessor merge; payload.baseCommit is the amendment preimage, not a reusable execution head.',
      docsPackageReadOnly: true,
      privateEvidenceNoDereference: true,
      claimBoundary: 'Manifest registration changes or lands no migration and performs no downstream or production migration; disposable isolated verification may execute existing migrations.',
    },
    registrationPack: {
      packId: REGISTRATION_PACK_ID,
      branch: REGISTRATION_BRANCH,
      tuwIds: REGISTRATION_TUW_IDS,
      allowedCreate: REGISTRATION_ALLOWED_CREATE,
      allowedModify: REGISTRATION_ALLOWED_MODIFY,
    },
    amendmentRegistration: {
      amendmentId: AMENDMENT_PACK_ID,
      branch: AMENDMENT_BRANCH,
      baseCommit: BASE_COMMIT,
      authorityRef: AMENDMENT_AUTHORITY_REF,
      tuwIds: AMENDMENT_TUW_IDS,
      allowedCreate: AMENDMENT_ALLOWED_CREATE,
      allowedModify: AMENDMENT_ALLOWED_MODIFY,
      claimBoundary: 'Manifest correction only; no downstream PACK payload is executed by this amendment.',
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
    testAnchorContract: {
      sourceContractSha256: digest({
        packs: packs.map((pack) => ({
          packId: pack.packId,
          rawTestAnchorPaths: pack.verification.rawTestAnchorPaths,
        })),
        basePathCollisions: basePathCollisions.map((collision) => ({
          path: collision.path,
          rawTestAnchorPaths: collision.rawTestAnchorPaths,
          disposition: collision.testAnchorDisposition,
        })),
      }),
      aliases: TEST_ANCHOR_ALIASES,
      plannedAcceptanceTestGaps,
      executableAvailabilityRule: 'BASE_COMMIT_OR_CURRENT_PACK_OR_TRANSITIVE_PREDECESSOR_PACK',
      unresolvedExecutableAnchorsAllowed: false,
    },
    basePathCollisionSourceContractSha256: digest(basePathCollisions),
    basePathCollisions,
    packs,
    nonOverlaySources,
    hunkAssignments,
    pathDispositions,
    migrations,
    conditionalTriggers: CONDITIONAL_TRIGGERS,
    quarantines: {
      hunkOrdinals: hunkAssignments.filter((item) => item.disposition === 'QUARANTINE').map((item) => item.ordinal),
      pathB64s: pathDispositions.filter((item) => item.disposition === 'QUARANTINE').map((item) => item.pathB64),
      migrationSourceOrdinals: blockedMigrationDrafts.map((item) => item.ordinal),
      conditionalUnitIds: sorted(INACTIVE_TRIGGER_UNIT_IDS),
      rule: 'Quarantined entries never enter any PACK without a separately registered manifest amendment.',
    },
    prohibitions: [
      'no docs/package change',
      'no private evidence publication or dereference',
      'no unassigned path or hunk staging',
      'no migration change or landing and no downstream or production migration execution by manifest registration; disposable isolated verification of existing migrations is permitted',
      'no product completion inherited from bootstrap or historical evidence',
      'no conditional unit execution without active written trigger',
      'no external operation without separately scoped authority',
      'no skipped or reduced technical gate',
      'no deployment, release, or go-live claim from this manifest',
    ],
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'AUTHORIZED_TECHNICAL_GATES_ONLY',
    payloadSha256: digest(payload),
    payload,
  };
}

export function validateManifest(manifest) {
  const errors = [];
  const fail = (code, detail) => errors.push({ code, detail });
  if (manifest.schemaVersion !== SCHEMA_VERSION) fail('SCHEMA_VERSION', manifest.schemaVersion);
  if (manifest.status !== 'AUTHORIZED_TECHNICAL_GATES_ONLY') fail('STATUS', manifest.status);
  if (manifest.payloadSha256 !== digest(manifest.payload)) fail('PAYLOAD_HASH', 'payload hash mismatch');
  if (manifest.payloadSha256 !== CANONICAL_PAYLOAD_SHA256) {
    fail('CANONICAL_PAYLOAD_HASH', manifest.payloadSha256);
  }

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
  const providersByPath = new Map();
  for (const pack of packs) {
    for (const file of [...(pack.files?.create ?? []), ...(pack.files?.modify ?? [])]) {
      const providers = providersByPath.get(file) ?? [];
      providers.push(pack.packId);
      providersByPath.set(file, sorted(unique(providers)));
    }
  }
  const blockedTriggerUnitsByPath = blockedTriggerUnitMap(payload.hunkAssignments ?? []);
  const exactBasePaths = basePathSet();
  const staticPrimary = primaryMap();
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
    const blueprint = BLUEPRINTS[pack.sequence - 1];
    const expectedPrimaryTuwIds = blueprint?.tuwIds.filter(
      (id) => staticPrimary[id] === blueprint.key,
    ) ?? [];
    const expectedSecondaryTuwIds = blueprint?.tuwIds.filter(
      (id) => Object.hasOwn(staticPrimary, id) && staticPrimary[id] !== blueprint.key,
    ) ?? [];
    const expectedSupportTuwIds = blueprint?.tuwIds.filter(
      (id) => !Object.hasOwn(staticPrimary, id),
    ) ?? [];
    if (!blueprint
      || pack.branch !== 'feat/pack-r14-' + String(pack.sequence + 3).padStart(2, '0') + '-' + blueprint.slug
      || pack.title !== blueprint.title
      || pack.objective !== blueprint.title + ' under exact hunk, dependency, evidence, and claim boundaries.'
      || pack.mode !== blueprint.mode
      || !sameSequence(pack.planTasks ?? [], blueprint.planTasks)
      || !sameSequence(pack.tuwIds ?? [], blueprint.tuwIds)) {
      fail('PACK_BLUEPRINT_CONTRACT', pack.packId);
    }
    if (!sameSequence(pack.primaryTuwIds ?? [], expectedPrimaryTuwIds)
      || !sameSequence(pack.secondaryTuwIds ?? [], expectedSecondaryTuwIds)
      || !sameSequence(pack.supportTuwIds ?? [], expectedSupportTuwIds)) {
      fail('PACK_TUW_ROLE_CONTRACT', pack.packId);
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
      || !pack.predecessorPackIds.includes(REGISTRATION_PACK_ID)
      || !pack.predecessorPackIds.includes(AMENDMENT_PACK_ID)) {
      fail('PREDECESSOR_SET', pack.packId);
    }
    for (const predecessor of pack.predecessorPackIds) {
      if ([REGISTRATION_PACK_ID, AMENDMENT_PACK_ID].includes(predecessor)) continue;
      if (!packById[predecessor]) fail('UNKNOWN_PREDECESSOR', pack.packId + ':' + predecessor);
      else if (packById[predecessor].sequence >= pack.sequence) fail('PACK_ORDER', predecessor + '->' + pack.packId);
    }
    const expectedTestAnchorRecords = classifyTestAnchors(pack, {
      basePaths: exactBasePaths,
      providersByPath,
      packById,
      blockedTriggerUnitsByPath,
    });
    if (expectedTestAnchorRecords.some(
      (record) => record.disposition === 'UNRESOLVED_EXECUTABLE_ANCHOR',
    )) {
      fail('UNRESOLVED_EXECUTABLE_TEST_ANCHOR', pack.packId);
    }
    if (digest(pack.verification?.testAnchorDispositions ?? {})
      !== digest(testAnchorDispositionPaths(expectedTestAnchorRecords))) {
      fail('TEST_ANCHOR_DISPOSITION', pack.packId);
    }
    const expectedFocusedTestPaths = sorted(unique(expectedTestAnchorRecords
      .filter((record) => [
        'AVAILABLE_AT_BASE',
        'PROVIDED_BY_CURRENT_PACK',
        'PLANNED_CURRENT_PACK_CREATE',
        'PROVIDED_BY_PREDECESSOR_PACK',
      ].includes(record.disposition))
      .map((record) => record.canonicalPath)));
    const expectedDeferredTestPaths = sorted(unique(expectedTestAnchorRecords
      .filter((record) => record.disposition === 'DEFERRED_PROVIDER_PACK')
      .map((record) => record.canonicalPath)));
    if (!sameSequence(pack.verification?.focusedTestPaths ?? [], expectedFocusedTestPaths)
      || !sameSequence(pack.verification?.deferredTestPaths ?? [], expectedDeferredTestPaths)) {
      fail('TEST_ANCHOR_AVAILABILITY_SET', pack.packId);
    }
    const actualCommands = pack.verification?.commands ?? [];
    const executableCommands = actualCommands.map(executableCommandText);
    for (const testPath of expectedFocusedTestPaths) {
      const assertionOccurrences = actualCommands.filter(
        (command) => command === FOCUSED_ASSERT_COMMAND + shellQuote(testPath),
      ).length;
      const exactRunner = FOCUSED_RUN_COMMAND + shellQuote(testPath);
      const runnerOccurrences = executableCommands.reduce(
        (count, command) => count + command.split(exactRunner).length - 1,
        0,
      );
      if (assertionOccurrences !== 1 || runnerOccurrences !== 1) {
        fail('FOCUSED_TEST_COMMAND_COVERAGE', pack.packId + ':' + testPath);
      }
    }
    const expectedFullIntegrationRuns = pack.migrationSourceOrdinals.length
      && !expectedFocusedTestPaths.includes('tests/integration') ? 1 : 0;
    const actualFocusedRunCount = executableCommands.reduce(
      (count, command) => count + command.split(FOCUSED_RUN_COMMAND).length - 1,
      0,
    );
    if (actualFocusedRunCount !== expectedFocusedTestPaths.length + expectedFullIntegrationRuns) {
      fail('FOCUSED_TEST_COMMAND_CARDINALITY', pack.packId);
    }
    for (const record of expectedTestAnchorRecords) {
      const earlierProviderPackIds = record.providerPackIds.filter(
        (providerPackId) => providerPackId !== pack.packId
          && packById[providerPackId]?.sequence < pack.sequence,
      );
      if (earlierProviderPackIds.some(
        (providerPackId) => !pack.predecessorPackIds.includes(providerPackId),
      ) || (record.disposition === 'DEFERRED_PROVIDER_PACK'
        && earlierProviderPackIds.length > 0)) {
        fail('TEST_PROVIDER_PREDECESSOR', pack.packId + ':' + record.canonicalPath);
      }
    }
    const expectedCommands = verificationCommands(pack, expectedFocusedTestPaths);
    const databaseRequired = pack.migrationSourceOrdinals.length > 0
      || expectedFocusedTestPaths.some(isIntegrationSelector);
    let expectedIsolatedDatabase = null;
    if (databaseRequired) {
      const database = isolatedDatabaseVerification(pack);
      expectedIsolatedDatabase = {
        projectName: database.projectName,
        postgresPort: database.postgresPort,
        minioApiPort: database.minioApiPort,
        minioConsolePort: database.minioConsolePort,
        ingestionPort: database.ingestionPort,
        ingestionWorkerUrl: 'http://127.0.0.1:' + database.ingestionPort,
        hostBinding: database.hostBinding,
        lockPath: database.lockPath,
        overridePath: database.overridePath,
        bucket: 'amic-vault-dev',
        freshVolumesRequired: true,
        precleanRequired: true,
        forceBuildRequired: true,
        forceRecreateRequired: true,
        cleanupExecutor: 'BASH_EXIT_TRAP_STATUS_PRESERVING',
        cleanupRequiredOnSuccessOrFailure: true,
      };
    }
    if (!sameSequence(pack.verification?.commands ?? [], expectedCommands)
      || digest(pack.verification?.isolatedDatabase ?? null) !== digest(expectedIsolatedDatabase)
      || pack.verification?.failCountRequired !== 0
      || pack.verification?.skipCountRequired !== 0
      || pack.verification?.exactHeadRequired !== true) {
      fail('PACK_VERIFICATION', pack.packId);
    }
    const expectedEvidenceTarget = '.omo/evidence/ulw/amic-vault-117-recovery-20260716/'
      + '<active-goal-id>/a<attempt>/' + pack.packId + '.txt';
    if (pack.evidenceTarget !== expectedEvidenceTarget
      || pack.repoSafeReceipt !== 'docs/execution/recovery-receipts/' + pack.packId + '.json'
      || !Array.isArray(pack.stopConditions)
      || pack.stopConditions.length < 6) {
      fail('PACK_EVIDENCE_CONTRACT', pack.packId);
    }
    const expectedTransitionTuwIds = TRANSITION_GROUPS[blueprint?.key] ?? [];
    const expectedNonCompleteTransitionTuwIds =
      NON_COMPLETE_TRANSITION_GROUPS[blueprint?.key] ?? [];
    const expectedConditionalBlockedTuwIds = blueprint?.tuwIds.filter(
      (id) => INACTIVE_TRIGGER_UNIT_IDS.has(id),
    ) ?? [];
    const controlPlane = pack.controlPlane ?? {};
    if (expectedTransitionTuwIds.some((id) => !blueprint?.tuwIds.includes(id))
      || expectedNonCompleteTransitionTuwIds.some(
        (id) => !expectedTransitionTuwIds.includes(id),
      )) {
      fail('PACK_TRANSITION_SCOPE', pack.packId);
    }
    if (!sameSequence(controlPlane.transitionTuwIds ?? [], expectedTransitionTuwIds)
      || !sameSequence(
        controlPlane.nonCompleteOnlyTransitionTuwIds ?? [],
        expectedNonCompleteTransitionTuwIds,
      )
      || !sameSequence(pack.conditionalBlockedTuwIds ?? [], expectedConditionalBlockedTuwIds)
      || !sameSet(controlPlane.transitionCommit?.exactPaths ?? [], TRANSITION_CONTROL_PLANE_PATHS)
      || controlPlane.transitionCommit?.oneRowPerCommit !== true
      || controlPlane.transitionCommit?.payloadMixingForbidden !== true
      || controlPlane.transitionCommit?.postTransitionNonControlPlaneChangeForbidden !== true
      || !sameSet(controlPlane.candidateBookkeeping?.create ?? [], [pack.repoSafeReceipt])
      || !sameSet(controlPlane.candidateBookkeeping?.modify ?? [], [EXECUTION_LEDGER_PATH])
      || controlPlane.candidateBookkeeping?.executionLedgerExactEofAppend !== true
      || controlPlane.candidateBookkeeping?.mustPrecedeTransitions !== true
      || controlPlane.candidateBookkeeping?.payloadMixingAllowed !== true) {
      fail('PACK_CONTROL_PLANE_CONTRACT', pack.packId);
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

  const testAnchorContract = payload.testAnchorContract ?? {};
  const sourceTestAnchorContract = {
    packs: packs.map((pack) => ({
      packId: pack.packId,
      rawTestAnchorPaths: pack.verification?.rawTestAnchorPaths ?? [],
    })),
    basePathCollisions: (payload.basePathCollisions ?? []).map((collision) => ({
      path: collision.path,
      rawTestAnchorPaths: collision.rawTestAnchorPaths,
      disposition: collision.testAnchorDisposition,
    })),
  };
  const sourceTestAnchorDigest = digest(sourceTestAnchorContract);
  if (sourceTestAnchorDigest !== testAnchorContract.sourceContractSha256
    || sourceTestAnchorDigest !== TEST_ANCHOR_SOURCE_CONTRACT_SHA256) {
    fail('TEST_ANCHOR_SOURCE_CONTRACT', sourceTestAnchorDigest);
  }
  if (digest(testAnchorContract.aliases ?? {}) !== digest(TEST_ANCHOR_ALIASES)) {
    fail('TEST_ANCHOR_ALIAS_CONTRACT', 'alias mapping drifted');
  }
  const expectedPlannedAcceptanceTestGaps = PLANNED_ACCEPTANCE_TEST_GAPS.map((gap) => ({
    ...gap,
    ownerPackId: executionPackByUnit[gap.ownerUnitId],
    state: 'PLANNED_NOT_YET_CREATED',
    blocksCompletionClaim: true,
  }));
  if (digest(testAnchorContract.plannedAcceptanceTestGaps ?? [])
    !== digest(expectedPlannedAcceptanceTestGaps)) {
    fail('PLANNED_ACCEPTANCE_TEST_GAP_CONTRACT', 'planned gap set drifted');
  }
  for (const gap of expectedPlannedAcceptanceTestGaps) {
    if (exactBasePaths.has(gap.path)
      || !testRunner(gap.path)
      || !sameSet(providersByPath.get(gap.path) ?? [], [gap.ownerPackId])) {
      fail('PLANNED_ACCEPTANCE_TEST_PROVIDER', gap.ownerUnitId + ':' + gap.path);
    }
  }
  if (testAnchorContract.executableAvailabilityRule
      !== 'BASE_COMMIT_OR_CURRENT_PACK_OR_TRANSITIVE_PREDECESSOR_PACK'
    || testAnchorContract.unresolvedExecutableAnchorsAllowed !== false) {
    fail('TEST_ANCHOR_AVAILABILITY_POLICY', 'availability policy drifted');
  }
  for (const pack of packs) {
    const expectedRequiredGaps = expectedPlannedAcceptanceTestGaps
      .filter((gap) => pack.tuwIds.includes(gap.ownerUnitId));
    if (digest(pack.verification?.requiredPlannedTestGaps ?? []) !== digest(expectedRequiredGaps)) {
      fail('PACK_PLANNED_TEST_GAPS', pack.packId);
    }
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

  const expectedNonOverlaySources = NON_OVERLAY_SOURCES.map(({ packKey, ...source }) => ({
    ...source,
    packId: packId(BLUEPRINTS.findIndex((blueprint) => blueprint.key === packKey) + 4),
  }));
  const nonOverlaySources = payload.nonOverlaySources ?? [];
  if (digest(nonOverlaySources) !== digest(expectedNonOverlaySources)) {
    fail('NON_OVERLAY_SOURCE_CONTRACT', 'registered Git history sources drifted');
  }
  if (new Set(nonOverlaySources.map((source) => source.sourceId)).size !== nonOverlaySources.length) {
    fail('NON_OVERLAY_SOURCE_DUPLICATE', 'duplicate source ID');
  }
  for (const source of nonOverlaySources) {
    if (!packById[source.packId]) fail('NON_OVERLAY_SOURCE_PACK', source.sourceId);
    if (!['GIT_COMMIT', 'GIT_COMMIT_RANGE'].includes(source.kind)) {
      fail('NON_OVERLAY_SOURCE_KIND', source.sourceId);
    }
    if (!Array.isArray(source.commits) || source.commits.length === 0
      || source.commits.some((commit) => !/^[0-9a-f]{40}$/.test(commit))) {
      fail('NON_OVERLAY_SOURCE_COMMITS', source.sourceId);
    }
    for (const pathAction of source.pathActions ?? []) {
      if (!['CREATE', 'MODIFY'].includes(pathAction.action)
        || pathAction.path.startsWith('docs/package/')
        || pathAction.path.startsWith('.omo/')) {
        fail('NON_OVERLAY_SOURCE_PATH', source.sourceId + ':' + pathAction.path);
      }
    }
  }
  for (const pack of packs) {
    const expectedSourceIds = nonOverlaySources
      .filter((source) => source.packId === pack.packId)
      .map((source) => source.sourceId);
    if (!sameSet(pack.nonOverlaySourceIds ?? [], expectedSourceIds)) {
      fail('PACK_NON_OVERLAY_SOURCE_SET', pack.packId);
    }
  }

  const basePathCollisions = payload.basePathCollisions ?? [];
  const basePathCollisionDigest = digest(basePathCollisions);
  if (payload.basePathCollisionSourceContractSha256 !== basePathCollisionDigest
    || basePathCollisionDigest !== BASE_PATH_COLLISION_SOURCE_CONTRACT_SHA256) {
    fail('BASE_PATH_COLLISION_SOURCE_CONTRACT', basePathCollisionDigest);
  }
  const baseCollisionByPathB64 = Object.fromEntries(
    basePathCollisions.map((collision) => [collision.pathB64, collision]),
  );
  if (new Set(basePathCollisions.map((collision) => collision.pathB64)).size
    !== basePathCollisions.length) {
    fail('BASE_PATH_COLLISION_DUPLICATE', String(basePathCollisions.length));
  }
  for (const collision of basePathCollisions) {
    const expectedPathB64 = Buffer.from(collision.path, 'utf8').toString('base64');
    if (collision.pathB64 !== expectedPathB64
      || collision.originalGitState !== 'untracked'
      || !exactBasePaths.has(collision.path)) {
      fail('BASE_PATH_COLLISION_PATH', collision.path);
      continue;
    }
    const expectedBaseSha256 = basePathSha256(collision.path);
    const identical = expectedBaseSha256 === collision.overlaySha256;
    const expectedResolution = identical
      ? 'QUARANTINE_IDENTICAL_AT_AMENDMENT_BASE'
      : 'QUARANTINE_STALE_OVERLAY_SUPERSEDED_BY_AMENDMENT_BASE';
    const expectedResolutionRef = identical
      ? 'EXACT_SHA256_EQUALITY'
      : BASE_COLLISION_SUPERSESSION_REFS[collision.path];
    if (collision.baseSha256 !== expectedBaseSha256
      || collision.resolution !== expectedResolution
      || !expectedResolutionRef
      || collision.resolutionRef !== expectedResolutionRef
      || collision.testAnchorDisposition !== 'QUARANTINED_WITH_SUPERSEDED_OVERLAY') {
      fail('BASE_PATH_COLLISION_RESOLUTION', collision.path);
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
  const historicalBaseHunks = hunks.filter((hunk) => hunk.sourceOwnerType === 'historical_base');
  const historicalBaseSourceContract = historicalBaseHunks.map(({
    ordinal,
    pathB64,
    hunkFingerprint,
    sourceOwnerType,
    sourceOwner,
    candidateUnits,
    risk,
  }) => ({
    ordinal,
    pathB64,
    hunkFingerprint,
    sourceOwnerType,
    sourceOwner,
    candidateUnits,
    risk,
  }));
  if (digest(historicalBaseSourceContract) !== HISTORICAL_BASE_SOURCE_CONTRACT_SHA256) {
    fail('HISTORICAL_BASE_SOURCE_CONTRACT', 'sealed historical-base source set drifted');
  }
  for (const hunk of historicalBaseHunks) {
    if (hunk.disposition !== 'QUARANTINE'
      || hunk.packId !== null
      || hunk.quarantineReason
        !== 'STALE_HISTORICAL_BASE_REPLACED_BY_REGISTERED_GIT_HISTORY_SOURCE') {
      fail('HISTORICAL_BASE_QUARANTINE_CONTRACT', String(hunk.ordinal));
    }
  }
  const listedHunks = new Map();
  for (const pack of packs) {
    for (const ordinal of pack.hunkOrdinals) {
      if (!hunkByOrdinal[ordinal]) fail('PACK_UNKNOWN_HUNK', pack.packId + ':' + ordinal);
      if (listedHunks.has(ordinal)) fail('HUNK_MULTI_PACK', String(ordinal));
      listedHunks.set(ordinal, pack.packId);
    }
  }
  for (const hunk of hunks) {
    const baseCollision = baseCollisionByPathB64[hunk.pathB64];
    if (hunk.disposition === 'PACK') {
      if (!packById[hunk.packId]) fail('HUNK_UNKNOWN_PACK', String(hunk.ordinal));
      if (listedHunks.get(hunk.ordinal) !== hunk.packId) fail('HUNK_PACK_MISMATCH', String(hunk.ordinal));
      if (hunk.quarantineReason !== null) fail('HUNK_QUARANTINE_REASON', String(hunk.ordinal));
    } else if (hunk.disposition !== 'QUARANTINE' || hunk.packId !== null) {
      fail('HUNK_DISPOSITION', String(hunk.ordinal));
    } else {
      const expectedReason = baseCollision
        ? (baseCollision.resolution === 'QUARANTINE_IDENTICAL_AT_AMENDMENT_BASE'
          ? 'OVERLAY_IDENTICAL_TO_AMENDMENT_BASE'
          : 'STALE_OVERLAY_SUPERSEDED_BY_AMENDMENT_BASE')
        : (hunk.sourceOwnerType === 'historical_base'
          ? 'STALE_HISTORICAL_BASE_REPLACED_BY_REGISTERED_GIT_HISTORY_SOURCE'
          : (hunk.sourceOwnerType === 'tuw' && INACTIVE_TRIGGER_UNIT_IDS.has(hunk.sourceOwner)
            ? 'INACTIVE_CONDITIONAL_TRIGGER'
            : 'SOURCE_CLASSIFICATION_QUARANTINE'));
      if (hunk.quarantineReason !== expectedReason) {
        fail('HUNK_QUARANTINE_REASON', String(hunk.ordinal));
      }
    }
    if ((baseCollision && !hunk.supersededPackId)
      || (!baseCollision && hunk.supersededPackId !== null)) {
      fail('BASE_PATH_COLLISION_HUNK_ROUTE', String(hunk.ordinal));
    }
    const triggerBlocked = hunk.quarantineReason === 'INACTIVE_CONDITIONAL_TRIGGER';
    const expectedBlockedPackId = triggerBlocked ? executionPackByUnit[hunk.sourceOwner] : null;
    const expectedTriggerId = triggerBlocked
      ? CONDITIONAL_TRIGGERS.find((row) => row.unitId === hunk.sourceOwner)?.triggerId
      : null;
    if (hunk.blockedPackId !== expectedBlockedPackId
      || hunk.activationTriggerId !== expectedTriggerId) {
      fail('INACTIVE_TRIGGER_HUNK_ROUTE', String(hunk.ordinal));
    }
  }

  const paths = payload.pathDispositions ?? [];
  if (paths.length !== 893 || new Set(paths.map((item) => item.pathB64)).size !== 893) {
    fail('PATH_COVERAGE', paths.length);
  }
  const hunksByPath = Map.groupBy(hunks, (item) => item.pathB64);
  const pathByB64 = Object.fromEntries(paths.map((entry) => [entry.pathB64, entry]));
  const expectedBaseCollisionPathB64s = paths
    .filter((entry) => entry.gitState === 'untracked'
      && exactBasePaths.has(decodePath(entry.pathB64))
      && (hunksByPath.get(entry.pathB64) ?? []).some((hunk) =>
        !['historical_base', 'quarantine'].includes(hunk.sourceOwnerType)))
    .map((entry) => entry.pathB64);
  if (!sameSet(basePathCollisions.map((collision) => collision.pathB64), expectedBaseCollisionPathB64s)) {
    fail('BASE_PATH_COLLISION_SET', String(expectedBaseCollisionPathB64s.length));
  }
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
    const expectedBaseCollisionResolution = baseCollisionByPathB64[entry.pathB64]?.resolution ?? null;
    if (!sameSet(entry.hunkOrdinals, pathHunks.map((hunk) => hunk.ordinal))
      || !sameSet(entry.packIds, expectedPackIdsForPath)
      || entry.disposition !== expectedDisposition
      || entry.baseCollisionResolution !== expectedBaseCollisionResolution) {
      fail('PATH_REVERSE_MAPPING', decoded);
    }
  }
  for (const collision of basePathCollisions) {
    const collisionHunks = hunksByPath.get(collision.pathB64) ?? [];
    if (!sameSequence(collision.hunkOrdinals ?? [], collisionHunks.map((hunk) => hunk.ordinal))
      || !sameSet(collision.supersededPackIds ?? [], collisionHunks
        .map((hunk) => hunk.supersededPackId).filter(Boolean))
      || collisionHunks.some((hunk) => hunk.disposition !== 'QUARANTINE')) {
      fail('BASE_PATH_COLLISION_HUNK_CONTRACT', collision.path);
    }
  }
  for (const pack of packs) {
    const packHunks = hunks.filter((hunk) => hunk.packId === pack.packId);
    const expectedOverlayPaths = sorted(unique(packHunks.map((hunk) => hunk.pathB64)));
    const expectedOverlayCreate = expectedOverlayPaths
      .filter((pathB64) => pathByB64[pathB64]?.gitState === 'untracked')
      .map(decodePath);
    const expectedOverlayModify = expectedOverlayPaths
      .filter((pathB64) => pathByB64[pathB64]?.gitState !== 'untracked')
      .map(decodePath);
    const packSources = nonOverlaySources.filter((source) => source.packId === pack.packId);
    const expectedSourceCreate = sorted(packSources.flatMap((source) => source.pathActions
      .filter((item) => item.action === 'CREATE')
      .map((item) => item.path)));
    const expectedSourceModify = sorted(packSources.flatMap((source) => source.pathActions
      .filter((item) => item.action === 'MODIFY')
      .map((item) => item.path)));
    const expectedPlannedTestCreate = sorted(PLANNED_ACCEPTANCE_TEST_GAPS
      .filter((gap) => executionPackByUnit[gap.ownerUnitId] === pack.packId)
      .map((gap) => gap.path));
    if (!sameSet(pack.files.overlayCreate ?? [], expectedOverlayCreate)
      || !sameSet(pack.files.overlayModify ?? [], expectedOverlayModify)
      || !sameSet(pack.files.sourceCreate ?? [], expectedSourceCreate)
      || !sameSet(pack.files.sourceModify ?? [], expectedSourceModify)
      || !sameSet(pack.files.plannedTestCreate ?? [], expectedPlannedTestCreate)) {
      fail('PACK_FILE_SOURCE_SET', pack.packId);
    }
    const effectiveActions = new Map();
    for (const file of expectedSourceModify) effectiveActions.set(file, 'MODIFY');
    for (const file of expectedSourceCreate) effectiveActions.set(file, 'CREATE');
    for (const file of expectedOverlayModify) {
      if (!effectiveActions.has(file)) effectiveActions.set(file, 'MODIFY');
    }
    for (const file of expectedOverlayCreate) effectiveActions.set(file, 'CREATE');
    for (const file of expectedPlannedTestCreate) effectiveActions.set(file, 'CREATE');
    const expectedCreate = [...effectiveActions]
      .filter(([, action]) => action === 'CREATE')
      .map(([file]) => file);
    const expectedModify = [...effectiveActions]
      .filter(([, action]) => action === 'MODIFY')
      .map(([file]) => file);
    if (!sameSet(pack.files.create ?? [], expectedCreate)
      || !sameSet(pack.files.modify ?? [], expectedModify)) {
      fail('PACK_FILE_SET', pack.packId);
    }
    const listedPaths = [...pack.files.create, ...pack.files.modify];
    if (new Set(listedPaths).size !== listedPaths.length) fail('PACK_FILE_DUPLICATE', pack.packId);
    for (const file of pack.files.create) {
      if (exactBasePaths.has(file)) fail('PACK_CREATE_BASE_COLLISION', pack.packId + ':' + file);
    }
    for (const file of pack.files.overlayCreate) {
      const row = pathByB64[Buffer.from(file, 'utf8').toString('base64')];
      if (row?.gitState !== 'untracked' || exactBasePaths.has(file)) {
        fail('PACK_CREATE_STATE', pack.packId + ':' + file);
      }
    }
    for (const file of pack.files.overlayModify) {
      const row = pathByB64[Buffer.from(file, 'utf8').toString('base64')];
      if (!row || row.gitState === 'untracked') fail('PACK_MODIFY_STATE', pack.packId + ':' + file);
    }
    const expectedShared = Object.fromEntries(expectedOverlayPaths
      .filter((pathB64) => pathByB64[pathB64]?.sharedFile)
      .map((pathB64) => [
        decodePath(pathB64),
        packHunks.filter((hunk) => hunk.pathB64 === pathB64).map((hunk) => hunk.hunkFingerprint),
      ]));
    if (digest(pack.files.sharedPathHunkSelectors) !== digest(expectedShared)) {
      fail('SHARED_HUNK_SELECTOR', pack.packId);
    }
  }
  for (const source of nonOverlaySources) {
    const sourcePack = packById[source.packId];
    for (const { path: sourcePath } of source.pathActions) {
      const row = pathByB64[Buffer.from(sourcePath, 'utf8').toString('base64')];
      for (const overlayPackId of row?.packIds ?? []) {
        if (overlayPackId !== source.packId
          && !packById[overlayPackId].predecessorPackIds.includes(source.packId)) {
          fail('NON_OVERLAY_SOURCE_PREDECESSOR', source.sourceId + ':' + sourcePath
            + ':' + overlayPackId);
        }
        if (packById[overlayPackId].sequence < sourcePack.sequence) {
          fail('NON_OVERLAY_SOURCE_ORDER', source.sourceId + ':' + sourcePath);
        }
      }
    }
  }

  const migrations = payload.migrations ?? [];
  const sourceOrdinals = migrations.map((item) => item.sourceOrdinal);
  const activeMigrations = migrations.filter((item) => item.executionDisposition === 'PACK');
  const blockedMigrations = migrations.filter(
    (item) => item.executionDisposition === 'BLOCKED_INACTIVE_TRIGGER',
  );
  const targetOrdinals = activeMigrations.map((item) => item.targetOrdinal);
  if (migrations.length !== 86) fail('MIGRATION_COUNT', migrations.length);
  if ([...sourceOrdinals].sort((a, b) => a - b).join(',') !== Array.from({ length: 86 }, (_, index) => index + 94).join(',')) {
    fail('MIGRATION_SOURCE_SET', 'not 94-179');
  }
  if ([...targetOrdinals].sort((a, b) => a - b).join(',')
    !== Array.from({ length: activeMigrations.length }, (_, index) => index + 94).join(',')) {
    fail('MIGRATION_TARGET_SET', 'active target chain is not contiguous');
  }
  if (blockedMigrations.length === 0
    || blockedMigrations.some((migration) => !INACTIVE_TRIGGER_UNIT_IDS.has(migration.ownerUnitId))) {
    fail('MIGRATION_INACTIVE_TRIGGER_SET', String(blockedMigrations.length));
  }
  let priorSequence = -1;
  for (const [index, migration] of activeMigrations.entries()) {
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
  for (const migration of blockedMigrations) {
    const trigger = CONDITIONAL_TRIGGERS.find((row) => row.unitId === migration.ownerUnitId);
    if (migration.packId !== null
      || migration.blockedPackId !== executionPackByUnit[migration.ownerUnitId]
      || migration.activationTriggerId !== trigger?.triggerId
      || migration.targetOrdinal !== null
      || migration.targetName !== null
      || migration.targetPredecessor !== null
      || migration.renumberRequired !== null) {
      fail('MIGRATION_INACTIVE_TRIGGER_ROUTE', migration.sourceName);
    }
  }
  const activeMigrationsByUnit = Map.groupBy(activeMigrations, (migration) => migration.ownerUnitId);
  for (const migration of activeMigrations) {
    for (const dependency of dependencies[migration.ownerUnitId] ?? []) {
      if (dependency.kind !== 'hard') continue;
      for (const dependencyMigration of activeMigrationsByUnit.get(dependency.id) ?? []) {
        if (dependencyMigration.packId === migration.packId
          && dependencyMigration.targetOrdinal >= migration.targetOrdinal) {
          fail('MIGRATION_HARD_DEPENDENCY_ORDER',
            dependency.id + '->' + migration.ownerUnitId + ':' + migration.packId);
        }
      }
    }
  }
  for (const pack of packs) {
    const packMigrations = activeMigrations.filter((migration) => migration.packId === pack.packId);
    if (!sameSet(pack.migrationSourceOrdinals, packMigrations.map((migration) => migration.sourceOrdinal))
      || !sameSet(pack.migrationTargetOrdinals, packMigrations.map((migration) => migration.targetOrdinal))) {
      fail('PACK_MIGRATION_MAPPING', pack.packId);
    }
    if (packMigrations.length) {
      const commands = pack.verification.commands;
      const database = isolatedDatabaseVerification(pack);
      const wrapperCommand = commands.find((command) =>
        command.startsWith('bash -c ') && command.includes(database.lockPath));
      const wrapper = wrapperCommand ? executableCommandText(wrapperCommand) : null;
      const migrateCount = wrapper?.split(' pnpm db:migrate').length - 1;
      if (!wrapper
        || migrateCount !== 2
        || !wrapper.includes(' pnpm db:rollback')
        || !wrapper.includes(' pnpm db:seed')
        || !wrapper.includes(FOCUSED_RUN_COMMAND)
        || !wrapper.includes('trap cleanup EXIT')
        || !wrapper.includes(' --build --force-recreate --renew-anon-volumes')
        || wrapper.split(' down -v --remove-orphans --rmi local').length - 1 !== 2) {
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
      const inactiveHunks = hunks.filter(
        (hunk) => hunk.sourceOwnerType === 'tuw' && hunk.sourceOwner === id,
      );
      if (inactiveHunks.some((hunk) =>
        hunk.disposition !== 'QUARANTINE'
        || hunk.quarantineReason !== 'INACTIVE_CONDITIONAL_TRIGGER')) {
        fail('TRIGGER_HUNK_EXECUTABLE', id);
      }
      const inactiveMigrations = migrations.filter((migration) => migration.ownerUnitId === id);
      if (inactiveMigrations.some(
        (migration) => migration.executionDisposition !== 'BLOCKED_INACTIVE_TRIGGER',
      )) {
        fail('TRIGGER_MIGRATION_EXECUTABLE', id);
      }
      if (packs.some((pack) => pack.controlPlane?.transitionTuwIds?.includes(id)
        && !pack.controlPlane?.nonCompleteOnlyTransitionTuwIds?.includes(id))) {
        fail('TRIGGER_COMPLETION_EXECUTABLE', id);
      }
    }
  }
  if (!sameSet(payload.quarantines?.conditionalUnitIds ?? [], [...INACTIVE_TRIGGER_UNIT_IDS])
    || !sameSet(payload.quarantines?.migrationSourceOrdinals ?? [],
      blockedMigrations.map((migration) => migration.sourceOrdinal))) {
    fail('TRIGGER_QUARANTINE_CONTRACT', 'conditional unit or migration set drifted');
  }
  if (payload.governance?.authorityRef !== AUTHORITY_REF) fail('AUTHORITY_REF', payload.governance?.authorityRef);
  if (payload.governance?.amendmentAuthorityRef !== AMENDMENT_AUTHORITY_REF) {
    fail('AMENDMENT_AUTHORITY_REF', payload.governance?.amendmentAuthorityRef);
  }
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
  const amendmentRegistration = payload.amendmentRegistration ?? {};
  if (amendmentRegistration.amendmentId !== AMENDMENT_PACK_ID
    || amendmentRegistration.branch !== AMENDMENT_BRANCH
    || amendmentRegistration.baseCommit !== BASE_COMMIT
    || amendmentRegistration.authorityRef !== AMENDMENT_AUTHORITY_REF
    || !sameSet(amendmentRegistration.tuwIds ?? [], AMENDMENT_TUW_IDS)
    || !sameSet(amendmentRegistration.allowedCreate ?? [], AMENDMENT_ALLOWED_CREATE)
    || !sameSet(amendmentRegistration.allowedModify ?? [], AMENDMENT_ALLOWED_MODIFY)) {
    fail('AMENDMENT_REGISTRATION', 'amendment contract drift');
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

function gitResult(args, cwd) {
  return spawnSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  });
}

function gitBufferResult(args, cwd) {
  return spawnSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  });
}

export function validateNonOverlayGitSources(manifest, { cwd = ROOT } = {}) {
  const errors = [];
  const fail = (code, detail) => errors.push({ code, detail });
  let commitCount = 0;
  const allPaths = new Set();
  for (const source of manifest.payload?.nonOverlaySources ?? []) {
    const history = gitResult([
      'rev-list',
      '--reverse',
      '--first-parent',
      `${source.sourceBaseCommit}..${source.sourceEndCommit}`,
    ], cwd);
    const commits = history.status === 0 ? history.stdout.split('\n').filter(Boolean) : [];
    if (history.status !== 0 || !sameSet(commits, source.commits)
      || commits.some((commit, index) => commit !== source.commits[index])) {
      fail('NON_OVERLAY_GIT_COMMIT_RANGE', source.sourceId);
      continue;
    }
    const firstParent = gitResult(['rev-parse', `${source.commits[0]}^`], cwd);
    if (firstParent.status !== 0 || firstParent.stdout.trim() !== source.sourceBaseCommit) {
      fail('NON_OVERLAY_GIT_PARENT', source.sourceId);
    }
    const touched = new Set();
    for (const commit of source.commits) {
      const shown = gitResult(['show', '--format=', '--name-only', '--no-renames', commit], cwd);
      if (shown.status !== 0) {
        fail('NON_OVERLAY_GIT_COMMIT_READ', source.sourceId + ':' + commit);
        continue;
      }
      for (const pathName of shown.stdout.split('\n').filter(Boolean)) touched.add(pathName);
    }
    const registeredPaths = source.pathActions.map((item) => item.path);
    if (!sameSet([...touched], registeredPaths)) {
      fail('NON_OVERLAY_GIT_PATH_SET', source.sourceId);
    }
    for (const pathAction of source.pathActions) {
      const exists = gitResult(['cat-file', '-e', `${manifest.payload.baseCommit}:${pathAction.path}`], cwd)
        .status === 0;
      if ((pathAction.action === 'CREATE' && exists)
        || (pathAction.action === 'MODIFY' && !exists)) {
        fail('NON_OVERLAY_BASE_PATH_STATE', source.sourceId + ':' + pathAction.path);
      }
      allPaths.add(pathAction.path);
    }
    commitCount += source.commits.length;
  }
  return {
    ok: errors.length === 0,
    errors,
    commits: commitCount,
    paths: allPaths.size,
  };
}

export function validateAuthorityArtifacts(manifest, {
  packRegistry,
  decisionLedger,
} = {}) {
  const errors = [];
  const fail = (code, detail) => errors.push({ code, detail });
  const payloadSha256 = manifest?.payloadSha256;
  const rawRegistryText = packRegistry ?? '';
  const registryText = maskNonOperationalMarkdown(rawRegistryText);
  const escapedAmendmentPackId = AMENDMENT_PACK_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const amendmentHeadingPattern = new RegExp(
    '^## ' + escapedAmendmentPackId + '(?:\\s|$).*$',
    'gm',
  );
  const amendmentHeadings = [...registryText.matchAll(amendmentHeadingPattern)];
  if (amendmentHeadings.length !== 1) {
    fail('AUTHORITY_PACK_REGISTRY_HEADING_COUNT', amendmentHeadings.length);
  }
  const exactHeadingPattern = new RegExp(
    '^' + AMENDMENT_REGISTRY_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
    'gm',
  );
  const exactHeadings = [...registryText.matchAll(exactHeadingPattern)];
  if (exactHeadings.length !== 1) {
    fail('AUTHORITY_PACK_REGISTRY_HEADING_FORMAT', exactHeadings.length);
  }
  const rawExactHeadings = [...rawRegistryText.matchAll(exactHeadingPattern)];
  if (rawExactHeadings.length !== exactHeadings.length) {
    fail('AUTHORITY_PACK_REGISTRY_NON_OPERATIONAL', rawExactHeadings.length);
  }
  const registrySectionStart = exactHeadings.length === 1 ? exactHeadings[0].index : -1;
  const registrySectionEnd = registrySectionStart < 0
    ? -1
    : registryText.indexOf('\n## ', registrySectionStart + AMENDMENT_REGISTRY_HEADING.length);
  const registrySection = registrySectionStart < 0
    ? ''
    : registryText.slice(
      registrySectionStart,
      registrySectionEnd < 0 ? registryText.length : registrySectionEnd,
    );
  const rawRegistrySectionStart = rawExactHeadings.length === 1 ? rawExactHeadings[0].index : -1;
  const rawRegistrySectionEnd = rawRegistrySectionStart < 0
    ? -1
    : rawRegistryText.indexOf('\n## ', rawRegistrySectionStart + AMENDMENT_REGISTRY_HEADING.length);
  const rawRegistrySection = rawRegistrySectionStart < 0
    ? ''
    : rawRegistryText.slice(
      rawRegistrySectionStart,
      rawRegistrySectionEnd < 0 ? rawRegistryText.length : rawRegistrySectionEnd,
    );
  const rawRegistryPreambleLines = rawRegistrySectionStart < 0
    ? []
    : rawRegistryText.slice(0, rawRegistrySectionStart).split('\n');
  const rawRegistryPreambleContent = rawRegistryPreambleLines.at(-1) === ''
    ? rawRegistryPreambleLines.slice(0, -1)
    : rawRegistryPreambleLines;
  const rawRegistryPreamble = rawRegistryPreambleContent
    .slice(rawRegistryPreambleContent.findLastIndex((line) => !line.trim()) + 1)
    .join('\n');
  const unsafeRegistryContextLines = (rawRegistryPreamble + '\n' + rawRegistrySection)
    .split('\n').filter((line) =>
    /^ {0,3}</.test(line) || /^ {0,3}<[^/]/.test(line));
  if (unsafeRegistryContextLines.length) {
    fail('AUTHORITY_PACK_REGISTRY_MARKDOWN_CONTEXT', unsafeRegistryContextLines.join('\n'));
  }
  const listMarkerPattern = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)/;
  const parentListMarkerPattern = /^([ \t]*)([-+*]|\d+[.)])(?:([ \t]+)|$)/;
  const markdownColumnWidth = (prefix) => [...prefix].reduce(
    (width, character) => character === '\t' ? width + 4 - (width % 4) : width + 1,
    0,
  );
  const isAuthorityListMarker = (line, index, lines) => {
    const marker = line.match(listMarkerPattern);
    if (!marker) return false;
    const indent = markdownColumnWidth(marker[1]);
    if (indent <= 3) return true;
    for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
      const parentLine = lines[parentIndex];
      if (!parentLine.trim()) continue;
      const parentMarker = parentLine.match(parentListMarkerPattern);
      if (parentMarker) {
        const parentIndent = markdownColumnWidth(parentMarker[1]);
        const markerEnd = markdownColumnWidth(parentMarker[1] + parentMarker[2]);
        const padding = parentMarker[3] ?? '';
        const markerPaddingEnd = markdownColumnWidth(parentMarker[1] + parentMarker[2] + padding);
        const parentContentIndent = !padding || markerPaddingEnd - markerEnd > 4
          ? markerEnd + 1
          : markerPaddingEnd;
        if (parentIndent < indent) {
          if (indent >= parentContentIndent && indent <= parentContentIndent + 3) return true;
        }
      }
      if (!parentMarker && markdownColumnWidth(parentLine.match(/^[ \t]*/)[0]) === 0) return false;
    }
    return false;
  };
  const authorityListItemText = (line, index, lines) => {
    if (!isAuthorityListMarker(line, index, lines)) return '';
    const marker = line.match(listMarkerPattern);
    const indent = markdownColumnWidth(marker[1]);
    const item = [line];
    for (let continuationIndex = index + 1; continuationIndex < lines.length; continuationIndex += 1) {
      const continuation = lines[continuationIndex];
      if (!continuation.trim() || listMarkerPattern.test(continuation)) break;
      if (markdownColumnWidth(continuation.match(/^[ \t]*/)[0]) <= indent) break;
      item.push(continuation.trim());
    }
    return item.join(' ');
  };
  const normalizeAuthorityText = (text) => text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) =>
      String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
    .replace(/[~*_]/g, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, '');
  const isCanonicalLabel = (line, index, lines) => {
    const item = normalizeAuthorityText(authorityListItemText(line, index, lines));
    return /Canonical\b/i.test(item) && /\bSHA-?256\b/i.test(item);
  };
  const canonicalLabelLines = registrySection.split('\n').filter((line) =>
    /^- Canonical payload SHA-256\s*:/i.test(line));
  const registryLines = registrySection.split('\n');
  const authorityCanonicalLabelLines = registryLines.filter((line, index, lines) =>
    isCanonicalLabel(line, index, lines));
  if (canonicalLabelLines.length !== 1) {
    fail('AUTHORITY_PACK_REGISTRY_CANONICAL_LABEL_COUNT', canonicalLabelLines.length);
  }
  if (authorityCanonicalLabelLines.length !== canonicalLabelLines.length) {
    fail('AUTHORITY_PACK_REGISTRY_CANONICAL_LABEL_COUNT', authorityCanonicalLabelLines.length);
  }
  const registryPayloadAnchors = [...registrySection.matchAll(
    /^- Canonical payload SHA-256:\n {2}`([0-9a-f]{64})`\.$/gm,
  )];
  const rawCanonicalLabelLines = rawRegistrySection.split('\n').filter((line) =>
    /^- Canonical payload SHA-256\s*:/i.test(line));
  const rawRegistryLines = rawRegistrySection.split('\n');
  const rawAuthorityCanonicalLabelLines = rawRegistryLines.filter((line, index, lines) =>
    isCanonicalLabel(line, index, lines));
  const rawRegistryPayloadAnchors = [...rawRegistrySection.matchAll(
    /^- Canonical payload SHA-256:\n {2}`([0-9a-f]{64})`\.$/gm,
  )];
  if (rawCanonicalLabelLines.length !== canonicalLabelLines.length
    || rawAuthorityCanonicalLabelLines.length !== authorityCanonicalLabelLines.length
    || rawRegistryPayloadAnchors.length !== registryPayloadAnchors.length) {
    fail('AUTHORITY_PACK_REGISTRY_NON_OPERATIONAL', {
      rawLabels: rawCanonicalLabelLines.length,
      labels: canonicalLabelLines.length,
      rawAuthorityLabels: rawAuthorityCanonicalLabelLines.length,
      authorityLabels: authorityCanonicalLabelLines.length,
      rawFields: rawRegistryPayloadAnchors.length,
      fields: registryPayloadAnchors.length,
    });
  }
  if (registryPayloadAnchors.length !== 1) {
    fail('AUTHORITY_PACK_REGISTRY_CANONICAL_FIELD_COUNT', registryPayloadAnchors.length);
  } else if (registryPayloadAnchors[0][1] !== payloadSha256) {
    fail('AUTHORITY_PACK_REGISTRY_PAYLOAD_HASH', registryPayloadAnchors[0][1]);
  }

  const decisionRecordPattern = new RegExp(
    '^- \\d{4}-\\d{2}-\\d{2} ' + escapedAmendmentPackId
      + ' authority decision record: decision=AFFIRM; authorityRef=`'
      + AMENDMENT_AUTHORITY_REF
      + '`; canonicalPayloadSha256=`([0-9a-f]{64})`; '
      + 'scope=CONTROL_PLANE_RECOVERY_MANIFEST_ONLY; '
      + 'status=AUTHORIZED_TECHNICAL_GATES_ONLY\\.$',
  );
  const rawDecisionLines = (decisionLedger ?? '').split('\n');
  const isAuthorityDecisionItem = (line, index, lines) => {
    const item = normalizeAuthorityText(authorityListItemText(line, index, lines));
    return item.includes(AMENDMENT_PACK_ID) && /authority\s+decision(?:\s+record)?\b/i.test(item);
  };
  const rawAuthorityLineIndexes = rawDecisionLines.flatMap((line, index, lines) =>
    isAuthorityDecisionItem(line, index, lines) ? [index] : []);
  const unsafeDecisionContextLines = rawAuthorityLineIndexes.flatMap((index) => {
    let preambleStart = index;
    while (preambleStart > 0 && rawDecisionLines[preambleStart - 1].trim()) preambleStart -= 1;
    return rawDecisionLines
      .slice(preambleStart, index)
      .concat(rawDecisionLines[index])
      .filter((line) => /^ {0,3}</.test(line)
        || /^ {0,3}<[^/]/.test(line)
        || /^ {0,3}`/.test(line)
        || openingFence(line));
  });
  if (unsafeDecisionContextLines.length) {
    fail('AUTHORITY_DECISION_MARKDOWN_CONTEXT', unsafeDecisionContextLines.join('\n'));
  }
  const decisionLines = maskNonOperationalMarkdown(decisionLedger ?? '').split('\n');
  const rawAuthorityLineCount = rawAuthorityLineIndexes.length;
  const decisionCandidates = decisionLines.filter((line, index, lines) =>
    isAuthorityDecisionItem(line, index, lines));
  if (rawAuthorityLineCount !== decisionCandidates.length) {
    fail('AUTHORITY_DECISION_RECORD_NON_OPERATIONAL', rawAuthorityLineCount);
  }
  const affirmativeDecisionRecords = decisionCandidates
    .map((line) => ({ line, match: line.match(decisionRecordPattern) }))
    .filter(({ match }) => match);
  if (!decisionCandidates.length) {
    fail('AUTHORITY_DECISION_RECORD_COUNT', 0);
  }
  if (new Set(affirmativeDecisionRecords.map(({ match }) => match[1])).size
    !== affirmativeDecisionRecords.length) {
    fail('AUTHORITY_DECISION_RECORD_COUNT', affirmativeDecisionRecords.length);
  }
  if (affirmativeDecisionRecords.length !== decisionCandidates.length) {
    fail('AUTHORITY_DECISION_RECORD_FORMAT', decisionCandidates.join('\n') || 'missing amendment decision');
  } else if (affirmativeDecisionRecords.at(-1)?.match[1] !== payloadSha256) {
    fail('AUTHORITY_DECISION_LEDGER_PAYLOAD_HASH', affirmativeDecisionRecords.at(-1)?.match[1]);
  }

  return { ok: errors.length === 0, errors };
}

function maskNonOperationalMarkdown(text) {
  let fence = null;
  let htmlBlock = null;
  let comment = false;
  let codeDelimiter = '';
  return text.split(/(?<=\n)/).map((line) => {
    if (fence) {
      if (isClosingFence(line, fence)) fence = null;
      return line.replace(/[^\n]/g, ' ');
    }
    if (htmlBlock) {
      if ((htmlBlock.blankEnds && /^\s*$/.test(line))
        || (!htmlBlock.blankEnds && htmlBlock.close.test(line))) htmlBlock = null;
      return line.replace(/[^\n]/g, ' ');
    }
    if (!comment && !codeDelimiter) {
      const opener = openingFence(line);
      if (opener) {
        fence = opener;
        return line.replace(/[^\n]/g, ' ');
      }
      const htmlOpener = openingHtmlBlock(line);
      if (htmlOpener) {
        if (htmlOpener.blankEnds || !htmlOpener.close.test(line)) htmlBlock = htmlOpener;
        return line.replace(/[^\n]/g, ' ');
      }
    }
    const masked = maskHtmlCommentsOutsideCodeSpans(line, { comment, codeDelimiter });
    comment = masked.comment;
    codeDelimiter = masked.codeDelimiter;
    return masked.text;
  }).join('');
}

function maskHtmlCommentsOutsideCodeSpans(line, { comment, codeDelimiter }) {
  let output = '';
  let cursor = 0;
  while (cursor < line.length) {
    if (comment) {
      const end = line.indexOf('-->', cursor);
      const stop = end < 0 ? line.length : end + 3;
      output += line.slice(cursor, stop).replace(/[^\n]/g, ' ');
      cursor = stop;
      comment = end < 0;
      continue;
    }
    if (codeDelimiter) {
      const end = exactBacktickRunIndex(line, codeDelimiter, cursor);
      const stop = end < 0 ? line.length : end + codeDelimiter.length;
      output += line.slice(cursor, stop).replace(/[^\n]/g, ' ');
      cursor = stop;
      if (end >= 0) codeDelimiter = '';
      continue;
    }
    if (line.startsWith('<!--', cursor)) {
      comment = true;
      continue;
    }
    if (line[cursor] === '`') {
      const match = line.slice(cursor).match(/^`+/);
      const delimiter = match[0];
      const end = exactBacktickRunIndex(line, delimiter, cursor + delimiter.length);
      if (end >= 0) {
        output += line.slice(cursor, end + delimiter.length);
        cursor = end + delimiter.length;
        continue;
      }
      codeDelimiter = delimiter;
      output += codeDelimiter.replace(/[^\n]/g, ' ');
      cursor += codeDelimiter.length;
      continue;
    }
    output += line[cursor];
    cursor += 1;
  }
  return { text: output, comment, codeDelimiter };
}

function exactBacktickRunIndex(line, delimiter, cursor) {
  for (let index = line.indexOf(delimiter, cursor); index >= 0; index = line.indexOf(delimiter, index + 1)) {
    if (line[index - 1] !== '`' && line[index + delimiter.length] !== '`') return index;
  }
  return -1;
}

function openingFence(line) {
  const match = line.match(/^((?: {0,3}(?:[-+*]|\d+[.)])[ \t]+)?)( {0,3})(`{3,}|~{3,})([^\n]*)/);
  if (!match) return null;
  const marker = match[3][0];
  if (marker === '`' && match[4].includes('`')) return null;
  return {
    marker,
    width: match[3].length,
    listIndent: match[1] ? match[1].length + match[2].length : 0,
  };
}

function openingHtmlBlock(line) {
  if (/^ {0,3}<!--/.test(line)) return null;
  if (/^ {0,3}<\?/.test(line)) return { close: /\?>/, blankEnds: false };
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return { close: /\]\]>/, blankEnds: false };
  if (/^ {0,3}<!/.test(line)) return { close: />/, blankEnds: false };
  const closing = line.match(/^ {0,3}<\/([A-Za-z][A-Za-z0-9-]*)\s*>/);
  if (closing && HTML_BLOCK_TAGS.has(closing[1].toLowerCase())) {
    return { close: /$^/, blankEnds: true };
  }
  const match = line.match(/^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:[ \t]|>|\/?>)/);
  if (!match) return null;
  const tag = match[1].toLowerCase();
  const specialTag = ['pre', 'script', 'style', 'textarea'].includes(tag);
  const completeTagLine = new RegExp(
    '^ {0,3}<' + tag + '(?:[ \\t]+[^>\\n]*)?/?>[ \\t]*\\r?\\n?$',
    'i',
  ).test(line);
  if (!HTML_BLOCK_TAGS.has(tag) && !completeTagLine) return null;
  return {
    close: new RegExp('</' + tag + '\\s*>', 'i'),
    blankEnds: !specialTag,
  };
}

const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center',
  'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head',
  'frame', 'frameset', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu',
  'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'pre', 'script',
  'search', 'section', 'style', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title',
  'tr', 'track', 'ul',
]);

function isClosingFence(line, fence) {
  const indent = fence.listIndent > 0
    ? '{' + fence.listIndent + ',' + (fence.listIndent + 3) + '}'
    : '{0,3}';
  const match = line.match(new RegExp('^ ' + indent + '(`+|~+)[ \\t]*\\r?\\n?$'));
  return Boolean(match
    && match[1][0] === fence.marker
    && match[1].length >= fence.width);
}

export function renderMarkdown(manifest) {
  const payload = manifest.payload;
  const activeMigrations = payload.migrations.filter(
    (item) => item.executionDisposition === 'PACK',
  );
  const blockedMigrations = payload.migrations.filter(
    (item) => item.executionDisposition === 'BLOCKED_INACTIVE_TRIGGER',
  );
  const renumbered = activeMigrations.filter((item) => item.renumberRequired).length;
  const activeMigrationEnd = String(93 + activeMigrations.length).padStart(4, '0');
  const lines = [
    '# Post-R14 Recovery PACK Manifest v2',
    '',
    'Status: AUTHORIZED_TECHNICAL_GATES_ONLY',
    '',
    '- Manifest: ' + payload.manifestId,
    '- Payload SHA-256: ' + manifest.payloadSha256,
    '- Registration PACK: ' + payload.registrationPack.packId,
    '- Registration branch: ' + payload.registrationPack.branch,
    '- Amendment: ' + payload.amendmentRegistration.amendmentId,
    '- Amendment branch: ' + payload.amendmentRegistration.branch,
    '- Amendment preimage: ' + payload.baseCommit,
    '- Authority: ' + payload.governance.authorityRef,
    '- Amendment authority: ' + payload.governance.amendmentAuthorityRef,
    '- Primary TUW coverage: 117/117',
    '- Dirty-path coverage: 893/893',
    '- Ownership-record coverage: 4801/4801',
    '- Non-overlay Git sources: 20 commits / 9 paths',
    '- Test-anchor source contract: ' + payload.testAnchorContract.sourceContractSha256,
    '- Planned acceptance-test gaps: '
      + payload.testAnchorContract.plannedAcceptanceTestGaps.length,
    '- Exact-base collision quarantine: ' + payload.basePathCollisions.length
      + ' paths (' + payload.basePathCollisions.filter((item) =>
        item.resolution === 'QUARANTINE_IDENTICAL_AT_AMENDMENT_BASE').length
      + ' identical / ' + payload.basePathCollisions.filter((item) =>
        item.resolution === 'QUARANTINE_STALE_OVERLAY_SUPERSEDED_BY_AMENDMENT_BASE').length
      + ' superseded)',
    '- Quarantine after amendment: '
      + payload.quarantines.hunkOrdinals.length + ' hunks / '
      + payload.quarantines.pathB64s.length + ' paths',
    '- Migration coverage: 86/86; active chain: ' + activeMigrations.length
      + '; trigger-blocked: ' + blockedMigrations.length
      + '; renumbered in dependency/PACK order: ' + renumbered,
    '',
    'This manifest is an execution authorization map only. It changes or lands no migration',
    'and performs no downstream or production migration. Disposable isolated verification',
    'may execute existing migrations; that is not deployment, external release, or go-live evidence.',
    '',
    '## Amendment correction',
    '',
    'The v1 overlay-only model could not execute Task 7: PACK-R14-04 had zero overlap',
    'with the required five release-history paths and would have reapplied stale 110-row',
    'historical-base material. Version 2 quarantines those 19 stale hunks and registers',
    'the exact 19-commit release-history range plus the separate one-commit LawOS source.',
    'The exact amendment base also already contains six overlay paths that the original',
    'dirty checkout classified as untracked creates. Four are byte-identical no-ops; the',
    'remaining H1-H3 pointer and ledger builder are legacy 110-row variants superseded by',
    'the merged 117-row control plane. All six stay preserved in the original checkout and',
    'are sealed as quarantine rather than recreated over the exact base.',
    '',
    'Every PACK now distinguishes effective payload files, preserved-overlay files,',
    'non-overlay source files, candidate bookkeeping, and one-row transition commits.',
    'Every raw test anchor is retained with an explicit disposition. Only tests available',
    'at the exact base, created by the current PACK, or supplied by a transitive predecessor',
    'become focused commands; later-owned anchors are deferred and seven normative tests',
    'that are explicitly planned but not yet created remain completion-blocking gaps and',
    'exact planned-create plus focused-test obligations of their owning implementation PACK.',
    'Each focused selector has a fail-closed regular-file/directory assertion and its own',
    'runner invocation, so another matching selector cannot hide a missing test. Static',
    'only/skip/todo/conditional markers are rejected, and the result wrapper requires at',
    'least one executed passing test with zero fail/skip/todo/xfail/xpass/deselection.',
    'Integration selectors require a real `.spec.ts`',
    'descendant; helper-only directories are non-executable anchors. Earlier test providers',
    'are explicit DAG predecessors. Database PACKs use PACK-specific compose projects,',
    'loopback-only ports, a serialized lock, pre-cleaned volumes, a forced exact-head ingestion',
    'build/recreate, database URLs, and ingestion worker URL with the canonical isolated bucket.',
    'A status-preserving Bash EXIT trap then runs compose up, migrate,',
    'rollback, migrate, seed, focused',
    'integration, full integration, and unconditional compose/image/volume cleanup in that order.',
    'Inactive D9, H14, and B20 hunks, migrations, implementation, and completion-state transitions remain quarantined;',
    'their sealed non-complete status adjudications remain permitted until a separately registered',
    'activation amendment supplies the matching trigger receipt.',
    'The receipt and exact EOF execution-ledger append precede transitions; transition',
    'commits then change exactly the four sealed 117-row control-plane paths. Any later',
    'non-control-plane push invalidates the candidate binding and all exact-head gates.',
    '',
    '## Registered non-overlay Git sources',
    '',
    '| Source | PACK | Commits | Paths | Mode |',
    '|---|---|---:|---:|---|',
  ];
  for (const source of payload.nonOverlaySources) {
    lines.push('| ' + source.sourceId + ' | ' + source.packId + ' | '
      + source.commits.length + ' | ' + source.pathActions.length + ' | '
      + source.reconstructionMode + ' |');
  }
  lines.push(
    '',
    '## PACK sequence',
    '',
    '| Seq | PACK | Branch | Mode | TUWs | Primary | Risk |',
    '|---:|---|---|---|---:|---:|---|',
  );
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
    'therefore preserves all 86 source files by hash/owner. The ' + activeMigrations.length
      + ' active rows receive target ordinals 0094-' + activeMigrationEnd,
    'in dependency-valid PACK and same-PACK unit-topological order; ' + blockedMigrations.length
      + ' H14 rows retain no target ordinal while their trigger is inactive.',
    'Each active migration lands with its execution PACK, its down path,',
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

function outputsMatchManifest(manifest, { json, markdown }) {
  return json === JSON.stringify(manifest, null, 2) + '\n'
    && markdown === renderMarkdown(manifest);
}

async function writeOutputs(manifest) {
  const json = JSON.stringify(manifest, null, 2) + '\n';
  const md = renderMarkdown(manifest);
  await Promise.all([writeFile(JSON_PATH, json), writeFile(MD_PATH, md)]);
  return { json, md };
}

const CLI_ACTION_OPTIONS = [
  '--assert-focused-test',
  '--run-focused-test',
  '--build',
  '--check',
];
const CLI_VALUE_OPTIONS = new Set([
  '--assert-focused-test',
  '--run-focused-test',
  '--source-dir',
]);
const CLI_BOOLEAN_OPTIONS = new Set(['--build', '--check', '--committed-only']);

export function parseCliArgs(argv) {
  const allowed = new Set([...CLI_VALUE_OPTIONS, ...CLI_BOOLEAN_OPTIONS]);
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!allowed.has(name)) throw new Error('unknown option: ' + name);
    if (options.has(name)) throw new Error(name + ' may be specified only once');
    if (CLI_VALUE_OPTIONS.has(name)) {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === '' || value.startsWith('--')) {
        throw new Error(name + ' requires a nonempty value');
      }
      options.set(name, value);
      index += 1;
    } else {
      options.set(name, true);
    }
  }

  const actions = CLI_ACTION_OPTIONS.filter((name) => options.has(name));
  if (actions.length !== 1) {
    throw new Error('exactly one action option is required: ' + CLI_ACTION_OPTIONS.join(', '));
  }
  const action = actions[0];
  const allowedByAction = {
    '--assert-focused-test': new Set(['--assert-focused-test']),
    '--run-focused-test': new Set(['--run-focused-test']),
    '--build': new Set(['--build', '--source-dir']),
    '--check': new Set(['--check', '--source-dir', '--committed-only']),
  }[action];
  const conflicting = [...options.keys()].filter((name) => !allowedByAction.has(name));
  if (conflicting.length) {
    throw new Error(action + ' does not accept: ' + conflicting.join(', '));
  }

  const sourceDir = options.get('--source-dir') ?? null;
  const committedOnly = options.has('--committed-only');
  if (action === '--check' && sourceDir && committedOnly) {
    throw new Error('--source-dir and --committed-only are mutually exclusive');
  }
  if (action === '--check' && !sourceDir && !committedOnly) {
    throw new Error('--check requires --source-dir <sealed-dir> or explicit --committed-only');
  }
  if (action === '--build' && !sourceDir) {
    throw new Error('--build requires --source-dir <sealed-dir>');
  }
  return {
    action,
    sourceDir,
    committedOnly,
    focusedTestPath: CLI_VALUE_OPTIONS.has(action) ? options.get(action) : null,
  };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.action === '--assert-focused-test') {
    const result = await assertFocusedTestPath(cli.focusedTestPath);
    console.log(JSON.stringify({ ok: true, code: 'FOCUSED_TEST_ASSERT_OK', ...result }));
    return;
  }
  if (cli.action === '--run-focused-test') {
    await runFocusedTest(cli.focusedTestPath);
    return;
  }
  const { sourceDir } = cli;
  if (cli.action === '--build') {
    const manifest = await buildManifest(sourceDir);
    const result = validateManifest(manifest);
    const gitSources = validateNonOverlayGitSources(manifest);
    const [packRegistry, decisionLedger] = await Promise.all([
      readFile(PACK_REGISTRY_PATH, 'utf8'),
      readFile(DECISION_LEDGER_PATH, 'utf8'),
    ]);
    const authority = validateAuthorityArtifacts(manifest, { packRegistry, decisionLedger });
    if (!result.ok || !gitSources.ok || !authority.ok) {
      console.error(JSON.stringify({ manifest: result, gitSources, authority }, null, 2));
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
      sourceCommits: gitSources.commits,
      sourcePaths: gitSources.paths,
    }));
    return;
  }

  const manifest = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  const result = validateManifest(manifest);
  const gitSources = validateNonOverlayGitSources(manifest);
  const expectedManifest = sourceDir ? await buildManifest(sourceDir) : manifest;
  const [actualJson, actualMd, packRegistry, decisionLedger] = await Promise.all([
    readFile(JSON_PATH, 'utf8'),
    readFile(MD_PATH, 'utf8'),
    readFile(PACK_REGISTRY_PATH, 'utf8'),
    readFile(DECISION_LEDGER_PATH, 'utf8'),
  ]);
  if (!result.ok || !gitSources.ok) {
    console.error(JSON.stringify({ manifest: result, gitSources }, null, 2));
    process.exit(1);
  }
  if (!outputsMatchManifest(expectedManifest, { json: actualJson, markdown: actualMd })) {
    console.error(JSON.stringify({ ok: false, code: 'CHECK_DRIFT', writes: 0 }));
    process.exit(1);
  }
  const authority = validateAuthorityArtifacts(expectedManifest, { packRegistry, decisionLedger });
  if (!authority.ok) {
    console.error(JSON.stringify({ ok: false, authority, writes: 0 }, null, 2));
    process.exit(1);
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
    sourceCommits: gitSources.commits,
    sourcePaths: gitSources.paths,
    writes: 0,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
