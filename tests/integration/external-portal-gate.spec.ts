import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  ExternalDownloadTicketDto,
  ExternalLinkCreatedResponseDto,
  ExternalLinkDto,
  ExternalNdaAcceptanceDto,
  ExternalQaListResponseDto,
  ExternalQaMessageDto,
  ExternalUserDto,
  ExternalWorkspaceDto,
} from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  addMatterMember,
  alphaMemberUserId,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('External portal Gate integration', () => {
  const marker = randomUUID().slice(0, 8).toUpperCase();
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const dlpMarker = `dlp-${marker.toLowerCase()}@example.test`;
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let workspace: ExternalWorkspaceDto;
  let externalUser: ExternalUserDto;
  let link: ExternalLinkDto;
  let linkToken: string;

  beforeAll(async () => {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId,
        versionId,
        title: `External Gate ${marker}`,
        contentText: `Fictitious DLP fixture address ${dlpMarker} for controlled warning tests.`,
        documentType: 'evidence',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      1601,
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaMemberUserId,
      matterRole: 'member',
      accessLevel: 'read',
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });

    workspace = await postJson<ExternalWorkspaceDto>('/v1/external/workspaces', {
      matterId,
      workspaceCode: `GATE-${marker}`,
      displayRef: `Gate room ${marker}`,
      expiresAt: futureIso(7),
    });
    externalUser = await postJson<ExternalUserDto>('/v1/external/users', {
      workspaceId: workspace.workspaceId,
      emailHash: sha256Hex(`recipient-${marker}@example.test`),
      displayRef: `recipient ${marker}`,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks DLP-positive external link grants until bounded warning override is accepted', async () => {
    const blocked = await fetch(`${baseUrl}/v1/external/links`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(baseLinkRequest()),
    });
    const blockedText = await blocked.text();
    expect(blocked.status, blockedText).toBe(400);
    expect(blockedText).toContain('VALIDATION_FAILED');
    expect(blockedText).not.toContain(dlpMarker);

    const audit = await latestExternalAudit('EXTERNAL_DLP_WARNING_BLOCKED', documentId);
    expect(audit?.result).toBe('denied');
    expect(audit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      version_id: versionId,
      external_workspace_id: workspace.workspaceId,
      external_user_id: externalUser.externalUserId,
      reason_code: 'EXTERNAL_DLP_WARNING_REQUIRED',
    });
    expect(audit?.metadata_json.result_count).toBeGreaterThan(0);
    expect(String(audit?.metadata_json.hash)).toMatch(/^[a-f0-9]{64}$/iu);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(dlpMarker);
  });

  it('issues audited portal download and Q&A only after NDA and workspace permission checks pass', async () => {
    const created = await postJson<ExternalLinkCreatedResponseDto>('/v1/external/links', {
      ...baseLinkRequest(),
      dlpWarningAccepted: true,
      dlpOverrideReasonCode: 'CLIENT_APPROVED',
    });
    link = created.link;
    linkToken = created.linkToken;
    expect(link.dlpWarningStatus).toBe('accepted');

    const preNdaQuestion = await fetch(`${baseUrl}/v1/external/access/${linkToken}/qa/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-amic-external-actor-ref': marker },
      body: JSON.stringify({ messageText: 'Please clarify clause five.' }),
    });
    expect(preNdaQuestion.status, await preNdaQuestion.text()).toBe(403);

    const status = await fetch(`${baseUrl}/v1/external/access/${linkToken}`, {
      headers: { 'x-amic-external-actor-ref': marker },
    });
    expect(status.status, await status.text()).toBe(200);

    const preNdaDownload = await fetch(`${baseUrl}/v1/external/access/${linkToken}/download-ticket`, {
      headers: { 'x-amic-external-actor-ref': marker },
    });
    expect(preNdaDownload.status, await preNdaDownload.text()).toBe(403);

    const nda = await postPublicJson<ExternalNdaAcceptanceDto>(
      `/v1/external/access/${linkToken}/nda`,
      {
        accepted: true,
        ndaVersion: 'NDA-R11-V1',
      },
    );
    expect(nda.accepted).toBe(true);

    const download = await getPublicJson<ExternalDownloadTicketDto>(
      `/v1/external/access/${linkToken}/download-ticket`,
    );
    expect(download).toMatchObject({
      status: 'ready',
      workspaceId: workspace.workspaceId,
      externalUserId: externalUser.externalUserId,
      documentId,
      versionId,
      watermarkApplied: true,
    });
    expect(download.downloadRef).toContain(`download:${link.linkId}`);
    expect(JSON.stringify(download)).not.toContain(linkToken);
    expect(JSON.stringify(download)).not.toContain(dlpMarker);

    const question = await postPublicJson<ExternalQaMessageDto>(
      `/v1/external/access/${linkToken}/qa/questions`,
      {
        messageText: 'Please clarify clause five.',
      },
    );
    expect(question.direction).toBe('external_question');

    const memberAnswer = await fetch(`${baseUrl}/v1/external/qa/${question.messageId}/answers`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ messageText: 'Member answer should fail.' }),
    });
    expect(memberAnswer.status, await memberAnswer.text()).toBe(403);

    const answer = await postJson<ExternalQaMessageDto>(
      `/v1/external/qa/${question.messageId}/answers`,
      {
        messageText: 'Clause five remains bounded to the room.',
      },
    );
    expect(answer).toMatchObject({
      direction: 'internal_answer',
      parentMessageId: question.messageId,
    });

    const publicQa = await getPublicJson<ExternalQaListResponseDto>(
      `/v1/external/access/${linkToken}/qa`,
    );
    expect(publicQa.messages.map((message) => message.messageId)).toEqual([
      question.messageId,
      answer.messageId,
    ]);

    const workspaceQa = await getJson<ExternalQaListResponseDto>(
      `/v1/external/workspaces/${workspace.workspaceId}/qa`,
    );
    expect(workspaceQa.messages.map((message) => message.messageId)).toContain(question.messageId);

    const dlpAccepted = await latestExternalAudit('EXTERNAL_DLP_WARNING_ACCEPTED', link.linkId);
    expect(dlpAccepted?.metadata_json).toMatchObject({
      reason_code: 'CLIENT_APPROVED',
      external_link_id: link.linkId,
      result_count: 1,
    });
    const downloadAudit = await latestExternalAudit('EXTERNAL_DOWNLOAD_REQUESTED', link.linkId);
    expect(downloadAudit?.metadata_json).toMatchObject({
      external_link_id: link.linkId,
      access_status: 'download_ticket_issued',
      watermark_ref: download.watermarkRef,
    });
    const questionAudit = await latestExternalAudit(
      'EXTERNAL_QA_MESSAGE_RECORDED',
      question.messageId,
    );
    const answerAudit = await latestExternalAudit('EXTERNAL_QA_MESSAGE_RECORDED', answer.messageId);
    expect(questionAudit?.metadata_json).toMatchObject({
      scope_id: question.messageId,
      hash: question.messageHash,
      access_status: 'external_question',
    });
    expect(answerAudit?.metadata_json).toMatchObject({
      scope_id: answer.messageId,
      hash: answer.messageHash,
      access_status: 'internal_answer',
    });
    const auditText = JSON.stringify([
      dlpAccepted?.metadata_json,
      downloadAudit?.metadata_json,
      questionAudit?.metadata_json,
      answerAudit?.metadata_json,
    ]);
    expect(auditText).not.toContain(linkToken);
    expect(auditText).not.toContain(dlpMarker);
    expect(auditText).not.toContain('Please clarify clause five.');
    expect(auditText).not.toContain('Clause five remains bounded to the room.');
  });

  it('keeps new portal tables tenant-RLS protected and external audit reference-only', async () => {
    const evidence = await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const rls = await client.query<{ table_name: string; rls: boolean; force_rls: boolean }>(
        `
          SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = 'external_qa_messages'
        `,
      );
      const destructive = await client.query<{ table_name: string; privilege_type: string }>(
        `
          SELECT table_name, privilege_type
          FROM information_schema.role_table_grants
          WHERE grantee = 'vault_app'
            AND table_name LIKE 'external_%'
            AND privilege_type IN ('DELETE', 'TRUNCATE')
          ORDER BY table_name, privilege_type
        `,
      );
      const unsafeAudit = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM audit_events
          WHERE tenant_id = $1
            AND action LIKE 'EXTERNAL_%'
            AND (
              metadata_json::text LIKE '%' || $2 || '%'
              OR metadata_json::text LIKE '%Please clarify clause five.%'
              OR metadata_json::text LIKE '%Clause five remains bounded to the room.%'
              OR metadata_json::text LIKE '%' || $3 || '%'
            )
        `,
        [tenantAlphaId, dlpMarker, linkToken],
      );
      return {
        rls: rls.rows[0],
        destructive: destructive.rows,
        unsafeAudit: Number(unsafeAudit.rows[0]?.count ?? 0),
      };
    });
    expect(evidence.rls).toEqual({
      table_name: 'external_qa_messages',
      rls: true,
      force_rls: true,
    });
    expect(evidence.destructive).toEqual([]);
    expect(evidence.unsafeAudit).toBe(0);
  });

  async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  async function postPublicJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-amic-external-actor-ref': marker },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as T;
  }

  async function getPublicJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'x-amic-external-actor-ref': marker },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as T;
  }

  function baseLinkRequest(): Record<string, unknown> {
    return {
      workspaceId: workspace.workspaceId,
      externalUserId: externalUser.externalUserId,
      documentId,
      versionId,
      expiresAt: futureIso(3),
      ndaVersion: 'NDA-R11-V1',
      watermarkRequired: true,
    };
  }
});

function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function latestExternalAudit(action: string, targetId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND (target_id = $3 OR metadata_json @> $4::jsonb)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        tenantAlphaId,
        action,
        targetId,
        JSON.stringify({ external_link_id: targetId }),
      ],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}
