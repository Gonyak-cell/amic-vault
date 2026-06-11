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
  it('loads deidentified fixtures idempotently and warns below the operational target', async () => {
    await withClient(createOwnerClient(), async (client) => {
      await expect(
        loadEvaluationCases({
          client,
          tenantId: tenantAlphaId,
          directory: 'tests/fixtures/evalset-v0',
        }),
      ).resolves.toMatchObject({ loaded: 2, warnings: expect.arrayContaining([expect.stringContaining('20-50')]) });
    });
    await expect(caseCount(tenantAlphaId, 'EV-0001')).resolves.toBe(1);

    await withClient(createOwnerClient(), async (client) => {
      await expect(
        loadEvaluationCases({
          client,
          tenantId: tenantAlphaId,
          directory: 'tests/fixtures/evalset-v0',
        }),
      ).resolves.toMatchObject({ loaded: 2 });
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
});
