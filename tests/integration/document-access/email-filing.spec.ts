import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { buildParentChildChunks } from '../../../apps/api/src/modules/search/semantic/document-chunker';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from '../helpers/db';
import { markPromotedFixture } from './document-api-helpers';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function emailMessageIdHash(value: string): string {
  return createHash('sha256').update('email-message-id').update('\0').update(value).digest('hex');
}

function fetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
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
      intakeTemplateCode: 'default_open',
      metadata: { domain: 'sender.example' },
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return { matterCode, matterId: (JSON.parse(body) as { matterId: string }).matterId };
}

function emailUploadPayload(input: {
  matterCode: string;
  messageId: string;
  attachmentText?: string;
  bodyText?: string;
  extraRecipientHeader?: string;
  filename?: string;
  subjectHeader?: string;
}): { form: FormData; raw: Buffer } {
  const boundary = `amic-upload-${randomUUID()}`;
  const attachment = Buffer.from(`%PDF-1.7\n${input.attachmentText ?? 'attachment'}\n%%EOF\n`);
  const eml = [
    'From: Sender <sender@sender.example>',
    [
      'To: Internal <internal@amic.test>, Outside <outside@example.test>',
      input.extraRecipientHeader,
    ]
      .filter(Boolean)
      .join(', '),
    `Message-ID: <${input.messageId}>`,
    'References: <thread-upload@example.test>',
    'Date: Fri, 12 Jun 2026 10:15:30 +0900',
    `Subject: ${input.subjectHeader ?? `Privileged filing request ${input.matterCode}`}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain',
    '',
    input.bodyText ?? 'body must not be persisted in audit metadata',
    `--${boundary}`,
    'Content-Type: application/pdf; name="attachment.pdf"',
    'Content-Disposition: attachment; filename="attachment.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    attachment.toString('base64'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const raw = Buffer.from(eml);
  const form = new FormData();
  form.append('file', new Blob([raw], { type: 'message/rfc822' }), input.filename ?? 'upload.eml');
  return { form, raw };
}

function emailUploadForm(input: {
  matterCode: string;
  messageId: string;
  attachmentText?: string;
  bodyText?: string;
  extraRecipientHeader?: string;
  filename?: string;
  subjectHeader?: string;
}): FormData {
  return emailUploadPayload(input).form;
}

function msgUploadForm(input: { filename?: string; raw?: Buffer }): FormData {
  const raw = input.raw ?? Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]);
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(raw)], { type: 'application/vnd.ms-outlook' }),
    input.filename ?? 'upload.msg',
  );
  return form;
}

function threadEmailUploadForm(input: {
  messageId: string;
  references?: readonly string[];
  subject?: string;
}): FormData {
  const eml = [
    'From: Sender <sender@sender.example>',
    'To: Internal <internal@amic.test>',
    `Message-ID: <${input.messageId}>`,
    input.references?.length ? `References: ${input.references.map((ref) => `<${ref}>`).join(' ')}` : null,
    'Date: Fri, 12 Jun 2026 10:15:30 +0900',
    `Subject: ${input.subject ?? 'Thread filing'}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'thread body must stay out of audit metadata',
  ]
    .filter((line): line is string => line !== null)
    .join('\r\n');
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(eml)], { type: 'message/rfc822' }), 'thread.eml');
  return form;
}

function nestedEmailUploadForm(input: { messageId: string }): FormData {
  const outer = `amic-outer-${randomUUID()}`;
  const related = `amic-related-${randomUUID()}`;
  const first = Buffer.from('%PDF-1.7\nnested-one\n%%EOF\n');
  const second = Buffer.from('%PDF-1.7\nnested-two\n%%EOF\n');
  const inline = Buffer.from('inline image bytes');
  const eml = [
    'From: Sender <sender@sender.example>',
    'To: Internal <internal@amic.test>',
    `Message-ID: <${input.messageId}>`,
    'Date: Fri, 12 Jun 2026 10:15:30 +0900',
    'Subject: Nested attachments',
    `Content-Type: multipart/mixed; boundary="${outer}"`,
    '',
    `--${outer}`,
    `Content-Type: multipart/related; boundary="${related}"`,
    '',
    `--${related}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    '<img src="cid:inline-asset">',
    `--${related}`,
    'Content-Type: image/png; name="inline.png"',
    'Content-Disposition: inline; filename="inline.png"',
    'Content-ID: <inline-asset>',
    'Content-Transfer-Encoding: base64',
    '',
    inline.toString('base64'),
    `--${related}`,
    'Content-Type: application/pdf; name="nested-one.pdf"',
    'Content-Disposition: attachment; filename="nested-one.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    first.toString('base64'),
    `--${related}--`,
    `--${outer}`,
    'Content-Type: application/pdf; name="nested-two.pdf"',
    'Content-Disposition: attachment; filename="nested-two.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    second.toString('base64'),
    `--${outer}--`,
    '',
  ].join('\r\n');
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(eml)], { type: 'message/rfc822' }), 'nested.eml');
  return form;
}

async function seedTenantEmailDomain(): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO tenant_email_domains (tenant_id, domain_ref)
        VALUES ($1, 'amic.test')
        ON CONFLICT (tenant_id, domain_ref) DO NOTHING
      `,
      [tenantAlphaId],
    );
  });
}

