import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('email raw file object storage isolation', () => {
  it('accepts only tenant-prefixed raw email storage references and hides them from other tenants', async () => {
    const emailId = randomUUID();
    const fileObjectId = randomUUID();
    const storageUri = `s3://amic-vault-dev/tenants/${tenantAlphaId}/emails/${emailId}/raw/${fileObjectId}`;

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO file_objects (
            file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
            mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
          )
          VALUES ($1, $2, $3, 'fixture.eml', 'fixture.eml', 'message/rfc822', 12, $4, NULL, 'email_ingest', NULL)
        `,
        [fileObjectId, tenantAlphaId, storageUri, sha256Hex('raw email')],
      );

      const alphaVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM file_objects WHERE storage_uri = $1',
        [storageUri],
      );
      expect(alphaVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM file_objects WHERE storage_uri = $1',
        [storageUri],
      );
      expect(betaVisible.rows[0]?.count).toBe('0');

      await expect(
        client.query(
          `
            INSERT INTO file_objects (
              file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
              mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
            )
            VALUES ($1, $2, $3, 'bad.eml', 'bad.eml', 'message/rfc822', 12, $4, NULL, 'email_ingest', NULL)
          `,
          [
            randomUUID(),
            tenantBetaId,
            `s3://amic-vault-dev/shared/${randomUUID()}`,
            sha256Hex('bad raw email'),
          ],
        ),
      ).rejects.toThrow(/file_objects_storage_uri_check/);
    });
  });
});
