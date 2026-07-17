import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, TextDecoder } from 'node:util';

const planPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md';
const jsonPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json';
const mdPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md';
const overridesPath = 'docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json';
const defaultGeneratedAt = '2026-07-17T00:00:00.000Z';
const technicalSchemaId = 'PACK-R14-02-TASK5-SCHEMA-V1';
const bootstrapPhase = 'BOOTSTRAP_IMPORT';
const bootstrapSourcePlanSha256 =
  '23774be4a061ad1e887d44cbbcfb1a34cae66f13165e08ff62d44968a57a81f7';
const bootstrapOverridesSha256 = 'd0404c84bfe3e7b4d14d071a0c9f267a87eb62a512a78f3e4d98499abaae6a4a';
const maxEvidenceAgeSeconds = 2_592_000;

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

export class LedgerValidationError extends Error {
  constructor(code, message, context = {}) {
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

function validateDependencyConditions(conditions, rowId) {
  if (!Array.isArray(conditions))
    reject('E_SCHEMA_SHAPE', 'dependencyConditions must be an array', { rowId });
  for (const [index, condition] of conditions.entries()) {
    const path = `dependencyConditions[${index}]`;
    assertExactKeys(
      condition,
      ['dependencyId', 'state', 'decisionRef', 'decisionHash'],
      'E_SCHEMA_SHAPE',
      path,
    );
    assertNonEmptyString(condition.dependencyId, 'E_SCHEMA_SHAPE', `${path}.dependencyId`);
    if (!['ACTIVE', 'INACTIVE'].includes(condition.state))
      reject('E_DEPENDENCY_CONDITION_UNKNOWN', `${path}.state is invalid`, { rowId, path });
    assertNonEmptyString(condition.decisionRef, 'E_SCHEMA_SHAPE', `${path}.decisionRef`);
    validateHash(condition.decisionHash, `${path}.decisionHash`);
  }
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
  validateDependencyConditions(row.dependencyConditions, row.id);
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

function parseDependencies(block) {
  const match = block.match(/\*\*Dependencies:\*\*\s*([^\n]+)/);
  if (!match) return [];
  const value = match[1].trim();
  if (value === '없음' || value === '—' || value === '-') return [];
  return unique(value.split(/,\s*|\s*→\s*/));
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
  const bytes = readFileSync(overridesPath, 'utf8');
  return { bytes, value: JSON.parse(bytes) };
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

  return parseTuwBlocks(plan).map((parsedUnit) => {
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
        dependencies: parseDependencies(block),
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

function assertSealedBootstrapInputs({ plan, sourcePlanBytes, overrides, overridesBytes }) {
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
  if (
    sourcePlanHash.value !== bootstrapSourcePlanSha256 ||
    overridesHash.value !== bootstrapOverridesSha256
  ) {
    reject('E_BOOTSTRAP_IDENTITY', 'Bootstrap exact input hashes changed');
  }
  return { sourcePlanHash, overridesHash };
}

export function buildLedgerFromPlan(
  plan,
  {
    overrides = { updatedAt: defaultGeneratedAt, unitOverrides: {} },
    sourcePlanBytes = plan,
    overridesBytes = `${JSON.stringify(overrides, null, 2)}\n`,
  } = {},
) {
  validateTimestamp(overrides.updatedAt, 'overrides.updatedAt');
  const { sourcePlanHash, overridesHash } = assertSealedBootstrapInputs({
    plan,
    sourcePlanBytes,
    overrides,
    overridesBytes,
  });
  if (overrides.updatedAt !== defaultGeneratedAt) {
    reject('E_METADATA_CLOCK', 'BOOTSTRAP_IMPORT must use the canonical bootstrap timestamp', {
      path: 'overrides.updatedAt',
    });
  }
  const units = parsePlanUnits(plan, overrides);
  assertBootstrapIdentity(units);
  validateLedgerRows(units, { asOf: overrides.updatedAt });
  const generationMetadata = {
    hashAlgorithm: 'SHA-256',
    sourcePlanSha256: sourcePlanHash,
    overridesSha256: overridesHash,
    transitionJournalSha256: null,
    asOf: overrides.updatedAt,
    phase: bootstrapPhase,
  };
  const ledger = {
    schemaVersion: 1,
    schemaId: technicalSchemaId,
    phase: bootstrapPhase,
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
      'do not promote or demote from this inert bootstrap; TUW-004 must register and replay the transition journal first',
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
    `Overrides: \`${overridesPath}\`. All 117 rows are an inert \`BOOTSTRAP_PREIMAGE\`; legacy records are historical only and current evidence is empty.`,
    '',
    '## Deterministic Metadata',
    '',
    `- Schema: \`${ledger.schemaId}\``,
    `- Phase: \`${ledger.phase}\``,
    `- asOf / generatedAt: \`${ledger.generatedAt}\``,
    `- Source plan SHA-256: \`${generationMetadata.sourcePlanSha256.value}\``,
    `- Overrides SHA-256: \`${generationMetadata.overridesSha256.value}\``,
    '- Transition journal SHA-256: `null` (TUW-004 has not created the journal)',
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
  return { ledger, markdown };
}

export function generateLedger({ check = false } = {}) {
  const plan = readFileSync(planPath, 'utf8');
  const overridesInput = readOverrides();
  const { ledger, markdown } = buildLedgerFromPlan(plan, {
    overrides: overridesInput.value,
    sourcePlanBytes: plan,
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
        journalEntries: 0,
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
      journalEntries: 0,
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
  if (code.startsWith('E_DRIFT_')) return 39;
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
