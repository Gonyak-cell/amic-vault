import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, TextDecoder } from 'node:util';

const planPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md';
const jsonPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json';
const mdPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md';
const overridesPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json';
const journalPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_TRANSITION_JOURNAL.json';
const defaultGeneratedAt = '2026-07-17T00:00:00.000Z';
const technicalSchemaId = 'PACK-R14-02-TASK5-SCHEMA-V1';
const bootstrapPhase = 'BOOTSTRAP_IMPORT';
const transitionPhase = 'TRANSITION';
const candidateRolloverPhase = 'CANDIDATE_ROLLOVER';
const finalCloseoutPhase = 'FINAL_CLOSEOUT';
const journalSchemaVersion = 'tuw-transition-journal/v1';
const journalHashAlgorithm = 'SHA-256';
const journalCanonicalization = 'AMIC-CJSON-1';
const journalAuthorityMode = 'GIT_COMMIT_V1';
const journalAuthorityCommit = '2daa27d6ecb959342ecb13396286532e64f54cab';
const finalPackPayloadSha256 =
  '32dc34bc28ea6642978098e17a80f33f4c590c49190edcbdf9e2cb03fcfa99d9';
const bootstrapId = 'PACK-R14-02-BOOTSTRAP-117';
const bootstrapSourcePlanSha256 =
  '23774be4a061ad1e887d44cbbcfb1a34cae66f13165e08ff62d44968a57a81f7';
const bootstrapOverridesSha256 = 'd0404c84bfe3e7b4d14d071a0c9f267a87eb62a512a78f3e4d98499abaae6a4a';
const bootstrapCanonicalOverridesSha256 =
  'fa0f692b4a71531a9326a221412890849b0266d8e0fceba80382ccc4713e7bf3';
const bootstrapOrderedRowSetSha256 =
  '64228240f540c1687d08fe3ac10de23ad7093d04f446d48e0580ce19c8649d8c';
const bootstrapExactIdSetSha256 =
  'eb3fe63aaad2c86ed2b58f7bcf752f7ea5ac9b6d266fb7ba79564a8d3d0e1a82';
const bootstrapSelectedTupleSha256 =
  'cb58efa92256d7d0ba0d417ca3498ea7cb69fe24bea1aa35fed5fb069546b787';
const maxEvidenceAgeSeconds = 2_592_000;

export const SEALED_ERROR_CODES = new Set([
  'E_SCHEMA_SHAPE',
  'E_SCHEMA_TIMESTAMP',
  'E_SCHEMA_HASH',
  'E_SCHEMA_GIT_SHA',
  'E_BOOTSTRAP_IDENTITY',
  'E_BOOTSTRAP_NOT_CURRENT',
  'E_METADATA_CLOCK',
  'E_EVIDENCE_LEGACY_CURRENT',
  'E_EVIDENCE_SCHEMA',
  'E_EVIDENCE_STALE',
  'E_EVIDENCE_WRONG_SHA',
  'E_EVIDENCE_SCOPE_DRIFT',
  'E_EVIDENCE_NON_DURABLE',
  'E_EVIDENCE_TEST_COUNTS',
  'E_DEPENDENCY_ALIAS',
  'E_DEPENDENCY_DUPLICATE',
  'E_DEPENDENCY_SELF',
  'E_DEPENDENCY_UNKNOWN',
  'E_DEPENDENCY_CYCLE',
  'E_DEPENDENCY_CAPABILITY_UNRESOLVED',
  'E_DEPENDENCY_CONDITION_UNKNOWN',
  'E_DEPENDENCY_GATE',
  'E_BLOCKER_ACCEPTANCE',
  'E_BLOCKER_HARD_NOT_ACCEPTABLE',
  'E_BLOCKER_POLICY_CONFLICT',
  'E_BLOCKER_SCOPE_DRIFT',
  'E_BLOCKER_NOT_COMPLETE',
  'E_JOURNAL_HEADER',
  'E_JOURNAL_GENESIS',
  'E_JOURNAL_SEQUENCE',
  'E_JOURNAL_CHAIN',
  'E_JOURNAL_HASH',
  'E_TRANSITION_MULTI_ROW',
  'E_TRANSITION_INVALID',
  'E_REPLAY_MISMATCH',
  'E_PHASE_UNADJUDICATED',
  'E_PHASE_CLOSEOUT',
  'E_DRIFT_JSON',
  'E_DRIFT_MARKDOWN',
  'E_CHECK_WRITE',
  'E_SCOPE_COMMIT',
  'E_SCOPE_PACK_SIZE',
]);

const validationStates = new Set(['BOOTSTRAP_PREIMAGE', 'CURRENT_VALIDATED']);
const evidenceTypes = new Set([
  'SOURCE',
  'CODE',
  'UNIT_TEST',
  'INTEGRATION_TEST',
  'SECURITY_TEST',
  'AUDIT_TEST',
  'MIGRATION',
  'BUILD',
  'LINT',
  'TYPECHECK',
  'DIAGNOSTIC',
  'MANUAL_QA',
  'RENDERED_QA',
  'PERFORMANCE',
  'EXTERNAL_OPERATION',
  'APPROVAL',
  'ARTIFACT',
  'RELEASE_GATE',
]);
const testLikeEvidenceTypes = new Set([
  'UNIT_TEST',
  'INTEGRATION_TEST',
  'SECURITY_TEST',
  'AUDIT_TEST',
  'MIGRATION',
  'BUILD',
  'LINT',
  'TYPECHECK',
  'DIAGNOSTIC',
  'PERFORMANCE',
  'RELEASE_GATE',
]);
const approvalOrExternalEvidenceTypes = new Set(['APPROVAL', 'EXTERNAL_OPERATION']);
const environmentClasses = new Set([
  'REPO_LOCAL',
  'CI',
  'ISOLATED_DB',
  'LOCAL_WEB',
  'PACKAGED_DESKTOP',
  'STAGING',
  'PRODUCTION',
  'EXTERNAL_PROVIDER',
  'MANUAL_OFFLINE',
]);
const producerKinds = new Set([
  'COMMAND',
  'TEST_RUNNER',
  'CI_JOB',
  'AGENT',
  'OPERATOR',
  'EXTERNAL_SYSTEM',
  'STATIC_SOURCE',
  'GENERATED_ARTIFACT',
]);
const evidenceDurabilities = new Set(['DURABLE', 'NON_DURABLE', 'GENERATED']);
const evidenceVisibilities = new Set(['REPO_SAFE', 'OPAQUE_PRIVATE']);
const invalidationTriggers = new Set([
  'CANDIDATE_SHA_DRIFT',
  'SOURCE_DRIFT',
  'CONFIG_DRIFT',
  'FIXTURE_DRIFT',
  'ARTIFACT_DRIFT',
  'TARGET_DRIFT',
  'APPROVAL_EXPIRY',
  'POST_REVIEW_PUSH',
  'TEST_COUNT_REGRESSION',
  'SKIP_NONZERO',
]);
const blockerClasses = new Set([
  'NONE',
  'POLICY_CONFLICT',
  'OWNER_DECISION',
  'EXTERNAL_EVIDENCE',
  'SOURCE_ACCESS',
  'DEPENDENCY',
  'TOOLING',
]);
const acceptableExternalBlockerClasses = new Set([
  'OWNER_DECISION',
  'EXTERNAL_EVIDENCE',
  'SOURCE_ACCESS',
]);
const acceptedBlockerAuthorityKinds = new Set(['DECISION_LEDGER', 'REGISTERED_PACK']);
const acceptedBlockerNonClaims = ['NO_EXTERNAL_EXECUTION', 'NO_GO_LIVE', 'NOT_COMPLETE'];
const allowedValidationModes = new Set(['100644', '100755', '120000', 'ABSENT']);
const dependencyKinds = new Set(['hard', 'soft', 'conditional', 'external']);
const transitionKinds = new Set([
  'ADJUDICATE',
  'PROMOTE',
  'DEMOTE',
  'BLOCK',
  'UNBLOCK',
  'REVALIDATE',
]);
const transitionControlPlanePaths = new Set([journalPath, overridesPath, jsonPath, mdPath]);
const closeoutControlPlanePaths = new Set([journalPath, jsonPath, mdPath]);

// Frozen from docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md
// (SHA-256 ee05e4e3e453fab573a8e99153eaeb3bca610e80ecc4d42b15a4491dff5474b1).
// Keep this set local to the parser: importing the source plan would make
// parser tests depend on repository files and would hide source drift.
const FROZEN_TUW_IDS = Object.freeze([
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'B1',
  'B2',
  'B3',
  'B4',
  'B6',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'D1',
  'D2',
  'D3',
  'D4',
  'E1',
  'E2',
  'E3',
  'E4',
  'F4',
  'F5',
  'G1',
  'G2',
  'H1',
  'H2',
  'H3',
  'H5',
  'H6',
  'A8',
  'A9',
  'A10',
  'A11',
  'A12',
  'A14',
  'B5',
  'B7',
  'B8',
  'B9',
  'B10',
  'B11',
  'B12',
  'C8',
  'C9',
  'C10',
  'C11',
  'C12',
  'C13',
  'C15',
  'D5',
  'D6',
  'D7',
  'D8',
  'D10',
  'E5',
  'E6',
  'E7',
  'E8',
  'E9',
  'E10',
  'E11',
  'E12',
  'F1',
  'F2',
  'F3',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'G3',
  'G5',
  'G6',
  'G7',
  'G8',
  'G9',
  'G10',
  'G11',
  'G12',
  'G13',
  'H4',
  'H7',
  'H8',
  'H9',
  'H11',
  'A13',
  'B13',
  'B14',
  'C14',
  'D9',
  'D11',
  'D12',
  'E13',
  'E14',
  'F12',
  'F13',
  'F14',
  'G4',
  'G14',
  'H12',
  'H13',
  'H14',
  'B15',
  'B16',
  'B17',
  'C16',
  'B18',
  'B19',
  'B20',
]);

export const DEPENDENCY_ALIAS_REGISTRY = Object.freeze([
  {
    ordinal: 1,
    rowId: 'D7',
    sourceLine: 1650,
    aliasKey: 'D7/B-OCR',
    sourceText: 'B(OCR 엔진 — ingestion 워커의 스캔 PDF OCR 스테이지)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:D7/B-OCR',
    emits: [{ id: 'B1', kind: 'hard' }],
  },
  {
    ordinal: 2,
    rowId: 'D8',
    sourceLine: 1678,
    aliasKey: 'D8/C-OUTLOOK-AUTO-INGEST',
    sourceText:
      'C(Outlook Graph 실연동 — 이메일 소스 자동 유입, 소프트 의존: 현행 업로드/파일링 경로만으로 완결 가능)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:D8/C-OUTLOOK-AUTO-INGEST',
    emits: [{ id: 'CAP-OUTLOOK-GRAPH-AUTO-INGEST', kind: 'soft' }],
  },
  {
    ordinal: 3,
    rowId: 'D10',
    sourceLine: 1706,
    aliasKey: 'D10/E2-GEMMA',
    sourceText:
      'E(E2 Gemma 생성·E8 Strong LLM 라우팅 — 답변 생성 품질, 소프트 의존: 기존 로컬 생성 경로로 선출시 가능)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:D10/E2-GEMMA',
    emits: [{ id: 'E2', kind: 'soft' }],
  },
  {
    ordinal: 4,
    rowId: 'D10',
    sourceLine: 1706,
    aliasKey: 'D10/E8-STRONG-ROUTING',
    sourceText:
      'E(E2 Gemma 생성·E8 Strong LLM 라우팅 — 답변 생성 품질, 소프트 의존: 기존 로컬 생성 경로로 선출시 가능)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:D10/E8-STRONG-ROUTING',
    emits: [{ id: 'E8', kind: 'soft' }],
  },
  {
    ordinal: 5,
    rowId: 'E7',
    sourceLine: 1791,
    aliasKey: 'E7/F-GRAPH-CONFIRMATION',
    sourceText: 'F(그래프 후보 candidate/confirmed 상태 스키마·승인 확정 플로우)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:E7/F-GRAPH-CONFIRMATION',
    emits: [{ id: 'CAP-GRAPH-CANDIDATE-CONFIRMATION', kind: 'conditional' }],
    registeredCondition: {
      state: 'INACTIVE',
      reason:
        'E7 scope excludes canonical graph write and confirmation; a scope amendment makes the condition ACTIVE',
    },
  },
  {
    ordinal: 6,
    rowId: 'E11',
    sourceLine: 1897,
    aliasKey: 'E11/C-OUTLOOK-THREAD-INGEST',
    sourceText: 'C(Email Vault Outlook Graph 실연동 — 쓰레드 단위 인입 확대)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:E11/C-OUTLOOK-THREAD-INGEST',
    emits: [{ id: 'CAP-OUTLOOK-GRAPH-THREAD-INGEST', kind: 'soft' }],
  },
  {
    ordinal: 7,
    rowId: 'E12',
    sourceLine: 1919,
    aliasKey: 'E12/G-HIDDEN-ROUTES',
    sourceText: 'G(contracts/dd/litigation hidden-route 봉인 해제·화면 노출)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:E12/G-HIDDEN-ROUTES',
    emits: [{ id: 'G2', kind: 'hard' }],
  },
  {
    ordinal: 8,
    rowId: 'G3',
    sourceLine: 2204,
    aliasKey: 'G3/B-DIFF',
    sourceText: 'B(문서 버전 비교 diff API/뷰)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:G3/B-DIFF',
    emits: [{ id: 'B11', kind: 'hard' }],
  },
  {
    ordinal: 9,
    rowId: 'G9',
    sourceLine: 2328,
    aliasKey: 'G9/B-WATERMARK',
    sourceText: 'B(서버사이드 PDF 워터마크 렌더링)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:G9/B-WATERMARK',
    emits: [{ id: 'B3', kind: 'hard' }],
  },
  {
    ordinal: 10,
    rowId: 'B13',
    sourceLine: 2638,
    aliasKey: 'B13/E-AI-ROUTING',
    sourceText: 'E(Gemma 구조화+Strong LLM 라우팅)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:B13/E-AI-ROUTING',
    emits: [{ id: 'CAP-AI-STRUCTURED-STRONG-ROUTING', kind: 'external' }],
  },
  {
    ordinal: 11,
    rowId: 'B13',
    sourceLine: 2638,
    aliasKey: 'B13/C-OUTLOOK-SEND',
    sourceText: 'C(Outlook Graph 송부 연동)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:B13/C-OUTLOOK-SEND',
    emits: [{ id: 'C16', kind: 'hard' }],
  },
  {
    ordinal: 12,
    rowId: 'B14',
    sourceLine: 2662,
    aliasKey: 'B14/F-CLAUSE-SEARCH',
    sourceText: 'F(조항은행 검색 API)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:B14/F-CLAUSE-SEARCH',
    emits: [{ id: 'F11', kind: 'hard' }],
  },
  {
    ordinal: 13,
    rowId: 'D11',
    sourceLine: 2758,
    aliasKey: 'D11/F-CLAUSE-CORPUS',
    sourceText: 'F(조항은행 — contract-intel 조항 파싱 데이터 적재 확대)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:D11/F-CLAUSE-CORPUS',
    emits: [{ id: 'CAP-CLAUSE-BANK-PARSED-CORPUS', kind: 'hard' }],
  },
  {
    ordinal: 14,
    rowId: 'D12',
    sourceLine: 2780,
    aliasKey: 'D12/H-LAW-DATA',
    sourceText: 'H(국내 법률데이터 연동 — 국가법령정보센터/판례 API 커넥터)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:D12/H-LAW-DATA',
    emits: [{ id: 'H12', kind: 'hard' }],
  },
  {
    ordinal: 15,
    rowId: 'E13',
    sourceLine: 2804,
    aliasKey: 'E13/B-EDITING-BASE',
    sourceText: 'B(문서 편집·버전 관리 기반)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:E13/B-EDITING-BASE',
    emits: [{ id: 'CAP-DOCUMENT-DRAFT-VERSION-PERSISTENCE', kind: 'hard' }],
  },
  {
    ordinal: 16,
    rowId: 'E14',
    sourceLine: 2827,
    aliasKey: 'E14/F-CONFIRMED-FACTS',
    sourceText: 'F(확정 graph facts — candidate→confirmed 승인 플로우)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:E14/F-CONFIRMED-FACTS',
    emits: [{ id: 'F9', kind: 'hard' }],
  },
  {
    ordinal: 17,
    rowId: 'H12',
    sourceLine: 3004,
    aliasKey: 'H12/F-AUTHORITY-CITATION',
    sourceText: 'F(F1 Authority 노드 타입·F4 Citation Ledger 연결 규약 협의 — 차단 아님)',
    resolutionRef: 'PACK-R14-02:T5-DEPREG-V1:H12/F-AUTHORITY-CITATION',
    emits: [
      { id: 'F1', kind: 'soft' },
      { id: 'F4', kind: 'soft' },
    ],
  },
]);

