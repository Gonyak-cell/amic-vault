import { describe, expect, it } from 'vitest';
import { computeMetrics } from './run-korean-eval';

describe('computeMetrics', () => {
  it('computes deterministic recall, precision, and false-positive rate', () => {
    expect(
      computeMetrics(
        [
          { expected: true, matched: true },
          { expected: true, matched: false },
          { expected: false, matched: true },
          { expected: false, matched: false },
        ],
        2,
      ),
    ).toMatchObject({
      cases: 2,
      documents: 4,
      truePositive: 1,
      falsePositive: 1,
      falseNegative: 1,
      trueNegative: 1,
      precision: 0.5,
      recall: 0.5,
      falsePositiveRate: 0.5,
    });
  });
});
