import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LitigationEvidenceDto, LitigationFactDto } from '@amic-vault/shared';
import {
  allowedFactTransitions,
  buildFactInput,
  FactLedgerForm,
  submitFactRegistration,
  submitFactTransition,
} from './fact-ledger-form';

const matterId = '11111111-1111-4111-8111-111111111122';
const timestamp = '2026-07-03T00:00:00.000Z';
const evidence = {
  evidenceId: '11111111-1111-4111-8111-111111111441',
  matterId,
  documentId: null,
  versionId: null,
  evidenceCode: 'GAP-003',
  evidenceDirection: 'gap',
  evidenceSequence: 3,
  evidenceType: 'document',
  exhibitLabel: '갑 제3호증',
  custodyStatus: 'reviewed',
  admittedStatus: 'unknown',
  sourceHash: null,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationEvidenceDto;

const citedDraft = {
  factId: '11111111-1111-4111-8111-111111111444',
  matterId,
  evidenceId: evidence.evidenceId,
  factCode: 'FACT-001',
  factSummary: '계약 해지 통지가 송달되었습니다.',
  factDate: null,
  status: 'draft',
  materiality: 'high',
  citationRefs: [`evidence:${evidence.evidenceId}`],
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationFactDto;

const uncitedDraft = {
  ...citedDraft,
  factId: '11111111-1111-4111-8111-111111111445',
  factCode: 'FACT-002',
  citationRefs: [],
} satisfies LitigationFactDto;

describe('FactLedgerForm', () => {
  it('builds a bounded draft fact payload', () => {
    expect(
      buildFactInput(matterId, {
        citationRefs: ` evidence:${evidence.evidenceId} `,
        evidenceId: evidence.evidenceId,
        factCode: ' FACT-003 ',
        factSummary: '  통지 수령일은 2026-07-03입니다.  ',
        materiality: 'medium',
      }),
    ).toMatchObject({
      matterId,
      evidenceId: evidence.evidenceId,
      factCode: 'FACT-003',
      factSummary: '통지 수령일은 2026-07-03입니다.',
      citationRefs: [`evidence:${evidence.evidenceId}`],
    });
  });

  it('submits a fact and refreshes the list surface', async () => {
    const createFact = vi.fn(async () => citedDraft);
    const onSubmitted = vi.fn();

    await submitFactRegistration({
      createFact,
      matterId,
      onSubmitted,
      state: {
        citationRefs: `evidence:${evidence.evidenceId}`,
        evidenceId: evidence.evidenceId,
        factCode: 'FACT-001',
        factSummary: '계약 해지 통지가 송달되었습니다.',
        materiality: 'high',
      },
    });

    expect(createFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factCode: 'FACT-001',
        status: 'draft',
      }),
    );
    expect(onSubmitted).toHaveBeenCalledWith(citedDraft);
  });

  it('exposes only allowed status transitions', async () => {
    expect(allowedFactTransitions(citedDraft)).toEqual(['verified', 'disputed', 'withdrawn']);
    expect(allowedFactTransitions(uncitedDraft)).toEqual(['disputed', 'withdrawn']);

    const html = renderToStaticMarkup(
      <FactLedgerForm
        evidence={[evidence]}
        facts={[uncitedDraft]}
        matterId={matterId}
        onChanged={() => undefined}
      />,
    );
    expect(html).toContain('다툼');
    expect(html).toContain('철회');
    expect(html).not.toContain('검증</button>');

    const updated = { ...citedDraft, status: 'disputed' } satisfies LitigationFactDto;
    const updateFact = vi.fn(async () => updated);
    const onSubmitted = vi.fn();
    await submitFactTransition({
      fact: citedDraft,
      status: 'disputed',
      updateFact,
      onSubmitted,
    });

    expect(updateFact).toHaveBeenCalledWith(citedDraft.factId, { status: 'disputed' });
    expect(onSubmitted).toHaveBeenCalledWith(updated);
  });
});
