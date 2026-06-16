import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function insertDocumentFixture(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
) {
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const fileObjectId = randomUUID();
  const fileHash = sha256Hex(`document:${tenantId}:${documentId}`);
  await client.query(
    `
      INSERT INTO clients (client_id, tenant_id, name, created_by)
      VALUES ($1, $2, $3, $4)
    `,
    [clientId, tenantId, `Outlook Insert RLS Client ${matterId}`, userId],
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
      `OUTINS-${matterId.slice(0, 8)}`,
      'Outlook Insert Matter',
      userId,
    ],
  );
  await client.query(
    `
      INSERT INTO file_objects (
        file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
        mime_type, size_bytes, sha256, created_by
      )
      VALUES ($1, $2, $3, 'insert-fixture.pdf', 'insert-fixture.pdf', 'application/pdf', 32, $4, $5)
    `,
    [
      fileObjectId,
      tenantId,
      `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
      fileHash,
      userId,
    ],
  );
  await client.query(
    `
      INSERT INTO documents (
        document_id, tenant_id, matter_id, document_family_id, title, status,
        document_type, created_by
      )
      VALUES ($1, $2, $3, $4, 'Insert reference fixture', 'final', 'contract', $5)
    `,
    [documentId, tenantId, matterId, randomUUID(), userId],
  );
  await client.query(
    `
      INSERT INTO document_versions (
        version_id, tenant_id, document_id, version_no, version_status,
        file_object_id, file_hash, created_by
      )
      VALUES ($1, $2, $3, 1, 'current', $4, $5, $6)
    `,
    [versionId, tenantId, documentId, fileObjectId, fileHash, userId],
  );
  return { documentId, versionId };
}

async function insertOutlookDocumentInsertion(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
) {
  const insertionId = randomUUID();
  const document = await insertDocumentFixture(client, tenantId, userId);
  await client.query(
    `
      INSERT INTO outlook_document_insertions (
        insertion_id, tenant_id, user_id, document_id, version_id,
        mailbox_fingerprint_hash, outlook_item_id_hash, canonical_message_sha256,
        has_external_recipients, insertion_mode, status, source_client,
        client_request_id_hash, idempotency_key_hash
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        false, 'internal-reference', 'ready', 'outlook-web-addin',
        $9, $10
      )
    `,
    [
      insertionId,
      tenantId,
      userId,
      document.documentId,
      document.versionId,
      sha256Hex(`mailbox:${tenantId}:${insertionId}`),
      sha256Hex(`item:${tenantId}:${insertionId}`),
      sha256Hex(`message:${tenantId}:${insertionId}`),
      sha256Hex(`client-request:${tenantId}:${insertionId}`),
      sha256Hex(`idempotency:${tenantId}:${insertionId}`),
    ],
  );
  return insertionId;
}

describe('outlook_document_insertions RLS', () => {
  it('isolates document insertion refs by tenant', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const alphaInsertionId = await insertOutlookDocumentInsertion(
        client,
        tenantAlphaId,
        alphaOwnerUserId,
      );

      const alphaVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_document_insertions WHERE insertion_id = $1',
        [alphaInsertionId],
      );
      expect(alphaVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaCannotSeeAlpha = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_document_insertions WHERE insertion_id = $1',
        [alphaInsertionId],
      );
      expect(betaCannotSeeAlpha.rows[0]?.count).toBe('0');

      await expect(
        insertOutlookDocumentInsertion(client, tenantBetaId, betaOwnerUserId),
      ).resolves.toEqual(expect.any(String));
    });
  });

  it('does not add public-link, raw payload, or token storage columns', async () => {
    await withClient(createAppClient(), async (client) => {
      const result = await client.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'outlook_document_insertions'
            AND (
              column_name LIKE '%access_token%'
              OR column_name LIKE '%refresh_token%'
              OR column_name LIKE '%token_value%'
              OR column_name LIKE '%raw%'
              OR column_name LIKE '%payload%'
              OR column_name LIKE '%public_link%'
              OR column_name LIKE '%secure_link%'
              OR column_name LIKE '%guest%'
              OR column_name LIKE '%url%'
            )
        `,
      );
      expect(result.rows).toEqual([]);
    });
  });
});
