import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEvaluationCases } from '../../tools/evalset/load-evaluation-cases';
import { createAppClient, createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

async function caseCount(tenantId: string, caseNo: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM evaluation_cases
        WHERE tenant_id = $1
          AND case_no = $2
      `,
      [tenantId, caseNo],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function caseGoldenLabels(
  tenantId: string,
  caseNo: string,
): Promise<{ expectedAnswerFacts: unknown; expectedCitationDocumentIds: string[] }> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      expected_answer_facts: unknown;
      expected_citation_document_ids: string[];
    }>(
      `
        SELECT expected_answer_facts, expected_citation_document_ids
        FROM evaluation_cases
        WHERE tenant_id = $1
          AND case_no = $2
      `,
      [tenantId, caseNo],
    );
    const row = result.rows[0];
    return {
      expectedAnswerFacts: row?.expected_answer_facts ?? [],
      expectedCitationDocumentIds: row?.expected_citation_document_ids ?? [],
    };
  });
}

async function visibleCaseCount(viewerTenantId: string, caseNo: string): Promise<number> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, viewerTenantId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM evaluation_cases
        WHERE case_no = $1
      `,
      [caseNo],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

describe('evalset integration', () => {
  it('loads 100+ deidentified fixtures idempotently without warning', async () => {
    await withClient(createOwnerClient(), async (client) => {
      await expect(
        loadEvaluationCases({
          client,
          tenantId: tenantAlphaId,
          directory: 'tests/fixtures/evalset-v0',
        }),
      ).resolves.toMatchObject({ loaded: 102, warnings: [] });
    });
    await expect(caseCount(tenantAlphaId, 'EV-0001')).resolves.toBe(1);

    await withClient(createOwnerClient(), async (client) => {
      await expect(
        loadEvaluationCases({
          client,
          tenantId: tenantAlphaId,
          directory: 'tests/fixtures/evalset-v0',
        }),
      ).resolves.toMatchObject({ loaded: 102, warnings: [] });
    });
    await expect(caseCount(tenantAlphaId, 'EV-0001')).resolves.toBe(1);
  });

  it('rolls back contaminated fixtures and keeps tenant isolation', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'amic-evalset-'));
    writeFileSync(
      path.join(dir, 'contaminated.json'),
      JSON.stringify({
        caseNo: 'EV-BLOCKED',
        sourceDocRef: 'doc:blocked',
        caseType: 'contract_search',
        queryText: 'blocked 900101-1234567 identifier',
        expectedRefs: ['doc:blocked'],
        deidentified: true,
      }),
    );

    await withClient(createOwnerClient(), async (client) => {
      await expect(
        loadEvaluationCases({ client, tenantId: tenantBetaId, directory: dir }),
      ).rejects.toThrow(/identifier pattern blocked/);
    });
    await expect(caseCount(tenantBetaId, 'EV-BLOCKED')).resolves.toBe(0);
    await expect(visibleCaseCount(tenantBetaId, 'EV-0001')).resolves.toBe(0);
  });

  it('loads golden labels for fact and citation-set evaluation roundtrip', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'amic-evalset-golden-'));
    const expectedDocumentId = '11111111-1111-4111-8111-111111111201';
    writeFileSync(
      path.join(dir, 'golden.json'),
      JSON.stringify({
        caseNo: 'EV-GOLDEN',
        sourceDocRef: 'doc:golden-contract-0001',
        caseType: 'contract_search',
        queryText: 'termination notice period clause',
        expectedRefs: ['doc:golden-contract-0001'],
        expectedAnswerFacts: [
          'termination notice must be sent 30 days before termination',
          'governing law is Korean law',
        ],
        expectedCitationDocumentIds: [expectedDocumentId],
        deidentified: true,
        notes: 'synthetic deidentified golden-label sample',
      }),
    );

    await withClient(createOwnerClient(), async (client) => {
      await expect(
        loadEvaluationCases({ client, tenantId: tenantAlphaId, directory: dir }),
      ).resolves.toMatchObject({
        loaded: 1,
        warnings: ['evalset contains 1 cases; LAI-18 technical target is 100'],
      });
    });

    await expect(caseGoldenLabels(tenantAlphaId, 'EV-GOLDEN')).resolves.toEqual({
      expectedAnswerFacts: [
        'termination notice must be sent 30 days before termination',
        'governing law is Korean law',
      ],
      expectedCitationDocumentIds: [expectedDocumentId],
    });
  });
});
