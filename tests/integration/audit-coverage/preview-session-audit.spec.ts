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

describe('preview session audit integration', () => {
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
    await withClient(createOwnerClient(), async (client) => {
      await client.query('DROP TRIGGER IF EXISTS test_preview_session_audit_fault ON audit_events');
      await client.query('DROP FUNCTION IF EXISTS test_preview_session_audit_fault()');
    });
    const storage = createStorageService();
    for (const storageUri of storageUris) {
      await storage.deleteByStorageUri(tenantBetaId, storageUri).catch(() => undefined);
    }
    await app.close();
  });

  it('rolls back the session and returns no document bytes when the same-transaction audit insert fails', async () => {
    const clientId = await createClient(baseUrl, betaOwnerCookie, 'PAUDIT');
    const matterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'PAUDIT');
    const uploaded = await uploadPdf(baseUrl, betaOwnerCookie, matterId, 'preview-audit-fault');
    storageUris.push(...(await storageUrisForDocument(uploaded.documentId)));

    await withClient(createOwnerClient(), async (client) => {
      await client.query(`
        CREATE OR REPLACE FUNCTION test_preview_session_audit_fault()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.action = 'DOCUMENT_VIEWED' AND NEW.target_id = '${uploaded.documentId}'::uuid THEN
            RAISE EXCEPTION 'test preview audit fault';
          END IF;
          RETURN NEW;
        END;
        $$;
      `);
      await client.query(`
        CREATE TRIGGER test_preview_session_audit_fault
        BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION test_preview_session_audit_fault()
      `);
    });

    try {
      const failedIssue = await fetch(`${baseUrl}/v1/documents/${uploaded.documentId}/preview-sessions`, {
        method: 'POST',
        headers: { cookie: betaOwnerCookie },
      });
      const failedIssueBody = await failedIssue.text();
      expect(failedIssue.status).toBe(500);
      expect(failedIssueBody).not.toContain('%PDF');
      expect(failedIssueBody).not.toContain('preview-audit-fault');

      await withClient(createOwnerClient(), async (client) => {
        const sessions = await client.query(
          'SELECT preview_session_id FROM preview_access_sessions WHERE document_id = $1',
          [uploaded.documentId],
        );
        const audit = await client.query(
          "SELECT event_id FROM audit_events WHERE target_id = $1 AND action = 'DOCUMENT_VIEWED'",
          [uploaded.documentId],
        );
        expect(sessions.rowCount).toBe(0);
        expect(audit.rowCount).toBe(0);
      });
    } finally {
      await withClient(createOwnerClient(), async (client) => {
        await client.query('DROP TRIGGER IF EXISTS test_preview_session_audit_fault ON audit_events');
        await client.query('DROP FUNCTION IF EXISTS test_preview_session_audit_fault()');
      });
    }
  });
});
