import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createAppClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Email Filing Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string) {
  const matterCode = `EMAIL-FILE-${randomUUID()}`;
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode,
      matterName: `Email Filing ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
      metadata: { domain: 'sender.example' },
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return { matterCode, matterId: (JSON.parse(body) as { matterId: string }).matterId };
}

function emailUploadForm(input: {
  matterCode: string;
  messageId: string;
  attachmentText?: string;
  filename?: string;
}): FormData {
  const boundary = `amic-upload-${randomUUID()}`;
  const attachment = Buffer.from(`%PDF-1.7\n${input.attachmentText ?? 'attachment'}\n%%EOF\n`);
  const eml = [
    'From: Sender <sender@sender.example>',
    'To: Internal <internal@amic.test>, Outside <outside@example.test>',
    `Message-ID: <${input.messageId}>`,
    'References: <thread-upload@example.test>',
    'Date: Fri, 12 Jun 2026 10:15:30 +0900',
    `Subject: Privileged filing request ${input.matterCode}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain',
    '',
    'body must not be persisted in audit metadata',
    `--${boundary}`,
    'Content-Type: application/pdf; name="attachment.pdf"',
    'Content-Disposition: attachment; filename="attachment.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    attachment.toString('base64'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const form = new FormData();
  form.append('tenantDomains', 'amic.test');
  form.append(
    'file',
    new Blob([Buffer.from(eml)], { type: 'message/rfc822' }),
    input.filename ?? 'upload.eml',
  );
  return form;
}

async function insertEmailFixture(matterCode: string): Promise<string> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const emailId = randomUUID();
    const fileObjectId = randomUUID();
    const rawSha256 = sha256Hex(`raw:${emailId}`);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
        )
        VALUES ($1, $2, $3, 'filing.eml', 'filing.eml', 'message/rfc822', 64, $4, NULL, 'email_ingest', $5)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        `s3://amic-vault-dev/tenants/${tenantAlphaId}/emails/${emailId}/raw/${fileObjectId}`,
        rawSha256,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_messages (
          email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parse_status, failure_reason_code, subject, raw_sha256, raw_size_bytes, created_by
        )
        VALUES ($1, $2, $3, $4, 'eml', 'parsed', NULL, $5, $6, 64, $7)
      `,
      [
        emailId,
        tenantAlphaId,
        fileObjectId,
        sha256Hex(`message:${emailId}`),
        `Filing request ${matterCode}`,
        rawSha256,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_participants (
          tenant_id, email_id, role, address_hash, domain_ref, display_name, is_outside
        )
        VALUES ($1, $2, 'from', $3, 'sender.example', 'Sender', true)
      `,
      [tenantAlphaId, emailId, sha256Hex(`sender:${emailId}`)],
    );
    return emailId;
  });
}

async function addMemberAndExclude(matterId: string): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, 'member', 'read', $4)
        ON CONFLICT (matter_id, user_id) DO NOTHING
      `,
      [tenantAlphaId, matterId, alphaMemberUserId, alphaOwnerUserId],
    );
    const wallId = randomUUID();
    await client.query(
      `
        INSERT INTO ethical_walls (wall_id, tenant_id, matter_id, wall_name, reason, created_by)
        VALUES ($1, $2, $3, $4, 'conflict_check', $5)
      `,
      [wallId, tenantAlphaId, matterId, `Email Filing Wall ${wallId}`, alphaOwnerUserId],
    );
    await client.query(
      `
        INSERT INTO ethical_wall_memberships (
          tenant_id, wall_id, subject_type, subject_id, membership_type, created_by
        )
        VALUES ($1, $2, 'user', $3, 'excluded', $4)
      `,
      [tenantAlphaId, wallId, alphaMemberUserId, alphaOwnerUserId],
    );
  });
}

async function auditCount(input: {
  action: string;
  actorId?: string;
  targetId: string;
  unsafe?: string;
}): Promise<string> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND target_id = $3
          AND ($4::uuid IS NULL OR actor_id = $4::uuid)
          AND ($5::text IS NULL OR metadata_json::text NOT LIKE '%' || $5::text || '%')
      `,
      [tenantAlphaId, input.action, input.targetId, input.actorId ?? null, input.unsafe ?? null],
    );
    return result.rows[0]?.count ?? '0';
  });
}

