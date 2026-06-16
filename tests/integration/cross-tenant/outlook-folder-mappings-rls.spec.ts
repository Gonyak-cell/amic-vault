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
    [clientId, tenantId, `Outlook Folder RLS Client ${matterId}`, userId],
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
      `OUTFOLDER-${matterId.slice(0, 8)}`,
      'Outlook Folder Matter',
      userId,
    ],
  );
  return matterId;
}

async function insertOutlookFolderMapping(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
  matterId: string,
) {
  const mappingId = randomUUID();
  const mailboxHash = sha256Hex(`mailbox:${tenantId}:${mappingId}`);
  const folderHash = sha256Hex(`folder:${tenantId}:${mappingId}`);
  await client.query(
    `
      INSERT INTO outlook_folder_mappings (
        mapping_id, tenant_id, user_id, matter_id, mailbox_fingerprint_hash,
        folder_ref_hash, folder_path_hash, mapping_mode, approval_status,
        requested_auto_file, auto_file_enabled, source_client, client_request_id_hash,
        idempotency_key_hash, approval_actor_id, approved_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'manual', 'active',
        false, false, 'outlook-web-addin', $8,
        $9, $3, now()
      )
    `,
    [
      mappingId,
      tenantId,
      userId,
      matterId,
      mailboxHash,
      folderHash,
      sha256Hex(`folder-path:${tenantId}:${mappingId}`),
      sha256Hex(`client-request:${tenantId}:${mappingId}`),
      sha256Hex(`idempotency:${tenantId}:${mappingId}`),
    ],
  );
  return { mappingId, mailboxHash, folderHash };
}

async function insertOutlookAutofileJob(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  tenantId: string,
  userId: string,
) {
  const matterId = await insertMatter(client, tenantId, userId);
  const mapping = await insertOutlookFolderMapping(client, tenantId, userId, matterId);
  const jobId = randomUUID();
  await client.query(
    `
      INSERT INTO outlook_autofile_jobs (
        job_id, tenant_id, mapping_id, user_id, matter_id, mailbox_fingerprint_hash,
        folder_ref_hash, canonical_message_sha256, dedupe_hash, status,
        denied_reason_code, retry_count, client_request_id_hash, idempotency_key_hash
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, 'disabled',
        'integration_gate_closed', 0, $10, $11
      )
    `,
    [
      jobId,
      tenantId,
      mapping.mappingId,
      userId,
      matterId,
      mapping.mailboxHash,
      mapping.folderHash,
      sha256Hex(`message:${tenantId}:${jobId}`),
      sha256Hex(`dedupe:${tenantId}:${jobId}`),
      sha256Hex(`job-client-request:${tenantId}:${jobId}`),
      sha256Hex(`job-idempotency:${tenantId}:${jobId}`),
    ],
  );
  return { jobId, mappingId: mapping.mappingId };
}

describe('outlook_folder_mappings RLS', () => {
  it('isolates folder mappings and auto-file jobs by tenant', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const alphaMatterId = await insertMatter(client, tenantAlphaId, alphaOwnerUserId);
      const alphaMapping = await insertOutlookFolderMapping(
        client,
        tenantAlphaId,
        alphaOwnerUserId,
        alphaMatterId,
      );
      const alphaJob = await insertOutlookAutofileJob(client, tenantAlphaId, alphaOwnerUserId);

      const alphaVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_folder_mappings WHERE mapping_id = $1',
        [alphaMapping.mappingId],
      );
      expect(alphaVisible.rows[0]?.count).toBe('1');
      const alphaJobVisible = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_autofile_jobs WHERE job_id = $1',
        [alphaJob.jobId],
      );
      expect(alphaJobVisible.rows[0]?.count).toBe('1');

      await setTenant(client, tenantBetaId);
      const betaCannotSeeAlpha = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_folder_mappings WHERE mapping_id = $1',
        [alphaMapping.mappingId],
      );
      expect(betaCannotSeeAlpha.rows[0]?.count).toBe('0');
      const betaCannotSeeAlphaJob = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM outlook_autofile_jobs WHERE job_id = $1',
        [alphaJob.jobId],
      );
      expect(betaCannotSeeAlphaJob.rows[0]?.count).toBe('0');

      const betaMatterId = await insertMatter(client, tenantBetaId, betaOwnerUserId);
      await expect(
        insertOutlookFolderMapping(client, tenantBetaId, betaOwnerUserId, betaMatterId),
      ).resolves.toMatchObject({ mappingId: expect.any(String) });
      await expect(
        insertOutlookAutofileJob(client, tenantBetaId, betaOwnerUserId),
      ).resolves.toMatchObject({ jobId: expect.any(String) });
    });
  });

  it('does not add raw folder, path, token, payload, or account storage columns', async () => {
    await withClient(createAppClient(), async (client) => {
      const result = await client.query<{ table_name: string; column_name: string }>(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('outlook_folder_mappings', 'outlook_autofile_jobs')
            AND (
              column_name IN ('folder_name', 'folder_path', 'graph_folder_id', 'mailbox_address')
              OR (column_name LIKE '%folder_name%' AND column_name NOT LIKE '%hash%')
              OR (column_name LIKE '%folder_path%' AND column_name NOT LIKE '%hash%')
              OR (column_name LIKE '%graph_folder_id%' AND column_name NOT LIKE '%hash%')
              OR (column_name LIKE '%mailbox_address%' AND column_name NOT LIKE '%hash%')
              OR column_name LIKE '%account%'
              OR column_name LIKE '%access_token%'
              OR column_name LIKE '%refresh_token%'
              OR column_name LIKE '%token_value%'
              OR column_name LIKE '%raw%'
              OR column_name LIKE '%payload%'
              OR column_name LIKE '%subject%'
              OR column_name LIKE '%body%'
              OR column_name LIKE '%filename%'
              OR column_name LIKE '%url%'
            )
        `,
      );
      expect(result.rows).toEqual([]);
    });
  });
});
