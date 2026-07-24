import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';
import { addMatterMember } from '../search-permission/search-fixtures';
import {
  alphaOwnerUserId,
  createClient,
  createMatter,
  createStorageService,
  ensureFreshMatterAppSyncState,
  excludeUserWithEthicalWall,
  login,
  loginAlphaOwner,
  loginBetaOwner,
  markCanonicalReadyFixture,
  storageUrisForDocument,
  uploadDocxVersion,
  uploadPdf,
} from './document-api-helpers';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaSecurityAdminUserId = '11111111-1111-4111-8111-111111111110';

interface AssessmentRow {
  assessment_id: string;
  version_id: string | null;
  scan_state: string;
  reason_code: string | null;
  restricted_finding_count: number;
  requires_review: boolean;
  result_hash: string;
}

interface ReviewResponse {
  assessmentId: string;
  reviewId: string;
  decision: 'allow' | 'deny';
  reasonCode: string;
  expiresAt: string;
  reviewedAt: string;
}

interface DlpAuditRow {
  action: string;
  result: string;
  metadata_json: Record<string, unknown>;
}

async function latestAssessment(input: {
  tenantId: string;
  documentId: string;
  versionId?: string;
  excludeAssessmentId?: string;
}): Promise<AssessmentRow> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    const result = await client.query<AssessmentRow>(
      `
        SELECT assessment_id, version_id, scan_state, reason_code,
          restricted_finding_count, requires_review, result_hash
        FROM dlp_scan_assessments
        WHERE tenant_id = $1
          AND document_id = $2
          AND ($3::uuid IS NULL OR version_id = $3)
          AND ($4::uuid IS NULL OR assessment_id <> $4)
        ORDER BY created_at DESC, assessment_id DESC
        LIMIT 1
      `,
      [
        input.tenantId,
        input.documentId,
        input.versionId ?? null,
        input.excludeAssessmentId ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('DLP assessment fixture missing');
    return row;
  });
}

