import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const corpusPath = fileURLToPath(
  new URL('../../tests/fixtures/dlp/korean-pii-eval.json', import.meta.url),
);
const baselinePath = fileURLToPath(
  new URL('../../security/dlp-korean-pii-baseline.json', import.meta.url),
);

export const DLP_CLASSES = Object.freeze([
  'korean_resident_id',
  'korean_alien_registration_number',
  'bank_account',
  'passport_number',
  'payment_card_number',
  'email_address',
  'phone_number',
]);

export const CORPUS_FAMILIES = Object.freeze(['positive', 'negative', 'hard_negative']);

const SYNTHETIC_VALUES = Object.freeze({
  rrn_hyphen: '000101-1000000',
  rrn_plain: '0001011000000',
  rrn_space: '991231 4000000',
  rrn_invalid_gender: '000101-0000000',
  case_number: '2026가단000101',
  alien_hyphen: '000101-5000000',
  alien_plain: '0001015000000',
  alien_space: '991231 8000000',
  alien_invalid_gender: '000101-9000000',
  legal_date: '2026-07-23',
  bank_four_groups: '000-000000-00-000',
  bank_three_groups: '00-0000-000000',
  bank_spaces: '000000 00 000000 0000',
  bank_invalid_prefix: '0000000-00-000',
  passport_legacy: 'M00000000',
  passport_current: 'M000A0000',
  passport_lowercase: 's000b0000',
  passport_invalid_prefix: 'A000B0000',
  document_code: 'DOC-M000A000',
  card_visa: '4111111111111111',
  card_mastercard: '5555555555554444',
  card_spaced: '4000 0000 0000 0002',
  card_invalid_luhn: '4111111111111112',
  statute_number: '법률 제12345호',
  email_basic: 'synthetic@example.test',
  email_plus: 'synthetic+review@example.test',
  email_subdomain: 'synthetic@matter.example.test',
  email_invalid_domain: 'synthetic@example',
  at_reference: '제10조@별표',
  phone_mobile: '010-0000-0000',
  phone_legacy: '011-000-0000',
  phone_international: '+82-10-0000-0000',
  phone_landline: '02-0000-0000',
  docket_number: '010-2026-000',
});

