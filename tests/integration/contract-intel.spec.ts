import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  ContractClauseBankResponseDto,
  ContractProcessResponseDto,
  ContractRuleFindingsResponseDto,
  CreatePlaybookRuleRequestDto,
  PlaybookRuleResponseDto,
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
    const body = await createRule({
      ruleKey: playbookRuleKey,
      ruleType: 'required_clause',
      severity: 'critical',
      expression: { requiredClauseKind: 'section', minCount: 1 },
      matterId,
    });
    expect(body.versionNumber).toBe(1);
    expect(body.expressionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain('requiredClauseKind');

    const audit = await latestRuleAudit(body.ruleId);
    expect(audit?.metadata_json).toMatchObject({
      playbook_rule_id: body.ruleId,
      rule_key: playbookRuleKey,
      rule_version: 1,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('requiredClauseKind');
  });

  it('lists clause bank and deterministic rule findings with permission-scoped audit', async () => {
    await processDocument(documentId);
    await createRule({
      ruleKey: `nda.section.required.${marker}`,
      ruleType: 'required_clause',
      severity: 'critical',
      expression: { requiredClauseKind: 'section', minCount: 1 },
      matterId,
    });
    await createRule({
      ruleKey: `nda.threshold.unsupported.${marker}`,
      ruleType: 'threshold',
      severity: 'warning',
      expression: { metric: 'raw_body', operator: 'gte', value: 1 },
      matterId,
    });

    const clauseBank = await getClauseBank(documentId);
    expect(clauseBank.clauses).toHaveLength(2);
    expect(clauseBank.clauses[0]?.citationRef).toMatch(/^clause:/u);
    expect(JSON.stringify(clauseBank)).not.toContain('Use reasonable safeguards');
    expect(JSON.stringify(clauseBank)).not.toContain('Confidential Information');

    const first = await getRuleFindings(documentId);
    const second = await getRuleFindings(documentId);
    expect(first.findings).toEqual(second.findings);
    const findingStatuses = first.findings.map((finding) => finding.status);
    expect(findingStatuses.filter((status) => status === 'pass').length).toBeGreaterThanOrEqual(1);
    expect(findingStatuses.filter((status) => status === 'unsupported')).toHaveLength(1);
    expect(first.unsupportedRuleCount).toBe(1);
    expect(JSON.stringify(first)).not.toContain('requiredClauseKind');
    expect(JSON.stringify(first)).not.toContain('raw_body');
    expect(JSON.stringify(first)).not.toContain('Use reasonable safeguards');

    const clauseAudit = await latestContractAudit(documentId, 'CONTRACT_CLAUSE_BANK_VIEWED');
    expect(clauseAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      result_count: 2,
    });
    const ruleAudit = await latestContractAudit(documentId, 'CONTRACT_RULE_EVALUATED');
    expect(ruleAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      document_id: documentId,
      rule_finding_count: first.findings.length,
      unsupported_rule_count: 1,
    });
  });

  it('denies clause bank access to explicitly blocked documents', async () => {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/clause-bank?matterId=${matterId}&documentId=${deniedDocumentId}`,
      {
        headers: { cookie: ownerCookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(403);
    expect(text).not.toContain(deniedDocumentId);
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

  async function createRule(input: CreatePlaybookRuleRequestDto): Promise<PlaybookRuleResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/playbook-rules`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as PlaybookRuleResponseDto;
  }

  async function getClauseBank(targetDocumentId: string): Promise<ContractClauseBankResponseDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/clause-bank?matterId=${matterId}&documentId=${targetDocumentId}`,
      {
        headers: { cookie: ownerCookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ContractClauseBankResponseDto;
  }

  async function getRuleFindings(
    targetDocumentId: string,
  ): Promise<ContractRuleFindingsResponseDto> {
    const response = await fetch(
      `${baseUrl}/v1/contract-intel/rule-findings?matterId=${matterId}&documentId=${targetDocumentId}`,
      {
        headers: { cookie: ownerCookie },
      },
    );
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as ContractRuleFindingsResponseDto;
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