const bootstrapStatusCounts = Object.freeze({
  COMPLETE_CANDIDATE: 19,
  LOCAL_IMPLEMENTED_NEEDS_EVIDENCE: 80,
  EXTERNAL_BLOCKED: 11,
  UNADJUDICATED: 7,
});
const imported110Hashes = Object.freeze({
  policy: {
    algorithm: 'SHA-256',
    value: '5c8f40f9f093535f5a7a438a98335552c7e937aa6e5a8301ecf20a55a16a6040',
  },
  ledgerJson: {
    algorithm: 'SHA-256',
    value: '36004dc408cbf6c3164bdde6ab80d90312b539e0c6e1a7b5c340eca6243febb7',
  },
  ledgerMarkdown: {
    algorithm: 'SHA-256',
    value: 'bf5fe7cb3d956a64b0cfff818bf9f4d7386ff21254d42c519a879980b31586e2',
  },
  overrides: {
    algorithm: 'SHA-256',
    value: 'b94e141ab1fd796884c2d452e2da14d4f9a43b69fdbb5d07f7cf178f2bd7711a',
  },
});
const journalTopLevelKeys = Object.freeze([
  'schemaVersion',
  'hashAlgorithm',
  'canonicalization',
  'authorityMode',
  'schemaId',
  'finalPackPayloadSha256',
  'authorityCommit',
  'candidateSha',
  'validationScopeDigest',
  'asOf',
  'previousAcceptedJournalHead',
  'bootstrap',
  'genesisHash',
  'entries',
  'closeoutSeal',
]);
const candidateRolloverJournalTopLevelKeys = Object.freeze([
  ...journalTopLevelKeys,
  'candidateRollover',
]);
const candidateRolloverKeys = Object.freeze([
  'recordedAt',
  'entryCount',
  'fromCandidateSha',
  'fromValidationScopeDigest',
  'toCandidateSha',
  'toValidationScopeDigest',
  'reasonCode',
  'reason',
  'rolloverHash',
]);
const bootstrapKeys = Object.freeze([
  'bootstrapId',
  'sourcePlanSha256',
  'selectedTupleSha256',
  'imported110Hashes',
  'rowCount',
  'exactIdSetSha256',
  'orderedRowIds',
  'orderedRowSetSha256',
  'statusCounts',
  'baseOverrides',
  'baseOverridesSha256',
]);
const genesisPreimageKeys = Object.freeze([
  'schemaVersion',
  'hashAlgorithm',
  'canonicalization',
  'authorityMode',
  'schemaId',
  'finalPackPayloadSha256',
  'authorityCommit',
  'candidateSha',
  'validationScopeDigest',
  'asOf',
  'previousAcceptedJournalHead',
  'bootstrap',
]);

export function computeJournalGenesisHash(journal) {
  return amicCanonicalHash(
    Object.fromEntries(genesisPreimageKeys.map((key) => [key, journal[key]])),
  );
}

export function computeJournalEntryHash(entry) {
  const { entryHash: ignored, ...preimage } = entry;
  void ignored;
  return amicCanonicalHash(preimage);
}

export function computeCandidateRolloverHash(rollover) {
  const { rolloverHash: ignored, ...preimage } = rollover;
  void ignored;
  return amicCanonicalHash(preimage);
}

export function computeCloseoutSealHash(seal) {
  const { sealHash: ignored, ...preimage } = seal;
  void ignored;
  return amicCanonicalHash(preimage);
}

export function createBootstrapJournal(baseOverrides) {
  const bootstrap = {
    bootstrapId,
    sourcePlanSha256: { algorithm: 'SHA-256', value: bootstrapSourcePlanSha256 },
    selectedTupleSha256: { algorithm: 'SHA-256', value: bootstrapSelectedTupleSha256 },
    imported110Hashes: cloneJson(imported110Hashes),
    rowCount: 117,
    exactIdSetSha256: { algorithm: 'SHA-256', value: bootstrapExactIdSetSha256 },
    orderedRowIds: [...FROZEN_TUW_IDS],
    orderedRowSetSha256: { algorithm: 'SHA-256', value: bootstrapOrderedRowSetSha256 },
    statusCounts: { ...bootstrapStatusCounts },
    baseOverrides: cloneJson(baseOverrides),
    baseOverridesSha256: amicCanonicalHash(baseOverrides),
  };
  const journal = {
    schemaVersion: journalSchemaVersion,
    hashAlgorithm: journalHashAlgorithm,
    canonicalization: journalCanonicalization,
    authorityMode: journalAuthorityMode,
    schemaId: technicalSchemaId,
    finalPackPayloadSha256: { algorithm: 'SHA-256', value: finalPackPayloadSha256 },
    authorityCommit: journalAuthorityCommit,
    candidateSha: null,
    validationScopeDigest: null,
    asOf: defaultGeneratedAt,
    previousAcceptedJournalHead: null,
    bootstrap,
    genesisHash: null,
    entries: [],
    closeoutSeal: null,
  };
  journal.genesisHash = computeJournalGenesisHash(journal);
  return journal;
}

export class LedgerValidationError extends Error {
  constructor(code, message, context = {}) {
    if (!SEALED_ERROR_CODES.has(code)) {
      throw new Error(`Unregistered ledger validation error code: ${code}`);
    }
    super(message);
    this.name = 'LedgerValidationError';
    this.code = code;
    this.rowId = context.rowId ?? null;
    this.sequence = context.sequence ?? null;
    this.path = context.path ?? null;
  }
}

function reject(code, message, context) {
  throw new LedgerValidationError(code, message, context);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, requiredKeys, code, path) {
  if (!isRecord(value)) reject(code, `${path} must be an object`, { path });
  const actual = Object.keys(value).sort();
  const expected = [...requiredKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    reject(code, `${path} must contain exactly: ${expected.join(', ')}`, { path });
  }
}

function assertNonEmptyString(value, code, path, maxLength = Number.POSITIVE_INFINITY) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    value !== value.normalize('NFC')
  ) {
    reject(code, `${path} must be a non-empty NFC string`, { path });
  }
}

function assertNullableString(value, code, path, maxLength = Number.POSITIVE_INFINITY) {
  if (value === null) return;
  assertNonEmptyString(value, code, path, maxLength);
}

function assertSafeNonNegativeInteger(value, code, path, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    reject(code, `${path} must be a non-negative safe integer`, { path });
  }
}

function assertStringArray(value, code, path, { exact, allowed } = {}) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    reject(code, `${path} must be a string array`, { path });
  }
  if (value.some((entry) => entry !== entry.normalize('NFC'))) {
    reject(code, `${path} strings must be NFC`, { path });
  }
  if (new Set(value).size !== value.length) {
    reject(code, `${path} must not contain duplicates`, { path });
  }
  if (allowed && value.some((entry) => !allowed.has(entry))) {
    reject(code, `${path} contains an unregistered value`, { path });
  }
  if (
    exact &&
    (value.length !== exact.length || value.some((entry, index) => entry !== exact[index]))
  ) {
    reject(code, `${path} does not match the registered exact values`, { path });
  }
}

export function sha256Hash(bytes) {
  return {
    algorithm: 'SHA-256',
    value: createHash('sha256').update(bytes).digest('hex'),
  };
}

function exactBytes(value, path) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  reject('E_SCOPE_COMMIT', `${path} must be exact bytes or a UTF-8 string`, { path });
}

export function validateExecutionLedgerEofAppend(before, after, expectedAppend) {
  const beforeBytes = exactBytes(before, 'executionLedger.before');
  const afterBytes = exactBytes(after, 'executionLedger.after');
  const appendBytes = exactBytes(expectedAppend, 'executionLedger.expectedAppend');
  if (
    appendBytes.length === 0 ||
    afterBytes.length !== beforeBytes.length + appendBytes.length ||
    !afterBytes.subarray(0, beforeBytes.length).equals(beforeBytes) ||
    !afterBytes.subarray(beforeBytes.length).equals(appendBytes)
  ) {
    reject('E_SCOPE_COMMIT', 'Execution ledger change must be the exact approved EOF append');
  }
  return true;
}

export function amicCanonicalJson(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      reject('E_SCHEMA_SHAPE', 'AMIC-CJSON-1 permits safe integers only');
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(amicCanonicalJson).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key.normalize('NFC'))}:${amicCanonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  reject('E_SCHEMA_SHAPE', 'AMIC-CJSON-1 received an unsupported value');
}

export function amicCanonicalHash(value) {
  return sha256Hash(amicCanonicalJson(value));
}

function hashesEqual(left, right) {
  return (
    isRecord(left) &&
    isRecord(right) &&
    left.algorithm === right.algorithm &&
    left.value === right.value
  );
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validateHash(value, path = 'hash') {
  assertExactKeys(value, ['algorithm', 'value'], 'E_SCHEMA_HASH', path);
  if (value.algorithm !== 'SHA-256' || !/^[0-9a-f]{64}$/.test(value.value)) {
    reject('E_SCHEMA_HASH', `${path} must be a lowercase SHA-256 Hash`, { path });
  }
  return true;
}

export function validateGitSha(value, path = 'gitSha') {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    reject('E_SCHEMA_GIT_SHA', `${path} must be a lowercase 40-character Git SHA`, { path });
  }
  return true;
}

export function validateTimestamp(value, path = 'timestamp') {
  const match =
    typeof value === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value)
      : null;
  const [year, month, day, hour, minute, second, millisecond] = match
    ? match.slice(1).map(Number)
    : [];
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    !match ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    millisecond > 999 ||
    Number.isNaN(Date.parse(value))
  ) {
    reject('E_SCHEMA_TIMESTAMP', `${path} must be a calendar-valid UTC millisecond timestamp`, {
      path,
    });
  }
  return true;
}

function validateScopeEntry(entry, index) {
  const path = `validationScope.entries[${index}]`;
  assertExactKeys(entry, ['path', 'mode', 'contentSha256'], 'E_SCHEMA_SHAPE', path);
  assertNonEmptyString(entry.path, 'E_SCHEMA_SHAPE', `${path}.path`);
  if (
    entry.path.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(entry.path) ||
    entry.path.includes('\\') ||
    entry.path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    reject('E_SCHEMA_SHAPE', `${path}.path must be a normalized repo-relative path`, {
      path: `${path}.path`,
    });
  }
  if (!allowedValidationModes.has(entry.mode)) {
    reject('E_SCHEMA_SHAPE', `${path}.mode is invalid`, { path: `${path}.mode` });
  }
  if (entry.mode === 'ABSENT') {
    if (entry.contentSha256 !== null) {
      reject('E_SCHEMA_HASH', `${path}.contentSha256 must be null for ABSENT`, {
        path: `${path}.contentSha256`,
      });
    }
  } else {
    validateHash(entry.contentSha256, `${path}.contentSha256`);
  }
}

export function computeValidationScopeDigest(entries) {
  if (!Array.isArray(entries)) {
    reject('E_SCHEMA_SHAPE', 'validationScope.entries must be an array', {
      path: 'validationScope.entries',
    });
  }
  entries.forEach(validateScopeEntry);
  const paths = entries.map((entry) => entry.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((path, index) => index > 0 && paths[index - 1] > path)
  ) {
    reject('E_SCHEMA_SHAPE', 'validationScope entries must have sorted unique paths', {
      path: 'validationScope.entries',
    });
  }
  const preimage = entries
    .map(
      (entry) =>
        `${entry.path}\0${entry.mode}\0${entry.mode === 'ABSENT' ? 'ABSENT' : entry.contentSha256.value}\n`,
    )
    .join('');
  return sha256Hash(preimage);
}

export function validateValidationScope(scope, { required = true } = {}) {
  if (scope === null && !required) return true;
  assertExactKeys(scope, ['entries', 'aggregateSha256'], 'E_SCHEMA_SHAPE', 'validationScope');
  if (!Array.isArray(scope.entries)) {
    reject('E_SCHEMA_SHAPE', 'validationScope.entries must be an array', {
      path: 'validationScope.entries',
    });
  }
  if (required && scope.entries.length === 0) {
    reject('E_SCHEMA_SHAPE', 'CURRENT_VALIDATED validationScope must not be empty', {
      path: 'validationScope.entries',
    });
  }
  const computed = computeValidationScopeDigest(scope.entries);
  validateHash(scope.aggregateSha256, 'validationScope.aggregateSha256');
  if (
    scope.aggregateSha256.algorithm !== computed.algorithm ||
    scope.aggregateSha256.value !== computed.value
  ) {
    reject('E_EVIDENCE_SCOPE_DRIFT', 'validationScope aggregate does not match its entries', {
      path: 'validationScope.aggregateSha256',
    });
  }
  return true;
}

export function isNonDurableRef(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.normalize('NFC');
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(normalized)?.[1];
  if (scheme?.toLowerCase() === 'file') return true;
  if (/^\/tmp(?:\/|$)/.test(normalized) || /^\/private\/tmp(?:\/|$)/.test(normalized)) {
    return true;
  }
  const repoRelative = normalized.replace(/^(?:\.\/)+/, '');
  return /^(?:\.omo|tmp)(?:\/|$)/.test(repoRelative);
}

function validateEnvironment(environment) {
  assertExactKeys(
    environment,
    ['class', 'targetRef', 'targetHash'],
    'E_EVIDENCE_SCHEMA',
    'evidence.environment',
  );
  if (!environmentClasses.has(environment.class)) {
    reject('E_EVIDENCE_SCHEMA', 'evidence.environment.class is invalid', {
      path: 'evidence.environment.class',
    });
  }
  assertNonEmptyString(
    environment.targetRef,
    'E_EVIDENCE_SCHEMA',
    'evidence.environment.targetRef',
  );
  if (environment.targetHash !== null) {
    validateHash(environment.targetHash, 'evidence.environment.targetHash');
  }
}

function validateProvenance(provenance, evidenceType) {
  const requiredKeys = [
    'producerKind',
    'producerRef',
    'receiptRef',
    'ownerRole',
    'commandRef',
    'approvalRef',
    'approvalScopeHash',
    'expiresAt',
    'exitCode',
    'expectedCount',
    'passCount',
    'failCount',
    'skipCount',
    'visibility',
    'durability',
    'nonClaims',
    'invalidationTriggers',
  ];
  assertExactKeys(provenance, requiredKeys, 'E_EVIDENCE_SCHEMA', 'evidence.provenance');
  if (!producerKinds.has(provenance.producerKind)) {
    reject('E_EVIDENCE_SCHEMA', 'evidence.provenance.producerKind is invalid', {
      path: 'evidence.provenance.producerKind',
    });
  }
  assertNonEmptyString(
    provenance.producerRef,
    'E_EVIDENCE_SCHEMA',
    'evidence.provenance.producerRef',
  );
  assertNullableString(
    provenance.receiptRef,
    'E_EVIDENCE_SCHEMA',
    'evidence.provenance.receiptRef',
    512,
  );
  if (
    typeof provenance.ownerRole !== 'string' ||
    !/^[A-Z][A-Z0-9_-]{1,63}$/.test(provenance.ownerRole)
  ) {
    reject('E_EVIDENCE_SCHEMA', 'evidence.provenance.ownerRole is invalid', {
      path: 'evidence.provenance.ownerRole',
    });
  }
  assertNullableString(
    provenance.commandRef,
    'E_EVIDENCE_SCHEMA',
    'evidence.provenance.commandRef',
    512,
  );
  assertNullableString(
    provenance.approvalRef,
    'E_EVIDENCE_SCHEMA',
    'evidence.provenance.approvalRef',
    512,
  );
  if (provenance.approvalScopeHash !== null)
    validateHash(provenance.approvalScopeHash, 'evidence.provenance.approvalScopeHash');
  if (provenance.expiresAt !== null)
    validateTimestamp(provenance.expiresAt, 'evidence.provenance.expiresAt');
  assertSafeNonNegativeInteger(
    provenance.exitCode,
    'E_EVIDENCE_SCHEMA',
    'evidence.provenance.exitCode',
    { nullable: true },
  );
  for (const field of ['expectedCount', 'passCount', 'failCount', 'skipCount']) {
    assertSafeNonNegativeInteger(
      provenance[field],
      'E_EVIDENCE_SCHEMA',
      `evidence.provenance.${field}`,
      { nullable: true },
    );
  }
  if (!evidenceVisibilities.has(provenance.visibility)) {
    reject('E_EVIDENCE_SCHEMA', 'evidence.provenance.visibility is invalid', {
      path: 'evidence.provenance.visibility',
    });
  }
  if (!evidenceDurabilities.has(provenance.durability)) {
    reject('E_EVIDENCE_SCHEMA', 'evidence.provenance.durability is invalid', {
      path: 'evidence.provenance.durability',
    });
  }
  assertStringArray(provenance.nonClaims, 'E_EVIDENCE_SCHEMA', 'evidence.provenance.nonClaims');
  assertStringArray(
    provenance.invalidationTriggers,
    'E_EVIDENCE_SCHEMA',
    'evidence.provenance.invalidationTriggers',
    { allowed: invalidationTriggers },
  );
  if (provenance.producerKind === 'GENERATED_ARTIFACT' && provenance.durability !== 'GENERATED') {
    reject('E_EVIDENCE_SCHEMA', 'generated producers require GENERATED durability', {
      path: 'evidence.provenance.durability',
    });
  }
  if (testLikeEvidenceTypes.has(evidenceType)) {
    const { exitCode, expectedCount, passCount, failCount, skipCount } = provenance;
    if (
      exitCode !== 0 ||
      !Number.isSafeInteger(expectedCount) ||
      expectedCount <= 0 ||
      failCount !== 0 ||
      skipCount !== 0 ||
      expectedCount !== passCount + failCount + skipCount
    ) {
      reject('E_EVIDENCE_TEST_COUNTS', 'test-like evidence counts are invalid', {
        path: 'evidence.provenance',
      });
    }
  }
  if (
    approvalOrExternalEvidenceTypes.has(evidenceType) &&
    (provenance.approvalRef === null ||
      provenance.approvalScopeHash === null ||
      provenance.expiresAt === null)
  ) {
    reject('E_EVIDENCE_SCHEMA', 'approval/external evidence requires approval binding and expiry', {
      path: 'evidence.provenance',
    });
  }
}

