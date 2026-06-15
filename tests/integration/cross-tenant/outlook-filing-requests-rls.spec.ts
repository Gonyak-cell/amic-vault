import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function insertMatter(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
) {
  const clientId = randomUUID();
  const matterId = randomUUID();
  await client.query(
    `
      INSERT INTO clients (client_id, tenant_id, name, created_by)
      VALUES ($1, $2, $3, $4)
    `,
    [clientId, tenantId, `Outlook RLS Client ${matterId}`, userId],
  );
  await client.query(
    `
      INSERT INTO matters (
        matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
        status, lead_lawyer_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 'contract', 'active', $6, $6)
    `,
    [matterId, tenantId, clientId, `OUTLOOK-${matterId.slice(0, 8)}`, 'Outlook Matter', userId],
  );
  return matterId;
}

async function insertOutlookRequest(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
  matterId: string,
) {
  const requestId = randomUUID();
  const mailboxHash = sha256Hex(`mailbox:${tenantId}:${requestId}`);
  const itemHash = sha256Hex(`item:${tenantId}:${requestId}`);
  const messageHash = sha256Hex(`message:${tenantId}:${requestId}`);
  const attachmentSetHash = sha256Hex(`attachment-set:${tenantId}:${requestId}`);
  const clientRequestHash = sha256Hex(`client-request:${tenantId}:${requestId}`);
  const idempotencyHash = sha256Hex(`idempotency:${tenantId}:${requestId}`);
  const attachmentHash = sha256Hex(`attachment:${tenantId}:${requestId}`);
  await client.query(
    `
      INSERT INTO outlook_filing_requests (
        request_id, tenant_id, user_id, matter_id, mailbox_fingerprint_hash,
        outlook_item_id_hash, canonical_message_sha256, attachment_set_hash,
        has_external_participants, participant_domain_hash_count, source_client,
        client_request_id_hash, idempotency_key_hash, selected_attachment_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, 0, 'outlook-web-addin', $9, $10, 1)
    `,
    [
      requestId,
      tenantId,
      userId,
      matterId,
      mailboxHash,
      itemHash,
      messageHash,
      attachmentSetHash,
      clientRequestHash,
      idempotencyHash,
    ],
  );
  await client.query(
    `
      INSERT INTO outlook_filing_request_attachments (
        tenant_id, request_id, attachment_id_hash, ordinal, size_bytes, sha256,
        selected_for_filing
      )
      VALUES ($1, $2, $3, 0, 42, $4, true)
    `,
    [tenantId, requestId, attachmentHash, messageHash],
  );
  return requestId;
}

describe('outlook_filing_requests RLS', () => {
  it('isolates Outlook filing request and attachment refs by tenant', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const alphaMatterId = await insertMatter(client, tenantAlphaId, alphaOwnerUserId);
      const alphaRequestId = await insertOutlookRequest(
        client,
        tenantAlphaId,
        alphaOwnerUserId,
        alphaMatterId,
      );

      const alphaVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_filing_requests WHERE request_id = $1',
        [alphaRequestId],
      );
      expect(alphaVisible.rows[0]?.count).toBe('1');
      const alphaAttachmentVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_filing_request_attachments WHERE request_id = $1',
        [alphaRequestId],
      );
      expect(alphaAttachmentVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaCannotSeeAlpha = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_filing_requests WHERE request_id = $1',
        [alphaRequestId],
      );
      expect(betaCannotSeeAlpha.rows[0]?.count).toBe('0');
      const betaCannotSeeAlphaAttachment = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_filing_request_attachments WHERE request_id = $1',
        [alphaRequestId],
      );
      expect(betaCannotSeeAlphaAttachment.rows[0]?.count).toBe('0');

      const betaMatterId = await insertMatter(client, tenantBetaId, betaOwnerUserId);
      await expect(
        insertOutlookRequest(client, tenantBetaId, betaOwnerUserId, betaMatterId),
      ).resolves.toEqual(expect.any(String));
    });
  });
});