const literalPiiPattern = /[0-9@]/u;
const tokenPattern = /\{\{([a-z0-9_]+)\}\}/gu;

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function metric(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function renderTemplate(template) {
  const seen = new Set();
  const rendered = template.replace(tokenPattern, (_, token) => {
    const value = SYNTHETIC_VALUES[token];
    if (!value) throw new Error(`unknown synthetic token: ${token}`);
    seen.add(token);
    return value;
  });
  if (seen.size === 0) throw new Error('each corpus template needs a synthetic token');
  if (rendered.includes('{{') || rendered.includes('}}')) {
    throw new Error('malformed synthetic token');
  }
  return rendered;
}

export function validateCorpus(corpus) {
  if (corpus?.schemaVersion !== 'amic-vault.dlp-korean-pii-corpus.v1') {
    throw new Error('invalid corpus schemaVersion');
  }
  if (corpus.policyVersion !== 'sf20-dlp-v1' || corpus.syntheticOnly !== true) {
    throw new Error('corpus must be sf20-dlp-v1 and synthetic-only');
  }
  if (stableJson(corpus.classes) !== stableJson(DLP_CLASSES)) {
    throw new Error('corpus classes must match the closed DLP class registry');
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    throw new Error('corpus cases are required');
  }

  const ids = new Set();
  const coverage = new Map(DLP_CLASSES.map((type) => [type, new Set()]));
  for (const testCase of corpus.cases) {
    if (
      typeof testCase.id !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{2,79}$/u.test(testCase.id) ||
      ids.has(testCase.id)
    ) {
      throw new Error(`invalid or duplicate corpus case id: ${String(testCase.id)}`);
    }
    ids.add(testCase.id);
    if (!DLP_CLASSES.includes(testCase.targetType)) {
      throw new Error(`unknown targetType for ${testCase.id}`);
    }
    if (!CORPUS_FAMILIES.includes(testCase.family)) {
      throw new Error(`unknown family for ${testCase.id}`);
    }
    if (testCase.synthetic !== true) throw new Error(`non-synthetic case: ${testCase.id}`);
    if (typeof testCase.template !== 'string' || literalPiiPattern.test(testCase.template)) {
      throw new Error(`literal PII-like value is forbidden in template: ${testCase.id}`);
    }
    if (
      !Array.isArray(testCase.expected) ||
      testCase.expected.some((type) => !DLP_CLASSES.includes(type)) ||
      new Set(testCase.expected).size !== testCase.expected.length
    ) {
      throw new Error(`invalid expected types for ${testCase.id}`);
    }
    if (testCase.family === 'positive' && !testCase.expected.includes(testCase.targetType)) {
      throw new Error(`positive case misses its target type: ${testCase.id}`);
    }
    if (testCase.family !== 'positive' && testCase.expected.includes(testCase.targetType)) {
      throw new Error(`negative case expects its target type: ${testCase.id}`);
    }
    renderTemplate(testCase.template);
    coverage.get(testCase.targetType).add(testCase.family);
  }

  for (const [type, families] of coverage) {
    for (const family of CORPUS_FAMILIES) {
      if (!families.has(family)) throw new Error(`missing ${family} coverage for ${type}`);
    }
  }
}

export async function loadCorpus(path = corpusPath) {
  const corpus = JSON.parse(await readFile(path, 'utf8'));
  validateCorpus(corpus);
  return corpus;
}

export async function defaultScan(text) {
  const shared = await import('../../packages/shared/dist/index.js');
  return shared.scanSensitiveData(text, { hash: sha256Hex });
}

export async function evaluateCorpus(corpus, scan = defaultScan) {
  validateCorpus(corpus);
  const orderedCases = [...corpus.cases].sort((left, right) => left.id.localeCompare(right.id));
  const counts = Object.fromEntries(
    DLP_CLASSES.map((type) => [type, { tp: 0, fp: 0, fn: 0, tn: 0 }]),
  );
  const misclassified = [];

  for (const testCase of orderedCases) {
    const text = renderTemplate(testCase.template);
    const predicted = new Set((await scan(text)).map((item) => item.findingType));
    const expected = new Set(testCase.expected);
    for (const type of DLP_CLASSES) {
      const expectedType = expected.has(type);
      const predictedType = predicted.has(type);
      if (expectedType && predictedType) counts[type].tp += 1;
      else if (!expectedType && predictedType) {
        counts[type].fp += 1;
        misclassified.push(`${testCase.id}:${type}:fp`);
      } else if (expectedType) {
        counts[type].fn += 1;
        misclassified.push(`${testCase.id}:${type}:fn`);
      } else counts[type].tn += 1;
    }
  }

  const classes = {};
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  let totalTn = 0;
  for (const type of DLP_CLASSES) {
    const value = counts[type];
    totalTp += value.tp;
    totalFp += value.fp;
    totalFn += value.fn;
    totalTn += value.tn;
    const precision = metric(value.tp, value.tp + value.fp);
    const recall = metric(value.tp, value.tp + value.fn);
    classes[type] = {
      ...value,
      precision: rounded(precision),
      recall: rounded(recall),
      f1: rounded(metric(2 * precision * recall, precision + recall)),
    };
  }

  const microPrecision = metric(totalTp, totalTp + totalFp);
  const microRecall = metric(totalTp, totalTp + totalFn);
  const macroPrecision =
    DLP_CLASSES.reduce((sum, type) => sum + classes[type].precision, 0) / DLP_CLASSES.length;
  const macroRecall =
    DLP_CLASSES.reduce((sum, type) => sum + classes[type].recall, 0) / DLP_CLASSES.length;
  const macroF1 =
    DLP_CLASSES.reduce((sum, type) => sum + classes[type].f1, 0) / DLP_CLASSES.length;

  return {
    schemaVersion: 'amic-vault.dlp-korean-pii-result.v1',
    policyVersion: corpus.policyVersion,
    corpusHash: sha256Hex(stableJson({ ...corpus, cases: orderedCases })),
    caseCount: orderedCases.length,
    classes,
    aggregate: {
      tp: totalTp,
      fp: totalFp,
      fn: totalFn,
      tn: totalTn,
      microPrecision: rounded(microPrecision),
      microRecall: rounded(microRecall),
      microF1: rounded(metric(2 * microPrecision * microRecall, microPrecision + microRecall)),
      macroPrecision: rounded(macroPrecision),
      macroRecall: rounded(macroRecall),
      macroF1: rounded(macroF1),
    },
    misclassifiedCaseHashes: [...new Set(misclassified)]
      .sort()
      .map((value) => sha256Hex(value)),
  };
}

export function assertThresholds(result) {
  const failures = [];
  if (result.aggregate.microPrecision < 0.98) failures.push('microPrecision<0.98');
  if (result.aggregate.microRecall < 0.9) failures.push('microRecall<0.90');
  if (result.aggregate.microF1 < 0.94) failures.push('microF1<0.94');
  for (const type of DLP_CLASSES) {
    if (result.classes[type].recall < 0.8) failures.push(`${type}.recall<0.80`);
  }
  if (failures.length > 0) throw new Error(`DLP absolute threshold failed: ${failures.join(',')}`);
}

export function assertAgainstBaseline(result, baseline) {
  if (baseline?.schemaVersion !== 'amic-vault.dlp-korean-pii-baseline.v1') {
    throw new Error('invalid DLP baseline schemaVersion');
  }
  if (
    result.policyVersion !== baseline.policyVersion ||
    result.corpusHash !== baseline.corpusHash ||
    result.caseCount !== baseline.caseCount
  ) {
    throw new Error('DLP corpus identity differs from the committed baseline');
  }
  const regressions = [];
  for (const metricName of [
    'microPrecision',
    'microRecall',
    'microF1',
    'macroPrecision',
    'macroRecall',
    'macroF1',
  ]) {
    if (result.aggregate[metricName] < baseline.aggregate[metricName]) {
      regressions.push(`aggregate.${metricName}`);
    }
  }
  for (const type of DLP_CLASSES) {
    for (const metricName of ['precision', 'recall', 'f1']) {
      if (result.classes[type][metricName] < baseline.classes[type][metricName]) {
        regressions.push(`${type}.${metricName}`);
      }
    }
  }
  if (regressions.length > 0) {
    throw new Error(`DLP baseline regression: ${regressions.join(',')}`);
  }
}

async function main() {
  const corpus = await loadCorpus();
  const result = await evaluateCorpus(corpus);
  assertThresholds(result);
  if (process.argv.includes('--check')) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    assertAgainstBaseline(result, baseline);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
