import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import {
  createClient,
  createMatter,
  createStorageService,
  ensureFreshMatterAppSyncState,
  loginBetaOwner,
  storageUrisForDocument,
} from './document-api-helpers';
import { createAppClient, createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

interface DocumentFolderDto {
  folderId: string;
  matterId: string;
  parentFolderId: string | null;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentTagListDto {
  tags: string[];
}

interface UploadDocumentResponseDto {
  documentId: string;
  matterId: string;
  fileObjectId: string;
  folderId?: string | null;
  folderPath?: string | null;
  tags?: string[];
}

function pdfForm(input: { marker: string; sourceRelativePath?: string; tags?: string[] }): FormData {
  const bytes = Buffer.from(`%PDF-1.7\nB8 ${input.marker}\n`);
  const form = new FormData();
  form.append('title', `${input.marker} Document`);
  if (input.sourceRelativePath) form.append('sourceRelativePath', input.sourceRelativePath);
  if (input.tags) form.append('tags', JSON.stringify(input.tags));
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    `${input.marker}.pdf`,
  );
  return form;
}

async function uploadOrganizedPdf(
  baseUrl: string,
  cookie: string,
  matterId: string,
  input: { marker: string; sourceRelativePath?: string; tags?: string[] },
): Promise<UploadDocumentResponseDto> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
    method: 'POST',
    headers: { cookie },
    body: pdfForm(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as UploadDocumentResponseDto;
}

async function getFolders(
  baseUrl: string,
  cookie: string,
  matterId: string,
): Promise<DocumentFolderDto[]> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/document-folders`, {
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as DocumentFolderDto[];
}

async function setTags(
  baseUrl: string,
  cookie: string,
  documentId: string,
  tags: string[],
): Promise<DocumentTagListDto> {
  const response = await fetch(`${baseUrl}/v1/documents/${documentId}/tags`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as DocumentTagListDto;
}

async function moveDocumentToFolder(
  baseUrl: string,
  cookie: string,
  documentId: string,
  folderId: string | null,
): Promise<UploadDocumentResponseDto> {
  const response = await fetch(`${baseUrl}/v1/documents/${documentId}/metadata`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ folderId }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as UploadDocumentResponseDto;
}

async function patchFolder(
  baseUrl: string,
  cookie: string,
  matterId: string,
  folderId: string,
  body: Record<string, unknown>,
): Promise<DocumentFolderDto> {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/document-folders/${folderId}`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as DocumentFolderDto;
}

async function folderRows(documentId: string): Promise<
  Array<{ folderPath: string; tag: string | null; auditAction: string | null }>
> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantBetaId);
    const result = await client.query<{
      folder_path: string;
      tag: string | null;
      audit_action: string | null;
    }>(
      `
        WITH RECURSIVE ancestors AS (
          SELECT f.folder_id, f.parent_folder_id, f.name, 0 AS depth
          FROM documents d
          JOIN document_folders f
            ON f.tenant_id = d.tenant_id
           AND f.folder_id = d.folder_id
          WHERE d.tenant_id = $1
            AND d.document_id = $2
          UNION ALL
          SELECT parent.folder_id, parent.parent_folder_id, parent.name, ancestors.depth + 1
          FROM ancestors
          JOIN document_folders parent
            ON parent.tenant_id = $1
           AND parent.folder_id = ancestors.parent_folder_id
        )
        SELECT
          (SELECT string_agg(name, '/' ORDER BY depth DESC) FROM ancestors) AS folder_path,
          t.tag,
          a.action AS audit_action
        FROM documents d
        LEFT JOIN document_tags t
          ON t.tenant_id = d.tenant_id
         AND t.document_id = d.document_id
        LEFT JOIN audit_events a
          ON a.tenant_id = d.tenant_id
         AND a.target_id = d.document_id
         AND a.action = 'DOCUMENT_TAGS_CHANGED'
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        ORDER BY t.tag ASC NULLS LAST, a.created_at DESC
      `,
      [tenantBetaId, documentId],
    );
    return result.rows.map((row) => ({
      auditAction: row.audit_action,
      folderPath: row.folder_path,
      tag: row.tag,
    }));
  });
}

