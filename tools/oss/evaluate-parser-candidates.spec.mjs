import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { evaluateParserCandidates } from './evaluate-parser-candidates.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function fixture() {
  const corpus = json('tests/fixtures/ingestion-sandbox/parser-candidate-corpus.json');
  return {
    corpus,
    sourceMap: json('security/oss-source-map.yml'),
    decisions: json('security/oss-adoption-decisions.yml'),
    composeText: readFileSync(resolve('infra/production/compose.yml'), 'utf8'),
    productFiles: Object.fromEntries(
      Object.keys(corpus.productGraphBaseline).map((path) => [path, readFileSync(resolve(path))]),
    ),
    appFileNames: [],
    evidenceFileNames: corpus.requiredCases.map(({ evidence }) => evidence),
  };
}

test('required SF20 corpus deterministically rejects all three unneeded services', () => {
  const first = evaluateParserCandidates(fixture());
  const second = evaluateParserCandidates(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.status, 'PASS');
  assert.equal(first.corpusCaseCount, 12);
  assert.equal(first.currentParserPassed, 12);
  assert.deepEqual(
    first.candidates.map(({ status }) => status),
    ['REJECT_FOR_SF20_BASELINE', 'REJECT_FOR_SF20_BASELINE', 'REJECT_FOR_SF20_BASELINE'],
  );
  assert.equal(first.candidateRuntimeCount, 0);
  assert.equal(first.candidateDependencyChangeCount, 0);
});

test('one measurable current-parser gap triggers only the matching candidate', () => {
  const value = fixture();
  value.corpus.requiredCases.find(({ id }) => id === 'korean-english-scanned-pdf').currentStatus =
    'FAIL';
  const report = evaluateParserCandidates(value);
  assert.equal(report.candidates.find(({ id }) => id === 'ocrmypdf').status, 'ADOPT_TRIGGER_MET');
  assert.equal(
    report.candidates.find(({ id }) => id === 'gotenberg').status,
    'REJECT_FOR_SF20_BASELINE',
  );
  assert.equal(
    report.candidates.find(({ id }) => id === 'tika').status,
    'REJECT_FOR_SF20_BASELINE',
  );
});

test('missing exact source evidence cannot become an adoption trigger', () => {
  const value = fixture();
  value.sourceMap.components.find(({ id }) => id === 'ocrmypdf').sourceEvidence = null;
  value.corpus.requiredCases.find(({ id }) => id === 'korean-english-scanned-pdf').currentStatus =
    'FAIL';
  const report = evaluateParserCandidates(value);
  assert.equal(
    report.candidates.find(({ id }) => id === 'ocrmypdf').status,
    'BLOCKED_SOURCE_EVIDENCE',
  );
});

test('missing corpus evidence file fails closed', () => {
  const value = fixture();
  value.evidenceFileNames = value.evidenceFileNames.filter(
    (path) => path !== 'workers/ingestion/tests/test_ocr_router.py',
  );
  assert.throws(() => evaluateParserCandidates(value), /evidence file missing/u);
});

test('candidate dependency service and adapter canaries fail closed', () => {
  for (const mutate of [
    (value) => {
      value.composeText += '\nocrmypdf:\n  image: ocrmypdf:latest\n';
    },
    (value) => {
      value.appFileNames.push('workers/ingestion/app/tika_adapter.py');
    },
    (value) => {
      value.productFiles['workers/ingestion/pyproject.toml'] = Buffer.concat([
        value.productFiles['workers/ingestion/pyproject.toml'],
        Buffer.from('\nocrmypdf = \"*\"\n'),
      ]);
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => evaluateParserCandidates(value),
      /candidate (?:runtime canary|dependency drift)/u,
    );
  }
});
