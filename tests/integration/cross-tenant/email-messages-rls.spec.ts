import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function insertEmailFixture(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  messageIdHash: string,
) {
  const emailId = randomUUID();
  const fileObjectId = randomUUID();
  const rawSha256 = sha256Hex(`raw:${tenantId}:${emailId}`);
  await client.query(
    `
      INSERT INTO file_objects (
        file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
        mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
      )
      VALUES ($1, $2, $3, 'fixture.eml', 'fixture.eml', 'message/rfc822', 32, $4, NULL, 'email_ingest', NULL)
    `,
    [
      fileObjectId,
      tenantId,
      `s3://amic-vault-dev/tenants/${tenantId}/emails/${emailId}/raw/${fileObjectId}`,
      rawSha256,
    ],
  );
  await client.query(
    `
      INSERT INTO email_messages (
        email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
        parse_status, failure_reason_code, raw_sha256, raw_size_bytes, created_by
      )
      VALUES ($1, $2, $3, $4, 'eml', 'parsed', NULL, $5, 32, NULL)
    `,
    [emailId, tenantId, fileObjectId, messageIdHash, rawSha256],
  );
  await client.query(
    `
      INSERT INTO email_participants (
        tenant_id, email_id, role, address_hash, domain_ref, display_name, is_outside
      )
      VALUES ($1, $2, 'from', $3, 'outside.test', 'Outside Sender', true)
      ON CONFLICT DO NOTHING
    `,
    [tenantId, emailId, sha256Hex(`address:${tenantId}:${emailId}`)],
  );
  const ownerUserId = tenantId === tenantAlphaId ? alphaOwnerUserId : betaOwnerUserId;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const attachmentFileObjectId = randomUUID();
  const attachmentSha256 = sha256Hex(`attachment:${tenantId}:${emailId}`);
  await client.query(
    `
      INSERT INTO clients (client_id, tenant_id, name, created_by)
      VALUES ($1, $2, $3, $4)
    `,
    [clientId, tenantId, `Email Link Client ${emailId}`, ownerUserId],
  );
  await client.query(
    `
      INSERT INTO matters (
        matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
        status, lead_lawyer_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 'contract', 'active', $6, $6)
    `,
    [
      matterId,
      tenantId,
      clientId,
      `EMAIL-LINK-${emailId}`,
      `Email Link Matter ${emailId}`,
      ownerUserId,
    ],
  );
  await client.query(
    `
      INSERT INTO documents (document_id, tenant_id, matter_id, document_family_id, title, created_by)
      VALUES ($1, $2, $3, $4, 'Linked attachment', $5)
    `,
    [documentId, tenantId, matterId, randomUUID(), ownerUserId],
  );
  await client.query(
    `
      INSERT INTO file_objects (
        file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
        mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
      )
      VALUES ($1, $2, $3, 'linked.pdf', 'linked.pdf', 'application/pdf', 32, $4, NULL, 'email_ingest', NULL)
    `,
    [
      attachmentFileObjectId,
      tenantId,
      `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${attachmentFileObjectId}`,
      attachmentSha256,
    ],
  );
  await client.query(
    `
      INSERT INTO email_document_links (
        tenant_id, email_id, document_id, file_object_id, attachment_index,
        attachment_filename, media_type, size_bytes, sha256
      )
      VALUES ($1, $2, $3, $4, 0, 'linked.pdf', 'application/pdf', 32, $5)
    `,
    [tenantId, emailId, documentId, attachmentFileObjectId, attachmentSha256],
  );
  await client.query(
    `
      INSERT INTO email_matter_filings (tenant_id, email_id, matter_id, created_by)
      VALUES ($1, $2, $3, $4)
    `,
    [tenantId, emailId, matterId, ownerUserId],
  );
  return emailId;
}

describe('email_messages RLS', () => {
  it('isolates imported email rows by tenant while allowing cross-tenant duplicate Message-ID hashes', async () => {
    const sharedMessageIdHash = sha256Hex(`message-id:${randomUUID()}`);
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const alphaEmailId = await insertEmailFixture(client, tenantAlphaId, sharedMessageIdHash);

      const alphaVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_messages WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(alphaVisible.rows[0]?.count).toBe('1');
      const alphaParticipantVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_participants WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(alphaParticipantVisible.rows[0]?.count).toBe('1');
      const alphaLinkVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_document_links WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(alphaLinkVisible.rows[0]?.count).toBe('1');
      const alphaFilingVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_matter_filings WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(alphaFilingVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaCannotSeeAlpha = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_messages WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(betaCannotSeeAlpha.rows[0]?.count).toBe('0');
      const betaCannotSeeAlphaParticipant = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_participants WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(betaCannotSeeAlphaParticipant.rows[0]?.count).toBe('0');
      const betaCannotSeeAlphaLink = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_document_links WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(betaCannotSeeAlphaLink.rows[0]?.count).toBe('0');
      const betaCannotSeeAlphaFiling = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_matter_filings WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(betaCannotSeeAlphaFiling.rows[0]?.count).toBe('0');

      await expect(insertEmailFixture(client, tenantBetaId, sharedMessageIdHash)).resolves.toEqual(
        expect.any(String),
      );
    });
  });
});
