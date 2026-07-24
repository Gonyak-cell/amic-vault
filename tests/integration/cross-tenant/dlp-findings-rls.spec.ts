import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';

describe('DLP findings and review RLS', () => {
  it('keeps findings, assessments, and append-only reviews tenant-bound through the app role', async () => {
    await withClient(createAppClient(), async (client) => {
      const sourceId = randomUUID();
      const assessmentId = randomUUID();
      const reviewId = randomUUID();
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

      await client.query(
        `
          INSERT INTO dlp_scan_assessments (
            assessment_id, tenant_id, source_type, source_id, scan_state,
            reason_code, finding_count, restricted_finding_count,
            requires_review, policy_version, result_hash
          )
          VALUES (
            $1, $2, 'text', $3, 'unscannable', 'assessment_missing',
            0, 0, true, 'sf20-dlp-v1', repeat('c', 64)
          )
        `,
        [assessmentId, tenantAlphaId, sourceId],
      );
      await client.query(
        `
          INSERT INTO dlp_review_decisions (
            review_id, tenant_id, assessment_id, reviewer_user_id,
            decision, reason_code, expires_at
          )
          VALUES (
            $1, $2, $3, $4, 'deny', 'sensitive_content_denied',
            now() + interval '1 day'
          )
        `,
        [reviewId, tenantAlphaId, assessmentId, alphaFirmAdminUserId],
      );
      const alphaReviewVisible = await client.query<{ assessment_count: string; review_count: string }>(
        `
          SELECT
            (SELECT count(*)::text FROM dlp_scan_assessments WHERE assessment_id = $1)
              AS assessment_count,
            (SELECT count(*)::text FROM dlp_review_decisions WHERE review_id = $2)
              AS review_count
        `,
        [assessmentId, reviewId],
      );
      expect(alphaReviewVisible.rows[0]).toEqual({
        assessment_count: '1',
        review_count: '1',
      });

      await setTenant(client, tenantBetaId);
      const betaVisible = await client.query<{ count: string }>(
        'SELECT count(*) FROM dlp_findings WHERE source_id = $1',
        [sourceId],
      );
      expect(betaVisible.rows[0]?.count).toBe('0');
      const betaReviewVisible = await client.query<{ assessment_count: string; review_count: string }>(
        `
          SELECT
            (SELECT count(*)::text FROM dlp_scan_assessments WHERE assessment_id = $1)
              AS assessment_count,
            (SELECT count(*)::text FROM dlp_review_decisions WHERE review_id = $2)
              AS review_count
        `,
        [assessmentId, reviewId],
      );
      expect(betaReviewVisible.rows[0]).toEqual({
        assessment_count: '0',
        review_count: '0',
      });
      await expect(
        client.query(
          `
            INSERT INTO dlp_scan_assessments (
              tenant_id, source_type, source_id, scan_state, reason_code,
              finding_count, restricted_finding_count, requires_review,
              policy_version, result_hash
            )
            VALUES (
              $1, 'text', $2, 'unscannable', 'assessment_missing',
              0, 0, true, 'sf20-dlp-v1', repeat('d', 64)
            )
          `,
          [tenantAlphaId, randomUUID()],
        ),
      ).rejects.toThrow(/row-level security/u);

      const destructivePrivileges = await client.query<{ table_name: string; privilege_type: string }>(
        `
          SELECT table_name, privilege_type
          FROM information_schema.role_table_grants
          WHERE grantee = 'vault_app'
            AND table_name IN ('dlp_scan_assessments', 'dlp_review_decisions')
            AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
          ORDER BY table_name, privilege_type
        `,
      );
      expect(destructivePrivileges.rows).toEqual([]);
    });
  });
});
