import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

describe('DLP findings RLS', () => {
  it('does not expose tenant alpha findings to tenant beta through the app role', async () => {
    await withClient(createAppClient(), async (client) => {
      const sourceId = '11111111-1111-4111-8111-11111111d101';
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO dlp_findings (
            tenant_id, source_type, source_id, rule_id, finding_type,
            value_hash, evidence_hash, start_offset, end_offset, confidence
          )
          VALUES (
            $1, 'text', $2, 'kr-rrn-format-v1', 'korean_resident_id',
            repeat('a', 64), repeat('b', 64), 0, 13, 0.9500
          )
          ON CONFLICT DO NOTHING
        `,
        [tenantAlphaId, sourceId],
      );

      const alphaVisible = await client.query<{ count: string }>(
        'SELECT count(*) FROM dlp_findings WHERE source_id = $1',
        [sourceId],
      );
      expect(alphaVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaVisible = await client.query<{ count: string }>(
        'SELECT count(*) FROM dlp_findings WHERE source_id = $1',
        [sourceId],
      );
      expect(betaVisible.rows[0]?.count).toBe('0');
    });
  });
});
