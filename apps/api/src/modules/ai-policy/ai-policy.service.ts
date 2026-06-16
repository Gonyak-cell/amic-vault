import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import {
  aiPolicyBlockedResponse,
  type AiDocumentPolicyDecision,
  type AiPolicyEvaluationRequest,
  type AiPolicyEvaluationResult,
} from '@amic-vault/shared';
import { markAndAuditAiPrepArtifactsStale } from '../ai/prep/ai-prep-lifecycle';
import { AuditService } from '../audit/audit.service';
import {
  evaluateAiPolicySnapshot,
  type AiPolicyCoreDecision,
  type MatterPolicySnapshot,
  type ModelAccessPolicySnapshot,
} from './ai-policy.evaluator';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface MatterPolicyRow {
  ai_policy_id: string | null;
  allowed_model_tiers: string[] | null;
  external_model_allowed: boolean | null;
  default_effect: string | null;
}

interface ModelAccessPolicyRow {
  route_key: string;
  model_tier: string;
  status: string;
  external_model_allowed: boolean;
}

interface DocumentAiPolicyRow {
  document_id: string;
  ai_allowed: boolean;
}

interface PolicySnapshot {
  matterPolicy: MatterPolicySnapshot | null;
  modelAccessPolicy: ModelAccessPolicySnapshot | null;
  documents: AiDocumentPolicyDecision[];
}

@Injectable()
export class AiPolicyService {
  private readonly logger = new Logger(AiPolicyService.name);

  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async evaluate(input: AiPolicyEvaluationRequest): Promise<AiPolicyEvaluationResult> {
    const startedAt = Date.now();
    const documentIds = this.uniqueDocumentIds(input.documentIds);
    let decision: AiPolicyEvaluationResult;
    try {
      decision = this.withDecisionRef(
        input,
        evaluateAiPolicySnapshot({
          matterId: input.matterId,
          modelRoute: input.modelRoute ?? 'local_gemma',
          ...(await this.findPolicySnapshot(
            input.tenantId,
            input.matterId,
            input.modelRoute ?? 'local_gemma',
            documentIds,
          )),
          requestedDocumentIds: documentIds,
        }),
      );
    } catch {
      this.logger.warn({ code: 'AI_POLICY_EVALUATION_ERROR', matterId: input.matterId });
      decision = this.withDecisionRef(input, {
        effect: 'DENY',
        code: 'AI_POLICY_BLOCKED',
        reasonCode: 'evaluation_error',
        auditResult: 'failure',
        policyId: null,
        modelRoute: null,
        matterId: input.matterId,
        documentDecisions: [],
        appliedRules: ['ai_policy:evaluation_error'],
      });
    }
    if (decision.reasonCode === 'evaluation_error') {
      await this.auditService.transaction(input.tenantId, async (tx) => {
        await markAndAuditAiPrepArtifactsStale(this.auditService, tx, {
          tenantId: input.tenantId,
          actorId: input.userId,
          matterId: input.matterId,
          staleReason: 'ai_policy_parse_failed',
        });
      });
    }

    await this.auditService.log({
      tenantId: input.tenantId,
      actorId: input.userId,
      action: 'AI_POLICY_EVALUATED',
      targetType: 'matter',
      targetId: input.matterId,
      matterId: input.matterId,
      result: decision.auditResult,
      metadata: {
        matter_id: input.matterId,
        ...(decision.policyId ? { policy_id: decision.policyId } : {}),
        ...(decision.modelRoute ? { model_route: decision.modelRoute } : {}),
        decision_ref: decision.decisionRef,
        document_count: decision.documentDecisions.length,
        ...(decision.reasonCode ? { reason_code: decision.reasonCode } : {}),
        ...(decision.reasonCode ? { blocked_reason: decision.reasonCode } : {}),
        hash: this.documentSetHash(input.documentIds ?? []),
        duration_ms: Math.max(0, Date.now() - startedAt),
      },
    });

    return decision;
  }

