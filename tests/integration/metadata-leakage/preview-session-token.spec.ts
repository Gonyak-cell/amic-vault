import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { createOwnerClient, tenantBetaId, withClient } from '../helpers/db';
import {
  createClient,
  createMatter,
  createStorageService,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from '../document-access/document-api-helpers';

describe('preview session token leakage integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    betaOwnerCookie = await loginBetaOwner(baseUrl);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('persists only the token hash and never reflects the raw credential in preview responses or audit metadata', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PLEAK');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PLEAK');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-token-leak');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const issuedResponse = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview-sessions`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie },
    });
    expect(issuedResponse.status, await issuedResponse.clone().text()).toBe(201);
    const issued = (await issuedResponse.json()) as { previewSessionId: string; token: string };
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const preview = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: {
        cookie: betaOwnerCookie,
        'x-amic-preview-session': issued.previewSessionId,
        'x-amic-preview-token': issued.token,
      },
    });
    const previewBody = await preview.text();
    expect(preview.status, previewBody).toBe(200);
    expect(previewBody).not.toContain(issued.token);
    expect([...preview.headers.entries()].join('\n')).not.toContain(issued.token);
    expect([...preview.headers.entries()].join('\n')).not.toContain(issued.previewSessionId);

    await withClient(createOwnerClient(), async (client) => {
      const session = await client.query<{ token_hash: string }>(
        'SELECT token_hash FROM preview_access_sessions WHERE preview_session_id = $1',
        [issued.previewSessionId],
      );
      const audit = await client.query<{ metadata: string }>(
        `SELECT metadata_json::text AS metadata
         FROM audit_events
         WHERE target_id = $1 AND action = 'DOCUMENT_VIEWED'
         ORDER BY created_at DESC
         LIMIT 1`,
        [uploaded.documentId],
      );
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'preview_access_sessions'
         ORDER BY ordinal_position`,
      );
      expect(session.rows[0]?.token_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(session.rows[0]?.token_hash).not.toBe(issued.token);
      expect(audit.rows[0]?.metadata).not.toContain(issued.token);
      expect(audit.rows[0]?.metadata).not.toContain('preview-token-leak');
      expect(columns.rows.map((row) => row.column_name)).not.toContain('token');
    });
  });
});
