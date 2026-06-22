import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  addBetaMember,
  betaMemberUserId,
  createClient,
  createMatter,
  createStorageService,
  loginBetaMember,
  loginBetaOwner,
  storageUrisForDocument,
} from './document-api-helpers';
import { createOwnerClient, tenantBetaId, withClient } from '../helpers/db';

interface UploadResponse {
  documentId: string;
  fileObjectId: string;
}

interface VersionListResponse {
  items: Array<{
    versionId: string;
    versionNo: number;
    versionStatus: 'current' | 'superseded';
    fileObjectId: string;
    fileHash: string;
    promotedFromSubversionId?: string | null;
  }>;
}

interface EditSessionResponse {
  editSessionId: string;
  documentId: string;
  baseVersionId: string;
  baseVersionNo: number;
  status: 'active' | 'checked_in' | 'cancelled' | 'expired' | 'conflicted';
}

interface NativeDraftResponse {
  documentId: string;
  editSessionId: string;
  baseVersionId: string;
  baseVersionNo: number;
  content: string;
  sha256: string;
}

interface SubversionResponse {
  subversionId: string;
  documentId: string;
  baseVersionId: string;
  baseVersionNo: number;
  subversionNo: number;
  displayVersion: string;
  status: 'saved' | 'submitted' | 'abandoned' | 'promoted';
  visibilityScope: 'session_owner' | 'reviewers' | 'matter_owners' | 'matter_editors';
  promotedVersionId: string | null;
}

interface ReviewerResponse {
  subversionReviewerId: string;
  subversionId: string;
  reviewerUserId: string;
  status: 'active' | 'revoked';
}

interface ReviewResponse {
  subversionReviewId: string;
  subversionId: string;
  reviewerUserId: string;
  decision: 'approved' | 'changes_requested';
}

interface PromoteResponse {
  documentId: string;
  subversionId: string;
  promotedVersionId: string;
  versionNo: number;
  versionStatus: 'current';
  supersedesVersionId: string;
  promotedFromSubversionId: string;
}

interface EditingLifecycleSnapshot {
  version_count: string;
  current_version_no: number;
  current_promoted_from_subversion_id: string | null;
  subversion_count: string;
  latest_subversion_no: number | null;
  latest_subversion_status: string | null;
  latest_client_save_id: string | null;
  edit_file_object_count: string;
}

async function expectJson<T>(
  response: Response,
  expectedStatus: number,
): Promise<T> {
  const body = await response.text();
  expect(response.status, body).toBe(expectedStatus);
  return JSON.parse(body) as T;
}

function textUploadForm(marker: string, content: string): FormData {
  const form = new FormData();
  form.append('title', `${marker} Native Editable`);
  form.append('file', new Blob([Buffer.from(content, 'utf8')], { type: 'text/plain' }), `${marker}.txt`);
  return form;
}

async function uploadTextDocument(
  baseUrl: string,
  cookie: string,
  matterId: string,
  marker: string,
  content: string,
): Promise<UploadResponse> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: textUploadForm(marker, content),
  });
  return expectJson<UploadResponse>(response, 201);
}

async function listVersions(
  baseUrl: string,
  cookie: string,
  documentId: string,
): Promise<VersionListResponse> {
  const response = await fetch(`${baseUrl}/v1/documents/${documentId}/versions`, {
    headers: { cookie },
  });
  return expectJson<VersionListResponse>(response, 200);
}

async function editingSnapshot(documentId: string): Promise<EditingLifecycleSnapshot> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<EditingLifecycleSnapshot>(
      `
        SELECT
          count(DISTINCT dv.version_id)::text AS version_count,
          max(dv.version_no) FILTER (WHERE dv.version_status = 'current')::int AS current_version_no,
          max(dv.promoted_from_subversion_id::text) FILTER (
            WHERE dv.version_status = 'current'
          ) AS current_promoted_from_subversion_id,
          count(DISTINCT sv.subversion_id)::text AS subversion_count,
          max(sv.subversion_no)::int AS latest_subversion_no,
          (array_agg(sv.status ORDER BY sv.subversion_no DESC))[1] AS latest_subversion_status,
          (array_agg(sv.client_save_id ORDER BY sv.subversion_no DESC))[1] AS latest_client_save_id,
          count(DISTINCT edit_file.file_object_id)::text AS edit_file_object_count
        FROM documents d
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        LEFT JOIN document_subversions sv
          ON sv.tenant_id = d.tenant_id
          AND sv.document_id = d.document_id
        LEFT JOIN file_objects edit_file
          ON edit_file.tenant_id = sv.tenant_id
          AND edit_file.file_object_id = sv.file_object_id
          AND edit_file.source_system = 'document_edit'
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        GROUP BY d.document_id
      `,
      [tenantBetaId, documentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`missing editing lifecycle snapshot for ${documentId}`);
    return row;
  });
}

