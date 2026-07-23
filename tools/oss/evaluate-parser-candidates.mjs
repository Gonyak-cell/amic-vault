#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANDIDATE_IDS = ['gotenberg', 'tika', 'ocrmypdf'];

function fail(message) {
  throw new Error(`parser candidate evaluation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`);
  return value;
}

function exactIds(values, expected, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  assert(values.length === expected.length, `${label} count mismatch`);
  assert(new Set(values.map(({ id }) => id)).size === values.length, `${label} duplicate id`);
  for (const id of expected)
    assert(
      values.some((value) => value.id === id),
      `${label} missing ${id}`,
    );
}

function sourceEvidence(component) {
  return Boolean(
    component &&
    component.state === 'PINNED' &&
    /^[0-9a-f]{40}$/u.test(component.commit ?? '') &&
    /^[0-9a-f]{40}$/u.test(component.tree ?? '') &&
    /^sha256:[0-9a-f]{64}$/u.test(component.licenseHash ?? '') &&
    component.sourceEvidence &&
    /^[0-9a-f]{40}$/u.test(component.sourceEvidence.sourceBlob ?? '') &&
    /^[0-9a-f]{40}$/u.test(component.sourceEvidence.testBlob ?? '') &&
    /^[0-9a-f]{40}$/u.test(component.sourceEvidence.securityBlob ?? ''),
  );
}

function verifyLocalClone(root, component) {
  if (!root) return 'NOT_REQUESTED';
  const clone = resolve(root, component.clonePath);
  assert(existsSync(clone), `source lab clone missing ${component.id}`);
  const revision = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const tree = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
  }).trim();
  assert(revision === component.commit, `source lab commit drift ${component.id}`);
  assert(tree === component.tree, `source lab tree drift ${component.id}`);
  const license = readFileSync(resolve(clone, component.licensePath));
  assert(sha256(license) === component.licenseHash, `source lab license drift ${component.id}`);
  for (const [pathKey, blobKey] of [
    ['sourcePath', 'sourceBlob'],
    ['testPath', 'testBlob'],
    ['securityPath', 'securityBlob'],
  ]) {
    const blob = execFileSync(
      'git',
      ['-C', clone, 'rev-parse', `HEAD:${component.sourceEvidence[pathKey]}`],
      { encoding: 'utf8' },
    ).trim();
    assert(blob === component.sourceEvidence[blobKey], `source lab blob drift ${component.id}`);
  }
  return 'VERIFIED';
}

export function evaluateParserCandidates({
  corpus,
  sourceMap,
  decisions,
  composeText,
  productFiles,
  appFileNames = [],
  evidenceFileNames = [],
  sourceLabRoot = '',
}) {
  assert(corpus.schemaVersion === 'amic-vault.sf20-parser-corpus.v1', 'corpus schema mismatch');
  assert(corpus.syntheticOnly === true, 'customer corpus is prohibited');
  exactIds(corpus.candidates, CANDIDATE_IDS, 'candidates');
  const cases = corpus.requiredCases;
  assert(Array.isArray(cases) && cases.length > 0, 'required corpus is empty');
  assert(new Set(cases.map(({ id }) => id)).size === cases.length, 'corpus case id duplicate');
  for (const entry of cases) {
    assert(
      entry.currentStatus === 'PASS' || entry.currentStatus === 'FAIL',
      `invalid status ${entry.id}`,
    );
    assert(
      typeof entry.evidence === 'string' && entry.evidence.length > 0,
      `evidence missing ${entry.id}`,
    );
    assert(evidenceFileNames.includes(entry.evidence), `evidence file missing ${entry.id}`);
  }

  const components = object(
    Object.fromEntries(sourceMap.components.map((component) => [component.id, component])),
    'source components',
  );
  const decisionRows = object(
    Object.fromEntries(decisions.decisions.map((decision) => [decision.id, decision])),
    'adoption decisions',
  );
  const sourceLab = {};
  const results = corpus.candidates.map((candidate) => {
    const component = components[candidate.id];
    const evidenceComplete =
      candidate.id === 'gotenberg'
        ? Boolean(component?.state === 'PINNED' && component?.commit && component?.licenseHash)
        : sourceEvidence(component);
    sourceLab[candidate.id] =
      candidate.id === 'gotenberg' || !evidenceComplete
        ? 'PREVIOUSLY_PINNED'
        : verifyLocalClone(sourceLabRoot, component);
    const gaps = cases
      .filter(({ currentStatus }) => currentStatus === 'FAIL')
      .filter(({ id }) => candidate.closesCases.includes(id))
      .map(({ id }) => id);
    const status = !evidenceComplete
      ? 'BLOCKED_SOURCE_EVIDENCE'
      : gaps.length > 0
        ? 'ADOPT_TRIGGER_MET'
        : 'REJECT_FOR_SF20_BASELINE';
    const decision = decisionRows[candidate.id];
    if (status === 'REJECT_FOR_SF20_BASELINE') {
      assert(decision?.status === status, `decision register drift ${candidate.id}`);
    }
    return {
      id: candidate.id,
      status,
      measuredGapCases: gaps,
      coverage: `${cases.length - cases.filter(({ currentStatus }) => currentStatus === 'FAIL').length}/${cases.length}`,
      latencyClass: candidate.latencyClass,
      memoryClass: candidate.memoryClass,
      failureBehavior: candidate.failureBehavior,
      license: candidate.license,
      sourceCommit: component?.commit ?? null,
      sourceTree: component?.tree ?? null,
      operatingServiceDelta: candidate.operatingServiceDelta,
      rollback: candidate.rollback,
    };
  });

  for (const [path, expected] of Object.entries(corpus.productGraphBaseline)) {
    assert(Object.hasOwn(productFiles, path), `product graph file missing ${path}`);
    assert(sha256(productFiles[path]) === expected, `candidate dependency drift ${path}`);
  }
  const runtimeText = `${composeText}\n${appFileNames.join('\n')}`.toLowerCase();
  for (const id of CANDIDATE_IDS) {
    assert(!runtimeText.includes(id), `candidate runtime canary found ${id}`);
  }

  return {
    schemaVersion: 'amic-vault.sf20-parser-candidate-report.v1',
    status: 'PASS',
    syntheticOnly: true,
    corpusCaseCount: cases.length,
    currentParserPassed: cases.filter(({ currentStatus }) => currentStatus === 'PASS').length,
    candidates: results,
    sourceLab,
    candidateRuntimeCount: 0,
    candidateDependencyChangeCount: 0,
  };
}

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const corpus = json('tests/fixtures/ingestion-sandbox/parser-candidate-corpus.json');
    const productFiles = Object.fromEntries(
      Object.keys(corpus.productGraphBaseline).map((path) => [path, readFileSync(resolve(path))]),
    );
    const report = evaluateParserCandidates({
      corpus,
      sourceMap: json('security/oss-source-map.yml'),
      decisions: json('security/oss-adoption-decisions.yml'),
      composeText: readFileSync(resolve('infra/production/compose.yml'), 'utf8'),
      productFiles,
      appFileNames: [],
      evidenceFileNames: corpus.requiredCases
        .map(({ evidence }) => evidence)
        .filter((path) => existsSync(resolve(path))),
      sourceLabRoot: process.env.OSS_RESEARCH_ROOT ?? '',
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
