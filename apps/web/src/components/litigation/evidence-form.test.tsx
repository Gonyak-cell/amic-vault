import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LitigationEvidenceDto } from '@amic-vault/shared';
import { buildEvidenceInput, EvidenceForm, submitEvidenceRegistration } from './evidence-form';

const matterId = '11111111-1111-4111-8111-111111111122';
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
  custodyStatus: 'collected',
  admittedStatus: 'unknown',
  sourceHash: null,
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
} satisfies LitigationEvidenceDto;

describe('EvidenceForm', () => {
  it('builds a create request with Korean exhibit label kept out of evidenceCode', () => {
    expect(
      buildEvidenceInput(matterId, {
        documentId: '',
        direction: 'gap',
        evidenceCode: '  GAP-003  ',
        evidenceSequence: '3',
        evidenceType: 'document',
        exhibitLabel: '  갑 제3호증  ',
      }),
    ).toMatchObject({
      matterId,
      evidenceCode: 'GAP-003',
      evidenceDirection: 'gap',
      evidenceSequence: 3,
      exhibitLabel: '갑 제3호증',
    });
  });

  it('submits evidence and refreshes the list surface', async () => {
    const createEvidence = vi.fn(async () => evidence);
    const onSubmitted = vi.fn();

    await submitEvidenceRegistration({
      createEvidence,
      matterId,
      onSubmitted,
      state: {
        documentId: '',
        direction: 'gap',
        evidenceCode: 'GAP-003',
        evidenceSequence: '3',
        evidenceType: 'document',
        exhibitLabel: '갑 제3호증',
      },
    });

    expect(createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceCode: 'GAP-003',
        evidenceDirection: 'gap',
        evidenceSequence: 3,
      }),
    );
    expect(onSubmitted).toHaveBeenCalledWith(evidence);
  });

  it('renders direction, generated label, and submit controls', () => {
    const html = renderToStaticMarkup(
      <EvidenceForm matterId={matterId} onChanged={() => undefined} />,
    );

    expect(html).toContain('증거 등록');
    expect(html).toContain('갑');
    expect(html).toContain('을');
    expect(html).toContain('증거번호 다시 계산');
    expect(html).toContain('등록');
  });
});
