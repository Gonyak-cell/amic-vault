import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { createOwnerClient, tenantBetaId, withClient } from './helpers/db';
import {
  auditCount,
  createClient,
  createMatter,
  createStorageService,
  latestAuditMetadata,
  loginAlphaOwner,
  loginBetaOwner,
  setDocumentLegalHold,
  storageUrisForDocument,
  uploadPdf,
} from './document-access/document-api-helpers';

async function patchStatus(baseUrl: string, cookie: string, documentId: string, status: string) {
  const response = await fetch(`${baseUrl}/v1/documents/${documentId}/status`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status, note: 'operator note must not be logged' }),
  });
  const text = await response.text();
  return { response, text };
}

async function refreshMatterAppSyncState(): Promise<void> {
  const hash = '0'.repeat(64);
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
          $2,
          $2,
          $2,
          'pass',
          '{}'::jsonb
        )
        ON CONFLICT (tenant_id, source_ref) DO UPDATE SET
          last_sync_at = excluded.last_sync_at,
          reflected_count = GREATEST(matter_app_sync_state.reflected_count, excluded.reflected_count),
          drift_count = 0,
          source_revision_hash = excluded.source_revision_hash,
          source_artifact_hash = excluded.source_artifact_hash,
          run_id_hash = excluded.run_id_hash,
          status = 'pass',
          summary_json = '{}'::jsonb,
          updated_at = now()
      `,
      [tenantBetaId, hash],
    );
  });
}

describe('document-status-transitions integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  const storageUris: string[] = [];
  const previousMatterSourceConfigured = process.env.MATTER_APP_SOURCE_CONFIGURED;
  const previousMatterSourceMode = process.env.MATTER_APP_SOURCE_MODE;
  const previousMatterRuntimeReady = process.env.MATTER_APP_RUNTIME_READY;
  const previousMatterSourceUpdatedAt = process.env.MATTER_APP_SOURCE_UPDATED_AT;

  beforeAll(async () => {
    process.env.MATTER_APP_SOURCE_CONFIGURED = 'true';
    process.env.MATTER_APP_SOURCE_MODE = 'matter_app_event_projection';
    process.env.MATTER_APP_RUNTIME_READY = 'true';
    process.env.MATTER_APP_SOURCE_UPDATED_AT = new Date().toISOString();
    await refreshMatterAppSyncState();
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    betaOwnerCookie = await loginBetaOwner(baseUrl);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
    if (previousMatterSourceConfigured === undefined) {
      delete process.env.MATTER_APP_SOURCE_CONFIGURED;
    } else {
      process.env.MATTER_APP_SOURCE_CONFIGURED = previousMatterSourceConfigured;
    }
    if (previousMatterSourceMode === undefined) {
      delete process.env.MATTER_APP_SOURCE_MODE;
    } else {
      process.env.MATTER_APP_SOURCE_MODE = previousMatterSourceMode;
    }
    if (previousMatterRuntimeReady === undefined) {
      delete process.env.MATTER_APP_RUNTIME_READY;
    } else {
      process.env.MATTER_APP_RUNTIME_READY = previousMatterRuntimeReady;
    }
    if (previousMatterSourceUpdatedAt === undefined) {
      delete process.env.MATTER_APP_SOURCE_UPDATED_AT;
    } else {
      process.env.MATTER_APP_SOURCE_UPDATED_AT = previousMatterSourceUpdatedAt;
    }
  });

  it('applies the contract document status sequence and audits every transition', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'DOCSTAT');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'DOCSTAT');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'doc-status');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const sequence = [
      'internal_review',
      'client_sent',
      'markup_received',
      'negotiation',
      'final',
      'executed',
    ] as const;
    let previous = 'draft';
    for (const status of sequence) {
      const { response, text } = await patchStatus(
        baseUrl,
        betaOwnerCookie,
        uploaded.documentId,
        status,
      );
      expect(response.status, text).toBe(200);
      expect(JSON.parse(text)).toMatchObject({ documentId: uploaded.documentId, status });
      expect(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_STATUS_CHANGED')).toEqual({
        document_id: uploaded.documentId,
        matter_id: matterId,
        before_ref: `document_status:${previous}`,
        after_ref: `document_status:${status}`,
        status_before: previous,
        status_after: status,
        reason_code: 'status_transition_note',
      });
      previous = status;
    }
    expect(await auditCount(uploaded.documentId, 'DOCUMENT_STATUS_CHANGED')).toBe(sequence.length);
    expect(JSON.stringify(await latestAuditMetadata(uploaded.documentId, 'DOCUMENT_STATUS_CHANGED'))).not.toContain(
      'operator note must not be logged',
    );
  });

  it('fails closed for invalid direct, legal-hold, and cross-tenant transitions', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'DOCSTATNEG');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'DOCSTATNEG');
    const invalid = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'doc-status-invalid');
    storageUris.push(...(await storageUrisForDocument(invalid.documentId)));

    const direct = await patchStatus(baseUrl, betaOwnerCookie, invalid.documentId, 'executed');
    expect(direct.response.status, direct.text).toBe(422);
    expect(JSON.parse(direct.text)).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DOCUMENT_STATUS_TRANSITION_NOT_ALLOWED',
    });

    const held = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'doc-status-held');
    storageUris.push(...(await storageUrisForDocument(held.documentId)));
    await setDocumentLegalHold(held.documentId, true);
    const blocked = await patchStatus(baseUrl, betaOwnerCookie, held.documentId, 'internal_review');
    expect(blocked.response.status, blocked.text).toBe(422);
    expect(JSON.parse(blocked.text)).toMatchObject({
      code: 'DOCUMENT_LOCKED',
      reason: 'DOCUMENT_LEGAL_HOLD',
    });

    const crossTenant = await patchStatus(baseUrl, alphaOwnerCookie, invalid.documentId, 'internal_review');
    expect([403, 404]).toContain(crossTenant.response.status);
    expect(JSON.parse(crossTenant.text)).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(await auditCount(invalid.documentId, 'DOCUMENT_STATUS_CHANGED')).toBe(0);
  });
});
