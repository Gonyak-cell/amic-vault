import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';

const rawMarkers = [
  'case-001@example.test',
  'Synthetic email fixture',
  'This fixture body',
] as const;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('email audit coverage', () => {
  it('allows email audit actions without raw header or body metadata', async () => {
    const emailId = randomUUID();
    const fileObjectId = randomUUID();
    const matterId = randomUUID();
    const documentId = randomUUID();
    const rawSha256 = sha256Hex('raw email bytes');
    const messageIdHash = sha256Hex('message-id:case-001@example.test');

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, action, target_type, target_id, result, metadata_json
          )
          VALUES
            ($1, 'system', 'EMAIL_IMPORTED', 'email', $2, 'success', $3::jsonb),
            ($1, 'system', 'EMAIL_DUPLICATE_BLOCKED', 'email', $2, 'denied', $4::jsonb),
            ($1, 'system', 'EMAIL_METADATA_UPDATED', 'email', $2, 'success', $5::jsonb),
            ($1, 'system', 'EMAIL_FILED', 'email', $2, 'success', $6::jsonb)
        `,
        [
          tenantAlphaId,
          emailId,
          JSON.stringify({
            scope_type: 'email',
            scope_id: emailId,
            file_object_id: fileObjectId,
            hash: rawSha256,
            after_ref: 'parse_status:parsed',
          }),
          JSON.stringify({
            scope_type: 'email_message_id',
            scope_id: emailId,
            hash: messageIdHash,
            reason_code: 'DUPLICATE_MESSAGE_ID',
          }),
          JSON.stringify({
            scope_type: 'email_metadata',
            scope_id: emailId,
            result_count: 2,
            reason_code: 'MALFORMED_DATE',
          }),
          JSON.stringify({
            scope_type: 'email_filing',
            scope_id: emailId,
            matter_id: matterId,
            document_id: documentId,
            filter_refs: `document_id:${documentId}`,
            result_count: 1,
          }),
        ],
      );

      const audit = await client.query<{ action: string; count: string; unsafe: string }>(
        `
          SELECT action,
                 count(*)::text AS count,
                 count(*) FILTER (
                   WHERE metadata_json::text LIKE '%' || $2 || '%'
                      OR metadata_json::text LIKE '%' || $3 || '%'
                      OR metadata_json::text LIKE '%' || $4 || '%'
                 )::text AS unsafe
          FROM audit_events
          WHERE tenant_id = $1
            AND action IN (
              'EMAIL_IMPORTED',
              'EMAIL_DUPLICATE_BLOCKED',
              'EMAIL_METADATA_UPDATED',
              'EMAIL_FILED'
            )
            AND target_id = $5
          GROUP BY action
          ORDER BY action
        `,
        [tenantAlphaId, ...rawMarkers, emailId],
      );

      expect(audit.rows).toEqual([
        { action: 'EMAIL_DUPLICATE_BLOCKED', count: '1', unsafe: '0' },
        { action: 'EMAIL_FILED', count: '1', unsafe: '0' },
        { action: 'EMAIL_IMPORTED', count: '1', unsafe: '0' },
        { action: 'EMAIL_METADATA_UPDATED', count: '1', unsafe: '0' },
      ]);
    });
  });
});