export function validateEvidence(evidence, { asOf, candidateSha, validationScopeDigest } = {}) {
  const legacyKeys = isRecord(evidence) ? Object.keys(evidence).sort() : [];
  if (
    legacyKeys.length === 3 &&
    legacyKeys[0] === 'note' &&
    legacyKeys[1] === 'ref' &&
    legacyKeys[2] === 'type'
  ) {
    reject(
      'E_EVIDENCE_LEGACY_CURRENT',
      'legacy evidence may only appear in historicalEvidenceRefs',
      { path: 'evidenceRefs' },
    );
  }
  assertExactKeys(
    evidence,
    [
      'type',
      'ref',
      'hash',
      'timestamp',
      'candidateSha',
      'validationScopeDigest',
      'environment',
      'provenance',
    ],
    'E_EVIDENCE_SCHEMA',
    'evidence',
  );
  if (!evidenceTypes.has(evidence.type))
    reject('E_EVIDENCE_SCHEMA', 'evidence.type is invalid', { path: 'evidence.type' });
  assertNonEmptyString(evidence.ref, 'E_EVIDENCE_SCHEMA', 'evidence.ref', 512);
  validateHash(evidence.hash, 'evidence.hash');
  validateTimestamp(evidence.timestamp, 'evidence.timestamp');
  validateGitSha(evidence.candidateSha, 'evidence.candidateSha');
  validateHash(evidence.validationScopeDigest, 'evidence.validationScopeDigest');
  validateEnvironment(evidence.environment);
  validateProvenance(evidence.provenance, evidence.type);
  validateTimestamp(asOf, 'generationMetadata.asOf');
  validateGitSha(candidateSha, 'row.validatedCandidateSha');
  validateHash(validationScopeDigest, 'row.validationScope.aggregateSha256');
  if (evidence.candidateSha !== candidateSha)
    reject('E_EVIDENCE_WRONG_SHA', 'evidence candidate SHA does not match the validated row', {
      path: 'evidence.candidateSha',
    });
  if (
    evidence.validationScopeDigest.algorithm !== validationScopeDigest.algorithm ||
    evidence.validationScopeDigest.value !== validationScopeDigest.value
  ) {
    reject('E_EVIDENCE_SCOPE_DRIFT', 'evidence validation scope does not match the validated row', {
      path: 'evidence.validationScopeDigest',
    });
  }
  const timestampMs = Date.parse(evidence.timestamp);
  const asOfMs = Date.parse(asOf);
  if (timestampMs > asOfMs || asOfMs - timestampMs > maxEvidenceAgeSeconds * 1000) {
    reject('E_EVIDENCE_STALE', 'evidence timestamp is stale or later than journal asOf', {
      path: 'evidence.timestamp',
    });
  }
  if (
    evidence.provenance.expiresAt !== null &&
    Date.parse(evidence.provenance.expiresAt) <= asOfMs
  ) {
    reject('E_EVIDENCE_STALE', 'evidence approval has expired at journal asOf', {
      path: 'evidence.provenance.expiresAt',
    });
  }
  const locatorValues = [
    evidence.ref,
    evidence.environment.targetRef,
    evidence.provenance.producerRef,
    evidence.provenance.receiptRef,
    evidence.provenance.commandRef,
    evidence.provenance.approvalRef,
  ].filter((value) => typeof value === 'string');
  if (evidence.provenance.durability === 'DURABLE' && locatorValues.some(isNonDurableRef)) {
    reject('E_EVIDENCE_NON_DURABLE', 'durable evidence uses a non-durable lexical reference', {
      path: 'evidence.ref',
    });
  }
  return true;
}

function validateHistoricalEvidence(evidence, rowId, index) {
  const path = `unitOverrides.${rowId}.historicalEvidenceRefs[${index}]`;
  assertExactKeys(evidence, ['type', 'ref', 'note'], 'E_SCHEMA_SHAPE', path);
  for (const field of ['type', 'ref', 'note']) {
    if (
      typeof evidence[field] !== 'string' ||
      evidence[field] !== evidence[field].normalize('NFC')
    ) {
      reject('E_SCHEMA_SHAPE', `${path}.${field} must be an NFC string`, {
        rowId,
        path: `${path}.${field}`,
      });
    }
  }
}

function registeredAliasForDependency(rowId, dependency) {
  return DEPENDENCY_ALIAS_REGISTRY.find(
    (alias) =>
      alias.rowId === rowId &&
      alias.resolutionRef === dependency.resolutionRef &&
      alias.sourceText === dependency.sourceText &&
      alias.emits.some(
        (emitted) => emitted.id === dependency.id && emitted.kind === dependency.kind,
      ),
  );
}

function validateDependencyRecords(row) {
  if (!Array.isArray(row.dependencies)) {
    reject('E_SCHEMA_SHAPE', `dependencies must be an array for ${row.id}`, { rowId: row.id });
  }
  const seen = new Set();
  for (const [index, dependency] of row.dependencies.entries()) {
    const path = `${row.id}.dependencies[${index}]`;
    assertExactKeys(
      dependency,
      ['id', 'kind', 'sourceText', 'resolutionRef'],
      'E_SCHEMA_SHAPE',
      path,
    );
    if (typeof dependency.id !== 'string' || !/^(?:[A-H][0-9]+|CAP-[A-Z0-9-]+)$/.test(dependency.id)) {
      reject('E_DEPENDENCY_UNKNOWN', `${path}.id is invalid`, { rowId: row.id, path });
    }
    if (!dependencyKinds.has(dependency.kind)) {
      reject('E_DEPENDENCY_UNKNOWN', `${path}.kind is invalid`, { rowId: row.id, path });
    }
    assertNonEmptyString(dependency.sourceText, 'E_DEPENDENCY_ALIAS', `${path}.sourceText`);
    if (dependency.resolutionRef !== null) {
      assertNonEmptyString(
        dependency.resolutionRef,
        'E_DEPENDENCY_ALIAS',
        `${path}.resolutionRef`,
      );
      if (!registeredAliasForDependency(row.id, dependency)) {
        reject('E_DEPENDENCY_ALIAS', `${path} does not match the sealed alias registry`, {
          rowId: row.id,
          path,
        });
      }
    } else {
      if (dependency.id.startsWith('CAP-')) {
        reject('E_DEPENDENCY_ALIAS', `${path} uses an unresolved non-registry capability`, {
          rowId: row.id,
          path,
        });
      }
      if (!FROZEN_TUW_IDS.includes(dependency.id)) {
        reject('E_DEPENDENCY_UNKNOWN', `${path} references an unknown TUW`, {
          rowId: row.id,
          path,
        });
      }
      if (!new RegExp(`^${dependency.id}(?:\\(|$)`).test(dependency.sourceText)) {
        reject('E_DEPENDENCY_ALIAS', `${path}.sourceText does not preserve its exact TUW ID`, {
          rowId: row.id,
          path,
        });
      }
      if (dependency.kind === 'external') {
        reject('E_DEPENDENCY_ALIAS', 'external dependency kind is registry-only', {
          rowId: row.id,
          path,
        });
      }
    }
    if (dependency.id === row.id) {
      reject('E_DEPENDENCY_SELF', `Row ${row.id} depends on itself`, { rowId: row.id, path });
    }
    if (seen.has(dependency.id)) {
      reject('E_DEPENDENCY_DUPLICATE', `Row ${row.id} repeats ${dependency.id}`, {
        rowId: row.id,
        path,
      });
    }
    seen.add(dependency.id);
  }
}

function validateDependencyConditions(conditions, row) {
  const rowId = row.id;
  if (!Array.isArray(conditions))
    reject('E_SCHEMA_SHAPE', 'dependencyConditions must be an array', { rowId });
  const seen = new Set();
  for (const [index, condition] of conditions.entries()) {
    const path = `dependencyConditions[${index}]`;
    assertExactKeys(
      condition,
      ['dependencyId', 'state', 'decisionRef', 'decisionHash'],
      'E_SCHEMA_SHAPE',
      path,
    );
    assertNonEmptyString(condition.dependencyId, 'E_SCHEMA_SHAPE', `${path}.dependencyId`);
    if (seen.has(condition.dependencyId)) {
      reject('E_DEPENDENCY_CONDITION_UNKNOWN', `${path}.dependencyId is duplicated`, {
        rowId,
        path,
      });
    }
    seen.add(condition.dependencyId);
    const dependency = row.dependencies.find((entry) => entry.id === condition.dependencyId);
    if (!dependency || dependency.kind !== 'conditional') {
      reject('E_DEPENDENCY_CONDITION_UNKNOWN', `${path} has no conditional dependency`, {
        rowId,
        path,
      });
    }
    if (!['ACTIVE', 'INACTIVE'].includes(condition.state))
      reject('E_DEPENDENCY_CONDITION_UNKNOWN', `${path}.state is invalid`, { rowId, path });
    assertNonEmptyString(condition.decisionRef, 'E_SCHEMA_SHAPE', `${path}.decisionRef`);
    validateHash(condition.decisionHash, `${path}.decisionHash`);
  }
}

function dependencyConditionState(row, dependency) {
  const explicit = row.dependencyConditions.find(
    (condition) => condition.dependencyId === dependency.id,
  );
  if (explicit) return explicit.state;
  const registered = registeredAliasForDependency(row.id, dependency)?.registeredCondition;
  return registered?.state ?? 'ACTIVE';
}

function gatingDependencies(row) {
  return row.dependencies.filter((dependency) => {
    if (dependency.kind === 'soft') return false;
    if (dependency.kind === 'conditional') {
      return dependencyConditionState(row, dependency) === 'ACTIVE';
    }
    return true;
  });
}

export function validateAcceptedBlocker(blocker, { row, asOf } = {}) {
  const requiredKeys = [
    'dependencyId',
    'blockerClass',
    'disposition',
    'scope',
    'authorityKind',
    'authorityRef',
    'authorityHash',
    'acceptedAt',
    'expiresAt',
    'candidateSha',
    'validationScopeDigest',
    'nonClaims',
  ];
  assertExactKeys(blocker, requiredKeys, 'E_BLOCKER_ACCEPTANCE', 'acceptedBlocker');
  if (!acceptableExternalBlockerClasses.has(blocker.blockerClass)) {
    const code =
      blocker.blockerClass === 'POLICY_CONFLICT'
        ? 'E_BLOCKER_POLICY_CONFLICT'
        : 'E_BLOCKER_ACCEPTANCE';
    reject(code, 'blocker class is not registered as an acceptable external boundary', {
      rowId: row?.id,
      path: 'acceptedBlocker.blockerClass',
    });
  }
  if (blocker.blockerClass !== row?.blockerClass)
    reject('E_BLOCKER_ACCEPTANCE', 'accepted blocker class must match the affected row', {
      rowId: row?.id,
    });
  if (blocker.disposition !== 'ACCEPT_DEFER' || blocker.scope !== 'DEPENDENCY_ORDER_ONLY')
    reject('E_BLOCKER_ACCEPTANCE', 'accepted blocker disposition or scope is invalid', {
      rowId: row?.id,
    });
  if (!acceptedBlockerAuthorityKinds.has(blocker.authorityKind))
    reject('E_BLOCKER_ACCEPTANCE', 'accepted blocker authority kind is invalid', {
      rowId: row?.id,
    });
  assertNonEmptyString(
    blocker.dependencyId,
    'E_BLOCKER_ACCEPTANCE',
    'acceptedBlocker.dependencyId',
  );
  assertNonEmptyString(
    blocker.authorityRef,
    'E_BLOCKER_ACCEPTANCE',
    'acceptedBlocker.authorityRef',
    512,
  );
  validateHash(blocker.authorityHash, 'acceptedBlocker.authorityHash');
  validateTimestamp(blocker.acceptedAt, 'acceptedBlocker.acceptedAt');
  validateTimestamp(blocker.expiresAt, 'acceptedBlocker.expiresAt');
  validateGitSha(blocker.candidateSha, 'acceptedBlocker.candidateSha');
  validateHash(blocker.validationScopeDigest, 'acceptedBlocker.validationScopeDigest');
  assertStringArray(blocker.nonClaims, 'E_BLOCKER_ACCEPTANCE', 'acceptedBlocker.nonClaims', {
    exact: acceptedBlockerNonClaims,
  });
  const dependency = Array.isArray(row?.dependencies)
    ? row.dependencies.find((entry) => isRecord(entry) && entry.id === blocker.dependencyId)
    : undefined;
  if (!dependency || dependency.kind !== 'external') {
    const code =
      dependency && ['hard', 'conditional'].includes(dependency.kind)
        ? 'E_BLOCKER_HARD_NOT_ACCEPTABLE'
        : 'E_BLOCKER_ACCEPTANCE';
    reject(code, 'accepted blockers apply only to a schema-registered external dependency', {
      rowId: row?.id,
    });
  }
  validateTimestamp(asOf, 'generationMetadata.asOf');
  const acceptedAtMs = Date.parse(blocker.acceptedAt);
  const expiresAtMs = Date.parse(blocker.expiresAt);
  if (
    acceptedAtMs >= expiresAtMs ||
    expiresAtMs <= Date.parse(asOf) ||
    expiresAtMs - acceptedAtMs > 7_776_000 * 1000
  ) {
    reject('E_BLOCKER_ACCEPTANCE', 'accepted blocker timestamps exceed the registered limits', {
      rowId: row?.id,
    });
  }
  if (blocker.candidateSha !== row?.validatedCandidateSha)
    reject('E_BLOCKER_SCOPE_DRIFT', 'accepted blocker candidate SHA does not match the row', {
      rowId: row?.id,
    });
  const rowScopeDigest = row?.validationScope?.aggregateSha256;
  if (
    !rowScopeDigest ||
    blocker.validationScopeDigest.algorithm !== rowScopeDigest.algorithm ||
    blocker.validationScopeDigest.value !== rowScopeDigest.value
  ) {
    reject('E_BLOCKER_SCOPE_DRIFT', 'accepted blocker validation scope does not match the row', {
      rowId: row?.id,
    });
  }
  return true;
}

function validateBlockingState(row, asOf) {
  if (!blockerClasses.has(row.blockerClass))
    reject('E_BLOCKER_ACCEPTANCE', `Invalid blockerClass for ${row.id}`, { rowId: row.id });
  if (!Array.isArray(row.blockingRefs))
    reject('E_BLOCKER_ACCEPTANCE', `blockingRefs must be an array for ${row.id}`, {
      rowId: row.id,
    });
  for (const ref of row.blockingRefs)
    assertNonEmptyString(ref, 'E_BLOCKER_ACCEPTANCE', `${row.id}.blockingRefs`, 512);
  if (
    new Set(row.blockingRefs).size !== row.blockingRefs.length ||
    row.blockingRefs.some((ref, index) => index > 0 && row.blockingRefs[index - 1] > ref)
  ) {
    reject('E_BLOCKER_ACCEPTANCE', `blockingRefs must be sorted and unique for ${row.id}`, {
      rowId: row.id,
    });
  }
  if (!Array.isArray(row.acceptedBlockers))
    reject('E_BLOCKER_ACCEPTANCE', `acceptedBlockers must be an array for ${row.id}`, {
      rowId: row.id,
    });
  if (row.blockerClass === 'NONE') {
    if (row.blockingRefs.length !== 0 || row.acceptedBlockers.length !== 0)
      reject('E_BLOCKER_ACCEPTANCE', `NONE blocker must not carry refs for ${row.id}`, {
        rowId: row.id,
      });
  } else if (row.blockingRefs.length === 0) {
    reject('E_BLOCKER_ACCEPTANCE', `Non-NONE blocker requires refs for ${row.id}`, {
      rowId: row.id,
    });
  }
  row.acceptedBlockers.forEach((blocker) => validateAcceptedBlocker(blocker, { row, asOf }));
}

export function isCurrentComplete(row) {
  if (
    row.validationState !== 'CURRENT_VALIDATED' ||
    row.status !== 'COMPLETE_CANDIDATE' ||
    row.blockerClass !== 'NONE' ||
    row.acceptedBlockers.length !== 0 ||
    row.remainingGaps.length !== 0
  )
    return false;
  return row.evidenceRefs.some(
    (evidence) =>
      evidence.provenance.durability === 'DURABLE' &&
      evidence.provenance.producerKind !== 'GENERATED_ARTIFACT' &&
      !isNonDurableRef(evidence.ref),
  );
}

