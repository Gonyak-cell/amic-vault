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
    [clientId, tenantId, `Outlook Auth Graph RLS Client ${matterId}`, userId],
  );
  await client.query(
    `
      INSERT INTO matters (
        matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
        status, lead_lawyer_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 'contract', 'active', $6, $6)
    `,
    [matterId, tenantId, clientId, `OUTAUTH-${matterId.slice(0, 8)}`, 'Outlook Auth Matter', userId],
  );
  return matterId;
}

async function insertVaultSession(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
) {
  const sessionId = randomUUID();
  await client.query(
    `
      INSERT INTO sessions (session_id, tenant_id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, now() + interval '1 hour')
    `,
    [sessionId, tenantId, userId, `sha256:${sha256Hex(`session:${sessionId}`)}`],
  );
  return sessionId;
}

async function insertOutlookAuthGraphRows(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
  matterId: string,
) {
  const requestId = randomUUID();
  const bindingId = randomUUID();
  const addinSessionId = randomUUID();
  const acquisitionId = randomUUID();
  const sourceSessionId = await insertVaultSession(client, tenantId, userId);
  const mailboxHash = sha256Hex(`mailbox:${tenantId}:${requestId}`);
  const messageHash = sha256Hex(`message:${tenantId}:${requestId}`);
  const attachmentSetHash = sha256Hex(`attachment-set:${tenantId}:${requestId}`);
  const attachmentHash = sha256Hex(`attachment:${tenantId}:${requestId}`);
  const clientRequestHash = sha256Hex(`client-request:${tenantId}:${requestId}`);
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
      sha256Hex(`item:${tenantId}:${requestId}`),
      messageHash,
      attachmentSetHash,
      clientRequestHash,
      sha256Hex(`idempotency:${tenantId}:${requestId}`),
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
    [tenantId, requestId, attachmentHash, sha256Hex(`content:${tenantId}:${requestId}`)],
  );
  await client.query(
    `
      INSERT INTO outlook_mailbox_bindings (
        binding_id, tenant_id, user_id, mailbox_fingerprint_hash
      )
      VALUES ($1, $2, $3, $4)
    `,
    [bindingId, tenantId, userId, mailboxHash],
  );
  await client.query(
    `
      INSERT INTO outlook_addin_sessions (
        addin_session_id, tenant_id, user_id, binding_id, source_session_id,
        mailbox_fingerprint_hash, identity_assertion_hash, identity_subject_hash,
        client_request_id_hash, source_client, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'outlook-web-addin', now() + interval '30 minutes')
    `,
    [
      addinSessionId,
      tenantId,
      userId,
      bindingId,
      sourceSessionId,
      mailboxHash,
      sha256Hex(`assertion:${tenantId}:${requestId}`),
      sha256Hex(`subject:${tenantId}:${requestId}`),
      clientRequestHash,
    ],
  );
  await client.query(
    `
      INSERT INTO outlook_graph_attachment_acquisitions (
        acquisition_id, tenant_id, request_id, addin_session_id, attachment_id_hash,
        mailbox_fingerprint_hash, canonical_message_sha256, status, content_sha256,
        size_bytes, client_request_id_hash, graph_scope_set_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'acquired', $8, 42, $9, $10)
    `,
    [
      acquisitionId,
      tenantId,
      requestId,
      addinSessionId,
      attachmentHash,
      mailboxHash,
      messageHash,
      sha256Hex(`content:${tenantId}:${requestId}`),
      clientRequestHash,
      sha256Hex('openid|profile|offline_access|Mail.Read'),
    ],
  );
  return { bindingId, addinSessionId, acquisitionId };
}

describe('Outlook auth and Graph gate RLS', () => {
  it('isolates mailbox bindings, add-in sessions, and Graph acquisition refs by tenant', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const alphaMatterId = await insertMatter(client, tenantAlphaId, alphaOwnerUserId);
      const alphaRows = await insertOutlookAuthGraphRows(
        client,
        tenantAlphaId,
        alphaOwnerUserId,
        alphaMatterId,
      );

      const alphaBindingVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_mailbox_bindings WHERE binding_id = $1',
        [alphaRows.bindingId],
      );
      expect(alphaBindingVisible.rows[0]?.count).toBe('1');
      const alphaSessionVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_addin_sessions WHERE addin_session_id = $1',
        [alphaRows.addinSessionId],
      );
      expect(alphaSessionVisible.rows[0]?.count).toBe('1');
      const alphaAcquisitionVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_graph_attachment_acquisitions WHERE acquisition_id = $1',
        [alphaRows.acquisitionId],
      );
      expect(alphaAcquisitionVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaCannotSeeBinding = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_mailbox_bindings WHERE binding_id = $1',
        [alphaRows.bindingId],
      );
      expect(betaCannotSeeBinding.rows[0]?.count).toBe('0');
      const betaCannotSeeSession = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_addin_sessions WHERE addin_session_id = $1',
        [alphaRows.addinSessionId],
      );
      expect(betaCannotSeeSession.rows[0]?.count).toBe('0');
      const betaCannotSeeAcquisition = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_graph_attachment_acquisitions WHERE acquisition_id = $1',
        [alphaRows.acquisitionId],
      );
      expect(betaCannotSeeAcquisition.rows[0]?.count).toBe('0');

      const betaMatterId = await insertMatter(client, tenantBetaId, betaOwnerUserId);
      await expect(
        insertOutlookAuthGraphRows(client, tenantBetaId, betaOwnerUserId, betaMatterId),
      ).resolves.toEqual(expect.objectContaining({ addinSessionId: expect.any(String) }));
    });
  });

  it('does not add columns for stored access tokens or raw Graph payloads', async () => {
    await withClient(createAppClient(), async (client) => {
      const result = await client.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN (
              'outlook_mailbox_bindings',
              'outlook_addin_sessions',
              'outlook_graph_attachment_acquisitions'
            )
            AND (
              column_name LIKE '%access_token%'
              OR column_name LIKE '%refresh_token%'
              OR column_name LIKE '%token_value%'
              OR column_name LIKE '%raw_graph%'
              OR column_name LIKE '%payload%'
            )
        `,
      );
      expect(result.rows).toEqual([]);
    });
  });
});
