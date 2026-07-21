import { describe, expect, it } from 'vitest';
import {
  scoreMatterSuggestion,
  type MatterSuggestionSignalInput,
} from './matter-suggestion-scorer';

interface EvalCandidate {
  id: string;
  expectedMatter: boolean;
  signals: MatterSuggestionSignalInput;
}

interface EvalCase {
  label: string;
  candidates: EvalCandidate[];
}

describe('scoreMatterSuggestion', () => {
  it.each([
    [
      'stored thread filing alone',
      { threadFiledCount: 1 },
      'auto_file',
      ['thread'],
    ],
    [
      'sender history plus domain',
      { senderMatterFilingCount: 3, senderTotalFilingCount: 4, domainMatch: true },
      'confirm',
      ['sender_history', 'participant_domain'],
    ],
    ['domain alone', { domainMatch: true }, 'candidate', ['participant_domain']],
    ['no signals', {}, 'manual', []],
    [
      'subject and domain',
      { subjectMatch: true, domainMatch: true },
      'candidate',
      ['participant_domain', 'subject'],
    ],
    [
      'client participant signal plus domain',
      { clientParticipantMatch: true, domainMatch: true },
      'candidate',
      ['participant_domain', 'participant_class'],
    ],
    [
      'opposing signal discounts an otherwise plausible matter',
      { senderMatterFilingCount: 2, senderTotalFilingCount: 3, domainMatch: true, opposingDomainConflict: true },
      'candidate',
      ['sender_history', 'participant_domain', 'opposing_signal'],
    ],
    [
      'thread and contrary domain still require high confidence',
      { threadFiledCount: 1, opposingDomainConflict: true },
      'confirm',
      ['thread', 'opposing_signal'],
    ],
  ] as const)('maps %s to the expected confidence band', (_label, input, band, reasons) => {
    const scored = scoreMatterSuggestion(input);

    expect(scored.confidenceBand).toBe(band);
    expect(scored.reasonCodes).toEqual(reasons);
    expect(scored.confidence).toBeGreaterThanOrEqual(0);
    expect(scored.confidence).toBeLessThanOrEqual(100);
  });

  it('keeps auto-file precise and confirm-or-higher top-ranked across the 50-case local eval set', () => {
    const cases = buildLocalEvalCases();
    const rankedTop = cases.map((scenario) => ({
      scenario,
      top: topRankedCandidate(scenario.candidates),
    }));
    const autoFilePredictions = rankedTop.filter(
      ({ top }) => top.score.confidenceBand === 'auto_file',
    );
    const confirmOrHigherPredictions = rankedTop.filter(
      ({ top }) => top.score.confidence >= 80,
    );
    const correctConfirmOrHigher = confirmOrHigherPredictions.filter(
      ({ top }) => top.expectedMatter,
    );

    expect(cases).toHaveLength(50);
    expect(autoFilePredictions.length).toBeGreaterThan(0);
    expect(confirmOrHigherPredictions.length).toBeGreaterThan(0);
    expect(autoFilePredictions.every(({ top }) => top.expectedMatter)).toBe(true);
    expect(correctConfirmOrHigher.length / confirmOrHigherPredictions.length).toBeGreaterThanOrEqual(
      0.8,
    );
  });
});

function rankCandidates(candidates: EvalCandidate[]) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreMatterSuggestion(candidate.signals),
    }))
    .sort(
      (left, right) =>
        right.score.confidence - left.score.confidence || left.id.localeCompare(right.id),
    );
}

function topRankedCandidate(candidates: EvalCandidate[]) {
  const [top] = rankCandidates(candidates);
  if (!top) {
    throw new Error('Email suggestion eval case must include at least one candidate.');
  }
  return top;
}

function buildLocalEvalCases(): EvalCase[] {
  return [
    ...Array.from({ length: 20 }, (_, index): EvalCase => {
      const threadFiledCount = (index % 3) + 1;
      return {
        label: `thread-continuity-${index + 1}`,
        candidates: [
          {
            id: `matter-thread-${index + 1}`,
            expectedMatter: true,
            signals: { threadFiledCount },
          },
          {
            id: `matter-domain-${index + 1}`,
            expectedMatter: false,
            signals: { domainMatch: true, subjectMatch: index % 2 === 0 },
          },
          {
            id: `matter-manual-${index + 1}`,
            expectedMatter: false,
            signals: {},
          },
        ],
      };
    }),
    ...Array.from({ length: 15 }, (_, index): EvalCase => {
      const senderMatterFilingCount = (index % 4) + 2;
      return {
        label: `sender-history-domain-${index + 1}`,
        candidates: [
          {
            id: `matter-sender-${index + 1}`,
            expectedMatter: true,
            signals: {
              senderMatterFilingCount,
              senderTotalFilingCount: senderMatterFilingCount + 2,
              domainMatch: true,
            },
          },
          {
            id: `matter-subject-${index + 1}`,
            expectedMatter: false,
            signals: { subjectMatch: true, domainMatch: index % 3 === 0 },
          },
          {
            id: `matter-opposing-${index + 1}`,
            expectedMatter: false,
            signals: { domainMatch: true, opposingDomainConflict: true },
          },
        ],
      };
    }),
    ...Array.from({ length: 10 }, (_, index): EvalCase => ({
      label: `candidate-threshold-${index + 1}`,
      candidates: [
        {
          id: `matter-candidate-${index + 1}`,
          expectedMatter: true,
          signals:
            index % 2 === 0
              ? { domainMatch: true, subjectMatch: true }
              : { domainMatch: true, clientParticipantMatch: true },
        },
        {
          id: `matter-weak-${index + 1}`,
          expectedMatter: false,
          signals: { subjectMatch: true },
        },
        {
          id: `matter-empty-${index + 1}`,
          expectedMatter: false,
          signals: {},
        },
      ],
    })),
    ...Array.from({ length: 5 }, (_, index): EvalCase => ({
      label: `opposing-discount-${index + 1}`,
      candidates: [
        {
          id: `matter-thread-opposing-${index + 1}`,
          expectedMatter: true,
          signals: { threadFiledCount: 1, opposingDomainConflict: true },
        },
        {
          id: `matter-domain-only-${index + 1}`,
          expectedMatter: false,
          signals: { domainMatch: true },
        },
        {
          id: `matter-sender-weak-${index + 1}`,
          expectedMatter: false,
          signals: { senderMatterFilingCount: 1, senderTotalFilingCount: 8 },
        },
      ],
    })),
  ];
}