export function validateLedgerRow(row, { asOf = defaultGeneratedAt } = {}) {
  if (!isRecord(row)) reject('E_SCHEMA_SHAPE', 'Ledger row must be an object');
  assertNonEmptyString(row.id, 'E_SCHEMA_SHAPE', 'row.id');
  if (!Object.hasOwn(statusTaxonomy, row.status))
    reject('E_SCHEMA_SHAPE', `Invalid status for ${row.id}`, { rowId: row.id, path: 'status' });
  if (!validationStates.has(row.validationState))
    reject('E_SCHEMA_SHAPE', `Invalid validationState for ${row.id}`, {
      rowId: row.id,
      path: 'validationState',
    });
  if (
    !Array.isArray(row.remainingGaps) ||
    row.remainingGaps.some(
      (gap) => typeof gap !== 'string' || gap.trim().length === 0 || gap !== gap.normalize('NFC'),
    )
  )
    reject('E_SCHEMA_SHAPE', `remainingGaps must contain non-empty NFC strings for ${row.id}`, {
      rowId: row.id,
      path: 'remainingGaps',
    });
  assertNonEmptyString(row.statusRationale, 'E_SCHEMA_SHAPE', `${row.id}.statusRationale`);
  assertNonEmptyString(row.nextAction, 'E_SCHEMA_SHAPE', `${row.id}.nextAction`);
  if (!Array.isArray(row.historicalEvidenceRefs))
    reject('E_SCHEMA_SHAPE', `historicalEvidenceRefs must be an array for ${row.id}`, {
      rowId: row.id,
    });
  row.historicalEvidenceRefs.forEach((evidence, index) =>
    validateHistoricalEvidence(evidence, row.id, index),
  );
  if (!Array.isArray(row.evidenceRefs))
    reject('E_EVIDENCE_SCHEMA', `evidenceRefs must be an array for ${row.id}`, { rowId: row.id });
  validateDependencyRecords(row);
  validateDependencyConditions(row.dependencyConditions, row);
  validateBlockingState(row, asOf);
  if (row.validationState === 'BOOTSTRAP_PREIMAGE') {
    if (
      row.validatedCandidateSha !== null ||
      row.validationScope !== null ||
      row.evidenceRefs.length !== 0
    )
      reject('E_BOOTSTRAP_NOT_CURRENT', `Bootstrap row ${row.id} cannot carry current validation`, {
        rowId: row.id,
      });
    if (row.acceptedBlockers.length !== 0 || row.dependencyConditions.length !== 0)
      reject(
        'E_BOOTSTRAP_NOT_CURRENT',
        `Bootstrap row ${row.id} cannot accept blockers or conditions`,
        { rowId: row.id },
      );
    const expectedClass = row.status === 'EXTERNAL_BLOCKED' ? 'EXTERNAL_EVIDENCE' : 'NONE';
    if (row.blockerClass !== expectedClass)
      reject('E_BLOCKER_ACCEPTANCE', `Bootstrap blocker class is invalid for ${row.id}`, {
        rowId: row.id,
      });
    if (expectedClass === 'EXTERNAL_EVIDENCE') {
      const expectedRef = `${planPath}:${row.source?.planLine}`;
      if (row.blockingRefs.length !== 1 || row.blockingRefs[0] !== expectedRef) {
        reject(
          'E_BLOCKER_ACCEPTANCE',
          `Bootstrap blocking refs must bind the exact source-plan row for ${row.id}`,
          { rowId: row.id },
        );
      }
    }
  } else {
    validateGitSha(row.validatedCandidateSha, `${row.id}.validatedCandidateSha`);
    validateValidationScope(row.validationScope);
    for (const evidence of row.evidenceRefs)
      validateEvidence(evidence, {
        asOf,
        candidateSha: row.validatedCandidateSha,
        validationScopeDigest: row.validationScope.aggregateSha256,
      });
  }
  if (row.status !== 'COMPLETE_CANDIDATE' && row.remainingGaps.length === 0)
    reject('E_SCHEMA_SHAPE', `Non-complete row ${row.id} requires remaining gaps`, {
      rowId: row.id,
    });
  if (
    row.validationState === 'CURRENT_VALIDATED' &&
    row.status === 'COMPLETE_CANDIDATE' &&
    !isCurrentComplete(row)
  )
    reject(
      'E_BLOCKER_NOT_COMPLETE',
      `Row ${row.id} lacks durable non-generated completion support`,
      { rowId: row.id },
    );
  if (row.status === 'EXTERNAL_BLOCKED' && isCurrentComplete(row))
    reject('E_BLOCKER_NOT_COMPLETE', `EXTERNAL_BLOCKED row ${row.id} can never be complete`, {
      rowId: row.id,
    });
  if (row.status === 'UNADJUDICATED') {
    const allowed = new Set(['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20']);
    if (row.validationState !== 'BOOTSTRAP_PREIMAGE' || !allowed.has(row.id))
      reject('E_PHASE_UNADJUDICATED', `UNADJUDICATED is not allowed for ${row.id}`, {
        rowId: row.id,
      });
  }
  return true;
}

export function validateLedgerRows(rows, { asOf = defaultGeneratedAt } = {}) {
  if (!Array.isArray(rows)) reject('E_SCHEMA_SHAPE', 'Ledger rows must be an array');
  rows.forEach((row) => validateLedgerRow(row, { asOf }));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  if (rowsById.size !== rows.length) {
    reject('E_DEPENDENCY_DUPLICATE', 'Ledger rows contain a duplicate ID');
  }
  for (const row of rows) {
    for (const dependency of row.dependencies) {
      if (!dependency.id.startsWith('CAP-') && !rowsById.has(dependency.id)) {
        reject('E_DEPENDENCY_UNKNOWN', `Row ${row.id} references unknown ${dependency.id}`, {
          rowId: row.id,
        });
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (row) => {
    if (visiting.has(row.id)) {
      reject('E_DEPENDENCY_CYCLE', `Dependency cycle reaches ${row.id}`, { rowId: row.id });
    }
    if (visited.has(row.id)) return;
    visiting.add(row.id);
    for (const dependency of gatingDependencies(row)) {
      const dependencyRow = rowsById.get(dependency.id);
      if (dependencyRow) visit(dependencyRow);
    }
    visiting.delete(row.id);
    visited.add(row.id);
  };
  rows.forEach(visit);

  for (const row of rows) {
    if (!isCurrentComplete(row)) continue;
    for (const dependency of gatingDependencies(row)) {
      if (dependency.id.startsWith('CAP-')) {
        reject(
          'E_DEPENDENCY_CAPABILITY_UNRESOLVED',
          `Current completion for ${row.id} is gated by unresolved ${dependency.id}`,
          { rowId: row.id },
        );
      }
      const dependencyRow = rowsById.get(dependency.id);
      if (!dependencyRow || !isCurrentComplete(dependencyRow)) {
        reject(
          'E_DEPENDENCY_GATE',
          `Current completion for ${row.id} precedes dependency ${dependency.id}`,
          { rowId: row.id },
        );
      }
    }
  }
  return true;
}

const objective = [
  '117 TUW strict completion audit and execution gate.',
  `Use ${planPath} as the authoritative 117-unit checklist and keep ${jsonPath} plus ${mdPath} as the active execution-control ledger.`,
  'For every TUW A1-H14 and Appendix-2 row across H1/H2/H3, classify the current state as COMPLETE_CANDIDATE, LOCAL_IMPLEMENTED_NEEDS_EVIDENCE, PARTIAL, NOT_STARTED, EXTERNAL_BLOCKED, or UNADJUDICATED.',
  'Do not treat file existence, passing unit tests, generated ledger rows, or plan text as completion.',
  'For each TUW, preserve its acceptance tests, manual QA requirement, dependencies, code anchors, migration requirements, audit/security invariants, external evidence needs, historicalEvidenceRefs, current evidenceRefs, and nextAction.',
  'Work one TUW at a time, starting from the smallest dependency-valid row.',
  'This BOOTSTRAP_IMPORT does not authorize promotion or demotion; TUW-004 must create and replay the transition journal before a state transition.',
  'Do not broaden implementation beyond the active TUW, and do not collapse multiple TUWs into a vague uplift task.',
  'Stop claiming product readiness until all 117 rows are CURRENT_VALIDATED COMPLETE_CANDIDATE with durable current evidence; EXTERNAL_BLOCKED and UNADJUDICATED are never completion evidence.',
].join(' ');

const statusById = new Map([
  ...[
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'C1',
    'C2',
    'C4',
    'C5',
    'C6',
    'D1',
    'D3',
    'F4',
    'F5',
    'H1',
    'H2',
    'H5',
    'H6',
    'A14',
    'D8',
    'E6',
    'G13',
    'H8',
    'H9',
  ].map((id) => [id, 'LOCAL_IMPLEMENTED_NEEDS_EVIDENCE']),
  ...[
    'A7',
    'B1',
    'B2',
    'B4',
    'B6',
    'C3',
    'D2',
    'D4',
    'E1',
    'E2',
    'E3',
    'E4',
    'G1',
    'G2',
    'A8',
    'A9',
    'A10',
    'A11',
    'A12',
    'B5',
    'B7',
    'B9',
    'B12',
    'C8',
    'C9',
    'C10',
    'C13',
    'D5',
    'D6',
    'D7',
    'E5',
    'E7',
    'E9',
    'E10',
    'E11',
    'E12',
    'F1',
    'F2',
    'F3',
    'F6',
    'F7',
    'F8',
    'F9',
    'F10',
    'F11',
    'G3',
    'G5',
    'G6',
    'G7',
    'G8',
    'G9',
    'G10',
    'G11',
    'G12',
    'H7',
    'B13',
    'C14',
    'D9',
    'D11',
    'F12',
    'F13',
    'G4',
    'G14',
    'H13',
    'H14',
  ].map((id) => [id, 'PARTIAL']),
  ...[
    'B3',
    'B8',
    'B10',
    'B11',
    'C11',
    'C12',
    'D10',
    'E8',
    'H4',
    'H11',
    'A13',
    'B14',
    'D12',
    'E13',
    'E14',
    'F14',
    'H12',
  ].map((id) => [id, 'NOT_STARTED']),
  ...['C7', 'H3', 'C15'].map((id) => [id, 'EXTERNAL_BLOCKED']),
  ...['B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20'].map((id) => [id, 'UNADJUDICATED']),
]);

const nextActionByStatus = {
  COMPLETE_CANDIDATE:
    'Do not do feature work. Re-run the full current-evidence completion audit and fill command/manual evidence refs before closing.',
  LOCAL_IMPLEMENTED_NEEDS_EVIDENCE:
    'Inspect the current implementation against this TUW acceptance block, add missing integration/manual evidence, run focused gates, then fill evidenceRefs.',
  PARTIAL:
    'Identify the missing code or acceptance surface for this TUW only, implement the smallest dependency-valid slice, then collect the required evidence.',
  NOT_STARTED:
    'Do not infer implementation from nearby files. Start this TUW from its plan block after dependencies are satisfied.',
  EXTERNAL_BLOCKED:
    'Keep repo code prepared and default-safe. Completion requires opaque external operational evidence, not more local implementation.',
  UNADJUDICATED:
    'Do not infer completion. Adjudicate this newly registered TUW against its acceptance block and record current evidence before any status change.',
};

const statusTaxonomy = {
  COMPLETE_CANDIDATE:
    'All required code, DB migrations, unit/integration/negative tests, staging/manual QA receipts, focused package checks, changed-file LSP diagnostics where available, migrate/rollback/migrate where applicable, and git diff check have durable current evidence refs bound to the exact candidate and validation scope; accepted blockers never satisfy completion.',
  LOCAL_IMPLEMENTED_NEEDS_EVIDENCE:
    'Implementation exists or is close, but the required completion evidence is missing, weak, stale, or narrower than the TUW acceptance block.',
  PARTIAL:
    'Some anchors or adjacent behavior exist, but material code, acceptance coverage, or gates are missing.',
  NOT_STARTED:
    'No reliable TUW-specific implementation evidence found. Nearby infrastructure does not count.',
  EXTERNAL_BLOCKED:
    'Repo-local work may be prepared, but completion depends on external operational evidence such as M365/admin/production/DR receipts.',
  UNADJUDICATED:
    'The TUW is present in the active 117-unit plan but has no adjudication or completion evidence recorded yet.',
};

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

const tuwIdPrefixRegex = /^[A-H]\d+(?:[ \t]|$)/;

/**
 * Parse one Markdown heading without reading the frozen source plan.
 *
 * The source has two intentionally different grammars:
 *   #### ID [S|M|L] Title
 *   ### ID [H1|H2|H3/S|M|L(·선택)] Title
 */
export function parseTuwHeading(line, lineNumber = 1) {
  const headingMatch = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line.trimEnd());
  if (!headingMatch) return null;

  const rank = headingMatch[1].length;
  const text = headingMatch[2].trim();

  if (rank === 4) {
    const originalMatch = /^([A-H]\d+)[ \t]+\[([SML])\][ \t]+(.+)$/.exec(text);
    if (originalMatch) {
      return {
        grammar: 'original',
        rank,
        id: originalMatch[1],
        horizon: null,
        size: originalMatch[2],
        conditional: false,
        title: originalMatch[3].trim(),
        heading: line.trimEnd(),
        line: lineNumber,
      };
    }
  }

  if (rank === 3) {
    const appendixMatch = /^([A-H]\d+)[ \t]+\[(H[123])\/([SML])(·선택)?\][ \t]+(.+)$/.exec(text);
    if (appendixMatch) {
      const [, id, horizon, size, marker, title] = appendixMatch;
      const conditional = Boolean(marker);
      const conditionalShape = horizon === 'H3' && size === 'L';
      if (conditional !== conditionalShape) {
        throw new Error(
          `Malformed Appendix-2 conditional marker for ${id} at line ${lineNumber}; H3/L requires ·선택 and other forms forbid it`,
        );
      }
      return {
        grammar: 'appendix-2',
        rank,
        id,
        horizon,
        size,
        conditional,
        title: title.trim(),
        heading: line.trimEnd(),
        line: lineNumber,
      };
    }
  }

  if ((rank === 3 || rank === 4 || tuwIdPrefixRegex.test(text)) && tuwIdPrefixRegex.test(text)) {
    throw new Error(`Malformed TUW heading at line ${lineNumber}: ${line.trim()}`);
  }
  return null;
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export function assertExactTuwIdSet(units, expectedIds = FROZEN_TUW_IDS) {
  const actualIds = units.map((unit) => (typeof unit === 'string' ? unit : unit.id));
  const expected = [...expectedIds];
  const expectedSet = new Set(expected);
  const actualSet = new Set(actualIds);
  const duplicates = duplicateValues(actualIds);
  const missing = expected.filter((id) => !actualSet.has(id));
  const extra = [...actualSet].filter((id) => !expectedSet.has(id));
  if (duplicates.length || missing.length || extra.length || actualIds.length !== expected.length) {
    const details = [
      `Expected exact ${expected.length} TUW IDs, found ${actualIds.length}`,
      missing.length ? `missing: ${missing.join(', ')}` : '',
      duplicates.length ? `duplicate: ${duplicates.join(', ')}` : '',
      extra.length ? `extra: ${extra.join(', ')}` : '',
    ].filter(Boolean);
    throw new Error(details.join('; '));
  }
  return true;
}

/**
 * Parse all TUW blocks and cut each block at the next heading whose rank is
 * equal to or higher than the TUW heading rank. Non-TUW headings participate
 * in the boundary scan so category/directive text cannot bleed into a TUW.
 */
export function parseTuwBlocks(markdown, options = {}) {
  if (typeof markdown !== 'string') {
    throw new TypeError('Expected Markdown source text');
  }
  const { expectedIds = FROZEN_TUW_IDS, assertExact = true } = options;
  const headings = [];
  const headingScan = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let match;
  while ((match = headingScan.exec(markdown))) {
    const line = match[0];
    const lineNumber = lineNumberAt(markdown, match.index ?? 0);
    const parsed = parseTuwHeading(line, lineNumber);
    headings.push({
      index: match.index ?? 0,
      endIndex: headingScan.lastIndex,
      rank: match[1].length,
      parsed,
    });
  }

  const blocks = headings
    .filter((heading) => heading.parsed)
    .map((heading) => {
      const boundary = headings.find(
        (candidate) => candidate.index > heading.index && candidate.rank <= heading.rank,
      );
      const end = boundary?.index ?? markdown.length;
      const parsed = heading.parsed;
      return {
        ...parsed,
        start: heading.index,
        end,
        endLine: lineNumberAt(markdown, end),
        block: markdown.slice(heading.index, end),
        body: markdown.slice(heading.endIndex, end),
      };
    });

  if (assertExact) assertExactTuwIdSet(blocks, expectedIds);
  return blocks;
}

export const parseTuwDocument = parseTuwBlocks;
export { FROZEN_TUW_IDS };

function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sectionBetween(block, startLabel, stopPattern) {
  const start = block.indexOf(startLabel);
  if (start === -1) return '';
  const rest = block.slice(start + startLabel.length);
  const stop = rest.search(stopPattern);
  return stop === -1 ? rest : rest.slice(0, stop);
}

function bulletLines(section) {
  return unique(
    section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^- /, '').trim()),
  );
}

function inlineCodeValues(section) {
  return unique([...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
}

function splitDependenciesAtDepthZero(value) {
  const tokens = [];
  let token = '';
  let depth = 0;
  for (const character of value) {
    if (character === '(') {
      depth += 1;
      token += character;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        reject('E_DEPENDENCY_ALIAS', 'Dependency text has an unmatched closing parenthesis');
      }
      token += character;
      continue;
    }
    if (depth === 0 && (character === ',' || character === '→')) {
      if (token.trim().length === 0) {
        reject('E_DEPENDENCY_ALIAS', 'Dependency text contains an empty depth-zero segment');
      }
      tokens.push(token.trim());
      token = '';
      continue;
    }
    token += character;
  }
  if (depth !== 0) {
    reject('E_DEPENDENCY_ALIAS', 'Dependency text has unbalanced parentheses');
  }
  if (token.trim().length === 0) {
    reject('E_DEPENDENCY_ALIAS', 'Dependency text contains an empty trailing segment');
  }
  tokens.push(token.trim());
  return tokens;
}

function dependencyKindFromSourceText(sourceText) {
  if (['조건부', 'ACTIVE', '선택'].some((marker) => sourceText.includes(marker))) {
    return 'conditional';
  }
  if (['소프트', '차단 아님'].some((marker) => sourceText.includes(marker))) return 'soft';
  return 'hard';
}

export function parseDependencyText(
  rowId,
  value,
  { knownIds = FROZEN_TUW_IDS, sourceLine = null } = {},
) {
  assertNonEmptyString(rowId, 'E_DEPENDENCY_ALIAS', 'dependency.rowId');
  if (typeof value !== 'string') {
    reject('E_DEPENDENCY_ALIAS', 'Dependency source must be a string', { rowId });
  }
  const trimmed = value.trim();
  if (/^(?:없음(?:\s*\([^\n]*\))?|—|-)$/.test(trimmed)) {
    splitDependenciesAtDepthZero(trimmed);
    return [];
  }
  const known = new Set(knownIds);
  const records = [];
  for (const sourceText of splitDependenciesAtDepthZero(trimmed)) {
    const aliases = DEPENDENCY_ALIAS_REGISTRY.filter(
      (alias) => alias.rowId === rowId && alias.sourceText === sourceText,
    );
    if (aliases.length > 0) {
      for (const alias of aliases) {
        if (sourceLine !== null && alias.sourceLine !== sourceLine) {
          reject('E_DEPENDENCY_ALIAS', `Alias source line drifted for ${alias.aliasKey}`, {
            rowId,
            path: 'dependencies',
          });
        }
        for (const emitted of alias.emits) {
          records.push({
            id: emitted.id,
            kind: emitted.kind,
            sourceText,
            resolutionRef: alias.resolutionRef,
          });
        }
      }
      continue;
    }
    const exact = /^([A-H][0-9]+)(?:\([^\n]*\))?$/.exec(sourceText);
    if (!exact) {
      reject('E_DEPENDENCY_ALIAS', `Unregistered or bare dependency alias: ${sourceText}`, {
        rowId,
        path: 'dependencies',
      });
    }
    const id = exact[1];
    if (!known.has(id)) {
      reject('E_DEPENDENCY_UNKNOWN', `Unknown dependency ${id} for ${rowId}`, {
        rowId,
        path: 'dependencies',
      });
    }
    records.push({
      id,
      kind: dependencyKindFromSourceText(sourceText),
      sourceText,
      resolutionRef: null,
    });
  }
  const seen = new Set();
  for (const dependency of records) {
    if (dependency.id === rowId) {
      reject('E_DEPENDENCY_SELF', `Row ${rowId} depends on itself`, { rowId });
    }
    if (seen.has(dependency.id)) {
      reject('E_DEPENDENCY_DUPLICATE', `Row ${rowId} repeats dependency ${dependency.id}`, {
        rowId,
      });
    }
    seen.add(dependency.id);
  }
  return records;
}

function parseDependencies(block, rowId, blockLine) {
  const match = /\*\*Dependencies:\*\*\s*([^\n]+)/.exec(block);
  if (!match) return [];
  const sourceLine = blockLine + lineNumberAt(block, match.index ?? 0) - 1;
  return parseDependencyText(rowId, match[1].trim(), { sourceLine });
}

function assertAliasRegistryCoverage(units) {
  const actual = units.flatMap((unit) =>
    unit.dependencies
      .filter((dependency) => dependency.resolutionRef !== null)
      .map((dependency) => ({ rowId: unit.id, ...dependency })),
  );
  const expected = DEPENDENCY_ALIAS_REGISTRY.flatMap((alias) =>
    alias.emits.map((emitted) => ({
      rowId: alias.rowId,
      id: emitted.id,
      kind: emitted.kind,
      sourceText: alias.sourceText,
      resolutionRef: alias.resolutionRef,
    })),
  );
  if (DEPENDENCY_ALIAS_REGISTRY.length !== 17 || expected.length !== 18) {
    reject('E_DEPENDENCY_ALIAS', 'The sealed dependency alias registry count changed');
  }
  if (!isDeepStrictEqual(actual, expected)) {
    reject('E_DEPENDENCY_ALIAS', 'Dependency aliases do not match sealed source order');
  }
}

function invariantLines(block) {
  const pattern =
    /(감사|Audit|audit|RLS|권한|permission|Permission|fail|tenant|테넌트|raw|token|secret|DLP|external|외부|legal|hold|wall|AI|민감|본문|원문|hash|해시)/i;
  return unique(
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => pattern.test(line))
      .slice(0, 20),
  );
}

function externalLines(block) {
  const pattern =
    /(EV-|M365|Microsoft 365|Integrated Apps|admin consent|tenant admin|운영증거|외부|external evidence|evidence-register|production|프로덕션|테넌트|관리자 승인|사이드로드)/i;
  return unique(
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => pattern.test(line))
      .slice(0, 20),
  );
}

