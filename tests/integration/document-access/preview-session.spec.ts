import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { createAppClient, createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';
import {
  addBetaMember,
  createClient,
  createMatter,
  createStorageService,
  loginAlphaOwner,
  loginBetaMember,
  loginBetaOwner,
  storageUrisForDocument,
  uploadPdf,
} from './document-api-helpers';

interface PreviewSession {
  previewSessionId: string;
  token: string;
}

async function issueSession(baseUrl: string, cookie: string, documentId: string): Promise<PreviewSession> {
  const response = await fetch(`${baseUrl}/v1/documents/${documentId}/preview-sessions`, {
    method: 'POST',
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as PreviewSession;
}

function headers(cookie: string, session: PreviewSession): Record<string, string> {
  return {
    cookie,
    'x-amic-preview-session': session.previewSessionId,
    'x-amic-preview-token': session.token,
  };
}

describe('preview session access integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaOwnerCookie: string;
  const storageUris: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await loginAlphaOwner(baseUrl);
    betaMemberCookie = await loginBetaMember(baseUrl);
    betaOwnerCookie = await loginBetaOwner(baseUrl);
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('fails closed for sessionless, cross-document, cross-user and cross-tenant preview reads', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PSESSION');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PSESSION');
    await addBetaMember(baseUrl, betaOwnerCookie, matterId, 'read');
    const first = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-session-first');
    const second = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-session-second');
    storageUris.push(...(await storageUrisForDocument(first.documentId)));
    storageUris.push(...(await storageUrisForDocument(second.documentId)));
    const session = await issueSession(baseUrl, betaOwnerCookie, first.documentId);

    const sessionless = await fetch(`${baseUrl}/v1/documents/${first.documentId}/preview`, {
      headers: { cookie: betaOwnerCookie },
    });
    const sessionlessBody = await sessionless.text();
    expect(sessionless.status).toBe(404);
    expect(sessionlessBody).not.toContain('preview-session-first');
    expect(sessionlessBody).not.toContain('%PDF');

    for (const attempt of [
      { cookie: betaOwnerCookie, documentId: second.documentId },
      { cookie: betaMemberCookie, documentId: first.documentId },
      { cookie: alphaOwnerCookie, documentId: first.documentId },
    ]) {
      const response = await fetch(`${baseUrl}/v1/documents/${attempt.documentId}/preview`, {
        headers: headers(attempt.cookie, session),
      });
      expect(response.status, await response.text()).toBe(404);
    }

    const secondVersion = await withClient(createOwnerClient(), async (client) => {
      const result = await client.query<{ version_id: string }>(
        `SELECT version_id
         FROM document_versions
         WHERE document_id = $1 AND version_status = 'current'
         LIMIT 1`,
        [second.documentId],
      );
      return result.rows[0]?.version_id;
    });
    expect(secondVersion).toBeTruthy();
    await withClient(createOwnerClient(), (client) =>
      client.query('UPDATE preview_access_sessions SET version_id = $2 WHERE preview_session_id = $1', [
        session.previewSessionId,
        secondVersion,
      ]),
    );
    const versionMismatch = await fetch(`${baseUrl}/v1/documents/${first.documentId}/preview`, {
      headers: headers(betaOwnerCookie, session),
    });
    expect(versionMismatch.status, await versionMismatch.text()).toBe(404);

    await withClient(createOwnerClient(), async (client) => {
      const relation = await client.query<{ relforcerowsecurity: boolean; relrowsecurity: boolean }>(
        `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class
         WHERE oid = 'preview_access_sessions'::regclass`,
      );
      expect(relation.rows[0]).toEqual({ relforcerowsecurity: true, relrowsecurity: true });
    });
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query(
        'SELECT preview_session_id FROM preview_access_sessions WHERE preview_session_id = $1',
        [session.previewSessionId],
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it('denies revoked and expired sessions before opening a byte stream', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PEXPIRE');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PEXPIRE');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-session-expiry');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    const revoked = await issueSession(baseUrl, betaOwnerCookie, uploaded.documentId);
    await withClient(createOwnerClient(), (client) =>
      client.query(
        'UPDATE preview_access_sessions SET revoked_at = now() WHERE preview_session_id = $1',
        [revoked.previewSessionId],
      ),
    );
    const revokedRead = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: headers(betaOwnerCookie, revoked),
    });
    expect(revokedRead.status, await revokedRead.text()).toBe(404);

    const expired = await issueSession(baseUrl, betaOwnerCookie, uploaded.documentId);
    await withClient(createOwnerClient(), (client) =>
      client.query(
        `UPDATE preview_access_sessions
         SET created_at = now() - interval '6 minutes', expires_at = now() - interval '1 minute'
         WHERE preview_session_id = $1`,
        [expired.previewSessionId],
      ),
    );
    const expiredRead = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview`, {
      headers: headers(betaOwnerCookie, expired),
    });
    expect(expiredRead.status, await expiredRead.text()).toBe(404);
  });
});