async function seedOpposingParty(matterId: string): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO parties (tenant_id, matter_id, name, party_type, party_role, created_by)
        VALUES ($1, $2, 'Opposing Counsel <lawyer@opposing.example>', 'corporation',
          'opposing_counsel', $3)
      `,
      [tenantAlphaId, matterId, alphaOwnerUserId],
    );
  });
}

async function emailParticipantClassCounts(emailId: string): Promise<Record<string, number>> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ participant_class: string; count: string }>(
      `
        SELECT participant_class, count(*)::text AS count
        FROM email_participants
        WHERE tenant_id = $1
          AND email_id = $2
        GROUP BY participant_class
        ORDER BY participant_class
      `,
      [tenantAlphaId, emailId],
    );
    return Object.fromEntries(
      result.rows.map((row) => [row.participant_class, Number(row.count)]),
    );
  });
}

async function emailThreadRows(emailIds: readonly string[]): Promise<
  Array<{
    email_id: string;
    thread_id: string | null;
    message_id_hash: string;
    references_json: readonly string[];
  }>
> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      email_id: string;
      thread_id: string | null;
      message_id_hash: string;
      references_json: readonly string[];
    }>(
      `
        SELECT email_id, thread_id, message_id_hash, references_json
        FROM email_messages
        WHERE tenant_id = $1
          AND email_id = ANY($2::uuid[])
        ORDER BY created_at ASC, email_id ASC
      `,
      [tenantAlphaId, emailIds],
    );
    return result.rows;
  });
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

async function rawDownloadAuditEvidence(input: {
  actorId: string;
  targetId: string;
  unsafe: string;
}): Promise<{ count: string; reasonCode: string; unsafe: string }> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      count: string;
      reason_code: string | null;
      unsafe: string;
    }>(
      `
        SELECT count(*)::text AS count,
          max(metadata_json->>'reason_code') AS reason_code,
          count(*) FILTER (
            WHERE metadata_json::text LIKE '%' || $4::text || '%'
          )::text AS unsafe
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'EMAIL_RAW_DOWNLOADED'
          AND target_id = $2
          AND actor_id = $3
      `,
      [tenantAlphaId, input.targetId, input.actorId, input.unsafe],
    );
    const row = result.rows[0];
    return {
      count: row?.count ?? '0',
      reasonCode: row?.reason_code ?? '',
      unsafe: row?.unsafe ?? '0',
    };
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
      author_user_id: string;
      ai_allowed: boolean;
      title: string;
      updated_at: Date;
    }>(
      `
        SELECT d.document_id, dv.version_id, d.matter_id, m.client_id,
          d.document_type, d.status AS document_status, dv.version_status,
          dv.created_by AS author_user_id, d.ai_allowed, d.title, d.updated_at
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
    const sourceTextHash = sha256Hex(contentText);
    const chunks = buildParentChildChunks({ text: contentText, sourceTextHash });
    const parentChunkIds = new Map<number, string>();

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
        UPDATE document_chunks
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
      `,
      [tenantAlphaId, row.version_id],
    );
    for (const chunk of chunks.filter((candidate) => candidate.chunkKind === 'parent')) {
      const chunkResult = await client.query<{ chunk_id: string }>(
        `
          INSERT INTO document_chunks (
            tenant_id, document_id, version_id, parent_chunk_id, chunk_kind, chunk_ordinal,
            char_start, char_end, token_count, chunk_text, text_hash, source_text_hash,
            stale, updated_at
          )
          VALUES ($1, $2, $3, NULL, 'parent', $4, $5, $6, $7, $8, $9, $10, false, now())
          ON CONFLICT (tenant_id, version_id, chunk_ordinal)
          DO UPDATE SET
            document_id = EXCLUDED.document_id,
            parent_chunk_id = NULL,
            chunk_kind = 'parent',
            char_start = EXCLUDED.char_start,
            char_end = EXCLUDED.char_end,
            token_count = EXCLUDED.token_count,
            chunk_text = EXCLUDED.chunk_text,
            text_hash = EXCLUDED.text_hash,
            source_text_hash = EXCLUDED.source_text_hash,
            stale = false,
            updated_at = EXCLUDED.updated_at
          RETURNING chunk_id
        `,
        [
          tenantAlphaId,
          row.document_id,
          row.version_id,
          chunk.chunkOrdinal,
          chunk.charStart,
          chunk.charEnd,
          chunk.tokenCount,
          chunk.chunkText,
          chunk.textHash,
          chunk.sourceTextHash,
        ],
      );
      const chunkId = chunkResult.rows[0]?.chunk_id;
      if (!chunkId) throw new Error('parent chunk seed returned no row');
      parentChunkIds.set(chunk.chunkOrdinal, chunkId);
    }
    for (const chunk of chunks.filter((candidate) => candidate.chunkKind === 'child')) {
      const parentChunkId =
        chunk.parentOrdinal === null ? undefined : parentChunkIds.get(chunk.parentOrdinal);
      if (!parentChunkId) throw new Error('child chunk seed missing parent');
      await client.query(
        `
          INSERT INTO document_chunks (
            tenant_id, document_id, version_id, parent_chunk_id, chunk_kind, chunk_ordinal,
            char_start, char_end, token_count, chunk_text, text_hash, source_text_hash,
            stale, updated_at
          )
          VALUES ($1, $2, $3, $4, 'child', $5, $6, $7, $8, $9, $10, $11, false, now())
          ON CONFLICT (tenant_id, version_id, chunk_ordinal)
          DO UPDATE SET
            document_id = EXCLUDED.document_id,
            parent_chunk_id = EXCLUDED.parent_chunk_id,
            chunk_kind = 'child',
            char_start = EXCLUDED.char_start,
            char_end = EXCLUDED.char_end,
            token_count = EXCLUDED.token_count,
            chunk_text = EXCLUDED.chunk_text,
            text_hash = EXCLUDED.text_hash,
            source_text_hash = EXCLUDED.source_text_hash,
            stale = false,
            updated_at = EXCLUDED.updated_at
        `,
        [
          tenantAlphaId,
          row.document_id,
          row.version_id,
          parentChunkId,
          chunk.chunkOrdinal,
          chunk.charStart,
          chunk.charEnd,
          chunk.tokenCount,
          chunk.chunkText,
          chunk.textHash,
          chunk.sourceTextHash,
        ],
      );
    }

    await client.query(
      `
        INSERT INTO document_search_index (
          tenant_id, document_id, version_id, matter_id, client_id, document_type,
          document_status, version_status, author_user_id, ai_allowed, title,
          content_text, source_text_hash, indexed_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          client_id = EXCLUDED.client_id,
          document_type = EXCLUDED.document_type,
          document_status = EXCLUDED.document_status,
          version_status = EXCLUDED.version_status,
          author_user_id = EXCLUDED.author_user_id,
          ai_allowed = EXCLUDED.ai_allowed,
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
        row.author_user_id,
        row.ai_allowed,
        row.title,
        contentText,
        sourceTextHash,
        row.updated_at,
      ],
    );
  });
}