describe('document folders and tags integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  let betaMatterId: string;
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    betaOwnerCookie = await loginBetaOwner(baseUrl);
    await ensureFreshMatterAppSyncState(tenantBetaId, 'b8_document_folders');
    const clientId = await createClient(baseUrl, betaOwnerCookie, `B8 Folder Client ${randomUUID()}`);
    betaMatterId = await createMatter(baseUrl, betaOwnerCookie, clientId, 'B8-FOLDER');
  });

  afterAll(async () => {
    const storage = createStorageService();
    for (const documentId of createdDocumentIds) {
      for (const storageUri of await storageUrisForDocument(documentId)) {
        await storage.deleteByStorageUri(tenantBetaId, storageUri);
      }
    }
    await app?.close();
  });

  it('preserves sourceRelativePath folders, supports tag updates, audits folder moves, and keeps RLS tenant-scoped', async () => {
    const uploaded = await uploadOrganizedPdf(baseUrl, betaOwnerCookie, betaMatterId, {
      marker: 'B8-Foldered',
      sourceRelativePath: 'a/b/c.pdf',
      tags: ['closing', 'executed'],
    });
    createdDocumentIds.push(uploaded.documentId);
    expect(uploaded.folderPath).toBe('a/b');
    expect(uploaded.tags).toEqual(['closing', 'executed']);

    const initialFolders = await getFolders(baseUrl, betaOwnerCookie, betaMatterId);
    const folderA = initialFolders.find((folder) => folder.path === 'a');
    const folderB = initialFolders.find((folder) => folder.path === 'a/b');
    expect(folderA?.folderId).toBeTruthy();
    expect(folderB?.folderId).toBe(uploaded.folderId);

    const updatedTags = await setTags(baseUrl, betaOwnerCookie, uploaded.documentId, [
      'executed',
      'reviewed',
    ]);
    expect(updatedTags.tags).toEqual(['executed', 'reviewed']);

    const targetRoot = await uploadOrganizedPdf(baseUrl, betaOwnerCookie, betaMatterId, {
      marker: 'B8-Target',
      sourceRelativePath: 'target/placeholder.pdf',
    });
    createdDocumentIds.push(targetRoot.documentId);
    const foldersBeforeMove = await getFolders(baseUrl, betaOwnerCookie, betaMatterId);
    const target = foldersBeforeMove.find((folder) => folder.path === 'target');
    expect(target?.folderId).toBeTruthy();

    const movedDocument = await moveDocumentToFolder(
      baseUrl,
      betaOwnerCookie,
      uploaded.documentId,
      target!.folderId,
    );
    expect(movedDocument.folderId).toBe(target!.folderId);
    expect(movedDocument.folderPath).toBe('target');

    const moved = await patchFolder(baseUrl, betaOwnerCookie, betaMatterId, folderB!.folderId, {
      parentFolderId: target!.folderId,
    });
    expect(moved.path).toBe('target/b');

    const rows = await folderRows(uploaded.documentId);
    expect([...new Set(rows.map((row) => row.tag).filter(Boolean))]).toEqual([
      'executed',
      'reviewed',
    ]);
    expect(rows.some((row) => row.auditAction === 'DOCUMENT_TAGS_CHANGED')).toBe(true);

    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const audit = await client.query<{ action: string }>(
        `
          SELECT action
          FROM audit_events
          WHERE tenant_id = $1
            AND target_id = $2
            AND action = 'DOCUMENT_FOLDER_MOVED'
          LIMIT 1
        `,
        [tenantBetaId, folderB!.folderId],
      );
      expect(audit.rowCount).toBe(1);
    });

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const invisible = await client.query(
        `
          SELECT folder_id
          FROM document_folders
          WHERE folder_id = $1
        `,
        [folderB!.folderId],
      );
      expect(invisible.rowCount).toBe(0);
    });
  });
});