async function latestDlpAudit(
  tenantId: string,
  assessmentId: string,
  action: 'DLP_EGRESS_BLOCKED' | 'DLP_REVIEW_APPLIED' | 'DLP_REVIEW_RECORDED',
): Promise<DlpAuditRow> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    const result = await client.query<DlpAuditRow>(
      `
        SELECT action, result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND metadata_json->>'dlp_assessment_id' = $3
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantId, action, assessmentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`DLP audit fixture missing: ${action}`);
    return row;
  });
}

async function postReview(
  baseUrl: string,
  cookie: string,
  assessmentId: string,
  body: {
    decision: 'allow' | 'deny';
    reasonCode:
      | 'verified_safe'
      | 'known_encrypted_source'
      | 'business_justified'
      | 'sensitive_content_denied';
    expiresAt: string;
  },
): Promise<Response> {
  return fetch(`${baseUrl}/v1/dlp/assessments/${assessmentId}/reviews`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('exact DLP egress review integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let alphaFirmAdminCookie: string;
  let alphaSecurityAdminCookie: string;
  let betaOwnerCookie: string;
  const storedObjects: Array<{ tenantId: string; storageUri: string }> = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    alphaFirmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    alphaSecurityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    betaOwnerCookie = await loginBetaOwner(baseUrl);
    await ensureFreshMatterAppSyncState(tenantAlphaId, 'sf20_dlp_exact_review_alpha');
    await ensureFreshMatterAppSyncState(tenantBetaId, 'sf20_dlp_exact_review_beta');
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const item of storedObjects) {
      await storage.deleteByStorageUri(item.tenantId, item.storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('binds allow and deny decisions to the exact source while preserving permission and tenant boundaries', async () => {
    const alphaClientId = await createClient(baseUrl, alphaOwnerCookie, 'DLP-EXACT');
    const alphaMatterId = await createMatter(
      baseUrl,
      alphaOwnerCookie,
      alphaClientId,
      'DLP-EXACT',
      { leadLawyerId: alphaOwnerUserId },
    );
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: alphaMatterId,
      userId: alphaFirmAdminUserId,
      matterRole: 'member',
      accessLevel: 'read',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: alphaMatterId,
      userId: alphaSecurityAdminUserId,
      matterRole: 'member',
      accessLevel: 'read',
    });
    const uploaded = await uploadPdf(
      baseUrl,
      alphaOwnerCookie,
      alphaMatterId,
      `dlp-exact-${randomUUID()}`,
    );
    const firstVersionId = await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      bodyText: 'Synthetic reserved passport fixture M12345678.',
    });
    for (const storageUri of await storageUrisForDocument(uploaded.documentId)) {
      storedObjects.push({ tenantId: tenantAlphaId, storageUri });
    }

    const firstBlocked = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    expect(firstBlocked.status, await firstBlocked.text()).toBe(400);
    const firstAssessment = await latestAssessment({
      tenantId: tenantAlphaId,
      documentId: uploaded.documentId,
      versionId: firstVersionId,
    });
    expect(firstAssessment).toMatchObject({
      scan_state: 'findings',
      reason_code: null,
      restricted_finding_count: 1,
      requires_review: true,
    });

    const ordinaryReview = await postReview(
      baseUrl,
      alphaOwnerCookie,
      firstAssessment.assessment_id,
      {
        decision: 'allow',
        reasonCode: 'business_justified',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    );
    expect(ordinaryReview.status, await ordinaryReview.text()).toBe(403);

    await excludeUserWithEthicalWall({
      tenantId: tenantAlphaId,
      matterId: alphaMatterId,
      userId: alphaSecurityAdminUserId,
      createdBy: alphaOwnerUserId,
    });
    const wallExcludedReview = await postReview(
      baseUrl,
      alphaSecurityAdminCookie,
      firstAssessment.assessment_id,
      {
        decision: 'allow',
        reasonCode: 'business_justified',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    );
    expect(wallExcludedReview.status, await wallExcludedReview.text()).toBe(403);

    const betaClientId = await createClient(baseUrl, betaOwnerCookie, 'DLP-CROSS');
    const betaMatterId = await createMatter(baseUrl, betaOwnerCookie, betaClientId, 'DLP-CROSS');
    const betaDocument = await uploadPdf(
      baseUrl,
      betaOwnerCookie,
      betaMatterId,
      `dlp-cross-${randomUUID()}`,
    );
    for (const storageUri of await storageUrisForDocument(betaDocument.documentId)) {
      storedObjects.push({ tenantId: tenantBetaId, storageUri });
    }
    const betaBlocked = await fetch(
      `${baseUrl}/v1/documents/${betaDocument.documentId}/download`,
      { headers: { cookie: betaOwnerCookie } },
    );
    expect(betaBlocked.status, await betaBlocked.text()).toBe(400);
    const betaAssessment = await latestAssessment({
      tenantId: tenantBetaId,
      documentId: betaDocument.documentId,
    });
    const crossTenantReview = await postReview(
      baseUrl,
      alphaFirmAdminCookie,
      betaAssessment.assessment_id,
      {
        decision: 'allow',
        reasonCode: 'verified_safe',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    );
    expect(crossTenantReview.status, await crossTenantReview.text()).toBe(403);

    const allowResponse = await postReview(
      baseUrl,
      alphaFirmAdminCookie,
      firstAssessment.assessment_id,
      {
        decision: 'allow',
        reasonCode: 'business_justified',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    );
    const allowBody = (await allowResponse.json()) as ReviewResponse;
    expect(allowResponse.status, JSON.stringify(allowBody)).toBe(201);
    expect(allowBody).toMatchObject({
      assessmentId: firstAssessment.assessment_id,
      decision: 'allow',
      reasonCode: 'business_justified',
    });

    const allowedDownload = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    expect(allowedDownload.status, await allowedDownload.text()).toBe(200);
    await expect(
      latestDlpAudit(tenantAlphaId, firstAssessment.assessment_id, 'DLP_REVIEW_APPLIED'),
    ).resolves.toMatchObject({
      action: 'DLP_REVIEW_APPLIED',
      metadata_json: expect.objectContaining({
        dlp_assessment_id: firstAssessment.assessment_id,
        dlp_review_id: allowBody.reviewId,
        version_id: firstVersionId,
        channel: 'document_download',
      }),
    });

    await markCanonicalReadyFixture({
      documentId: uploaded.documentId,
      versionId: firstVersionId,
      bodyText: 'Synthetic reserved alien registration fixture 900101-5000000.',
    });
    const changedHashBlocked = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    expect(changedHashBlocked.status, await changedHashBlocked.text()).toBe(400);
    const changedAssessment = await latestAssessment({
      tenantId: tenantAlphaId,
      documentId: uploaded.documentId,
      versionId: firstVersionId,
      excludeAssessmentId: firstAssessment.assessment_id,
    });
    expect(changedAssessment.assessment_id).not.toBe(firstAssessment.assessment_id);
    expect(changedAssessment.result_hash).not.toBe(firstAssessment.result_hash);

    const changedAllow = await postReview(
      baseUrl,
      alphaFirmAdminCookie,
      changedAssessment.assessment_id,
      {
        decision: 'allow',
        reasonCode: 'business_justified',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    );
    expect(changedAllow.status, await changedAllow.text()).toBe(201);
    const changedDeny = await postReview(
      baseUrl,
      alphaFirmAdminCookie,
      changedAssessment.assessment_id,
      {
        decision: 'deny',
        reasonCode: 'sensitive_content_denied',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    );
    expect(changedDeny.status, await changedDeny.text()).toBe(201);
    const deniedAfterAllow = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    expect(deniedAfterAllow.status, await deniedAfterAllow.text()).toBe(400);
    const denialAudit = await latestDlpAudit(
      tenantAlphaId,
      changedAssessment.assessment_id,
      'DLP_EGRESS_BLOCKED',
    );
    expect(denialAudit.metadata_json).toMatchObject({
      dlp_assessment_id: changedAssessment.assessment_id,
      reason_code: 'DLP_REVIEW_DENIED',
      version_id: firstVersionId,
    });

    const secondVersion = await uploadDocxVersion(
      baseUrl,
      alphaOwnerCookie,
      uploaded.documentId,
      `dlp-new-version-${randomUUID()}`,
      'Synthetic new-version body.',
    );
    for (const storageUri of await storageUrisForDocument(uploaded.documentId)) {
      if (!storedObjects.some((item) => item.storageUri === storageUri)) {
        storedObjects.push({ tenantId: tenantAlphaId, storageUri });
      }
    }
    const newVersionBlocked = await fetch(
      `${baseUrl}/v1/documents/${uploaded.documentId}/download`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    expect(newVersionBlocked.status, await newVersionBlocked.text()).toBe(400);
    const newVersionAssessment = await latestAssessment({
      tenantId: tenantAlphaId,
      documentId: uploaded.documentId,
      versionId: secondVersion.versionId,
    });
    expect(newVersionAssessment.version_id).toBe(secondVersion.versionId);
    expect(newVersionAssessment.assessment_id).not.toBe(firstAssessment.assessment_id);

    const recordedAudit = await latestDlpAudit(
      tenantAlphaId,
      firstAssessment.assessment_id,
      'DLP_REVIEW_RECORDED',
    );
    const auditText = JSON.stringify([
      recordedAudit.metadata_json,
      denialAudit.metadata_json,
    ]);
    expect(auditText).not.toContain('M12345678');
    expect(auditText).not.toContain('900101-5000000');
    expect(recordedAudit.metadata_json).toEqual(
      expect.objectContaining({
        dlp_assessment_id: firstAssessment.assessment_id,
        dlp_review_id: allowBody.reviewId,
        dlp_policy_version: 'sf20-dlp-v1',
        channel: 'manual_review',
      }),
    );
  });
});
