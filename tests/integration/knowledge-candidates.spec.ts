import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

interface SeededDocument {
  documentId: string;
  title: string;
  versionId: string;
}

interface KnowledgeCandidateRow {
  candidate_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  candidate_type: 'executed' | 'opinion' | 'clause_source';
  status: 'proposed' | 'approved' | 'rejected';
  work_item_id: string | null;
}

interface WorkQueueResponse {
  items: Array<{
    itemKey: string;
    targetId?: string;
    kind?: string;
    title: string;
    description: string;
    status?: string;
  }>;
}

async function login(
  baseUrl: string,
  input: { email: string; password: string; tenantId: string },
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

async function expectJson<T>(response: Response, status: number): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(status);
  return JSON.parse(body) as T;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `A13 Knowledge Client ${randomUUID()}` }),
  });
  return (await expectJson<{ clientId: string }>(response, 201)).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
  input: { accessScope?: 'firm_open' | 'restricted'; label: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(input.accessScope ? { accessScope: input.accessScope } : {}),
      clientId,
      matterCode: `A13-${randomUUID()}`,
      matterName: `A13 ${input.label} ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  return (await expectJson<{ matterId: string }>(response, 201)).matterId;
}

async function updateStatus(
  baseUrl: string,
  cookie: string,
  matterId: string,
  status: string,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function runConflictCheck(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<{ conflictCheckId: string }> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/conflict-checks`, {
    method: 'POST',
    headers: { cookie },
  });
  return expectJson<{ conflictCheckId: string }>(response, 201);
}

async function clearMatterConflicts(baseUrl: string, cookie: string, matterId: string): Promise<void> {
  const check = await runConflictCheck(baseUrl, cookie, matterId);
  const response = await fetch(
    `${baseUrl}/v1/matters/${matterId}/conflict-checks/${check.conflictCheckId}`,
    {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cleared', rationale: 'A13 knowledge candidate fixture' }),
    },
  );
  await expectJson(response, 200);
}

async function createActiveMatter(
  baseUrl: string,
  cookie: string,
  clientId: string,
  input: { accessScope?: 'firm_open' | 'restricted'; label: string },
): Promise<string> {
  const matterId = await createMatter(baseUrl, cookie, clientId, input);
  await clearMatterConflicts(baseUrl, cookie, matterId);
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'open'), 200);
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'active'), 200);
  return matterId;
}

async function closeMatter(baseUrl: string, cookie: string, matterId: string): Promise<void> {
  await expectJson(await updateStatus(baseUrl, cookie, matterId, 'closing'), 200);
  const closed = await expectJson<{ status: string; closedAt: string | null }>(
    await updateStatus(baseUrl, cookie, matterId, 'closed'),
    200,
  );
  expect(closed.status).toBe('closed');
  expect(closed.closedAt).toEqual(expect.any(String));
}

async function insertKnowledgeDocument(
  matterId: string,
  input: {
    label: string;
    documentType: 'contract' | 'opinion';
    status: 'executed' | 'final';
    subtype?: string | null;
    significance: 'execution_copy' | 'final';
  },
): Promise<SeededDocument> {
  const documentId = randomUUID();
  const fileObjectId = randomUUID();
  const versionId = randomUUID();
  const hash = sha256Hex(`a13-document:${input.label}:${documentId}`);
  const title = `A13 ${input.label}`;
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, created_by
        )
        VALUES ($1, $2, $3, $4, $4, 'application/pdf', 64, $5, $6)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        storageUri(matterId, documentId, fileObjectId),
        `${input.label}.pdf`,
        hash,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          document_type, subtype, confidentiality_level, privilege_status,
          ai_allowed, created_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'standard', 'none', true, $9, now())
      `,
      [
        documentId,
        tenantAlphaId,
        matterId,
        randomUUID(),
        title,
        input.status,
        input.documentType,
        input.subtype ?? null,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO document_versions (
          version_id, tenant_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, version_label, version_significance
        )
        VALUES ($1, $2, $3, 1, 'current', $4, $5, $6, $7, $8)
      `,
      [
        versionId,
        tenantAlphaId,
        documentId,
        fileObjectId,
        hash,
        alphaOwnerUserId,
        input.significance === 'execution_copy' ? 'Execution' : 'Final',
        input.significance,
      ],
    );
  });
  return { documentId, title, versionId };
}

async function listCandidates(matterId: string): Promise<KnowledgeCandidateRow[]> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<KnowledgeCandidateRow>(
      `
        SELECT candidate_id, matter_id, document_id, version_id, candidate_type, status, work_item_id
        FROM knowledge_candidates
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY candidate_type ASC, candidate_id ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows;
  });
}

async function documentTags(documentId: string): Promise<string[]> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ tag: string }>(
      `
        SELECT tag
        FROM document_tags
        WHERE tenant_id = $1
          AND document_id = $2
        ORDER BY tag ASC
      `,
      [tenantAlphaId, documentId],
    );
    return result.rows.map((row) => row.tag);
  });
}

async function knowledgeAudits(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; metadata_json: Record<string, unknown> }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action IN (
            'KNOWLEDGE_CANDIDATE_PROPOSED',
            'KNOWLEDGE_CANDIDATE_REVIEWED',
            'DOCUMENT_TAGS_CHANGED'
          )
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows;
  });
}

async function getWorkQueue(baseUrl: string, cookie: string): Promise<WorkQueueResponse> {
  const response = await fetch(
    `${baseUrl}/v1/work/items?kind=knowledge_candidate_review&assignee=all&limit=100`,
    { headers: { cookie } },
  );
  return expectJson<WorkQueueResponse>(response, 200);
}

async function reviewCandidate(
  baseUrl: string,
  cookie: string,
  candidateId: string,
  action: 'approve' | 'reject',
) {
  const response = await fetch(`${baseUrl}/v1/matters/knowledge-candidates/${candidateId}/review`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      action,
      reviewReason: action === 'approve' ? 'A13 integration approval' : 'A13 integration rejection',
    }),
  });
  return expectJson<{ status: string; candidateId: string }>(response, 200);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function storageUri(matterId: string, documentId: string, fileObjectId: string): string {
  return `s3://amic-vault-dev/tenants/${tenantAlphaId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
}