async function searchDocuments(
  baseUrl: string,
  cookie: string,
  query: string,
  target?: 'email',
): Promise<{
  total: number;
  facets?: {
    emailSenderDomains?: Array<{ value: string; count: number }>;
    emailRecipientDomains?: Array<{ value: string; count: number }>;
  };
  results: Array<{ documentId: string; documentType: string; matterId: string }>;
}> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 10, ...(target ? { target } : {}) }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as {
    total: number;
    facets?: {
      emailSenderDomains?: Array<{ value: string; count: number }>;
      emailRecipientDomains?: Array<{ value: string; count: number }>;
    };
    results: Array<{ documentId: string; documentType: string; matterId: string }>;
  };
}

async function setEmailBodySearchEnabled(enabled: boolean): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE tenants
        SET settings_json = jsonb_set(
          settings_json,
          '{emailBodySearchEnabled}',
          to_jsonb($2::boolean),
          true
        )
        WHERE tenant_id = $1
      `,
      [tenantAlphaId, enabled],
    );
  });
}

async function ensureFreshMatterAppSyncState(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO matter_app_sync_state (
          tenant_id,
          source_ref,
          last_sync_at,
          reflected_count,
          drift_count,
          source_revision_hash,
          source_artifact_hash,
          run_id_hash,
          status,
          summary_json
        )
        VALUES (
          $1,
          'lawos_lazycodex_canonical_identity',
          now(),
          1,
          0,
          repeat('a', 64),
          repeat('b', 64),
          repeat('c', 64),
          'pass',
          '{"fixture":"c1_email_filing"}'::jsonb
        )
        ON CONFLICT (tenant_id, source_ref)
        DO UPDATE SET
          last_sync_at = EXCLUDED.last_sync_at,
          reflected_count = EXCLUDED.reflected_count,
          drift_count = EXCLUDED.drift_count,
          source_revision_hash = EXCLUDED.source_revision_hash,
          source_artifact_hash = EXCLUDED.source_artifact_hash,
          run_id_hash = EXCLUDED.run_id_hash,
          status = EXCLUDED.status,
          summary_json = EXCLUDED.summary_json,
          updated_at = now()
      `,
      [tenantAlphaId],
    );
  });
}

