import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { ContractProcessResponseDto, PlaybookRuleResponseDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  withClient,
} from './helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  alphaFirmAdminUserId,
  alphaOwnerUserId,
  insertSearchIndexedRow,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('contract intelligence integration', () => {
  const marker = `contract-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const documentId = randomUUID();
  const versionId = randomUUID();
  const deniedDocumentId = randomUUID();
  const deniedVersionId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let adminCookie: string;
  const playbookRuleKey = `nda.confidentiality.${marker}`;

  beforeAll(async () => {
    const text = `Article 1 Definitions
"Confidential Information" means all non-public information
"Confidential Information" means marked information

Section 2 Confidentiality
This Non-Disclosure Agreement protects confidential information. [[ADD:Use reasonable safeguards]] <del>old rule</del>`;
    await insertDocument({ documentId, versionId, text, title: `${marker} NDA` });
    await insertDocument({
      documentId: deniedDocumentId,
      versionId: deniedVersionId,
      text,
      title: `${marker} Denied NDA`,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: deniedDocumentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
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
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('classifies and extracts contract facts with reference-only audit', async () => {
    const output = await processDocument(documentId);

    expect(output.classification.contractType).toBe('nda');
    expect(output.clauseCount).toBe(2);
    expect(output.definedTermCount).toBe(2);
    expect(output.redlineChangeCount).toBe(2);
    expect(JSON.stringify(output)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(output)).not.toContain('non-public information');

    const counts = await contractCounts(versionId);
    expect(counts).toEqual({
      clauses: 2,
      chunks: 2,
      terms: 2,
      conflicts: 2,
      redlines: 2,
    });
    const audit = await latestContractAudit(documentId, 'CONTRACT_CLAUSES_EXTRACTED');
    expect(audit?.metadata_json).toMatchObject({
      document_id: documentId,
      version_id: versionId,
      clause_count: 2,
      parser_status: 'success',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(marker);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Confidential Information');
  });

  it('denies explicitly blocked documents before parsing', async () => {
    const response = await fetch(`${baseUrl}/v1/contract-intel/process`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: deniedDocumentId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);
    expect(await contractCounts(deniedVersionId)).toEqual({
      clauses: 0,
      chunks: 0,
      terms: 0,
      conflicts: 0,
      redlines: 0,
    });
  });

  it('creates audited playbook rule versions without storing raw text', async () => {
    const response = await fetch(`${baseUrl}/v1/contract-intel/playbook-rules`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        ruleKey: playbookRuleKey,
        ruleType: 'required_clause',
        severity: 'critical',
        expression: { requiredClauseKind: 'section', minCount: 1 },
        matterId,
      }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    const body = JSON.parse(text) as PlaybookRuleResponseDto;
    expect(body.versionNumber).toBe(1);
    expect(body.expressionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(text).not.toContain('requiredClauseKind');

    const audit = await latestRuleAudit(body.ruleId);
    expect(audit?.metadata_json).toMatchObject({
      playbook_rule_id: body.ruleId,
      rule_key: playbookRuleKey,
      rule_version: 1,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('requiredClauseKind');
  });

  async function processDocument(targetDocumentId: string): Promise<ContractProcessResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/process`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: targetDocumentId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as ContractProcessResponseDto;
  }

  async function insertDocument(input: {
    documentId: string;
    versionId: string;
    text: string;
    title: string;
  }): Promise<void> {
    await insertSearchIndexedRow(
      {
        tenantId: tenantAlphaId,
        ownerUserId: alphaOwnerUserId,
        clientId,
        matterId,
        documentId: input.documentId,
        versionId: input.versionId,
        title: input.title,
        contentText: input.text,
        documentType: 'contract',
        documentStatus: 'draft',
        versionStatus: 'current',
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
      1201,
    );
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO canonical_documents (
            tenant_id, version_id, body_text, extraction_status, extraction_method,
            confidence, extracted_at
          )
          VALUES ($1, $2, $3, 'ready', 'docx', 0.980, now())
        `,
        [tenantAlphaId, input.versionId, input.text],
      );
    });
  }
});

async function contractCounts(versionId: string): Promise<{
  clauses: number;
  chunks: number;
  terms: number;
  conflicts: number;
  redlines: number;
}> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      clauses: string;
      chunks: string;
      terms: string;
      conflicts: string;
      redlines: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM contract_clauses WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS clauses,
          (SELECT count(*) FROM contract_clause_chunks WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS chunks,
          (SELECT count(*) FROM contract_defined_terms WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS terms,
          (SELECT count(*) FROM contract_defined_terms WHERE tenant_id = $1 AND version_id = $2 AND conflict_status = 'conflict' AND stale = false)::text AS conflicts,
          (SELECT count(*) FROM contract_redline_changes WHERE tenant_id = $1 AND version_id = $2 AND stale = false)::text AS redlines
      `,
      [tenantAlphaId, versionId],
    );
    const row = result.rows[0];
    return {
      clauses: Number(row?.clauses ?? 0),
      chunks: Number(row?.chunks ?? 0),
      terms: Number(row?.terms ?? 0),
      conflicts: Number(row?.conflicts ?? 0),
      redlines: Number(row?.redlines ?? 0),
    };
  });
}

async function latestContractAudit(documentId: string, action: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, documentId, action],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}

async function latestRuleAudit(ruleId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = 'PLAYBOOK_RULE_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, ruleId],
    );
    return result.rows[0] as { result: string; metadata_json: Record<string, unknown> } | undefined;
  });
}
