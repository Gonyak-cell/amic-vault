import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';

const rawMarkers = [
  '000000-0000000',
  '900101-5000000',
  '000-000000-00-000',
  'M12345678',
  '4111111111111111',
  'person@example.test',
  '010-0000-0000',
] as const;

const findingInputs = [
  { ruleId: 'kr-rrn-format-v1', findingType: 'korean_resident_id' },
  {
    ruleId: 'kr-alien-registration-format-v1',
    findingType: 'korean_alien_registration_number',
  },
  { ruleId: 'bank-account-format-v1', findingType: 'bank_account' },
  { ruleId: 'passport-format-v1', findingType: 'passport_number' },
  { ruleId: 'payment-card-format-v1', findingType: 'payment_card_number' },
  { ruleId: 'email-address-format-v1', findingType: 'email_address' },
  { ruleId: 'kr-phone-format-v1', findingType: 'phone_number' },
] as const;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('DLP audit coverage', () => {
  it('records reference-only DLP findings and audit events', async () => {
    const sourceId = randomUUID();
    const egressId = randomUUID();
    const findings = findingInputs.map((input, index) => ({
      ...input,
      findingId: randomUUID(),
      valueHash: sha256Hex(`dlp-value:${input.ruleId}:${rawMarkers[index]}`),
      evidenceHash: sha256Hex(`dlp-evidence:${sourceId}:${index}`),
      startOffset: index * 20,
      endOffset: index * 20 + rawMarkers[index].length,
    }));

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      for (const finding of findings) {
        await client.query(
          `
            INSERT INTO dlp_findings (
              finding_id, tenant_id, source_type, source_id, rule_id, finding_type,
              value_hash, evidence_hash, start_offset, end_offset, confidence
            )
            VALUES ($1, $2, 'text', $3, $4, $5, $6, $7, $8, $9, 0.9900)
          `,
          [
            finding.findingId,
            tenantAlphaId,
            sourceId,
            finding.ruleId,
            finding.findingType,
            finding.valueHash,
            finding.evidenceHash,
            finding.startOffset,
            finding.endOffset,
          ],
        );
        await client.query(
          `
            INSERT INTO audit_events (
              tenant_id, actor_type, action, target_type, target_id, result, metadata_json
            )
            VALUES (
              $1, 'system', 'DLP_FINDING_RECORDED', 'dlp_finding', $2, 'success', $3::jsonb
            )
          `,
          [
            tenantAlphaId,
            finding.findingId,
            JSON.stringify({
              scope_type: 'text',
              scope_id: sourceId,
              hash: finding.valueHash,
            }),
          ],
        );
      }
      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, action, target_type, target_id, result, metadata_json
          )
          VALUES ($1, 'system', 'DLP_SCAN_COMPLETED', 'text', $2, 'success', $3::jsonb)
        `,
        [
          tenantAlphaId,
          sourceId,
          JSON.stringify({
            scope_type: 'text',
            scope_id: sourceId,
            result_count: findings.length,
          }),
        ],
      );
      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, action, target_type, target_id, result, metadata_json
          )
          VALUES (
            $1, 'system', 'DLP_EGRESS_BLOCKED', 'model_egress', $2, 'denied', $3::jsonb
          )
        `,
        [
          tenantAlphaId,
          egressId,
          JSON.stringify({
            scope_type: 'model_egress',
            scope_id: egressId,
            result_count: 2,
            hash: sha256Hex(`egress:${egressId}`),
          }),
        ],
      );

      const findingRows = await client.query<{ count: string; unsafe: string }>(
        `
          SELECT count(*)::text AS count,
                 count(*) FILTER (
                   WHERE row_to_json(dlp_findings)::text LIKE '%' || $2 || '%'
                      OR row_to_json(dlp_findings)::text LIKE '%' || $3 || '%'
                      OR row_to_json(dlp_findings)::text LIKE '%' || $4 || '%'
                      OR row_to_json(dlp_findings)::text LIKE '%' || $5 || '%'
                      OR row_to_json(dlp_findings)::text LIKE '%' || $6 || '%'
                      OR row_to_json(dlp_findings)::text LIKE '%' || $7 || '%'
                      OR row_to_json(dlp_findings)::text LIKE '%' || $8 || '%'
                 )::text AS unsafe
          FROM dlp_findings
          WHERE tenant_id = $1 AND source_id = $9
        `,
        [tenantAlphaId, ...rawMarkers, sourceId],
      );
      expect(findingRows.rows[0]).toEqual({ count: '7', unsafe: '0' });

      const audit = await client.query<{ action: string; count: string; unsafe: string }>(
        `
          SELECT action,
                 count(*)::text AS count,
                 count(*) FILTER (
                   WHERE metadata_json::text LIKE '%' || $2 || '%'
                      OR metadata_json::text LIKE '%' || $3 || '%'
                      OR metadata_json::text LIKE '%' || $4 || '%'
                      OR metadata_json::text LIKE '%' || $5 || '%'
                      OR metadata_json::text LIKE '%' || $6 || '%'
                      OR metadata_json::text LIKE '%' || $7 || '%'
                      OR metadata_json::text LIKE '%' || $8 || '%'
                 )::text AS unsafe
          FROM audit_events
          WHERE tenant_id = $1
            AND action IN ('DLP_SCAN_COMPLETED', 'DLP_FINDING_RECORDED', 'DLP_EGRESS_BLOCKED')
            AND (
              target_id IN ($9::uuid, $10::uuid)
              OR metadata_json->>'scope_id' IN ($9::text, $10::text)
            )
          GROUP BY action
          ORDER BY action
        `,
        [tenantAlphaId, ...rawMarkers, sourceId, egressId],
      );
      expect(audit.rows).toEqual([
        { action: 'DLP_EGRESS_BLOCKED', count: '1', unsafe: '0' },
        { action: 'DLP_FINDING_RECORDED', count: '7', unsafe: '0' },
        { action: 'DLP_SCAN_COMPLETED', count: '1', unsafe: '0' },
      ]);
    });
  });
});