describe('knowledge candidate integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let firmAdminCookie: string;
  let betaCookie: string;
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
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    betaCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates proposed knowledge candidates on close, keeps them idempotent, and approves one into tags and audit', async () => {
    const matterId = await createActiveMatter(baseUrl, ownerCookie, clientId, {
      label: 'open knowledge',
    });
    const executed = await insertKnowledgeDocument(matterId, {
      label: 'Executed Copy',
      documentType: 'contract',
      status: 'executed',
      significance: 'execution_copy',
    });
    const opinion = await insertKnowledgeDocument(matterId, {
      label: 'Final Opinion',
      documentType: 'opinion',
      status: 'final',
      subtype: 'closing opinion',
      significance: 'final',
    });

    await closeMatter(baseUrl, ownerCookie, matterId);

    const candidates = await listCandidates(matterId);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: executed.documentId,
          version_id: executed.versionId,
          candidate_type: 'executed',
          status: 'proposed',
          work_item_id: expect.any(String),
        }),
        expect.objectContaining({
          document_id: opinion.documentId,
          version_id: opinion.versionId,
          candidate_type: 'opinion',
          status: 'proposed',
          work_item_id: expect.any(String),
        }),
      ]),
    );

    const repeatClose = await updateStatus(baseUrl, ownerCookie, matterId, 'closed');
    expect(repeatClose.status, await repeatClose.text()).toBeGreaterThanOrEqual(400);
    expect(await listCandidates(matterId)).toHaveLength(candidates.length);

    const queue = await getWorkQueue(baseUrl, ownerCookie);
    const executedCandidate = candidates.find((candidate) => candidate.document_id === executed.documentId);
    expect(executedCandidate).toBeDefined();
    expect(queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: executedCandidate!.candidate_id,
          kind: 'knowledge_candidate_review',
          title: '지식은행 후보 검토',
        }),
      ]),
    );
    expect(JSON.stringify(queue)).toContain(executed.title);

    const reviewed = await reviewCandidate(baseUrl, ownerCookie, executedCandidate!.candidate_id, 'approve');
    expect(reviewed).toEqual(
      expect.objectContaining({ candidateId: executedCandidate!.candidate_id, status: 'approved' }),
    );
    expect(await documentTags(executed.documentId)).toEqual(
      expect.arrayContaining(['knowledge_bank', 'knowledge_bank_executed']),
    );
    const queueAfterApproval = await getWorkQueue(baseUrl, ownerCookie);
    expect(queueAfterApproval.items.map((item) => item.targetId)).not.toContain(
      executedCandidate!.candidate_id,
    );

    const audits = await knowledgeAudits(matterId);
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'KNOWLEDGE_CANDIDATE_PROPOSED',
        'KNOWLEDGE_CANDIDATE_REVIEWED',
        'DOCUMENT_TAGS_CHANGED',
      ]),
    );
    const reviewAudit = audits.find((row) => row.action === 'KNOWLEDGE_CANDIDATE_REVIEWED');
    expect(reviewAudit?.metadata_json).toEqual(
      expect.objectContaining({
        knowledge_candidate_id: executedCandidate!.candidate_id,
        status_after: 'approved',
        candidate_type: 'executed',
      }),
    );
    expect(JSON.stringify(audits)).not.toContain('A13 integration approval');
  });

  it('keeps restricted Matter candidates out of unauthorized work queues', async () => {
    const matterId = await createActiveMatter(baseUrl, ownerCookie, clientId, {
      accessScope: 'restricted',
      label: 'restricted knowledge',
    });
    await insertKnowledgeDocument(matterId, {
      label: 'Restricted Execution',
      documentType: 'contract',
      status: 'executed',
      significance: 'execution_copy',
    });
    await insertKnowledgeDocument(matterId, {
      label: 'Restricted Opinion',
      documentType: 'opinion',
      status: 'final',
      subtype: 'closing opinion',
      significance: 'final',
    });
    await closeMatter(baseUrl, ownerCookie, matterId);

    const [candidate] = await listCandidates(matterId);
    expect(candidate).toBeDefined();

    const ownerQueue = await getWorkQueue(baseUrl, ownerCookie);
    expect(ownerQueue.items.map((item) => item.targetId)).toContain(candidate!.candidate_id);

    const firmAdminQueue = await getWorkQueue(baseUrl, firmAdminCookie);
    expect(firmAdminQueue.items.map((item) => item.targetId)).not.toContain(candidate!.candidate_id);

    const betaQueue = await getWorkQueue(baseUrl, betaCookie);
    expect(betaQueue.items.map((item) => item.targetId)).not.toContain(candidate!.candidate_id);
  });
});