describe('email filing integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let clientId: string;
  let previousIngestionWorkerUrl: string | undefined;

  beforeAll(async () => {
    previousIngestionWorkerUrl = process.env.INGESTION_WORKER_URL;
    process.env.INGESTION_WORKER_URL = 'http://127.0.0.1:9';
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
    await ensureFreshMatterAppSyncState();
    await seedTenantEmailDomain();
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
    if (previousIngestionWorkerUrl === undefined) {
      delete process.env.INGESTION_WORKER_URL;
    } else {
      process.env.INGESTION_WORKER_URL = previousIngestionWorkerUrl;
    }
  });

  it('suggests, files, audits, and timeline-filters emails through matter permission', async () => {
    const { matterCode, matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const emailId = await insertEmailFixture(matterCode);

    const suggestions = await fetch(`${baseUrl}/v1/emails/${emailId}/matter-suggestions`, {
      headers: { cookie: ownerCookie },
    });
    const suggestionBody = (await suggestions.json()) as {
      items: Array<{
        matterId: string;
        reasonCodes: string[];
        score: number;
        confidence: number;
        confidenceBand: string;
      }>;
    };
    expect(suggestions.status, JSON.stringify(suggestionBody)).toBe(200);
    expect(suggestionBody.items[0]).toMatchObject({
      matterId,
      reasonCodes: expect.arrayContaining(['subject', 'participant_domain']),
      score: 73,
      confidence: 73,
      confidenceBand: 'candidate',
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

  it('groups shuffled uploaded replies and files the stored thread as one unit', async () => {
    const { matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const rootMessageId = `${randomUUID()}@thread.example.test`;
    const replyOneMessageId = `${randomUUID()}@thread.example.test`;
    const replyTwoMessageId = `${randomUUID()}@thread.example.test`;

    const replyTwo = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: replyTwoMessageId,
        references: [rootMessageId, replyOneMessageId],
        subject: 'Thread second reply',
      }),
    });
    const replyTwoBody = (await replyTwo.json()) as { email: { emailId: string } };
    expect(replyTwo.status, JSON.stringify(replyTwoBody)).toBe(201);

    const replyOne = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: replyOneMessageId,
        references: [rootMessageId],
        subject: 'Thread first reply',
      }),
    });
    const replyOneBody = (await replyOne.json()) as { email: { emailId: string } };
    expect(replyOne.status, JSON.stringify(replyOneBody)).toBe(201);

    const root = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: rootMessageId,
        subject: 'Thread root',
      }),
    });
    const rootBody = (await root.json()) as { email: { emailId: string } };
    expect(root.status, JSON.stringify(rootBody)).toBe(201);

    const rows = await emailThreadRows([
      rootBody.email.emailId,
      replyOneBody.email.emailId,
      replyTwoBody.email.emailId,
    ]);
    expect(rows).toHaveLength(3);
    expect([...new Set(rows.map((row) => row.thread_id))]).toHaveLength(1);
    expect(rows.every((row) => row.thread_id !== null)).toBe(true);
    const rootRow = rows.find((row) => row.email_id === rootBody.email.emailId);
    const replyOneRow = rows.find((row) => row.email_id === replyOneBody.email.emailId);
    const replyTwoRow = rows.find((row) => row.email_id === replyTwoBody.email.emailId);
    expect(rootRow).toMatchObject({
      message_id_hash: emailMessageIdHash(rootMessageId),
    });
    expect(replyOneRow).toMatchObject({
      message_id_hash: emailMessageIdHash(replyOneMessageId),
      references_json: [emailMessageIdHash(rootMessageId)],
    });
    expect(replyTwoRow).toMatchObject({
      message_id_hash: emailMessageIdHash(replyTwoMessageId),
      references_json: [emailMessageIdHash(rootMessageId), emailMessageIdHash(replyOneMessageId)],
    });

    const threadId = rows[0]?.thread_id;
    expect(threadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    if (!threadId) throw new Error('missing email thread id');

    const timeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: ownerCookie },
    });
    const timelineBody = (await timeline.json()) as {
      items: Array<{ emailId: string; thread: { threadId: string | null } }>;
      threads: Array<{ threadId: string | null; filedEmailCount: number; items: Array<{ emailId: string }> }>;
    };
    expect(timeline.status, JSON.stringify(timelineBody)).toBe(200);
    expect(timelineBody.items).toHaveLength(3);
    expect(timelineBody.threads).toHaveLength(1);
    expect(timelineBody.threads[0]).toMatchObject({
      threadId,
      filedEmailCount: 3,
    });
    expect(timelineBody.threads[0]?.items.map((item) => item.emailId).sort()).toEqual(
      [rootBody.email.emailId, replyOneBody.email.emailId, replyTwoBody.email.emailId].sort(),
    );

    const deniedBulk = await fetch(`${baseUrl}/v1/email-threads/${threadId}/file`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    expect(deniedBulk.status, await deniedBulk.text()).toBe(403);

    const bulk = await fetch(`${baseUrl}/v1/email-threads/${threadId}/file`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    const bulkBody = (await bulk.json()) as {
      threads: Array<{ threadId: string | null; filedEmailCount: number }>;
    };
    expect(bulk.status, JSON.stringify(bulkBody)).toBe(201);
    expect(bulkBody.threads).toEqual([
      expect.objectContaining({
        threadId,
        filedEmailCount: 3,
      }),
    ]);
  });

  it('uploads MSG via the worker parser and creates attachment documents', async () => {
    const { matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const attachmentBody = Buffer.from('%PDF-1.7\nmsg worker attachment\n%%EOF\n');
    const normalizedMessageId = `${randomUUID()}@example.test`;
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (!fetchUrl(input).endsWith('/email/parse')) return realFetch(input, init);
        return new Response(
          JSON.stringify({
            parser: 'msg',
            parser_version: 'email-worker-v1',
            parse_status: 'parsed',
            normalized_message_id: normalizedMessageId,
            subject: 'MSG 검토 요청',
            sent_at: '2026-06-12T10:15:30+09:00',
            received_at: null,
            metadata_warning_code: null,
            body_text: '본문은 audit metadata에 저장하지 않는다',
            references: ['thread-msg@example.test'],
            participants: [
              {
                role: 'from',
                normalized_address: 'sender@sender.example',
                domain_ref: 'sender.example',
                display_name: 'Sender',
              },
              {
                role: 'to',
                normalized_address: 'internal@amic.test',
                domain_ref: 'amic.test',
                display_name: 'Internal',
              },
            ],
            attachments: [
              {
                attachment_index: 0,
                normalized_filename: 'msg-attachment.pdf',
                media_type: 'application/pdf',
                size_bytes: attachmentBody.length,
                sha256: sha256Hex(attachmentBody),
                body_base64: attachmentBody.toString('base64'),
              },
            ],
            failure_reason_code: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const uploaded = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
        method: 'POST',
        headers: { cookie: ownerCookie },
        body: msgUploadForm({ filename: 'korean-outlook.msg' }),
      });
      const uploadedBody = (await uploaded.json()) as {
        email: {
          emailId: string;
          parser: string;
          parseStatus: string;
          parserVersion: string;
          subject: string | null;
        };
        filing: { matterId: string; documentIds: string[] };
      };
      expect(uploaded.status, JSON.stringify(uploadedBody)).toBe(201);
      expect(uploadedBody.email).toMatchObject({
        parser: 'msg',
        parserVersion: 'email-worker-v1',
        parseStatus: 'parsed',
        subject: 'MSG 검토 요청',
      });
      expect(uploadedBody.filing).toMatchObject({ matterId });
      expect(uploadedBody.filing.documentIds).toHaveLength(1);

      const workerParseCalls = fetchMock.mock.calls.filter(([input]) =>
        fetchUrl(input).endsWith('/email/parse'),
      );
      expect(workerParseCalls).toHaveLength(1);
      const attachmentDocumentId = uploadedBody.filing.documentIds[0];
      const emailDocumentLinks = await fetch(
        `${baseUrl}/v1/emails/${uploadedBody.email.emailId}/document-links`,
        { headers: { cookie: ownerCookie } },
      );
      const emailDocumentLinkBody = (await emailDocumentLinks.json()) as Array<{
        documentId: string;
        attachmentFilename: string;
        mediaType: string;
      }>;
      expect(emailDocumentLinks.status, JSON.stringify(emailDocumentLinkBody)).toBe(200);
      expect(emailDocumentLinkBody).toEqual([
        expect.objectContaining({
          documentId: attachmentDocumentId,
          attachmentFilename: 'msg-attachment.pdf',
          mediaType: 'application/pdf',
        }),
      ]);
      await expect(dlpAttachmentEvidence(matterId)).resolves.toEqual({
        findingCount: '0',
        scanCount: '1',
        unsafe: '0',
      });
      await expect(
        withClient(createAppClient(), async (client) => {
          await setTenant(client, tenantAlphaId);
          const result = await client.query<{ parser: string; parse_status: string; count: string }>(
            `
              SELECT e.parser, e.parse_status, count(ep.*)::text AS count
              FROM email_messages e
              LEFT JOIN email_participants ep
                ON ep.tenant_id = e.tenant_id
               AND ep.email_id = e.email_id
              WHERE e.tenant_id = $1
                AND e.email_id = $2
              GROUP BY e.parser, e.parse_status
            `,
            [tenantAlphaId, uploadedBody.email.emailId],
          );
          return result.rows[0];
        }),
      ).resolves.toEqual({ parser: 'msg', parse_status: 'parsed', count: '2' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uploads EML to a matter through upload permission with DLP and display-only warnings', async () => {
    const { matterCode, matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    await seedOpposingParty(matterId);
    const denied = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: memberCookie },
      body: emailUploadForm({
        matterCode,
        messageId: `${randomUUID()}@example.test`,
      }),
    });
    expect(denied.status, await denied.text()).toBe(403);

    const bodyToken = `emailbody${randomUUID().split('-').join('')}`;
    const uploadPayload = emailUploadPayload({
      matterCode,
      messageId: `${randomUUID()}@example.test`,
      attachmentText: 'person@example.test',
      bodyText: `searchable filed email body ${bodyToken}`,
      extraRecipientHeader: 'Opposing <lawyer@opposing.example>',
    });
    const uploaded = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: uploadPayload.form,
    });
    const uploadedBody = (await uploaded.json()) as {
      email: { emailId: string; hasOutsideParticipants: boolean };
      filing: {
        matterId: string;
        documentIds: string[];
        warningCodes: string[];
        participantClasses: Array<{ class: string; count: number }>;
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
    expect(uploadedBody.filing.participantClasses).toEqual(
      expect.arrayContaining([
        { class: 'client', count: 1 },
        { class: 'internal', count: 1 },
        { class: 'opposing', count: 1 },
        { class: 'other_external', count: 1 },
      ]),
    );
    await expect(emailParticipantClassCounts(uploadedBody.email.emailId)).resolves.toEqual({
      client: 1,
      internal: 1,
      opposing: 1,
      other_external: 1,
    });
    const c9Timeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: ownerCookie },
    });
    const c9TimelineBody = (await c9Timeline.json()) as {
      items: Array<{ emailId: string; participantClasses: Array<{ class: string; count: number }> }>;
    };
    expect(c9Timeline.status, JSON.stringify(c9TimelineBody)).toBe(200);
    expect(c9TimelineBody.items.find((item) => item.emailId === uploadedBody.email.emailId)).toEqual(
      expect.objectContaining({
        participantClasses: expect.arrayContaining([
          { class: 'client', count: 1 },
          { class: 'internal', count: 1 },
          { class: 'opposing', count: 1 },
          { class: 'other_external', count: 1 },
        ]),
      }),
    );
    expect(uploadedBody.filing.warningCodes).not.toContain('matter_metadata_mismatch');
    expect(uploadedBody.filing.documentIds).toHaveLength(1);
    await expect(dlpAttachmentEvidence(matterId)).resolves.toEqual({
      findingCount: '1',
      scanCount: '1',
      unsafe: '0',
    });

    const attachmentDocumentId = uploadedBody.filing.documentIds[0];
    expect(attachmentDocumentId).toBeDefined();
    await markPromotedFixture({ documentId: attachmentDocumentId });
    const bodyDocumentId = await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query<{ body_document_id: string | null }>(
        `
          SELECT body_document_id
          FROM email_matter_filings
          WHERE tenant_id = $1 AND email_id = $2 AND matter_id = $3
          LIMIT 1
        `,
        [tenantAlphaId, uploadedBody.email.emailId, matterId],
      );
      const documentId = result.rows[0]?.body_document_id;
      if (!documentId) throw new Error('EMAIL_BODY_DOCUMENT_MISSING');
      return documentId;
    });
    await markPromotedFixture({ documentId: bodyDocumentId });
    await indexAttachmentDocumentForSearch(
      bodyDocumentId,
      `searchable filed email body ${bodyToken}`,
    );
    const emailDocumentLinks = await fetch(
      `${baseUrl}/v1/emails/${uploadedBody.email.emailId}/document-links`,
      { headers: { cookie: ownerCookie } },
    );
    const emailDocumentLinkBody = (await emailDocumentLinks.json()) as Array<{
      documentId: string;
      attachmentFilename: string;
    }>;
    expect(emailDocumentLinks.status, JSON.stringify(emailDocumentLinkBody)).toBe(200);
    expect(emailDocumentLinkBody).toEqual([
      expect.objectContaining({
        documentId: attachmentDocumentId,
        attachmentFilename: 'attachment.pdf',
      }),
    ]);

    const documentEmailLinks = await fetch(
      `${baseUrl}/v1/documents/${attachmentDocumentId}/email-links`,
      { headers: { cookie: ownerCookie } },
    );
    const documentEmailLinkBody = (await documentEmailLinks.json()) as Array<{
      emailId: string;
      documentId: string;
      attachmentFilename: string;
    }>;
    expect(documentEmailLinks.status, JSON.stringify(documentEmailLinkBody)).toBe(200);
    expect(documentEmailLinkBody).toEqual([
      expect.objectContaining({
        emailId: uploadedBody.email.emailId,
        documentId: attachmentDocumentId,
        attachmentFilename: 'attachment.pdf',
      }),
    ]);

    const deniedDocumentEmailLinks = await fetch(
      `${baseUrl}/v1/documents/${attachmentDocumentId}/email-links`,
      { headers: { cookie: memberCookie } },
    );
    expect(deniedDocumentEmailLinks.status, await deniedDocumentEmailLinks.text()).toBe(403);

    const filteredEmailDocumentLinks = await fetch(
      `${baseUrl}/v1/emails/${uploadedBody.email.emailId}/document-links`,
      { headers: { cookie: memberCookie } },
    );
    const filteredEmailDocumentLinkBody = (await filteredEmailDocumentLinks.json()) as unknown[];
    expect(filteredEmailDocumentLinks.status, JSON.stringify(filteredEmailDocumentLinkBody)).toBe(
      200,
    );
    expect(filteredEmailDocumentLinkBody).toEqual([]);

    const expectedRawHash = sha256Hex(uploadPayload.raw);
    const rawDownload = await fetch(
      `${baseUrl}/v1/emails/${uploadedBody.email.emailId}/raw?reasonCode=casework`,
      { headers: { cookie: ownerCookie } },
    );
    const rawBytes = Buffer.from(await rawDownload.arrayBuffer());
    expect(rawDownload.status, rawBytes.toString()).toBe(200);
    expect(rawDownload.headers.get('content-type')).toContain('message/rfc822');
    expect(rawDownload.headers.get('x-amic-sha256')).toBe(expectedRawHash);
    expect(sha256Hex(rawBytes)).toBe(expectedRawHash);
    await expect(
      rawDownloadAuditEvidence({
        actorId: alphaOwnerUserId,
        targetId: uploadedBody.email.emailId,
        unsafe: bodyToken,
      }),
    ).resolves.toEqual({ count: '1', reasonCode: 'casework', unsafe: '0' });

    const deniedRawDownload = await fetch(
      `${baseUrl}/v1/emails/${uploadedBody.email.emailId}/raw?reasonCode=casework`,
      { headers: { cookie: memberCookie } },
    );
    expect(deniedRawDownload.status, await deniedRawDownload.text()).toBe(403);

    const searchToken = `emailattachment${randomUUID().split('-').join('')}`;
    await indexAttachmentDocumentForSearch(
      attachmentDocumentId,
      `searchable email attachment token ${searchToken}`,
    );
    const ownerSearch = await searchDocuments(baseUrl, ownerCookie, searchToken);
    expect(ownerSearch.results).toEqual([
      expect.objectContaining({ documentId: attachmentDocumentId, matterId }),
    ]);
    const ownerBodySearch = await searchDocuments(baseUrl, ownerCookie, bodyToken);
    expect(ownerBodySearch.results).toEqual([
      expect.objectContaining({ documentType: 'email', matterId }),
    ]);
    const ownerEmailTargetSearch = await searchDocuments(baseUrl, ownerCookie, bodyToken, 'email');
    expect(ownerEmailTargetSearch.results).toEqual([
      expect.objectContaining({ documentType: 'email', matterId }),
    ]);
    expect(ownerEmailTargetSearch.facets?.emailSenderDomains).toEqual([
      expect.objectContaining({ value: 'sender.example', count: 1 }),
    ]);

    const disabledBodyToken = `emailbodynoindex${randomUUID().split('-').join('')}`;
    await setEmailBodySearchEnabled(false);
    try {
      const policyOffUpload = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
        method: 'POST',
        headers: { cookie: ownerCookie },
        body: emailUploadForm({
          matterCode,
          messageId: `${randomUUID()}@example.test`,
          attachmentText: `policy-off-${disabledBodyToken}`,
          bodyText: `policy disabled body token ${disabledBodyToken}`,
        }),
      });
      expect(policyOffUpload.status, await policyOffUpload.text()).toBe(201);
    } finally {
      await setEmailBodySearchEnabled(true);
    }
    await expect(searchDocuments(baseUrl, ownerCookie, disabledBodyToken)).resolves.toMatchObject({
      total: 0,
      results: [],
    });

    const koreanSubjectUpload = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: emailUploadForm({
        matterCode,
        messageId: `${randomUUID()}@example.test`,
        subjectHeader: '=?EUC-KR?B?seK50CCwy8XkIL/kw7s=?=',
      }),
    });
    const koreanSubjectBody = (await koreanSubjectUpload.json()) as {
      email: { subject: string | null };
      filing: { privilegeTagSuggestion: { tag: string; requiresUserConfirmation: boolean } | null };
    };
    expect(koreanSubjectUpload.status, JSON.stringify(koreanSubjectBody)).toBe(201);
    expect(koreanSubjectBody.email.subject).toBe('기밀 검토 요청');
    expect(koreanSubjectBody.filing.privilegeTagSuggestion).toMatchObject({
      tag: 'confidential',
      requiresUserConfirmation: true,
    });

    const nestedUpload = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: nestedEmailUploadForm({
        messageId: `${randomUUID()}@example.test`,
      }),
    });
    const nestedBody = (await nestedUpload.json()) as {
      email: { emailId: string };
      filing: { documentIds: string[] };
    };
    expect(nestedUpload.status, JSON.stringify(nestedBody)).toBe(201);
    expect(nestedBody.filing.documentIds).toHaveLength(2);
    await expect(
      withClient(createAppClient(), async (client) => {
        await setTenant(client, tenantAlphaId);
        const result = await client.query<{ document_id: string }>(
          `
            SELECT document_id
            FROM email_document_links
            WHERE tenant_id = $1
              AND email_id = $2
            ORDER BY document_id
          `,
          [tenantAlphaId, nestedBody.email.emailId],
        );
        return result.rows.map((row) => row.document_id).sort();
      }),
    ).resolves.toEqual([...nestedBody.filing.documentIds].sort());

    await addMemberAndExclude(matterId);
    const excludedSearch = await searchDocuments(baseUrl, memberCookie, searchToken);
    expect(excludedSearch).toMatchObject({ total: 0, results: [] });
    const excludedBodySearch = await searchDocuments(baseUrl, memberCookie, bodyToken);
    expect(excludedBodySearch).toMatchObject({ total: 0, results: [] });

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
  }, 20_000);
});