  async assertAllowed(input: AiPolicyEvaluationRequest): Promise<AiPolicyEvaluationResult> {
    const decision = await this.evaluate(input);
    if (decision.effect !== 'ALLOW') {
      throw new ForbiddenException(aiPolicyBlockedResponse(decision));
    }
    return decision;
  }

  private async findPolicySnapshot(
    tenantId: string,
    matterId: string,
    modelRoute: string,
    documentIds: readonly string[],
  ): Promise<PolicySnapshot> {
    return this.withTenantClient(tenantId, async (client) => ({
      matterPolicy: await this.findMatterPolicy(client, tenantId, matterId),
      modelAccessPolicy: await this.findModelAccessPolicy(client, tenantId, modelRoute),
      documents: await this.findDocumentDecisions(client, tenantId, matterId, documentIds),
    }));
  }

  private async withTenantClient<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async findMatterPolicy(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterPolicySnapshot | null> {
    const result = await client.query<MatterPolicyRow>(
      `
        SELECT
          m.ai_policy_id,
          p.allowed_model_tiers,
          p.external_model_allowed,
          p.default_effect
        FROM matters m
        LEFT JOIN ai_policies p
          ON p.tenant_id = m.tenant_id
         AND p.policy_id = m.ai_policy_id
        WHERE m.tenant_id = $1
          AND m.matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      policyId: row.ai_policy_id,
      allowedModelTiers: row.allowed_model_tiers ?? [],
      externalModelAllowed: row.external_model_allowed ?? false,
      defaultEffect: row.default_effect ?? 'DENY',
    };
  }

  private async findModelAccessPolicy(
    client: PoolClient,
    tenantId: string,
    modelRoute: string,
  ): Promise<ModelAccessPolicySnapshot | null> {
    const result = await client.query<ModelAccessPolicyRow>(
      `
        SELECT route_key, model_tier, status, external_model_allowed
        FROM ai_model_access_policies
        WHERE tenant_id = $1
          AND route_key = $2
        LIMIT 1
      `,
      [tenantId, modelRoute],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      routeKey: row.route_key,
      modelTier: row.model_tier,
      status: row.status === 'enabled' ? 'enabled' : 'disabled',
      externalModelAllowed: row.external_model_allowed,
    };
  }

  private async findDocumentDecisions(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    documentIds: readonly string[],
  ): Promise<AiDocumentPolicyDecision[]> {
    if (documentIds.length === 0) return [];
    const result = await client.query<DocumentAiPolicyRow>(
      `
        SELECT document_id, ai_allowed
        FROM documents
        WHERE tenant_id = $1
          AND matter_id = $2
          AND document_id = ANY($3::uuid[])
        ORDER BY document_id
      `,
      [tenantId, matterId, documentIds],
    );
    return result.rows.map((row) => ({
      documentId: row.document_id,
      aiAllowed: row.ai_allowed,
    }));
  }

  private uniqueDocumentIds(documentIds: readonly string[] | undefined): string[] {
    return [...new Set(documentIds ?? [])].sort();
  }

  private withDecisionRef(
    input: AiPolicyEvaluationRequest,
    decision: AiPolicyCoreDecision,
  ): AiPolicyEvaluationResult {
    const canonical = JSON.stringify({
      effect: decision.effect,
      reasonCode: decision.reasonCode ?? null,
      tenantId: input.tenantId,
      matterId: decision.matterId,
      policyId: decision.policyId,
      modelRoute: decision.modelRoute,
      documentIds: this.uniqueDocumentIds(input.documentIds),
    });
    const hash = createHash('sha256').update(canonical).digest('hex');
    return {
      ...decision,
      decisionRef: `ai_policy_decision:${hash}`,
    };
  }

  private documentSetHash(documentIds: readonly string[]): string {
    return createHash('sha256')
      .update(this.uniqueDocumentIds(documentIds).join('|'))
      .digest('hex');
  }
}