function migrationLines(block, anchors) {
  return unique([
    ...anchors.filter((anchor) => anchor.includes('db/migrations/')),
    ...block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /마이그레이션|migration|db\/migrations/i.test(line)),
  ]);
}

function normalizeAnchorPath(anchor) {
  return anchor
    .replace(/^신규:\s*/, '')
    .replace(/^신규\([^)]*\):\s*/, '')
    .replace(/\s+\([^)]*\).*$/, '')
    .trim();
}

function statusCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

function markdownTable(rows) {
  const lines = [
    '| ID | H | Size | Status | Validation | Current evidence | Historical evidence | Blocker | Gaps | Plan line | Next action |',
    '|---|---:|:---:|---|---|---:|---:|---|---:|---:|---|',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.horizon} | ${row.size} | ${row.status} | ${row.validationState} | ${row.evidenceCount} | ${row.historicalEvidenceCount} | ${row.blockerClass} | ${row.gapCount} | ${row.planLine} | ${row.nextAction} |`,
    );
  }
  return lines.join('\n');
}

function readOverrides() {
  const bytes = readFileSync(overridesPath);
  const text = decodeBootstrapUtf8(bytes, overridesPath);
  try {
    return { bytes, value: JSON.parse(text) };
  } catch {
    reject('E_BOOTSTRAP_IDENTITY', 'Materialized overrides must contain valid JSON', {
      path: overridesPath,
    });
  }
}

function applyOverride(unit, override) {
  if (!override) return unit;
  if (override.status && !Object.hasOwn(statusTaxonomy, override.status)) {
    reject('E_SCHEMA_SHAPE', `Invalid override status for ${unit.id}: ${override.status}`, {
      rowId: unit.id,
      path: 'status',
    });
  }
  return {
    ...unit,
    status: override.status ?? unit.status,
    migrationRequirements: override.migrationRequirements ?? unit.migrationRequirements,
    externalEvidenceNeeds: override.externalEvidenceNeeds ?? unit.externalEvidenceNeeds,
    validationState: override.validationState ?? unit.validationState,
    validatedCandidateSha: override.validatedCandidateSha ?? unit.validatedCandidateSha,
    validationScope: override.validationScope ?? unit.validationScope,
    historicalEvidenceRefs: override.historicalEvidenceRefs ?? unit.historicalEvidenceRefs,
    evidenceRefs: override.evidenceRefs ?? unit.evidenceRefs,
    blockerClass: override.blockerClass ?? unit.blockerClass,
    blockingRefs: override.blockingRefs ?? unit.blockingRefs,
    acceptedBlockers: override.acceptedBlockers ?? unit.acceptedBlockers,
    dependencyConditions: override.dependencyConditions ?? unit.dependencyConditions,
    remainingGaps: override.remainingGaps ?? unit.remainingGaps,
    nextAction: override.nextAction ?? unit.nextAction,
    statusRationale: override.statusRationale ?? unit.statusRationale,
    lastReviewedAt: override.lastReviewedAt ?? unit.lastReviewedAt,
  };
}

function parsePlanUnits(plan, overrides) {
  const horizonMarkers = [...plan.matchAll(/^##\s+Horizon\s+(\d+)/gm)].map((match) => ({
    horizon: match[1],
    index: match.index ?? 0,
  }));

  const units = parseTuwBlocks(plan).map((parsedUnit) => {
    const block = parsedUnit.block;
    const id = parsedUnit.id;
    const status = statusById.get(id);
    if (!status) {
      throw new Error(`Missing status classification for ${id}`);
    }
    const horizon =
      parsedUnit.horizon?.replace(/^H/, '') ??
      horizonMarkers.filter((marker) => marker.index < parsedUnit.start).at(-1)?.horizon ??
      'unknown';
    const codeAnchorSection = sectionBetween(
      block,
      '**Code anchors:**',
      /\n\*\*Acceptance tests|\n#### /,
    );
    const acceptanceSection = sectionBetween(
      block,
      '**Acceptance tests (완료판정):**',
      /\n\*\*검증 노트|\n#### /,
    );
    const anchors = inlineCodeValues(codeAnchorSection);
    const acceptanceTests = bulletLines(acceptanceSection);
    const manualQa = acceptanceTests.filter((line) => line.startsWith('수동'));
    return applyOverride(
      {
        id,
        horizon,
        size: parsedUnit.size,
        title: parsedUnit.title,
        source: {
          planPath,
          planLine: parsedUnit.line,
        },
        status,
        dependencies: parseDependencies(block, id, parsedUnit.line),
        codeAnchors: anchors.map((anchor) => {
          const pathCandidate = normalizeAnchorPath(anchor);
          return {
            anchor,
            pathCandidate,
            exists: existsSync(pathCandidate),
          };
        }),
        acceptanceTests,
        manualQa,
        migrationRequirements: migrationLines(block, anchors),
        auditSecurityInvariants: invariantLines(block),
        externalEvidenceNeeds: externalLines(block),
        validationState: 'BOOTSTRAP_PREIMAGE',
        validatedCandidateSha: null,
        validationScope: null,
        historicalEvidenceRefs: [],
        evidenceRefs: [],
        blockerClass: status === 'EXTERNAL_BLOCKED' ? 'EXTERNAL_EVIDENCE' : 'NONE',
        blockingRefs: status === 'EXTERNAL_BLOCKED' ? [`${planPath}:${parsedUnit.line}`] : [],
        acceptedBlockers: [],
        dependencyConditions: [],
        remainingGaps: ['No current TUW-specific completion evidence has been recorded yet.'],
        nextAction: nextActionByStatus[status],
        statusRationale:
          'Initial strict audit classification from current repo scan; not completion evidence.',
        lastReviewedAt: null,
      },
      overrides.unitOverrides?.[id],
    );
  });
  assertAliasRegistryCoverage(units);
  return units;
}

function assertBootstrapIdentity(units) {
  const counts = statusCounts(units);
  const expectedCounts = {
    COMPLETE_CANDIDATE: 19,
    LOCAL_IMPLEMENTED_NEEDS_EVIDENCE: 80,
    EXTERNAL_BLOCKED: 11,
    UNADJUDICATED: 7,
  };
  const horizons = units.reduce((result, unit) => {
    result[unit.horizon] = (result[unit.horizon] ?? 0) + 1;
    return result;
  }, {});
  if (
    units.length !== 117 ||
    Object.entries(expectedCounts).some(([status, count]) => counts[status] !== count) ||
    Object.keys(counts).some((status) => !Object.hasOwn(expectedCounts, status)) ||
    horizons['1'] !== 38 ||
    horizons['2'] !== 61 ||
    horizons['3'] !== 18
  ) {
    reject('E_BOOTSTRAP_IDENTITY', 'The fixed 117-row bootstrap identity or counts changed');
  }
  const currentRow = units.find(
    (unit) =>
      unit.validationState !== 'BOOTSTRAP_PREIMAGE' ||
      unit.validatedCandidateSha !== null ||
      unit.validationScope !== null ||
      !Array.isArray(unit.evidenceRefs) ||
      unit.evidenceRefs.length !== 0 ||
      !Array.isArray(unit.acceptedBlockers) ||
      unit.acceptedBlockers.length !== 0 ||
      !Array.isArray(unit.dependencyConditions) ||
      unit.dependencyConditions.length !== 0,
  );
  if (currentRow) {
    reject('E_BOOTSTRAP_NOT_CURRENT', 'BOOTSTRAP_IMPORT rows must remain inert preimages', {
      rowId: currentRow.id,
    });
  }
}

function decodeBootstrapUtf8(bytes, path) {
  if (typeof bytes === 'string') return bytes;
  if (!(bytes instanceof Uint8Array)) {
    reject('E_BOOTSTRAP_IDENTITY', `${path} must be exact UTF-8 bytes`, { path });
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    reject('E_BOOTSTRAP_IDENTITY', `${path} must be valid UTF-8`, { path });
  }
}

function assertSealedInputs({ plan, sourcePlanBytes, overrides, overridesBytes }) {
  const sourcePlanText = decodeBootstrapUtf8(sourcePlanBytes, 'sourcePlanBytes');
  const overridesText = decodeBootstrapUtf8(overridesBytes, 'overridesBytes');
  let parsedOverrides;
  try {
    parsedOverrides = JSON.parse(overridesText);
  } catch {
    reject('E_BOOTSTRAP_IDENTITY', 'overridesBytes must contain valid JSON', {
      path: 'overridesBytes',
    });
  }
  if (plan !== sourcePlanText || !isDeepStrictEqual(overrides, parsedOverrides)) {
    reject('E_BOOTSTRAP_IDENTITY', 'Bootstrap parsed values and exact input bytes diverged');
  }
  const sourcePlanHash = sha256Hash(sourcePlanBytes);
  const overridesHash = sha256Hash(overridesBytes);
  if (sourcePlanHash.value !== bootstrapSourcePlanSha256) {
    reject('E_BOOTSTRAP_IDENTITY', 'The sealed source-plan bytes changed');
  }
  return { sourcePlanHash, overridesHash };
}

function assertHashWithCode(value, code, path, expectedValue = null) {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(',') !== 'algorithm,value' ||
    value.algorithm !== 'SHA-256' ||
    !/^[0-9a-f]{64}$/.test(value.value) ||
    (expectedValue !== null && value.value !== expectedValue)
  ) {
    reject(code, `${path} is not the registered SHA-256 Hash`, { path });
  }
}

function validateOverridesObject(overrides, path = 'overrides') {
  assertExactKeys(
    overrides,
    ['schemaVersion', 'updatedAt', 'unitOverrides'],
    'E_BOOTSTRAP_IDENTITY',
    path,
  );
  if (overrides.schemaVersion !== 1 || !isRecord(overrides.unitOverrides)) {
    reject('E_BOOTSTRAP_IDENTITY', `${path} has an invalid schema`, { path });
  }
  validateTimestamp(overrides.updatedAt, `${path}.updatedAt`);
  const ids = Object.keys(overrides.unitOverrides);
  const idSet = new Set(ids);
  if (ids.length !== 117 || FROZEN_TUW_IDS.some((id) => !idSet.has(id))) {
    reject('E_BOOTSTRAP_IDENTITY', `${path} must contain the exact 117 IDs`, { path });
  }
}

function validateJournalBootstrap(bootstrap, plan) {
  assertExactKeys(bootstrap, bootstrapKeys, 'E_BOOTSTRAP_IDENTITY', 'journal.bootstrap');
  if (bootstrap.bootstrapId !== bootstrapId || bootstrap.rowCount !== 117) {
    reject('E_BOOTSTRAP_IDENTITY', 'Journal bootstrap identity changed');
  }
  assertHashWithCode(
    bootstrap.sourcePlanSha256,
    'E_BOOTSTRAP_IDENTITY',
    'journal.bootstrap.sourcePlanSha256',
    bootstrapSourcePlanSha256,
  );
  assertHashWithCode(
    bootstrap.selectedTupleSha256,
    'E_BOOTSTRAP_IDENTITY',
    'journal.bootstrap.selectedTupleSha256',
    bootstrapSelectedTupleSha256,
  );
  if (!isDeepStrictEqual(bootstrap.imported110Hashes, imported110Hashes)) {
    reject('E_BOOTSTRAP_IDENTITY', 'Imported 110 hashes changed');
  }
  assertHashWithCode(
    bootstrap.exactIdSetSha256,
    'E_BOOTSTRAP_IDENTITY',
    'journal.bootstrap.exactIdSetSha256',
    bootstrapExactIdSetSha256,
  );
  assertStringArray(
    bootstrap.orderedRowIds,
    'E_BOOTSTRAP_IDENTITY',
    'journal.bootstrap.orderedRowIds',
    { exact: FROZEN_TUW_IDS },
  );
  assertHashWithCode(
    bootstrap.orderedRowSetSha256,
    'E_BOOTSTRAP_IDENTITY',
    'journal.bootstrap.orderedRowSetSha256',
    bootstrapOrderedRowSetSha256,
  );
  if (
    !isDeepStrictEqual(bootstrap.statusCounts, bootstrapStatusCounts) ||
    amicCanonicalHash(bootstrap.orderedRowIds).value !== bootstrapOrderedRowSetSha256 ||
    amicCanonicalHash([...bootstrap.orderedRowIds].sort()).value !== bootstrapExactIdSetSha256
  ) {
    reject('E_BOOTSTRAP_IDENTITY', 'Journal bootstrap counts or ordered ID digests changed');
  }
  validateOverridesObject(bootstrap.baseOverrides, 'journal.bootstrap.baseOverrides');
  assertHashWithCode(
    bootstrap.baseOverridesSha256,
    'E_BOOTSTRAP_IDENTITY',
    'journal.bootstrap.baseOverridesSha256',
    bootstrapCanonicalOverridesSha256,
  );
  if (
    bootstrap.baseOverrides.updatedAt !== defaultGeneratedAt ||
    amicCanonicalHash(bootstrap.baseOverrides).value !== bootstrapCanonicalOverridesSha256
  ) {
    reject('E_BOOTSTRAP_IDENTITY', 'Journal base overrides are not the sealed bootstrap');
  }
  const bootstrapUnits = parsePlanUnits(plan, bootstrap.baseOverrides);
  assertBootstrapIdentity(bootstrapUnits);
  validateLedgerRows(bootstrapUnits, { asOf: defaultGeneratedAt });
  return bootstrapUnits;
}

export function deriveJournalPhase(journal) {
  if (!Array.isArray(journal?.entries)) {
    reject('E_JOURNAL_HEADER', 'journal.entries must be an array', { path: 'entries' });
  }
  if (journal.closeoutSeal !== null) return finalCloseoutPhase;
  if (
    journal.candidateRollover !== undefined &&
    journal.candidateRollover !== null &&
    journal.entries.length === journal.candidateRollover.entryCount
  ) {
    return candidateRolloverPhase;
  }
  return journal.entries.length === 0 ? bootstrapPhase : transitionPhase;
}

function validateJournalHeader(journal) {
  const hasCandidateRollover = Object.hasOwn(journal, 'candidateRollover');
  assertExactKeys(
    journal,
    hasCandidateRollover ? candidateRolloverJournalTopLevelKeys : journalTopLevelKeys,
    'E_JOURNAL_HEADER',
    'journal',
  );
  const literals = {
    schemaVersion: journalSchemaVersion,
    hashAlgorithm: journalHashAlgorithm,
    canonicalization: journalCanonicalization,
    authorityMode: journalAuthorityMode,
    schemaId: technicalSchemaId,
    authorityCommit: journalAuthorityCommit,
  };
  for (const [field, expected] of Object.entries(literals)) {
    if (journal[field] !== expected) {
      reject('E_JOURNAL_HEADER', `journal.${field} changed`, { path: field });
    }
  }
  assertHashWithCode(
    journal.finalPackPayloadSha256,
    'E_JOURNAL_HEADER',
    'journal.finalPackPayloadSha256',
    finalPackPayloadSha256,
  );
  validateTimestamp(journal.asOf, 'journal.asOf');
  const phase = deriveJournalPhase(journal);
  if (phase === bootstrapPhase) {
    if (
      hasCandidateRollover ||
      journal.candidateSha !== null ||
      journal.validationScopeDigest !== null ||
      journal.previousAcceptedJournalHead !== null ||
      journal.asOf !== defaultGeneratedAt ||
      journal.closeoutSeal !== null
    ) {
      reject('E_JOURNAL_HEADER', 'BOOTSTRAP_IMPORT header bindings changed');
    }
  } else {
    validateGitSha(journal.candidateSha, 'journal.candidateSha');
    assertHashWithCode(
      journal.validationScopeDigest,
      'E_JOURNAL_HEADER',
      'journal.validationScopeDigest',
    );
    if (journal.previousAcceptedJournalHead !== null) {
      assertHashWithCode(
        journal.previousAcceptedJournalHead,
        'E_JOURNAL_HEADER',
        'journal.previousAcceptedJournalHead',
      );
    }
    if (phase === finalCloseoutPhase && journal.previousAcceptedJournalHead === null) {
      reject('E_JOURNAL_HEADER', 'FINAL_CLOSEOUT requires a prior accepted journal head');
    }
    if (hasCandidateRollover) validateCandidateRollover(journal.candidateRollover, journal);
  }
  return phase;
}

function validateCandidateRollover(rollover, journal) {
  assertExactKeys(rollover, candidateRolloverKeys, 'E_JOURNAL_HEADER', 'journal.candidateRollover');
  validateTimestamp(rollover.recordedAt, 'journal.candidateRollover.recordedAt');
  if (!Number.isSafeInteger(rollover.entryCount) || rollover.entryCount < 1
    || rollover.entryCount > journal.entries.length) {
    reject('E_JOURNAL_HEADER', 'journal.candidateRollover.entryCount is invalid');
  }
  validateGitSha(rollover.fromCandidateSha, 'journal.candidateRollover.fromCandidateSha');
  validateGitSha(rollover.toCandidateSha, 'journal.candidateRollover.toCandidateSha');
  assertHashWithCode(
    rollover.fromValidationScopeDigest,
    'E_JOURNAL_HEADER',
    'journal.candidateRollover.fromValidationScopeDigest',
  );
  assertHashWithCode(
    rollover.toValidationScopeDigest,
    'E_JOURNAL_HEADER',
    'journal.candidateRollover.toValidationScopeDigest',
  );
  if (
    rollover.fromCandidateSha === rollover.toCandidateSha ||
    rollover.toCandidateSha !== journal.candidateSha ||
    !hashesEqual(rollover.toValidationScopeDigest, journal.validationScopeDigest) ||
    !hashesEqual(rollover.fromValidationScopeDigest, journal.validationScopeDigest) ||
    typeof rollover.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(rollover.reasonCode)
  ) {
    reject('E_JOURNAL_HEADER', 'journal.candidateRollover bindings are invalid');
  }
  assertNonEmptyString(rollover.reason, 'E_JOURNAL_HEADER', 'journal.candidateRollover.reason');
  assertHashWithCode(rollover.rolloverHash, 'E_JOURNAL_HASH', 'journal.candidateRollover.rolloverHash');
  if (!hashesEqual(rollover.rolloverHash, computeCandidateRolloverHash(rollover))) {
    reject('E_JOURNAL_HASH', 'journal.candidateRollover.rolloverHash is invalid');
  }
}

function defaultCandidateDiffResolver(candidateSha, { cwd = process.cwd() } = {}) {
  const result = spawnSync('git', ['diff', '--name-only', `${candidateSha}..HEAD`], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').filter(Boolean);
}

function immutableEntryIdentity(entry) {
  if (!isRecord(entry)) return null;
  const { previousEntryHash: _previousEntryHash, entryHash: _entryHash, ...identity } = entry;
  return identity;
}

function snapshotIntroducesEntry(snapshot, parentSnapshot, entry) {
  if (!Array.isArray(snapshot?.entries)) return false;
  const parentEntries = Array.isArray(parentSnapshot?.entries) ? parentSnapshot.entries : [];
  if (snapshot.entries.length !== parentEntries.length + 1) return false;
  if (
    parentEntries.some(
      (candidate, index) =>
        !isDeepStrictEqual(
          immutableEntryIdentity(candidate),
          immutableEntryIdentity(snapshot.entries[index]),
        ),
    )
  ) {
    return false;
  }
  return isDeepStrictEqual(
    immutableEntryIdentity(snapshot.entries.at(-1)),
    immutableEntryIdentity(entry),
  );
}

function readGitPathAtCommit(commitSha, path, { cwd = process.cwd() } = {}) {
  const shown = spawnSync('git', ['show', `${commitSha}:${path}`], {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return shown.status === 0 ? Buffer.from(shown.stdout) : null;
}

function parseCommittedJson(bytes, path) {
  if (bytes === null) {
    reject('E_SCOPE_COMMIT', `Committed control-plane snapshot is missing ${path}`, { path });
  }
  try {
    return JSON.parse(decodeBootstrapUtf8(bytes, path));
  } catch (error) {
    if (error instanceof LedgerValidationError) throw error;
    reject('E_SCOPE_COMMIT', `Committed control-plane snapshot has invalid JSON at ${path}`, {
      path,
    });
  }
}

function entryIdentityKey(entry) {
  return amicCanonicalJson(immutableEntryIdentity(entry));
}

function gitCommitAuthority(commitSha, { cwd = process.cwd() } = {}) {
  const timestamp = spawnSync('git', ['show', '-s', '--format=%ct', commitSha], {
    cwd,
    encoding: 'utf8',
  });
  const changed = spawnSync(
    'git',
    ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commitSha],
    { cwd, encoding: 'utf8' },
  );
  if (timestamp.status !== 0 || changed.status !== 0) {
    reject('E_SCOPE_COMMIT', `Unable to inspect committed snapshot ${commitSha}`);
  }
  const epochSeconds = Number(timestamp.stdout.trim());
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 0) {
    reject('E_SCOPE_COMMIT', `Committed snapshot ${commitSha} has an invalid timestamp`);
  }
  return {
    commitSha,
    recordedAt: new Date(epochSeconds * 1000).toISOString(),
    changedPaths: changed.stdout.split('\n').filter(Boolean),
  };
}

function readCommittedControlPlaneSnapshot(commitSha, { cwd = process.cwd() } = {}) {
  const authority = gitCommitAuthority(commitSha, { cwd });
  const planBytes = readGitPathAtCommit(commitSha, planPath, { cwd });
  const journalBytes = readGitPathAtCommit(commitSha, journalPath, { cwd });
  const overridesBytes = readGitPathAtCommit(commitSha, overridesPath, { cwd });
  const jsonBytes = readGitPathAtCommit(commitSha, jsonPath, { cwd });
  const markdownBytes = readGitPathAtCommit(commitSha, mdPath, { cwd });
  if (
    [planBytes, journalBytes, overridesBytes, jsonBytes, markdownBytes].some(
      (bytes) => bytes === null,
    )
  ) {
    reject('E_SCOPE_COMMIT', `Committed snapshot ${commitSha} lacks a required control-plane file`);
  }
  return {
    ...authority,
    planBytes,
    journalBytes,
    overridesBytes,
    jsonBytes,
    markdownBytes,
    plan: decodeBootstrapUtf8(planBytes, `${commitSha}:${planPath}`),
    journal: parseCommittedJson(journalBytes, `${commitSha}:${journalPath}`),
    overrides: parseCommittedJson(overridesBytes, `${commitSha}:${overridesPath}`),
  };
}

function assertExactChangedPaths(authority, expectedPaths, message) {
  const changed = new Set(authority.changedPaths);
  if (
    changed.size !== expectedPaths.size ||
    [...expectedPaths].some((path) => !changed.has(path))
  ) {
    reject('E_SCOPE_COMMIT', message);
  }
}

function assertOneRowOverrideDelta(prior, current, entry) {
  if (
    !isRecord(prior) ||
    !isRecord(current) ||
    !isRecord(prior.unitOverrides) ||
    !isRecord(current.unitOverrides) ||
    prior.schemaVersion !== current.schemaVersion ||
    !isDeepStrictEqual(Object.keys(prior).sort(), Object.keys(current).sort()) ||
    !isDeepStrictEqual(
      Object.keys(prior.unitOverrides).sort(),
      Object.keys(current.unitOverrides).sort(),
    )
  ) {
    reject('E_TRANSITION_MULTI_ROW', 'Committed transition changed the override container shape', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  const changedRows = Object.keys(current.unitOverrides).filter(
    (id) => !isDeepStrictEqual(prior.unitOverrides[id], current.unitOverrides[id]),
  );
  if (
    changedRows.length !== 1 ||
    changedRows[0] !== entry.tuwId ||
    current.updatedAt !== entry.recordedAt ||
    !isDeepStrictEqual(current.unitOverrides[entry.tuwId], entry.afterOverride)
  ) {
    reject('E_TRANSITION_MULTI_ROW', 'Committed transition must replace exactly its one declared row', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
}

/**
 * Validate one already-read Git snapshot without consulting Git authority
 * resolvers. Callers inject the previously accepted snapshot and exact
 * introducing authorities, preventing recursive default-resolver loops.
 */
export function validateCommittedControlPlaneSnapshot(
  snapshot,
  {
    priorSnapshot = null,
    entryAuthorities = new Map(),
    closeoutAuthority = null,
    candidateDiffResolver = () => [],
  } = {},
) {
  const rendered = buildLedgerFromPlan(snapshot.plan, {
    overrides: snapshot.overrides,
    sourcePlanBytes: snapshot.planBytes,
    overridesBytes: snapshot.overridesBytes,
    journal: snapshot.journal,
    journalBytes: snapshot.journalBytes,
    entryCommitResolver: (entry) => entryAuthorities.get(entryIdentityKey(entry)) ?? null,
    closeoutCommitResolver: () => closeoutAuthority,
    candidateDiffResolver,
    previousJournalSnapshotResolver: () =>
      priorSnapshot === null
        ? null
        : { commitSha: priorSnapshot.commitSha, journal: priorSnapshot.journal },
  });
  const expectedJson = Buffer.from(`${JSON.stringify(rendered.ledger, null, 2)}\n`, 'utf8');
  const expectedMarkdown = Buffer.from(rendered.markdown, 'utf8');
  if (!snapshot.jsonBytes.equals(expectedJson)) {
    reject('E_DRIFT_JSON', `Committed JSON ledger does not render from ${snapshot.commitSha}`, {
      path: jsonPath,
    });
  }
  if (!snapshot.markdownBytes.equals(expectedMarkdown)) {
    reject(
      'E_DRIFT_MARKDOWN',
      `Committed Markdown ledger does not render from ${snapshot.commitSha}`,
      { path: mdPath },
    );
  }
  return rendered;
}
function scanAcceptedJournalSnapshots({ cwd = process.cwd() } = {}) {
  const log = spawnSync('git', ['log', '--reverse', '--format=%H%x00%ct', '--', journalPath], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (log.status !== 0) {
    const hasHead = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd }).status === 0;
    if (!hasHead) return [];
    reject('E_JOURNAL_CHAIN', 'Unable to resolve journal history from Git');
  }
  const snapshots = [];
  let priorSnapshot = null;
  let entryAuthorities = new Map();
  for (const line of log.stdout.split('\n').filter(Boolean)) {
    const [commitSha] = line.split('\0');
    const snapshot = readCommittedControlPlaneSnapshot(commitSha, { cwd });
    const phase = deriveJournalPhase(snapshot.journal);
    const nextAuthorities = new Map(entryAuthorities);
    let closeoutAuthority = null;
    let introducedEntryKey = null;

    if (priorSnapshot === null) {
      if (phase !== bootstrapPhase) {
        reject('E_JOURNAL_CHAIN', 'The first accepted journal snapshot must be BOOTSTRAP_IMPORT');
      }
    } else if (phase === candidateRolloverPhase) {
      const rollover = snapshot.journal.candidateRollover;
      if (
        priorSnapshot.phase === finalCloseoutPhase ||
        !isDeepStrictEqual(snapshot.overrides, priorSnapshot.overrides) ||
        snapshot.journal.entries.length !== priorSnapshot.journal.entries.length ||
        snapshot.journal.entries.some((entry, index) => !isDeepStrictEqual(
          immutableEntryIdentity(entry),
          immutableEntryIdentity(priorSnapshot.journal.entries[index]),
        )) ||
        rollover.entryCount !== priorSnapshot.journal.entries.length ||
        rollover.fromCandidateSha !== priorSnapshot.journal.candidateSha ||
        snapshot.recordedAt !== rollover.recordedAt
      ) {
        reject('E_JOURNAL_CHAIN', 'Candidate rollover must preserve the accepted entry prefix and overrides');
      }
      assertExactChangedPaths(
        snapshot,
        transitionControlPlanePaths,
        'A candidate rollover snapshot must change exactly four control-plane paths',
      );
    } else if (phase === transitionPhase) {
      const introducedEntry = snapshot.journal.entries.at(-1);
      if (
        priorSnapshot.phase === finalCloseoutPhase ||
        !snapshotIntroducesEntry(snapshot.journal, priorSnapshot.journal, introducedEntry)
      ) {
        reject('E_JOURNAL_CHAIN', 'A transition snapshot must introduce exactly one entry prefix');
      }
      assertExactChangedPaths(
        snapshot,
        transitionControlPlanePaths,
        'An accepted transition snapshot must change exactly four control-plane paths',
      );
      if (snapshot.recordedAt !== introducedEntry.recordedAt) {
        reject('E_SCOPE_COMMIT', 'Introducing commit timestamp does not equal entry.recordedAt', {
          rowId: introducedEntry.tuwId,
          sequence: introducedEntry.sequence,
        });
      }
      assertOneRowOverrideDelta(priorSnapshot.overrides, snapshot.overrides, introducedEntry);
      introducedEntryKey = entryIdentityKey(introducedEntry);
      nextAuthorities.set(introducedEntryKey, {
        commitSha: snapshot.commitSha,
        recordedAt: snapshot.recordedAt,
        changedPaths: snapshot.changedPaths,
      });
    } else if (phase === finalCloseoutPhase) {
      const priorEntries = priorSnapshot.journal.entries;
      if (
        priorSnapshot.phase === finalCloseoutPhase ||
        snapshot.journal.entries.length !== priorEntries.length ||
        snapshot.journal.entries.some(
          (entry, index) =>
            !isDeepStrictEqual(
              immutableEntryIdentity(entry),
              immutableEntryIdentity(priorEntries[index]),
            ),
        )
      ) {
        reject('E_JOURNAL_CHAIN', 'Closeout must seal the exact prior accepted entry prefix');
      }
      assertExactChangedPaths(
        snapshot,
        closeoutControlPlanePaths,
        'An accepted closeout snapshot must change exactly three control-plane paths',
      );
      if (
        snapshot.recordedAt !== snapshot.journal.closeoutSeal.recordedAt ||
        !snapshot.overridesBytes.equals(priorSnapshot.overridesBytes)
      ) {
        reject('E_SCOPE_COMMIT', 'Closeout must preserve exact overrides and bind its commit timestamp');
      }
      closeoutAuthority = {
        commitSha: snapshot.commitSha,
        recordedAt: snapshot.recordedAt,
        changedPaths: snapshot.changedPaths,
      };
    } else {
      reject('E_JOURNAL_CHAIN', 'BOOTSTRAP_IMPORT cannot follow an accepted journal snapshot');
    }

    const diffResolver = (candidateSha) => {
      const diff = spawnSync('git', ['diff', '--name-only', `${candidateSha}..${commitSha}`], {
        cwd,
        encoding: 'utf8',
      });
      return diff.status === 0 ? diff.stdout.split('\n').filter(Boolean) : null;
    };
    validateCommittedControlPlaneSnapshot(snapshot, {
      priorSnapshot,
      entryAuthorities: nextAuthorities,
      closeoutAuthority,
      candidateDiffResolver: diffResolver,
    });
    snapshot.phase = phase;
    snapshot.introducedEntryKey = introducedEntryKey;
    snapshot.closeoutSealHash = snapshot.journal.closeoutSeal?.sealHash?.value ?? null;
    snapshots.push(snapshot);
    priorSnapshot = snapshot;
    entryAuthorities = nextAuthorities;
  }
  return snapshots;
}

export function resolveEntryIntroductionCommit(
  entry,
  { cwd = process.cwd(), acceptedSnapshots = null } = {},
) {
  const snapshots = acceptedSnapshots ?? scanAcceptedJournalSnapshots({ cwd });
  const key = entryIdentityKey(entry);
  const snapshot = snapshots.find((candidate) => candidate.introducedEntryKey === key);
  if (!snapshot) return null;
  return {
    commitSha: snapshot.commitSha,
    recordedAt: snapshot.recordedAt,
    changedPaths: snapshot.changedPaths,
  };
}

function defaultEntryCommitResolver(entry, options) {
  return resolveEntryIntroductionCommit(entry, options);
}

export function resolvePriorAcceptedJournalSnapshot(
  currentJournalBytes,
  { cwd = process.cwd(), acceptedSnapshots = null } = {},
) {
  const snapshots = acceptedSnapshots ?? scanAcceptedJournalSnapshots({ cwd });
  if (snapshots.length === 0) return null;
  const latest = snapshots.at(-1);
  const currentBytes = exactBytes(currentJournalBytes, 'journalBytes');
  const priorIndex = latest.journalBytes.equals(currentBytes)
    ? snapshots.length - 2
    : snapshots.length - 1;
  if (priorIndex < 0) return null;
  const prior = snapshots[priorIndex];
  return { commitSha: prior.commitSha, journal: prior.journal };
}

function defaultCloseoutCommitResolver(
  seal,
  { cwd = process.cwd(), acceptedSnapshots = null } = {},
) {
  const snapshots = acceptedSnapshots ?? scanAcceptedJournalSnapshots({ cwd });
  const snapshot = snapshots.find(
    (candidate) => candidate.closeoutSealHash === seal.sealHash.value,
  );
  if (!snapshot) return null;
  return {
    commitSha: snapshot.commitSha,
    recordedAt: snapshot.recordedAt,
    changedPaths: snapshot.changedPaths,
  };
}

export function validateCloseoutAuthority(seal, resolver, usedCommits, latestEntryRecordedAt) {
  const authority = resolver(seal);
  if (!isRecord(authority)) {
    reject('E_SCOPE_COMMIT', 'No separate Git commit authorizes the closeout seal');
  }
  validateGitSha(authority.commitSha, 'closeoutAuthority.commitSha');
  validateTimestamp(authority.recordedAt, 'closeoutAuthority.recordedAt');
  assertStringArray(authority.changedPaths, 'E_SCOPE_COMMIT', 'closeoutAuthority.changedPaths');
  const changed = new Set(authority.changedPaths);
  if (
    authority.recordedAt !== seal.recordedAt ||
    usedCommits.has(authority.commitSha) ||
    Date.parse(authority.recordedAt) <= Date.parse(latestEntryRecordedAt) ||
    changed.size !== closeoutControlPlanePaths.size ||
    [...closeoutControlPlanePaths].some((path) => !changed.has(path))
  ) {
    reject('E_SCOPE_COMMIT', 'Closeout must be a later journal-and-ledgers-only Git commit');
  }
}

function validateTransitionSemantics(entry, beforeOverride) {
  const afterOverride = entry.afterOverride;
  if (
    isRecord(afterOverride) &&
    !isDeepStrictEqual(Object.keys(beforeOverride).sort(), Object.keys(afterOverride).sort())
  ) {
    reject('E_TRANSITION_MULTI_ROW', 'A journal entry must replace exactly one whole row override', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  if (!isRecord(afterOverride) || isDeepStrictEqual(beforeOverride, afterOverride)) {
    reject('E_TRANSITION_INVALID', `Transition ${entry.transitionId} has no one-row delta`, {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  if (
    !isDeepStrictEqual(
      beforeOverride.historicalEvidenceRefs,
      afterOverride.historicalEvidenceRefs,
    )
  ) {
    reject(
      'E_TRANSITION_INVALID',
      'Transitions must preserve historicalEvidenceRefs value-for-value and order-for-order',
      {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      },
    );
  }
  if (
    afterOverride.validationState !== 'CURRENT_VALIDATED' ||
    afterOverride.status === 'UNADJUDICATED'
  ) {
    reject('E_TRANSITION_INVALID', 'Transitions must leave one adjudicated CURRENT_VALIDATED row', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  if (
    afterOverride.validatedCandidateSha !== entry.candidateSha ||
    !hashesEqual(afterOverride.validationScope?.aggregateSha256, entry.validationScopeDigest)
  ) {
    reject('E_TRANSITION_INVALID', 'Transition candidate or validation-scope binding drifted', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  const beforeComplete = beforeOverride.status === 'COMPLETE_CANDIDATE';
  const afterComplete = afterOverride.status === 'COMPLETE_CANDIDATE';
  const beforeBlocked =
    beforeOverride.status === 'EXTERNAL_BLOCKED' || beforeOverride.blockerClass !== 'NONE';
  const afterBlocked =
    afterOverride.status === 'EXTERNAL_BLOCKED' || afterOverride.blockerClass !== 'NONE';
  const completionChanged = beforeComplete !== afterComplete;
  const blockednessChanged = beforeBlocked !== afterBlocked;
  let expectedKind;
  if (beforeOverride.status === 'UNADJUDICATED') {
    expectedKind = 'ADJUDICATE';
  } else if (completionChanged && blockednessChanged) {
    reject(
      'E_TRANSITION_INVALID',
      'A transition cannot combine a completion-boundary and blockedness change',
      {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      },
    );
  } else if (blockednessChanged) {
    expectedKind = afterBlocked ? 'BLOCK' : 'UNBLOCK';
  } else if (completionChanged) {
    expectedKind = afterComplete ? 'PROMOTE' : 'DEMOTE';
  } else if (beforeOverride.status === afterOverride.status) {
    expectedKind = 'REVALIDATE';
  } else {
    reject('E_TRANSITION_INVALID', 'The row delta has no registered exclusive transition kind', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  if (entry.transitionKind !== expectedKind) {
    reject('E_TRANSITION_INVALID', `Transition kind ${entry.transitionKind} does not match its delta`, {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
}

function validateEntryAuthority(entry, resolver, usedCommits) {
  const authority = resolver(entry);
  if (!isRecord(authority)) {
    reject('E_SCOPE_COMMIT', `No containing Git commit authorizes ${entry.transitionId}`, {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  validateGitSha(authority.commitSha, 'entryAuthority.commitSha');
  validateTimestamp(authority.recordedAt, 'entryAuthority.recordedAt');
  if (authority.recordedAt !== entry.recordedAt || usedCommits.has(authority.commitSha)) {
    reject('E_SCOPE_COMMIT', 'Entry timestamp or one-entry-per-commit authority is invalid', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  assertStringArray(authority.changedPaths, 'E_SCOPE_COMMIT', 'entryAuthority.changedPaths');
  const changed = new Set(authority.changedPaths);
  if (
    changed.size !== transitionControlPlanePaths.size ||
    [...transitionControlPlanePaths].some((path) => !changed.has(path))
  ) {
    reject('E_SCOPE_COMMIT', 'A transition commit must change exactly four control-plane paths', {
      rowId: entry.tuwId,
      sequence: entry.sequence,
    });
  }
  usedCommits.add(authority.commitSha);
}

function validateJournalEntry(entry, index, journal, previousHash, previousRecordedAt) {
  const requiredKeys = [
    'sequence',
    'transitionId',
    'packId',
    'tuwId',
    'transitionKind',
    'candidateSha',
    'validationScopeDigest',
    'recordedAt',
    'reasonCode',
    'reason',
    'beforeOverrideSha256',
    'afterOverride',
    'afterOverrideSha256',
    'previousEntryHash',
    'entryHash',
  ];
  const path = `journal.entries[${index}]`;
  assertExactKeys(entry, requiredKeys, 'E_JOURNAL_SEQUENCE', path);
  const sequence = index + 1;
  if (
    entry.sequence !== sequence ||
    entry.transitionId !== `TR-${String(sequence).padStart(6, '0')}` ||
    !transitionKinds.has(entry.transitionKind) ||
    !FROZEN_TUW_IDS.includes(entry.tuwId)
  ) {
    reject('E_JOURNAL_SEQUENCE', `${path} sequence, ID, kind, or TUW is invalid`, {
      rowId: entry.tuwId ?? null,
      sequence: entry.sequence ?? null,
      path,
    });
  }
  assertNonEmptyString(entry.packId, 'E_JOURNAL_SEQUENCE', `${path}.packId`);
  const expectedCandidateSha = journal.candidateRollover !== undefined
    && journal.candidateRollover !== null
    && index < journal.candidateRollover.entryCount
    ? journal.candidateRollover.fromCandidateSha
    : journal.candidateSha;
  const expectedScopeDigest = journal.candidateRollover !== undefined
    && journal.candidateRollover !== null
    && index < journal.candidateRollover.entryCount
    ? journal.candidateRollover.fromValidationScopeDigest
    : journal.validationScopeDigest;
  if (entry.candidateSha !== expectedCandidateSha) {
    reject('E_JOURNAL_HEADER', `${path}.candidateSha does not bind the header`, {
      rowId: entry.tuwId,
      sequence,
    });
  }
  validateGitSha(entry.candidateSha, `${path}.candidateSha`);
  assertHashWithCode(
    entry.validationScopeDigest,
    'E_JOURNAL_HEADER',
    `${path}.validationScopeDigest`,
    expectedScopeDigest.value,
  );
  validateTimestamp(entry.recordedAt, `${path}.recordedAt`);
  if (previousRecordedAt !== null && Date.parse(entry.recordedAt) <= Date.parse(previousRecordedAt)) {
    reject('E_JOURNAL_SEQUENCE', 'Entry timestamps must be strictly increasing', {
      rowId: entry.tuwId,
      sequence,
    });
  }
  if (typeof entry.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(entry.reasonCode)) {
    reject('E_TRANSITION_INVALID', `${path}.reasonCode is invalid`, {
      rowId: entry.tuwId,
      sequence,
    });
  }
  assertNonEmptyString(entry.reason, 'E_TRANSITION_INVALID', `${path}.reason`);
  assertHashWithCode(entry.beforeOverrideSha256, 'E_JOURNAL_HASH', `${path}.beforeOverrideSha256`);
  assertHashWithCode(entry.afterOverrideSha256, 'E_JOURNAL_HASH', `${path}.afterOverrideSha256`);
  assertHashWithCode(entry.previousEntryHash, 'E_JOURNAL_CHAIN', `${path}.previousEntryHash`);
  assertHashWithCode(entry.entryHash, 'E_JOURNAL_HASH', `${path}.entryHash`);
  if (!hashesEqual(entry.previousEntryHash, previousHash)) {
    reject('E_JOURNAL_CHAIN', `${path} does not extend the previous chain head`, {
      rowId: entry.tuwId,
      sequence,
    });
  }
  if (!hashesEqual(entry.entryHash, computeJournalEntryHash(entry))) {
    reject('E_JOURNAL_HASH', `${path}.entryHash is invalid`, {
      rowId: entry.tuwId,
      sequence,
    });
  }
}

export function computeCloseoutFacts(overrides, rows) {
  const unresolved = [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    for (const dependency of gatingDependencies(row)) {
      const dependencyRow = rowsById.get(dependency.id);
      if (dependency.id.startsWith('CAP-') || !dependencyRow || !isCurrentComplete(dependencyRow)) {
        unresolved.push({ rowId: row.id, dependencyId: dependency.id, kind: dependency.kind });
      }
    }
  }
  const blockers = rows
    .filter((row) => row.blockerClass !== 'NONE' || row.acceptedBlockers.length > 0)
    .map((row) => ({
      rowId: row.id,
      blockerClass: row.blockerClass,
      blockingRefs: row.blockingRefs,
      acceptedBlockers: row.acceptedBlockers,
    }));
  const findings = rows
    .filter((row) => !isCurrentComplete(row))
    .map((row) => ({
      rowId: row.id,
      status: row.status,
      remainingGaps: row.remainingGaps,
      statusRationale: row.statusRationale,
      nextAction: row.nextAction,
    }));
  return {
    finalOverridesSha256: amicCanonicalHash(overrides),
    finalRowsSha256: amicCanonicalHash(rows),
    statusCounts: statusCounts(rows),
    unresolvedDependenciesSha256: amicCanonicalHash(unresolved),
    blockersSha256: amicCanonicalHash(blockers),
    validationFindingsSha256: amicCanonicalHash(findings),
  };
}

export function validateCloseoutSeal(seal, { journal, overrides, rows, chainHead }) {
  const requiredKeys = [
    'recordedAt',
    'candidateSha',
    'validationScopeDigest',
    'disposition',
    'entryCount',
    'finalEntryHash',
    'finalOverridesSha256',
    'finalRowsSha256',
    'statusCounts',
    'unresolvedDependenciesSha256',
    'blockersSha256',
    'validationFindingsSha256',
    'previousEntryHash',
    'sealHash',
  ];
  assertExactKeys(seal, requiredKeys, 'E_PHASE_CLOSEOUT', 'journal.closeoutSeal');
  validateTimestamp(seal.recordedAt, 'journal.closeoutSeal.recordedAt');
  if (
    seal.recordedAt !== journal.asOf ||
    seal.candidateSha !== journal.candidateSha ||
    !hashesEqual(seal.validationScopeDigest, journal.validationScopeDigest) ||
    !['COMPLETE', 'BLOCKED'].includes(seal.disposition) ||
    seal.entryCount !== journal.entries.length ||
    !hashesEqual(seal.finalEntryHash, chainHead) ||
    !hashesEqual(seal.previousEntryHash, chainHead)
  ) {
    reject('E_PHASE_CLOSEOUT', 'Closeout seal header or chain bindings are invalid');
  }
  const facts = computeCloseoutFacts(overrides, rows);
  for (const field of [
    'finalOverridesSha256',
    'finalRowsSha256',
    'unresolvedDependenciesSha256',
    'blockersSha256',
    'validationFindingsSha256',
  ]) {
    if (!hashesEqual(seal[field], facts[field])) {
      reject('E_PHASE_CLOSEOUT', `Closeout seal ${field} does not match replay`);
    }
  }
  if (!isDeepStrictEqual(seal.statusCounts, facts.statusCounts)) {
    reject('E_PHASE_CLOSEOUT', 'Closeout status counts do not match replay');
  }
  if (rows.length !== 117 || rows.some((row) => row.validationState !== 'CURRENT_VALIDATED')) {
    reject('E_PHASE_CLOSEOUT', 'Closeout requires 117 CURRENT_VALIDATED rows');
  }
  if (rows.some((row) => row.status === 'UNADJUDICATED')) {
    reject('E_PHASE_UNADJUDICATED', 'FINAL_CLOSEOUT requires UNADJUDICATED=0');
  }
  if (seal.disposition === 'COMPLETE' && rows.some((row) => !isCurrentComplete(row))) {
    reject('E_PHASE_CLOSEOUT', 'COMPLETE closeout requires every row to be current complete');
  }
  if (
    seal.disposition === 'BLOCKED' &&
    rows.some(
      (row) =>
        !isCurrentComplete(row) &&
        (row.remainingGaps.length === 0 ||
          row.statusRationale.trim().length === 0 ||
          row.nextAction.trim().length === 0),
    )
  ) {
    reject('E_PHASE_CLOSEOUT', 'BLOCKED closeout has an unexplained non-complete row');
  }
  assertHashWithCode(seal.sealHash, 'E_JOURNAL_HASH', 'journal.closeoutSeal.sealHash');
  if (!hashesEqual(seal.sealHash, computeCloseoutSealHash(seal))) {
    reject('E_JOURNAL_HASH', 'Closeout seal hash is invalid');
  }
  return true;
}

export function computeJournalSnapshotHead(journal) {
  validateJournalHeader(journal);
  assertHashWithCode(journal.genesisHash, 'E_JOURNAL_GENESIS', 'journal.genesisHash');
  if (!hashesEqual(journal.genesisHash, computeJournalGenesisHash(journal))) {
    reject('E_JOURNAL_GENESIS', 'Prior journal snapshot has an invalid genesis hash');
  }
  let head = journal.genesisHash;
  let previousRecordedAt = null;
  for (const [index, entry] of journal.entries.entries()) {
    validateJournalEntry(entry, index, journal, head, previousRecordedAt);
    head = entry.entryHash;
    previousRecordedAt = entry.recordedAt;
  }
  if (journal.closeoutSeal !== null) {
    const seal = journal.closeoutSeal;
    assertHashWithCode(seal.sealHash, 'E_JOURNAL_HASH', 'journal.closeoutSeal.sealHash');
    if (
      seal.recordedAt !== journal.asOf ||
      seal.candidateSha !== journal.candidateSha ||
      !hashesEqual(seal.validationScopeDigest, journal.validationScopeDigest) ||
      seal.entryCount !== journal.entries.length ||
      !hashesEqual(seal.previousEntryHash, head) ||
      !hashesEqual(seal.finalEntryHash, head) ||
      !hashesEqual(seal.sealHash, computeCloseoutSealHash(seal))
    ) {
      reject('E_JOURNAL_CHAIN', 'Prior closeout snapshot has an invalid chain head');
    }
    head = seal.sealHash;
  }
  return head;
}

function validatePreviousAcceptedJournalHead(journal, journalBytes, resolver, plan) {
  const prior = resolver(journalBytes);
  if (prior === null) {
    if (journal.previousAcceptedJournalHead !== null) {
      reject('E_JOURNAL_CHAIN', 'No prior accepted journal snapshot exists for the recorded head');
    }
    return true;
  }
  if (!isRecord(prior) || !isRecord(prior.journal)) {
    reject('E_JOURNAL_CHAIN', 'Prior accepted journal snapshot resolution failed');
  }
  validateJournalBootstrap(prior.journal.bootstrap, plan);
  const expectedHead = computeJournalSnapshotHead(prior.journal);
  if (!hashesEqual(journal.previousAcceptedJournalHead, expectedHead)) {
    reject('E_JOURNAL_CHAIN', 'previousAcceptedJournalHead is not the immediate prior snapshot head');
  }
  return true;
}

export function validateTransitionJournal(
  {
    plan,
    sourcePlanBytes = plan,
    overrides,
    overridesBytes = `${JSON.stringify(overrides, null, 2)}\n`,
    journal,
    journalBytes = `${JSON.stringify(journal, null, 2)}\n`,
  },
  {
    entryCommitResolver,
    closeoutCommitResolver,
    candidateDiffResolver,
    previousJournalSnapshotResolver,
    gitCwd = process.cwd(),
  } = {},
) {
  let acceptedSnapshotsCache = null;
  const acceptedSnapshots = () => {
    if (acceptedSnapshotsCache === null) {
      acceptedSnapshotsCache = scanAcceptedJournalSnapshots({ cwd: gitCwd });
    }
    return acceptedSnapshotsCache;
  };
  const resolveEntryCommit =
    entryCommitResolver ??
    ((entry) =>
      defaultEntryCommitResolver(entry, {
        cwd: gitCwd,
        acceptedSnapshots: acceptedSnapshots(),
      }));
  const resolveCloseoutCommit =
    closeoutCommitResolver ??
    ((seal) =>
      defaultCloseoutCommitResolver(seal, {
        cwd: gitCwd,
        acceptedSnapshots: acceptedSnapshots(),
      }));
  const resolveCandidateDiff =
    candidateDiffResolver ?? ((candidateSha) => defaultCandidateDiffResolver(candidateSha, { cwd: gitCwd }));
  const resolvePreviousSnapshot =
    previousJournalSnapshotResolver ??
    ((bytes) =>
      resolvePriorAcceptedJournalSnapshot(bytes, {
        cwd: gitCwd,
        acceptedSnapshots: acceptedSnapshots(),
      }));
  validateOverridesObject(overrides);
  const { sourcePlanHash, overridesHash } = assertSealedInputs({
    plan,
    sourcePlanBytes,
    overrides,
    overridesBytes,
  });
  const journalText = decodeBootstrapUtf8(journalBytes, 'journalBytes');
  let parsedJournal;
  try {
    parsedJournal = JSON.parse(journalText);
  } catch {
    reject('E_JOURNAL_HEADER', 'Transition journal must contain valid JSON', {
      path: journalPath,
    });
  }
  if (!isDeepStrictEqual(journal, parsedJournal)) {
    reject('E_JOURNAL_HEADER', 'Journal value does not match its exact input bytes', {
      path: journalPath,
    });
  }
  const journalHash = sha256Hash(journalBytes);
  const phase = validateJournalHeader(journal);
  validateJournalBootstrap(journal.bootstrap, plan);
  assertHashWithCode(journal.genesisHash, 'E_JOURNAL_GENESIS', 'journal.genesisHash');
  const expectedGenesis = computeJournalGenesisHash(journal);
  if (!hashesEqual(journal.genesisHash, expectedGenesis)) {
    reject('E_JOURNAL_GENESIS', 'Journal genesis does not match AMIC-CJSON-1 preimage');
  }
  validatePreviousAcceptedJournalHead(journal, journalBytes, resolvePreviousSnapshot, plan);
  if (
    phase === bootstrapPhase &&
    (overridesHash.value !== bootstrapOverridesSha256 ||
      !isDeepStrictEqual(overrides, journal.bootstrap.baseOverrides))
  ) {
    reject('E_BOOTSTRAP_IDENTITY', 'BOOTSTRAP_IMPORT materialized overrides changed');
  }
  if (phase !== bootstrapPhase) {
    const diffPaths = resolveCandidateDiff(journal.candidateSha);
    if (
      !Array.isArray(diffPaths) ||
      diffPaths.some((path) => !transitionControlPlanePaths.has(path))
    ) {
      reject('E_SCOPE_COMMIT', 'Candidate-to-HEAD diff contains a non-control-plane path');
    }
  }

  const replayedOverrides = cloneJson(journal.bootstrap.baseOverrides);
  let chainHead = journal.genesisHash;
  let previousRecordedAt = null;
  const usedCommits = new Set();
  const packRows = new Map();
  const packOrder = [];
  let rows = parsePlanUnits(plan, replayedOverrides);
  for (const [index, entry] of journal.entries.entries()) {
    validateJournalEntry(entry, index, journal, chainHead, previousRecordedAt);
    validateEntryAuthority(entry, resolveEntryCommit, usedCommits);
    const beforeOverride = replayedOverrides.unitOverrides[entry.tuwId];
    if (!isRecord(beforeOverride)) {
      reject('E_REPLAY_MISMATCH', `Replay has no row ${entry.tuwId}`, {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      });
    }
    if (!hashesEqual(entry.beforeOverrideSha256, amicCanonicalHash(beforeOverride))) {
      reject('E_REPLAY_MISMATCH', `Replay prefix mismatch for ${entry.tuwId}`, {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      });
    }
    if (!hashesEqual(entry.afterOverrideSha256, amicCanonicalHash(entry.afterOverride))) {
      reject('E_JOURNAL_HASH', `After-override hash mismatch for ${entry.tuwId}`, {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      });
    }
    validateTransitionSemantics(entry, beforeOverride);
    if (!packRows.has(entry.packId)) {
      packRows.set(entry.packId, new Set());
      packOrder.push(entry.packId);
    } else if (packOrder.at(-1) !== entry.packId) {
      reject('E_SCOPE_PACK_SIZE', `Pack ${entry.packId} cannot be reopened after another pack`, {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      });
    }
    const packSet = packRows.get(entry.packId);
    if (packSet.has(entry.tuwId)) {
      reject('E_TRANSITION_MULTI_ROW', `Pack ${entry.packId} repeats ${entry.tuwId}`, {
        rowId: entry.tuwId,
        sequence: entry.sequence,
      });
    }
    packSet.add(entry.tuwId);
    replayedOverrides.unitOverrides[entry.tuwId] = cloneJson(entry.afterOverride);
    replayedOverrides.updatedAt = entry.recordedAt;
    rows = parsePlanUnits(plan, replayedOverrides);
    validateLedgerRows(rows, { asOf: entry.recordedAt });
    chainHead = entry.entryHash;
    previousRecordedAt = entry.recordedAt;
  }

  if (phase !== bootstrapPhase) {
    for (const [index, packId] of packOrder.entries()) {
      const ids = packRows.get(packId);
      const activeTrailingPack = phase === transitionPhase && index === packOrder.length - 1;
      if (ids.size > 8 || (!activeTrailingPack && ids.size < 3)) {
        reject(
          'E_SCOPE_PACK_SIZE',
          activeTrailingPack
            ? `Active trailing pack ${packId} must contain 1-8 unique TUWs`
            : `Completed pack ${packId} must contain 3-8 unique TUWs`,
        );
      }
    }
  }
  if (
    (phase === transitionPhase || phase === candidateRolloverPhase) &&
    journal.asOf !== journal.entries.at(-1).recordedAt
  ) {
    reject('E_METADATA_CLOCK', 'Transition or candidate rollover asOf must equal the latest entry timestamp');
  }
  if (phase !== finalCloseoutPhase && replayedOverrides.updatedAt !== journal.asOf) {
    reject('E_METADATA_CLOCK', 'Materialized overrides updatedAt must equal journal asOf');
  }
  if (!isDeepStrictEqual(replayedOverrides, overrides)) {
    reject('E_REPLAY_MISMATCH', 'Final replay does not equal materialized overrides');
  }
  validateLedgerRows(rows, { asOf: journal.asOf });
  if (
    journal.previousAcceptedJournalHead !== null &&
    (hashesEqual(journal.previousAcceptedJournalHead, journal.genesisHash) ||
      journal.entries.some((entry) =>
        hashesEqual(journal.previousAcceptedJournalHead, entry.entryHash),
      ) ||
      (journal.closeoutSeal &&
        hashesEqual(journal.previousAcceptedJournalHead, journal.closeoutSeal.sealHash)))
  ) {
    reject('E_JOURNAL_CHAIN', 'Previous accepted head self-references the current snapshot');
  }
  if (phase === finalCloseoutPhase) {
    if (journal.asOf !== journal.closeoutSeal.recordedAt) {
      reject('E_METADATA_CLOCK', 'FINAL_CLOSEOUT asOf must equal the seal timestamp');
    }
    validateCloseoutSeal(journal.closeoutSeal, {
      journal,
      overrides: replayedOverrides,
      rows,
      chainHead,
    });
    validateCloseoutAuthority(
      journal.closeoutSeal,
      resolveCloseoutCommit,
      usedCommits,
      journal.entries.at(-1).recordedAt,
    );
    chainHead = journal.closeoutSeal.sealHash;
  } else if (journal.closeoutSeal !== null) {
    reject('E_PHASE_CLOSEOUT', 'Only FINAL_CLOSEOUT may contain a closeout seal');
  }
  return {
    phase,
    rows,
    replayedOverrides,
    sourcePlanHash,
    overridesHash,
    journalHash,
    journalEntries: journal.entries.length,
    journalHead: chainHead,
  };
}

export function buildLedgerFromPlan(
  plan,
  {
    overrides = { updatedAt: defaultGeneratedAt, unitOverrides: {} },
    sourcePlanBytes = plan,
    overridesBytes = `${JSON.stringify(overrides, null, 2)}\n`,
    journal = null,
    journalBytes = null,
    entryCommitResolver,
    closeoutCommitResolver,
    candidateDiffResolver,
    previousJournalSnapshotResolver,
    gitCwd,
  } = {},
) {
  let journalValue = journal;
  let journalInputBytes = journalBytes;
  if (journalValue === null) {
    if (!existsSync(journalPath)) {
      reject('E_JOURNAL_HEADER', 'Transition journal is missing', { path: journalPath });
    }
    journalInputBytes = readFileSync(journalPath);
    try {
      journalValue = JSON.parse(decodeBootstrapUtf8(journalInputBytes, journalPath));
    } catch (error) {
      if (error instanceof LedgerValidationError) throw error;
      reject('E_JOURNAL_HEADER', 'Transition journal must contain valid JSON', {
        path: journalPath,
      });
    }
  }
  if (journalInputBytes === null) {
    journalInputBytes = `${JSON.stringify(journalValue, null, 2)}\n`;
  }
  const replay = validateTransitionJournal(
    {
      plan,
      sourcePlanBytes,
      overrides,
      overridesBytes,
      journal: journalValue,
      journalBytes: journalInputBytes,
    },
    {
      entryCommitResolver,
      closeoutCommitResolver,
      candidateDiffResolver,
      previousJournalSnapshotResolver,
      gitCwd,
    },
  );
  const units = replay.rows;
  const generationMetadata = {
    hashAlgorithm: 'SHA-256',
    sourcePlanSha256: replay.sourcePlanHash,
    overridesSha256: replay.overridesHash,
    transitionJournalSha256: replay.journalHash,
    asOf: journalValue.asOf,
    phase: replay.phase,
  };
  const ledger = {
    schemaVersion: 1,
    schemaId: technicalSchemaId,
    phase: replay.phase,
    generatedAt: generationMetadata.asOf,
    generationMetadata,
    sourcePlan: planPath,
    overridesPath,
    objective,
    statusTaxonomy,
    completionGate: [
      'derive acceptance tests and manual QA from the source TUW block',
      'verify gating dependencies are satisfied; record explicit blockers only as noncompletion',
      'inspect code anchors and migration requirements in current worktree',
      'run required unit, integration, permission/security negative, and audit tests',
      'run focused package checks plus db migrate/rollback/migrate where applicable',
      'collect current changed-file LSP diagnostics where the tool is available',
      'collect staging/manual QA receipts for TUWs whose acceptance block requires them',
      'record current evidence refs in this ledger',
      'apply state changes only through the sealed one-row transition journal and require every replay prefix to validate',
    ],
    counts: statusCounts(units),
    validationCounts: {
      BOOTSTRAP_PREIMAGE: units.filter((unit) => unit.validationState === 'BOOTSTRAP_PREIMAGE')
        .length,
      CURRENT_VALIDATED: units.filter((unit) => unit.validationState === 'CURRENT_VALIDATED')
        .length,
    },
    units,
  };
  const markdown = [
    '# TUW Internal DMS Uplift 117 Status Ledger',
    '',
    `Generated from \`${planPath}\`. This ledger is an execution-control artifact, not completion evidence by itself.`,
    replay.phase === bootstrapPhase
      ? `Overrides: \`${overridesPath}\`. All 117 rows remain an inert \`BOOTSTRAP_PREIMAGE\`; legacy records are historical only and current evidence is empty.`
      : `Overrides: \`${overridesPath}\`. Phase \`${replay.phase}\` is derived from the sealed journal; only replayed one-row entries may change row state.`,
    '',
    '## Deterministic Metadata',
    '',
    `- Schema: \`${ledger.schemaId}\``,
    `- Phase: \`${ledger.phase}\``,
    `- asOf / generatedAt: \`${ledger.generatedAt}\``,
    `- Source plan SHA-256: \`${generationMetadata.sourcePlanSha256.value}\``,
    `- Overrides SHA-256: \`${generationMetadata.overridesSha256.value}\``,
    `- Transition journal SHA-256: \`${generationMetadata.transitionJournalSha256.value}\``,
    '',
    '## Objective',
    '',
    ledger.objective,
    '',
    '## Status Counts',
    '',
    ...Object.entries(ledger.counts).map(([status, count]) => `- ${status}: ${count}`),
    `- BOOTSTRAP_PREIMAGE: ${ledger.validationCounts.BOOTSTRAP_PREIMAGE}`,
    `- CURRENT_VALIDATED: ${ledger.validationCounts.CURRENT_VALIDATED}`,
    '',
    '## Rules',
    '',
    ...ledger.completionGate.map((rule) => `- ${rule}`),
    '',
    '## Rows',
    '',
    markdownTable(
      units.map((unit) => ({
        id: unit.id,
        horizon: unit.horizon,
        size: unit.size,
        status: unit.status,
        validationState: unit.validationState,
        planLine: unit.source.planLine,
        evidenceCount: unit.evidenceRefs.length,
        historicalEvidenceCount: unit.historicalEvidenceRefs.length,
        blockerClass: unit.blockerClass,
        gapCount: unit.remainingGaps.length,
        nextAction: unit.nextAction,
      })),
    ),
    '',
  ].join('\n');
  return { ledger, markdown, journalEntries: replay.journalEntries };
}

