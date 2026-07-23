import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertAgainstBaseline,
  assertThresholds,
  DLP_CLASSES,
  evaluateCorpus,
  loadCorpus,
  validateCorpus,
} from './run-korean-pii-eval.mjs';

const baselinePath = new URL('../../security/dlp-korean-pii-baseline.json', import.meta.url);

test('corpus result is deterministic and independent of case order', async () => {
  const corpus = await loadCorpus();
  const first = await evaluateCorpus(corpus);
  const reversed = await evaluateCorpus({ ...corpus, cases: [...corpus.cases].reverse() });

  assert.deepEqual(first, reversed);
  assert.equal(first.caseCount, 35);
  assert.equal(Object.keys(first.classes).length, DLP_CLASSES.length);
  assert.doesNotMatch(JSON.stringify(first), /example\.test|411111|000101/u);
});

test('committed corpus meets absolute and non-regression gates', async () => {
  const corpus = await loadCorpus();
  const result = await evaluateCorpus(corpus);
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

  assert.doesNotThrow(() => assertThresholds(result));
  assert.doesNotThrow(() => assertAgainstBaseline(result, baseline));
});

test('corpus validator rejects unsafe or incomplete mutations', async () => {
  const corpus = await loadCorpus();
  const baseCase = corpus.cases[0];
  const mutations = [
    { ...corpus, syntheticOnly: false },
    { ...corpus, cases: [...corpus.cases, { ...baseCase }] },
    { ...corpus, cases: corpus.cases.map((item, index) => index === 0 ? { ...item, synthetic: false } : item) },
    { ...corpus, cases: corpus.cases.map((item, index) => index === 0 ? { ...item, template: 'literal synthetic@example.test' } : item) },
    { ...corpus, cases: corpus.cases.map((item, index) => index === 0 ? { ...item, template: 'literal 010-1234-5678' } : item) },
    { ...corpus, cases: corpus.cases.map((item, index) => index === 0 ? { ...item, template: 'SYNTHETIC {{unknown_token}}' } : item) },
    { ...corpus, cases: corpus.cases.filter((item) => !(item.targetType === 'phone_number' && item.family === 'hard_negative')) },
  ];

  for (const mutation of mutations) {
    assert.throws(() => validateCorpus(mutation));
  }
});

test('baseline comparison fails when a detector loses all positives', async () => {
  const corpus = await loadCorpus();
  const result = await evaluateCorpus(corpus, async () => []);
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

  assert.throws(() => assertThresholds(result), /absolute threshold failed/u);
  assert.throws(() => assertAgainstBaseline(result, baseline), /baseline regression/u);
  assert.ok(result.misclassifiedCaseHashes.length > 0);
  assert.match(result.misclassifiedCaseHashes[0], /^[0-9a-f]{64}$/u);
});
