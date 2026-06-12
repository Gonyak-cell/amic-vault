import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

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

      await setTenant(client, tenantBetaId);
      const betaCannotSeeAlpha = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM email_messages WHERE email_id = $1',
        [alphaEmailId],
      );
      expect(betaCannotSeeAlpha.rows[0]?.count).toBe('0');

      await expect(insertEmailFixture(client, tenantBetaId, sharedMessageIdHash)).resolves.toEqual(
        expect.any(String),
      );
    });
  });
});