export function generateLedger({ check = false } = {}) {
  const planBytes = readFileSync(planPath);
  const plan = decodeBootstrapUtf8(planBytes, planPath);
  const overridesInput = readOverrides();
  const { ledger, markdown, journalEntries } = buildLedgerFromPlan(plan, {
    overrides: overridesInput.value,
    sourcePlanBytes: planBytes,
    overridesBytes: overridesInput.bytes,
  });
  const json = `${JSON.stringify(ledger, null, 2)}\n`;
  if (check) {
    const actualJson = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : null;
    const actualMarkdown = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null;
    if (actualJson !== json) {
      reject('E_DRIFT_JSON', 'Generated JSON ledger drift detected', { path: jsonPath });
    }
    if (actualMarkdown !== markdown) {
      reject('E_DRIFT_MARKDOWN', 'Generated Markdown ledger drift detected', { path: mdPath });
    }
    console.log(
      JSON.stringify({
        ok: true,
        code: 'CHECK_OK',
        phase: ledger.phase,
        rowCount: ledger.units.length,
        journalEntries,
        writes: 0,
      }),
    );
    return ledger;
  }
  let writes = 0;
  try {
    writeFileSync(jsonPath, json);
    writes += 1;
    writeFileSync(mdPath, markdown);
    writes += 1;
  } catch (error) {
    if (error && typeof error === 'object') error.writes = writes;
    throw error;
  }
  console.log(
    JSON.stringify({
      ok: true,
      code: 'GENERATED',
      phase: ledger.phase,
      rowCount: ledger.units.length,
      journalEntries,
      writes,
    }),
  );
  return ledger;
}