async function dlpAttachmentEvidence(matterId: string): Promise<{
  findingCount: string;
  scanCount: string;
  unsafe: string;
}> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      finding_count: string;
      scan_count: string;
      unsafe: string;
    }>(
      `
        SELECT
          (
            SELECT count(*)::text
            FROM dlp_findings
            WHERE tenant_id = $1
              AND matter_id = $2
              AND source_type = 'attachment'
          ) AS finding_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1
              AND matter_id = $2
              AND action = 'DLP_SCAN_COMPLETED'
              AND target_type = 'attachment'
          ) AS scan_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1
              AND matter_id = $2
              AND metadata_json::text LIKE '%person@example.test%'
          ) AS unsafe
      `,
      [tenantAlphaId, matterId],
    );
    const row = result.rows[0];
    return {
      findingCount: row?.finding_count ?? '0',
      scanCount: row?.scan_count ?? '0',
      unsafe: row?.unsafe ?? '0',
    };
  });
}

async function indexAttachmentDocumentForSearch(
  documentId: string,
  contentText: string,
): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const source = await client.query<{
      document_id: string;
      version_id: string;
      matter_id: string;
      client_id: string;
      document_type: string;
      document_status: string;
      version_status: string;
      title: string;
      updated_at: Date;
    }>(
      `
        SELECT d.document_id, dv.version_id, d.matter_id, m.client_id,
          d.document_type, d.status AS document_status, dv.version_status,
          d.title, d.updated_at
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
         AND m.matter_id = d.matter_id
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
      `,
      [tenantAlphaId, documentId],
    );
    const row = source.rows[0];
    expect(row).toBeDefined();

    await client.query(
      `
        INSERT INTO canonical_documents (
          tenant_id, version_id, body_text, extraction_status, extraction_method,
          confidence, extracted_at
        )
        VALUES ($1, $2, $3, 'ready', 'pdf_text', 0.999, now())
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          body_text = EXCLUDED.body_text,
          extraction_status = 'ready',
          extraction_method = 'pdf_text',
          confidence = 0.999,
          failure_reason_code = NULL,
          extracted_at = now(),
          updated_at = now()
      `,
      [tenantAlphaId, row.version_id, contentText],
    );

    await client.query(
      `
        INSERT INTO document_search_index (
          tenant_id, document_id, version_id, matter_id, client_id, document_type,
          document_status, version_status, title, content_text, source_text_hash,
          indexed_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12)
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          client_id = EXCLUDED.client_id,
          document_type = EXCLUDED.document_type,
          document_status = EXCLUDED.document_status,
          version_status = EXCLUDED.version_status,
          title = EXCLUDED.title,
          content_text = EXCLUDED.content_text,
          source_text_hash = EXCLUDED.source_text_hash,
          indexed_at = EXCLUDED.indexed_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        tenantAlphaId,
        row.document_id,
        row.version_id,
        row.matter_id,
        row.client_id,
        row.document_type,
        row.document_status,
        row.version_status,
        row.title,
        contentText,
        sha256Hex(contentText),
        row.updated_at,
      ],
    );
  });
}

async function searchDocuments(baseUrl: string, cookie: string, query: string): Promise<{
  total: number;
  results: Array<{ documentId: string; matterId: string }>;
}> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 10 }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as {
    total: number;
    results: Array<{ documentId: string; matterId: string }>;
  };
}

describe('email filing integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('suggests, files, audits, and timeline-filters emails through matter permission', async () => {
    const { matterCode, matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const emailId = await insertEmailFixture(matterCode);

    const suggestions = await fetch(`${baseUrl}/v1/emails/${emailId}/matter-suggestions`, {
      headers: { cookie: ownerCookie },
    });
    const suggestionBody = (await suggestions.json()) as {
      items: Array<{ matterId: string; reasonCodes: string[] }>;
    };
    expect(suggestions.status, JSON.stringify(suggestionBody)).toBe(200);
    expect(suggestionBody.items[0]).toMatchObject({
      matterId,
      reasonCodes: expect.arrayContaining(['subject', 'participant_domain']),
    });

    const denied = await fetch(`${baseUrl}/v1/emails/${emailId}/file`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    expect(denied.status, await denied.text()).toBe(403);
    await expect(
      auditCount({ action: 'ACCESS_DENIED', actorId: alphaMemberUserId, targetId: matterId }),
    ).resolves.toBe('1');

    const filed = await fetch(`${baseUrl}/v1/emails/${emailId}/file`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    const filedBody = (await filed.json()) as { emailId: string; matterId: string };
    expect(filed.status, JSON.stringify(filedBody)).toBe(201);
    expect(filedBody).toMatchObject({ emailId, matterId });
    await expect(
      auditCount({
        action: 'EMAIL_FILED',
        actorId: alphaOwnerUserId,
        targetId: emailId,
        unsafe: matterCode,
      }),
    ).resolves.toBe('1');

    const timeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: ownerCookie },
    });
    const timelineBody = (await timeline.json()) as { items: Array<{ emailId: string }> };
    expect(timeline.status, JSON.stringify(timelineBody)).toBe(200);
    expect(timelineBody.items).toEqual([expect.objectContaining({ emailId })]);

    await addMemberAndExclude(matterId);
    const excludedTimeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: memberCookie },
    });
    const excludedBody = (await excludedTimeline.json()) as { items: unknown[] };
    expect(excludedTimeline.status, JSON.stringify(excludedBody)).toBe(200);
    expect(excludedBody.items).toEqual([]);
  });

  it('uploads EML to a matter through upload permission with DLP and display-only warnings', async () => {
    const { matterCode, matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const denied = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: memberCookie },
      body: emailUploadForm({
        matterCode,
        messageId: `${randomUUID()}@example.test`,
      }),
    });
    expect(denied.status, await denied.text()).toBe(403);

    const uploaded = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: emailUploadForm({
        matterCode,
        messageId: `${randomUUID()}@example.test`,
        attachmentText: 'person@example.test',
      }),
    });
    const uploadedBody = (await uploaded.json()) as {
      email: { emailId: string; hasOutsideParticipants: boolean };
      filing: {
        matterId: string;
        documentIds: string[];
        warningCodes: string[];
        privilegeTagSuggestion: { tag: string; requiresUserConfirmation: boolean } | null;
        thread: { directReferenceCount: number; relatedEmailCount: number };
      };
    };
    expect(uploaded.status, JSON.stringify(uploadedBody)).toBe(201);
    expect(uploadedBody.email.hasOutsideParticipants).toBe(true);
    expect(uploadedBody.filing).toMatchObject({
      matterId,
      warningCodes: expect.arrayContaining(['outside_participant']),
      privilegeTagSuggestion: {
        tag: 'attorney_client_privilege',
        requiresUserConfirmation: true,
      },
      thread: {
        directReferenceCount: 1,
      },
    });
    expect(uploadedBody.filing.warningCodes).not.toContain('matter_metadata_mismatch');
    expect(uploadedBody.filing.documentIds).toHaveLength(1);
    await expect(dlpAttachmentEvidence(matterId)).resolves.toEqual({
      findingCount: '1',
      scanCount: '1',
      unsafe: '0',
    });

    const attachmentDocumentId = uploadedBody.filing.documentIds[0];
    expect(attachmentDocumentId).toBeDefined();
    const searchToken = `emailattachment${randomUUID().replaceAll('-', '')}`;
    await indexAttachmentDocumentForSearch(
      attachmentDocumentId,
      `searchable email attachment token ${searchToken}`,
    );
    const ownerSearch = await searchDocuments(baseUrl, ownerCookie, searchToken);
    expect(ownerSearch.results).toEqual([
      expect.objectContaining({ documentId: attachmentDocumentId, matterId }),
    ]);

    await addMemberAndExclude(matterId);
    const excludedSearch = await searchDocuments(baseUrl, memberCookie, searchToken);
    expect(excludedSearch).toMatchObject({ total: 0, results: [] });

    const unsupported = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: emailUploadForm({
        matterCode,
        messageId: `${randomUUID()}@example.test`,
        filename: 'not-email.txt',
      }),
    });
    expect(unsupported.status, await unsupported.text()).toBe(415);
  });
});