async function auditActionCounts(documentId: string): Promise<Record<string, number>> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ action: string; count: string }>(
      `
        SELECT action, count(*)::text
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action IN (
            'DOCUMENT_CHECKED_OUT',
            'DOCUMENT_SUBVERSION_SAVED',
            'DOCUMENT_CHECKED_IN',
            'DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED',
            'DOCUMENT_SUBVERSION_REVIEW_SUBMITTED',
            'DOCUMENT_VERSION_PROMOTED'
          )
        GROUP BY action
      `,
      [tenantBetaId, documentId],
    );
    return Object.fromEntries(result.rows.map((row) => [row.action, Number(row.count)]));
  });
}

describe('document editing lifecycle integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let reviewerCookie: string;
  let matterId: string;
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await loginBetaOwner(baseUrl);
    reviewerCookie = await loginBetaMember(baseUrl);
    const clientId = await createClient(baseUrl, ownerCookie, 'EDIT');
    matterId = await createMatter(baseUrl, ownerCookie, clientId, 'EDIT');
    await addBetaMember(baseUrl, ownerCookie, matterId, 'edit');
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of createdDocumentIds) {
      for (const storageUri of await storageUrisForDocument(documentId)) {
        await storage.deleteByStorageUri(tenantBetaId, storageUri);
      }
    }
    await app.close();
  });

  it('runs checkout, native draft save, review, check-in, and official promotion end to end', async () => {
    const marker = `edit-${randomUUID()}`;
    const initialContent = `Initial native draft ${marker}`;
    const uploaded = await uploadTextDocument(
      baseUrl,
      ownerCookie,
      matterId,
      marker,
      initialContent,
    );
    createdDocumentIds.push(uploaded.documentId);

    const initialVersions = await listVersions(baseUrl, ownerCookie, uploaded.documentId);
    expect(initialVersions.items).toHaveLength(1);
    const baseVersion = initialVersions.items[0];
    expect(baseVersion).toMatchObject({ versionNo: 1, versionStatus: 'current' });

    const checkout = await expectJson<EditSessionResponse>(
      await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions`, {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          baseVersionId: baseVersion?.versionId,
          clientKind: 'web_upload',
          checkoutReasonCode: 'WEB_EDIT',
          idempotencyKey: `checkout:${marker}`,
        }),
      }),
      201,
    );
    expect(checkout).toMatchObject({
      documentId: uploaded.documentId,
      baseVersionId: baseVersion?.versionId,
      baseVersionNo: 1,
      status: 'active',
    });

    const draft = await expectJson<NativeDraftResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions/${checkout.editSessionId}/native-draft`,
        { headers: { cookie: ownerCookie } },
      ),
      200,
    );
    expect(draft.content).toBe(initialContent);
    expect(draft.sha256).toBe(baseVersion?.fileHash);

    const updatedContent = `${initialContent}\nReviewed clause update`;
    const saved = await expectJson<SubversionResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions/${checkout.editSessionId}/native-draft`,
        {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify({
            clientSaveId: `save:${marker}`,
            content: updatedContent,
            editPackageMode: 'vault_text',
            expectedBaseSha256: baseVersion?.fileHash,
            saveReasonCode: 'NATIVE_SAVE',
            visibilityScope: 'reviewers',
          }),
        },
      ),
      201,
    );
    expect(saved).toMatchObject({
      baseVersionNo: 1,
      displayVersion: 'v1.1',
      status: 'saved',
      visibilityScope: 'reviewers',
    });

    const retriedSave = await expectJson<SubversionResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions/${checkout.editSessionId}/native-draft`,
        {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify({
            clientSaveId: `save:${marker}`,
            content: `${updatedContent}\nclient retry should not create v1.2`,
            editPackageMode: 'vault_text',
            expectedBaseSha256: baseVersion?.fileHash,
            saveReasonCode: 'NATIVE_SAVE',
            visibilityScope: 'reviewers',
          }),
        },
      ),
      201,
    );
    expect(retriedSave.subversionId).toBe(saved.subversionId);
    expect(retriedSave.displayVersion).toBe('v1.1');

    const reviewer = await expectJson<ReviewerResponse>(
      await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/subversions/${saved.subversionId}/reviewers`, {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ reviewerUserId: betaMemberUserId }),
      }),
      201,
    );
    expect(reviewer).toMatchObject({
      subversionId: saved.subversionId,
      reviewerUserId: betaMemberUserId,
      status: 'active',
    });

    const checkedIn = await expectJson<EditSessionResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/edit-sessions/${checkout.editSessionId}/check-in`,
        {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify({ expectedLastSubversionId: saved.subversionId }),
        },
      ),
      201,
    );
    expect(checkedIn.status).toBe('checked_in');

    const blockedPromotion = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/subversions/${saved.subversionId}/promote`,
      {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedBaseVersionId: baseVersion?.versionId,
          idempotencyKey: `promote-pending:${marker}`,
        }),
      },
    );
    const blockedPromotionBody = await blockedPromotion.text();
    expect(blockedPromotion.status, blockedPromotionBody).toBe(400);
    expect(blockedPromotionBody).toContain('review_required');

    const review = await expectJson<ReviewResponse>(
      await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/subversions/${saved.subversionId}/reviews/me`, {
        method: 'POST',
        headers: { cookie: reviewerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      201,
    );
    expect(review).toMatchObject({
      subversionId: saved.subversionId,
      reviewerUserId: betaMemberUserId,
      decision: 'approved',
    });

    const promoted = await expectJson<PromoteResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/subversions/${saved.subversionId}/promote`,
        {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedBaseVersionId: baseVersion?.versionId,
            idempotencyKey: `promote:${marker}`,
            publishReasonCode: 'CLIENT_READY',
          }),
        },
      ),
      201,
    );
    expect(promoted).toMatchObject({
      documentId: uploaded.documentId,
      subversionId: saved.subversionId,
      versionNo: 2,
      versionStatus: 'current',
      supersedesVersionId: baseVersion?.versionId,
      promotedFromSubversionId: saved.subversionId,
    });

    const retriedPromote = await expectJson<PromoteResponse>(
      await fetch(
        `${baseUrl}/v1/documents/${uploaded.documentId}/subversions/${saved.subversionId}/promote`,
        {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedBaseVersionId: baseVersion?.versionId,
            idempotencyKey: `promote:${marker}`,
            publishReasonCode: 'CLIENT_READY',
          }),
        },
      ),
      201,
    );
    expect(retriedPromote.promotedVersionId).toBe(promoted.promotedVersionId);

    const versions = await listVersions(baseUrl, ownerCookie, uploaded.documentId);
    expect(versions.items.map((item) => item.versionNo)).toEqual([2, 1]);
    expect(versions.items[0]).toMatchObject({
      versionId: promoted.promotedVersionId,
      versionStatus: 'current',
      promotedFromSubversionId: saved.subversionId,
    });
    expect(versions.items[1]).toMatchObject({ versionStatus: 'superseded' });

    const snapshot = await editingSnapshot(uploaded.documentId);
    expect(snapshot).toMatchObject({
      version_count: '2',
      current_version_no: 2,
      current_promoted_from_subversion_id: saved.subversionId,
      subversion_count: '1',
      latest_subversion_no: 1,
      latest_subversion_status: 'promoted',
      latest_client_save_id: `save:${marker}`,
      edit_file_object_count: '1',
    });

    await expect(auditActionCounts(uploaded.documentId)).resolves.toMatchObject({
      DOCUMENT_CHECKED_OUT: 1,
      DOCUMENT_SUBVERSION_SAVED: 1,
      DOCUMENT_CHECKED_IN: 1,
      DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED: 1,
      DOCUMENT_SUBVERSION_REVIEW_SUBMITTED: 1,
      DOCUMENT_VERSION_PROMOTED: 1,
    });
  });
});