export function exitCodeFor(error) {
  const code = error instanceof LedgerValidationError ? error.code : 'E_SCHEMA_SHAPE';
  if (code.startsWith('E_BOOTSTRAP_')) return 31;
  if (code.startsWith('E_METADATA_')) return 32;
  if (code.startsWith('E_EVIDENCE_')) return 33;
  if (code.startsWith('E_DEPENDENCY_')) return 34;
  if (code.startsWith('E_BLOCKER_')) return 35;
  if (code.startsWith('E_JOURNAL_')) return 36;
  if (code.startsWith('E_REPLAY_')) return 37;
  if (code.startsWith('E_TRANSITION_') || code.startsWith('E_PHASE_')) return 38;
  if (code.startsWith('E_DRIFT_') || code.startsWith('E_CHECK_')) return 39;
  if (code.startsWith('E_SCOPE_')) return 40;
  return 30;
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    generateLedger({ check: process.argv.includes('--check') });
  } catch (error) {
    const validationError = error instanceof LedgerValidationError ? error : null;
    console.error(
      JSON.stringify({
        ok: false,
        code: validationError?.code ?? 'E_SCHEMA_SHAPE',
        rowId: validationError?.rowId ?? null,
        sequence: validationError?.sequence ?? null,
        path: validationError?.path ?? null,
        writes:
          error && typeof error === 'object' && Number.isSafeInteger(error.writes)
            ? error.writes
            : 0,
      }),
    );
    process.exitCode = exitCodeFor(error);
  }
}
