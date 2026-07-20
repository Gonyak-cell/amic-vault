import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  graphNodeReviewResponseSchema,
  type GraphEdgeType,
  type GraphNodeCreatedByKind,
  type GraphNodeProvenance,
  type GraphNodeReviewRequestDto,
  type GraphNodeReviewResponseDto,
  type GraphNodeReviewStatus,
  type GraphNodeType,
  type GraphSyncResponseDto,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';

export interface GraphSyncContext {
  tenantId: string;
  userId: string | null;
  sessionId?: string | null;
}

interface MatterSourceRow {
  matter_id: string;
  client_id: string;
}

interface DocumentSourceRow {
  document_id: string;
  version_id: string;
}

interface DocumentVersionSourceRow {
  document_id: string;
  version_id: string;
  version_no: number;
  version_status: string;
  supersedes_version_id: string | null;
}

interface TextChunkSourceRow {
  chunk_id: string;
  document_id: string;
  version_id: string;
  source_text_hash: string;
}

interface ContractClauseSourceRow {
  clause_id: string;
  document_id: string;
  version_id: string;
  clause_kind: string;
  clause_number: string;
  heading_hash: string;
  text_hash: string;
}

interface ContractDefinedTermSourceRow {
  term_id: string;
  document_id: string;
  version_id: string;
  clause_id: string;
  normalized_term_key: string;
  term_hash: string;
  definition_hash: string;
  conflict_status: string;
}

interface ClauseChunkAlignmentSourceRow {
  clause_id: string;
  chunk_id: string;
  document_id: string;
  version_id: string;
  text_hash: string;
}

interface LitigationEvidenceSourceRow {
  evidence_id: string;
  document_id: string | null;
  version_id: string | null;
  source_hash: string | null;
  custody_status: string;
  admitted_status: string;
}

interface LitigationFactSourceRow {
  fact_id: string;
  evidence_id: string | null;
  document_id: string | null;
  version_id: string | null;
  status: string;
  materiality: string;
  fact_date: string | null;
}

interface AiClaimFactSourceRow {
  claim_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  claim_hash: string;
  kind: string;
  verification_status: string;
  is_legal_conclusion: boolean;
}

interface LitigationIssueSourceRow {
  issue_id: string;
  parent_issue_id: string | null;
  issue_type: string;
  status: string;
}

interface DdRfiSourceRow {
  rfi_id: string;
  status: string;
  priority: string;
}

interface DdIssueSourceRow {
  issue_id: string;
  rfi_id: string | null;
  document_id: string | null;
  severity: string;
  status: string;
}

interface DdRiskSourceRow {
  risk_id: string;
  issue_id: string | null;
  severity: string;
  likelihood: string;
  status: string;
}

interface PartySourceRow {
  party_id: string;
  party_type: string;
  party_role: string;
  related_client_id: string | null;
}

interface NegotiationPositionSourceRow {
  position_id: string;
  party_id: string;
  source_document_id: string;
  source_version_id: string;
  source_clause_id: string | null;
  clause_kind: string;
  position_summary_hash: string;
  round_no: number;
}

interface GraphNodeInput {
  nodeType: GraphNodeType;
  sourceTable: string;
  sourceId: string;
  matterId: string | null;
  documentId: string | null;
  versionId: string | null;
  sourceHash: string;
  provenance?: GraphNodeProvenance | undefined;
  reviewStatus?: GraphNodeReviewStatus | null | undefined;
  createdByKind?: GraphNodeCreatedByKind | undefined;
}

interface GraphEdgeInput {
  edgeType: GraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  matterId: string;
  documentId: string | null;
}

interface GraphFactReviewNodeRow {
  node_id: string;
  source_id: string;
  matter_id: string;
  provenance: GraphNodeProvenance;
  review_status: GraphNodeReviewStatus | null;
  created_by_kind: GraphNodeCreatedByKind;
  stale: boolean;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function hashParts(...parts: Array<string | null | undefined>): string {
  return sha256Hex(parts.map((part) => part ?? '').join(':'));
}

@Injectable()
export class GraphSyncService {
  private readonly logger = new Logger(GraphSyncService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
  ) {}

  async syncMatter(
    ctx: GraphSyncContext,
    matterId: string,
  ): Promise<GraphSyncResponseDto> {
    const startedAt = performance.now();
    try {
      return await this.auditService.transaction(ctx.tenantId, async (client) => {
        const syncRunId = await this.createRun(client, ctx.tenantId, matterId);
        const matter = await this.findMatter(client, ctx.tenantId, matterId);
        if (!matter) {
          throw new BadRequestException({ code: 'VALIDATION_FAILED' });
        }

        await this.markMatterGraphStale(client, ctx.tenantId, matterId);
        const clientNodeId = await this.upsertNode(client, ctx.tenantId, {
          nodeType: 'client',
          sourceTable: 'clients',
          sourceId: matter.client_id,
          matterId: null,
          documentId: null,
          versionId: null,
          sourceHash: sha256Hex(`client:${matter.client_id}`),
        });
        const matterNodeId = await this.upsertNode(client, ctx.tenantId, {
          nodeType: 'matter',
          sourceTable: 'matters',
          sourceId: matter.matter_id,
          matterId,
          documentId: null,
          versionId: null,
          sourceHash: sha256Hex(`matter:${matter.matter_id}`),
        });
        await this.upsertEdge(client, ctx.tenantId, {
          edgeType: 'HAS_MATTER',
          sourceNodeId: clientNodeId,
          targetNodeId: matterNodeId,
          matterId,
          documentId: null,
        });

        const documents = await this.listCurrentDocuments(client, ctx.tenantId, matterId);
        for (const document of documents) {
          const documentNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'document',
            sourceTable: 'documents',
            sourceId: document.document_id,
            matterId,
            documentId: document.document_id,
            versionId: null,
            sourceHash: sha256Hex(`document:${document.document_id}`),
          });
          const versionNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'version',
            sourceTable: 'document_versions',
            sourceId: document.version_id,
            matterId,
            documentId: document.document_id,
            versionId: document.version_id,
            sourceHash: sha256Hex(`version:${document.version_id}`),
          });
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_DOCUMENT',
            sourceNodeId: matterNodeId,
            targetNodeId: documentNodeId,
            matterId,
            documentId: document.document_id,
          });
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_VERSION',
            sourceNodeId: documentNodeId,
            targetNodeId: versionNodeId,
            matterId,
            documentId: document.document_id,
          });
        }
        const documentVersions = await this.listDocumentVersions(client, ctx.tenantId, matterId);
        const versionNodeIds = new Map<string, string>();
        for (const version of documentVersions) {
          const documentNodeId = await this.findNodeId(
            client,
            ctx.tenantId,
            'document',
            version.document_id,
          );
          if (!documentNodeId) continue;
          const versionNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'version',
            sourceTable: 'document_versions',
            sourceId: version.version_id,
            matterId,
            documentId: version.document_id,
            versionId: version.version_id,
            sourceHash: hashParts(
              'version',
              version.version_id,
              String(version.version_no),
              version.version_status,
              version.supersedes_version_id,
            ),
          });
          versionNodeIds.set(version.version_id, versionNodeId);
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_VERSION',
            sourceNodeId: documentNodeId,
            targetNodeId: versionNodeId,
            matterId,
            documentId: version.document_id,
          });
        }
        for (const version of documentVersions) {
          if (!version.supersedes_version_id) continue;
          const sourceNodeId = versionNodeIds.get(version.version_id);
          const targetNodeId =
            versionNodeIds.get(version.supersedes_version_id) ??
            (await this.findNodeId(client, ctx.tenantId, 'version', version.supersedes_version_id));
          if (!sourceNodeId || !targetNodeId) continue;
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'SUPERSEDES',
            sourceNodeId,
            targetNodeId,
            matterId,
            documentId: version.document_id,
          });
        }

        const textChunks = await this.listTextChunks(client, ctx.tenantId, matterId);
        for (const chunk of textChunks) {
          const versionNodeId = await this.findNodeId(
            client,
            ctx.tenantId,
            'version',
            chunk.version_id,
          );
          if (!versionNodeId) continue;
          const chunkNodeId = await this.upsertNode(client, ctx.tenantId, {
            nodeType: 'text_chunk',
            sourceTable: 'document_chunks',
            sourceId: chunk.chunk_id,
            matterId,
            documentId: chunk.document_id,
            versionId: chunk.version_id,
            sourceHash: sha256Hex(`text-chunk:${chunk.chunk_id}:${chunk.source_text_hash}`),
          });
          await this.upsertEdge(client, ctx.tenantId, {
            edgeType: 'HAS_CLAUSE',
            sourceNodeId: versionNodeId,
            targetNodeId: chunkNodeId,
            matterId,
            documentId: chunk.document_id,
          });
        }
        await this.syncContractClauses(client, ctx.tenantId, matterId);
        await this.syncContractDefinedTerms(client, ctx.tenantId, matterId);
        await this.syncClauseChunkAlignments(client, ctx.tenantId, matterId);

        await this.syncLitigationEvidence(client, ctx.tenantId, matterId);
        await this.syncLitigationFacts(client, ctx.tenantId, matterId, matterNodeId);
        await this.syncAiClaimFacts(client, ctx.tenantId, matterId, matterNodeId);
        await this.syncLitigationIssues(client, ctx.tenantId, matterId, matterNodeId);
        await this.syncDdRfis(client, ctx.tenantId, matterId);
        await this.syncDdIssues(client, ctx.tenantId, matterId, matterNodeId);
        await this.syncDdRisks(client, ctx.tenantId, matterId, matterNodeId);
        await this.syncParties(client, ctx.tenantId, matterId, matterNodeId);
        await this.syncNegotiationPositions(client, ctx.tenantId, matterId);

        const counts = await this.countActiveAndStale(client, ctx.tenantId, matterId);
        await client.query(
          `
            UPDATE graph_sync_runs
            SET status = 'success',
              node_count = $3,
              edge_count = $4,
              stale_node_count = $5,
              stale_edge_count = $6,
              completed_at = now()
            WHERE tenant_id = $1
              AND sync_run_id = $2
          `,
          [
            ctx.tenantId,
            syncRunId,
            counts.nodeCount,
            counts.edgeCount,
            counts.staleNodeCount,
            counts.staleEdgeCount,
          ],
        );
        const syncAudit = await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'GRAPH_SYNCED',
            targetType: 'graph_sync',
            targetId: syncRunId,
            matterId,
            metadata: {
              sync_run_id: syncRunId,
              matter_id: matterId,
              node_count: counts.nodeCount,
              edge_count: counts.edgeCount,
              stale_count: counts.staleNodeCount + counts.staleEdgeCount,
              duration_ms: Math.round(performance.now() - startedAt),
            },
          },
          client,
        );
        await this.openGraphFactReviewWorkItems(client, ctx.tenantId, matterId, syncAudit.eventId);

        return {
          syncRunId,
          matterId,
          status: 'success',
          nodeCount: counts.nodeCount,
          edgeCount: counts.edgeCount,
          staleNodeCount: counts.staleNodeCount,
          staleEdgeCount: counts.staleEdgeCount,
        };
      });
    } catch (error) {
      this.logger.warn({ code: 'GRAPH_SYNC_FAILED', matterId });
      throw error;
    }
  }

  async reviewFactNode(
    ctx: GraphSyncContext,
    nodeId: string,
    input: GraphNodeReviewRequestDto,
  ): Promise<GraphNodeReviewResponseDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const row = await this.findReviewableFactNode(client, ctx.tenantId, nodeId);
      if (!row || row.matter_id === null) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      if (row.provenance !== 'ai_proposed' || row.review_status !== 'proposed' || row.stale) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      }
      await this.assertCanEditMatter(ctx, row.matter_id);

      const confirming = input.action === 'confirm';
      const nextProvenance: GraphNodeProvenance = confirming ? 'human_confirmed' : 'ai_proposed';
      const nextReviewStatus: GraphNodeReviewStatus = confirming ? 'confirmed' : 'proposed';
      const nextCreatedByKind: GraphNodeCreatedByKind = confirming ? 'human' : 'ai';
      const nextStale = !confirming;

      await client.query(
        `
          UPDATE graph_nodes
          SET provenance = $3,
            review_status = $4,
            created_by_kind = $5,
            stale = $6,
            updated_at = now()
          WHERE tenant_id = $1
            AND node_id = $2
        `,
        [ctx.tenantId, nodeId, nextProvenance, nextReviewStatus, nextCreatedByKind, nextStale],
      );

      const audit = await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: confirming ? 'FACT_CONFIRMED' : 'FACT_REJECTED',
          targetType: 'graph_node',
          targetId: nodeId,
          matterId: row.matter_id,
          metadata: {
            matter_id: row.matter_id,
            fact_id: row.source_id,
            status_before: row.review_status,
            status_after: confirming ? 'confirmed' : 'rejected',
          },
        },
        client,
      );
      await this.completeGraphFactReviewWork(
        client,
        ctx.tenantId,
        nodeId,
        ctx.userId,
        audit.eventId,
      );

      return graphNodeReviewResponseSchema.parse({
        nodeId,
        matterId: row.matter_id,
        action: input.action,
        provenance: nextProvenance,
        reviewStatus: nextReviewStatus,
        stale: nextStale,
      });
    });
  }

  private async createRun(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<string> {
    const result = await client.query<{ sync_run_id: string }>(
      `
        INSERT INTO graph_sync_runs (tenant_id, matter_id, scope_id)
        VALUES ($1, $2, $2)
        RETURNING sync_run_id
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('graph sync run insert returned no row');
    return row.sync_run_id;
  }

  private async findMatter(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterSourceRow | null> {
    const result = await client.query<MatterSourceRow>(
      `
        SELECT matter_id, client_id
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return result.rows[0] ?? null;
  }

  private async markMatterGraphStale(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE graph_edges
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND stale = false
      `,
      [tenantId, matterId],
    );
    await client.query(
      `
        UPDATE graph_nodes
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND stale = false
      `,
      [tenantId, matterId],
    );
  }

  private async listCurrentDocuments(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<DocumentSourceRow[]> {
    const result = await client.query<DocumentSourceRow>(
      `
        SELECT d.document_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        ORDER BY d.document_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listDocumentVersions(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<DocumentVersionSourceRow[]> {
    const result = await client.query<DocumentVersionSourceRow>(
      `
        SELECT d.document_id, dv.version_id, dv.version_no, dv.version_status,
          dv.supersedes_version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        ORDER BY d.document_id, dv.version_no, dv.version_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listTextChunks(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<TextChunkSourceRow[]> {
    const result = await client.query<TextChunkSourceRow>(
      `
        SELECT dc.chunk_id, dc.document_id, dc.version_id, dc.source_text_hash
        FROM document_chunks dc
        JOIN documents d
          ON d.tenant_id = dc.tenant_id
          AND d.document_id = dc.document_id
        JOIN document_versions dv
          ON dv.tenant_id = dc.tenant_id
          AND dv.version_id = dc.version_id
          AND dv.version_status = 'current'
        WHERE dc.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
          AND dc.chunk_kind = 'parent'
          AND dc.stale = false
        ORDER BY dc.document_id, dc.chunk_ordinal
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listContractClauses(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<ContractClauseSourceRow[]> {
    const result = await client.query<ContractClauseSourceRow>(
      `
        SELECT cc.clause_id, cc.document_id, cc.version_id, cc.clause_kind,
          cc.clause_number, cc.heading_hash, cc.text_hash
        FROM contract_clauses cc
        JOIN documents d
          ON d.tenant_id = cc.tenant_id
          AND d.document_id = cc.document_id
        JOIN document_versions dv
          ON dv.tenant_id = cc.tenant_id
          AND dv.version_id = cc.version_id
          AND dv.version_status = 'current'
        WHERE cc.tenant_id = $1
          AND cc.matter_id = $2
          AND cc.stale = false
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        ORDER BY cc.document_id, cc.start_offset, cc.clause_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listContractDefinedTerms(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<ContractDefinedTermSourceRow[]> {
    const result = await client.query<ContractDefinedTermSourceRow>(
      `
        SELECT term_id, document_id, version_id, clause_id, normalized_term_key,
          term_hash, definition_hash, conflict_status
        FROM contract_defined_terms
        WHERE tenant_id = $1
          AND matter_id = $2
          AND stale = false
        ORDER BY document_id, normalized_term_key, term_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listClauseChunkAlignments(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<ClauseChunkAlignmentSourceRow[]> {
    const result = await client.query<ClauseChunkAlignmentSourceRow>(
      `
        SELECT clause_id, chunk_id, document_id, version_id, text_hash
        FROM contract_clause_chunks
        WHERE tenant_id = $1
          AND matter_id = $2
          AND stale = false
          AND chunk_id IS NOT NULL
        ORDER BY document_id, chunk_ordinal, clause_chunk_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async syncContractClauses(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const clauses = await this.listContractClauses(client, tenantId, matterId);
    for (const clause of clauses) {
      const versionNodeId = await this.findNodeId(client, tenantId, 'version', clause.version_id);
      if (!versionNodeId) continue;
      const clauseNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'clause',
        sourceTable: 'contract_clauses',
        sourceId: clause.clause_id,
        matterId,
        documentId: clause.document_id,
        versionId: clause.version_id,
        sourceHash: hashParts(
          'contract-clause',
          clause.clause_id,
          clause.clause_kind,
          clause.clause_number,
          clause.heading_hash,
          clause.text_hash,
        ),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'CONTAINS_CLAUSE',
        sourceNodeId: versionNodeId,
        targetNodeId: clauseNodeId,
        matterId,
        documentId: clause.document_id,
      });
    }
  }

  private async syncContractDefinedTerms(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const terms = await this.listContractDefinedTerms(client, tenantId, matterId);
    for (const term of terms) {
      const versionNodeId = await this.findNodeId(client, tenantId, 'version', term.version_id);
      if (!versionNodeId) continue;
      const termNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'defined_term',
        sourceTable: 'contract_defined_terms',
        sourceId: term.term_id,
        matterId,
        documentId: term.document_id,
        versionId: term.version_id,
        sourceHash: hashParts(
          'contract-defined-term',
          term.term_id,
          term.clause_id,
          term.normalized_term_key,
          term.term_hash,
          term.definition_hash,
          term.conflict_status,
        ),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'DEFINES',
        sourceNodeId: versionNodeId,
        targetNodeId: termNodeId,
        matterId,
        documentId: term.document_id,
      });
    }
  }

  private async syncClauseChunkAlignments(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const alignments = await this.listClauseChunkAlignments(client, tenantId, matterId);
    for (const alignment of alignments) {
      const clauseNodeId = await this.findNodeId(client, tenantId, 'clause', alignment.clause_id);
      const chunkNodeId = await this.findNodeId(client, tenantId, 'text_chunk', alignment.chunk_id);
      if (!clauseNodeId || !chunkNodeId) continue;
      await this.upsertEdge(client, tenantId, {
        edgeType: 'ALIGNED_WITH',
        sourceNodeId: clauseNodeId,
        targetNodeId: chunkNodeId,
        matterId,
        documentId: alignment.document_id,
      });
    }
  }

  private async syncLitigationEvidence(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const evidenceRows = await this.listLitigationEvidence(client, tenantId, matterId);
    for (const evidence of evidenceRows) {
      const evidenceNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'evidence',
        sourceTable: 'litigation_evidence_items',
        sourceId: evidence.evidence_id,
        matterId,
        documentId: evidence.document_id,
        versionId: evidence.version_id,
        sourceHash: hashParts(
          'evidence',
          evidence.evidence_id,
          evidence.source_hash,
          evidence.document_id,
          evidence.version_id,
          evidence.custody_status,
          evidence.admitted_status,
        ),
      });
      const targetNodeId =
        evidence.version_id === null
          ? await this.findOptionalDocumentNode(client, tenantId, evidence.document_id)
          : await this.findNodeId(client, tenantId, 'version', evidence.version_id);
      if (!targetNodeId) continue;
      await this.upsertEdge(client, tenantId, {
        edgeType: 'EVIDENCED_BY',
        sourceNodeId: evidenceNodeId,
        targetNodeId,
        matterId,
        documentId: evidence.document_id,
      });
    }
  }

  private async syncLitigationFacts(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    matterNodeId: string,
  ): Promise<void> {
    const factRows = await this.listLitigationFacts(client, tenantId, matterId);
    for (const fact of factRows) {
      const factNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'fact',
        sourceTable: 'litigation_facts',
        sourceId: fact.fact_id,
        matterId,
        documentId: fact.document_id,
        versionId: fact.version_id,
        sourceHash: hashParts(
          'fact',
          fact.fact_id,
          fact.evidence_id,
          fact.status,
          fact.materiality,
          fact.fact_date,
        ),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_FACT',
        sourceNodeId: matterNodeId,
        targetNodeId: factNodeId,
        matterId,
        documentId: fact.document_id,
      });
      if (!fact.evidence_id) continue;
      const evidenceNodeId = await this.findNodeId(client, tenantId, 'evidence', fact.evidence_id);
      if (!evidenceNodeId) continue;
      await this.upsertEdge(client, tenantId, {
        edgeType: 'EVIDENCED_BY',
        sourceNodeId: factNodeId,
        targetNodeId: evidenceNodeId,
        matterId,
        documentId: fact.document_id,
      });
    }
  }

  private async syncAiClaimFacts(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    matterNodeId: string,
  ): Promise<void> {
    const claimRows = await this.listAiClaimFacts(client, tenantId, matterId);
    for (const claim of claimRows) {
      const factNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'fact',
        sourceTable: 'ai_claims',
        sourceId: claim.claim_id,
        matterId,
        documentId: claim.document_id,
        versionId: claim.version_id,
        sourceHash: hashParts(
          'ai-claim',
          claim.claim_id,
          claim.claim_hash,
          claim.kind,
          claim.verification_status,
          claim.is_legal_conclusion ? 'legal' : 'grounded',
        ),
        provenance: 'ai_proposed',
        reviewStatus: 'proposed',
        createdByKind: 'ai',
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_FACT',
        sourceNodeId: matterNodeId,
        targetNodeId: factNodeId,
        matterId,
        documentId: claim.document_id,
      });
      const versionNodeId = await this.findNodeId(client, tenantId, 'version', claim.version_id);
      if (!versionNodeId) continue;
      await this.upsertEdge(client, tenantId, {
        edgeType: 'CITES',
        sourceNodeId: factNodeId,
        targetNodeId: versionNodeId,
        matterId,
        documentId: claim.document_id,
      });
    }
  }

  private async syncLitigationIssues(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    matterNodeId: string,
  ): Promise<void> {
    const issueRows = await this.listLitigationIssues(client, tenantId, matterId);
    for (const issue of issueRows) {
      const issueNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'issue',
        sourceTable: 'litigation_issue_nodes',
        sourceId: issue.issue_id,
        matterId,
        documentId: null,
        versionId: null,
        sourceHash: hashParts('litigation-issue', issue.issue_id, issue.issue_type, issue.status),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_ISSUE',
        sourceNodeId: matterNodeId,
        targetNodeId: issueNodeId,
        matterId,
        documentId: null,
      });
      if (!issue.parent_issue_id) continue;
      const parentNodeId = await this.findNodeId(client, tenantId, 'issue', issue.parent_issue_id);
      if (!parentNodeId) continue;
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_SUB_ISSUE',
        sourceNodeId: parentNodeId,
        targetNodeId: issueNodeId,
        matterId,
        documentId: null,
      });
    }
  }

  private async syncDdRfis(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const rfiRows = await this.listDdRfis(client, tenantId, matterId);
    for (const rfi of rfiRows) {
      await this.upsertNode(client, tenantId, {
        nodeType: 'rfi',
        sourceTable: 'dd_rfis',
        sourceId: rfi.rfi_id,
        matterId,
        documentId: null,
        versionId: null,
        sourceHash: hashParts('rfi', rfi.rfi_id, rfi.status, rfi.priority),
      });
    }
  }

  private async syncDdIssues(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    matterNodeId: string,
  ): Promise<void> {
    const issueRows = await this.listDdIssues(client, tenantId, matterId);
    for (const issue of issueRows) {
      const issueNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'issue',
        sourceTable: 'dd_issues',
        sourceId: issue.issue_id,
        matterId,
        documentId: issue.document_id,
        versionId: null,
        sourceHash: hashParts('dd-issue', issue.issue_id, issue.status, issue.severity),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_ISSUE',
        sourceNodeId: matterNodeId,
        targetNodeId: issueNodeId,
        matterId,
        documentId: issue.document_id,
      });
      if (!issue.rfi_id) continue;
      const rfiNodeId = await this.findNodeId(client, tenantId, 'rfi', issue.rfi_id);
      if (!rfiNodeId) continue;
      await this.upsertEdge(client, tenantId, {
        edgeType: 'REQUIRES_ACTION',
        sourceNodeId: issueNodeId,
        targetNodeId: rfiNodeId,
        matterId,
        documentId: issue.document_id,
      });
    }
  }

  private async syncDdRisks(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    matterNodeId: string,
  ): Promise<void> {
    const riskRows = await this.listDdRisks(client, tenantId, matterId);
    for (const risk of riskRows) {
      const riskNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'risk',
        sourceTable: 'dd_risks',
        sourceId: risk.risk_id,
        matterId,
        documentId: null,
        versionId: null,
        sourceHash: hashParts(
          'dd-risk',
          risk.risk_id,
          risk.issue_id,
          risk.status,
          risk.severity,
          risk.likelihood,
        ),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_RISK',
        sourceNodeId: matterNodeId,
        targetNodeId: riskNodeId,
        matterId,
        documentId: null,
      });
    }
  }

  private async syncParties(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    matterNodeId: string,
  ): Promise<void> {
    const partyRows = await this.listParties(client, tenantId, matterId);
    for (const party of partyRows) {
      const partyNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'party',
        sourceTable: 'parties',
        sourceId: party.party_id,
        matterId,
        documentId: null,
        versionId: null,
        sourceHash: hashParts(
          'party',
          party.party_id,
          party.party_type,
          party.party_role,
          party.related_client_id,
        ),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_PARTY',
        sourceNodeId: matterNodeId,
        targetNodeId: partyNodeId,
        matterId,
        documentId: null,
      });
    }
  }

  private async syncNegotiationPositions(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const positionRows = await this.listNegotiationPositions(client, tenantId, matterId);
    for (const position of positionRows) {
      const partyNodeId = await this.findNodeId(client, tenantId, 'party', position.party_id);
      if (!partyNodeId) continue;
      const positionNodeId = await this.upsertNode(client, tenantId, {
        nodeType: 'negotiation_position',
        sourceTable: 'negotiation_positions',
        sourceId: position.position_id,
        matterId,
        documentId: position.source_document_id,
        versionId: position.source_version_id,
        sourceHash: hashParts(
          'negotiation-position',
          position.position_id,
          position.party_id,
          position.clause_kind,
          String(position.round_no),
          position.source_clause_id,
          position.position_summary_hash,
        ),
      });
      await this.upsertEdge(client, tenantId, {
        edgeType: 'HAS_POSITION',
        sourceNodeId: partyNodeId,
        targetNodeId: positionNodeId,
        matterId,
        documentId: position.source_document_id,
      });
    }
  }

  private async listLitigationEvidence(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<LitigationEvidenceSourceRow[]> {
    const result = await client.query<LitigationEvidenceSourceRow>(
      `
        SELECT evidence_id, document_id, version_id, source_hash, custody_status, admitted_status
        FROM litigation_evidence_items
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY evidence_code, evidence_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listLitigationFacts(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<LitigationFactSourceRow[]> {
    const result = await client.query<LitigationFactSourceRow>(
      `
        SELECT lf.fact_id, lf.evidence_id, le.document_id, le.version_id,
          lf.status, lf.materiality, lf.fact_date::text AS fact_date
        FROM litigation_facts lf
        LEFT JOIN litigation_evidence_items le
          ON le.tenant_id = lf.tenant_id
         AND le.evidence_id = lf.evidence_id
        WHERE lf.tenant_id = $1
          AND lf.matter_id = $2
        ORDER BY lf.fact_code, lf.fact_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listAiClaimFacts(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<AiClaimFactSourceRow[]> {
    const result = await client.query<AiClaimFactSourceRow>(
      `
        SELECT DISTINCT ON (c.claim_id)
          c.claim_id, s.matter_id, cc.document_id, cc.version_id,
          c.claim_hash, c.kind, c.verification_status, c.is_legal_conclusion
        FROM ai_claims c
        JOIN ai_sessions s
          ON s.tenant_id = c.tenant_id
         AND s.ai_session_id = c.ai_session_id
        JOIN ai_claim_citations cc
          ON cc.tenant_id = c.tenant_id
         AND cc.claim_id = c.claim_id
        JOIN documents d
          ON d.tenant_id = cc.tenant_id
         AND d.document_id = cc.document_id
        JOIN document_versions dv
          ON dv.tenant_id = cc.tenant_id
         AND dv.version_id = cc.version_id
         AND dv.document_id = cc.document_id
        WHERE c.tenant_id = $1
          AND s.matter_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        ORDER BY c.claim_id, cc.source_ref ASC
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listLitigationIssues(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<LitigationIssueSourceRow[]> {
    const result = await client.query<LitigationIssueSourceRow>(
      `
        SELECT issue_id, parent_issue_id, issue_type, status
        FROM litigation_issue_nodes
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY position, issue_code, issue_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listDdRfis(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<DdRfiSourceRow[]> {
    const result = await client.query<DdRfiSourceRow>(
      `
        SELECT rfi_id, status, priority
        FROM dd_rfis
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY rfi_code, rfi_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listDdIssues(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<DdIssueSourceRow[]> {
    const result = await client.query<DdIssueSourceRow>(
      `
        SELECT issue_id, rfi_id, document_id, severity, status
        FROM dd_issues
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY issue_code, issue_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listDdRisks(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<DdRiskSourceRow[]> {
    const result = await client.query<DdRiskSourceRow>(
      `
        SELECT risk_id, issue_id, severity, likelihood, status
        FROM dd_risks
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY risk_code, risk_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listParties(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<PartySourceRow[]> {
    const result = await client.query<PartySourceRow>(
      `
        SELECT party_id, party_type, party_role, related_client_id
        FROM parties
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY party_role, party_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async listNegotiationPositions(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<NegotiationPositionSourceRow[]> {
    const result = await client.query<NegotiationPositionSourceRow>(
      `
        SELECT position_id, party_id, source_document_id, source_version_id,
          source_clause_id, clause_kind, position_summary_hash, round_no
        FROM negotiation_positions
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY party_id, round_no, position_id
      `,
      [tenantId, matterId],
    );
    return result.rows;
  }

  private async findOptionalDocumentNode(
    client: PoolClient,
    tenantId: string,
    documentId: string | null,
  ): Promise<string | null> {
    if (!documentId) return null;
    return this.findNodeId(client, tenantId, 'document', documentId);
  }

  private async upsertNode(
    client: PoolClient,
    tenantId: string,
    input: GraphNodeInput,
  ): Promise<string> {
    const provenance = input.provenance ?? 'derived';
    const reviewStatus = input.reviewStatus ?? 'confirmed';
    const createdByKind = input.createdByKind ?? 'system';
    const result = await client.query<{ node_id: string }>(
      `
        INSERT INTO graph_nodes (
          tenant_id, node_type, source_table, source_id, matter_id, document_id,
          version_id, source_hash, provenance, review_status, created_by_kind,
          stale, synced_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, now(), now())
        ON CONFLICT (tenant_id, node_type, source_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          document_id = EXCLUDED.document_id,
          version_id = EXCLUDED.version_id,
          source_hash = EXCLUDED.source_hash,
          provenance = CASE
            WHEN graph_nodes.source_table = 'ai_claims'
              AND graph_nodes.provenance = 'human_confirmed'
              AND EXCLUDED.provenance = 'ai_proposed'
              THEN graph_nodes.provenance
            ELSE EXCLUDED.provenance
          END,
          review_status = CASE
            WHEN graph_nodes.source_table = 'ai_claims'
              AND graph_nodes.provenance = 'human_confirmed'
              AND EXCLUDED.provenance = 'ai_proposed'
              THEN graph_nodes.review_status
            ELSE EXCLUDED.review_status
          END,
          created_by_kind = CASE
            WHEN graph_nodes.source_table = 'ai_claims'
              AND graph_nodes.provenance = 'human_confirmed'
              AND EXCLUDED.provenance = 'ai_proposed'
              THEN graph_nodes.created_by_kind
            ELSE EXCLUDED.created_by_kind
          END,
          stale = false,
          synced_at = EXCLUDED.synced_at,
          updated_at = EXCLUDED.updated_at
        RETURNING node_id
      `,
      [
        tenantId,
        input.nodeType,
        input.sourceTable,
        input.sourceId,
        input.matterId,
        input.documentId,
        input.versionId,
        input.sourceHash,
        provenance,
        reviewStatus,
        createdByKind,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('graph node upsert returned no row');
    return row.node_id;
  }

  private async openGraphFactReviewWorkItems(
    client: PoolClient,
    tenantId: string,
    matterId: string,
    auditEventId: string,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, assigned_to_user_id, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          gn.tenant_id, 'ai_prep', 'graph_fact_review', 'graph_node', gn.node_id,
          gn.matter_id, gn.document_id, 'open', 'user', s.actor_id,
          now() + interval '2 days', s.actor_id, $3, $3
        FROM graph_nodes gn
        JOIN ai_claims c
          ON c.tenant_id = gn.tenant_id
         AND c.claim_id = gn.source_id
        JOIN ai_sessions s
          ON s.tenant_id = c.tenant_id
         AND s.ai_session_id = c.ai_session_id
        WHERE gn.tenant_id = $1
          AND gn.matter_id = $2
          AND gn.node_type = 'fact'
          AND gn.source_table = 'ai_claims'
          AND gn.provenance = 'ai_proposed'
          AND gn.review_status = 'proposed'
          AND gn.stale = false
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          assigned_to_user_id = EXCLUDED.assigned_to_user_id,
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
      `,
      [tenantId, matterId, auditEventId],
    );
  }

  private async findReviewableFactNode(
    client: PoolClient,
    tenantId: string,
    nodeId: string,
  ): Promise<GraphFactReviewNodeRow | null> {
    const result = await client.query<GraphFactReviewNodeRow>(
      `
        SELECT node_id, source_id, matter_id, provenance, review_status, created_by_kind, stale
        FROM graph_nodes
        WHERE tenant_id = $1
          AND node_id = $2
          AND node_type = 'fact'
          AND source_table = 'ai_claims'
        LIMIT 1
      `,
      [tenantId, nodeId],
    );
    return result.rows[0] ?? null;
  }

  private async completeGraphFactReviewWork(
    client: PoolClient,
    tenantId: string,
    nodeId: string,
    actorUserId: string | null,
    auditEventId: string,
  ): Promise<void> {
    if (!actorUserId) throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    await client.query(
      `
        UPDATE work_items
        SET status = 'completed',
          completed_by = $3,
          completed_at = now(),
          last_audit_event_id = $4,
          updated_at = now()
        WHERE tenant_id = $1
          AND source = 'ai_prep'
          AND kind = 'graph_fact_review'
          AND target_type = 'graph_node'
          AND target_id = $2
          AND status IN ('open', 'in_progress')
      `,
      [tenantId, nodeId, actorUserId, auditEventId],
    );
  }

  private async assertCanEditMatter(ctx: GraphSyncContext, matterId: string): Promise<void> {
    if (!ctx.userId) throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    let decision: Awaited<ReturnType<PermissionService['canEditMatter']>> | undefined;
    try {
      decision = await this.permissionService.canEditMatter(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        matterId,
      );
    } catch {
      this.logger.warn({ code: 'GRAPH_FACT_REVIEW_PERMISSION_ERROR', matterId });
    }
    if (decision?.effect !== 'ALLOW') throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }

  private async findNodeId(
    client: PoolClient,
    tenantId: string,
    nodeType: GraphNodeType,
    sourceId: string,
  ): Promise<string | null> {
    const result = await client.query<{ node_id: string }>(
      `
        SELECT node_id
        FROM graph_nodes
        WHERE tenant_id = $1
          AND node_type = $2
          AND source_id = $3
          AND stale = false
        LIMIT 1
      `,
      [tenantId, nodeType, sourceId],
    );
    return result.rows[0]?.node_id ?? null;
  }

  private async upsertEdge(
    client: PoolClient,
    tenantId: string,
    input: GraphEdgeInput,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO graph_edges (
          tenant_id, edge_type, source_node_id, target_node_id, matter_id,
          document_id, source_hash, stale, synced_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, now(), now())
        ON CONFLICT (tenant_id, edge_type, source_node_id, target_node_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          document_id = EXCLUDED.document_id,
          source_hash = EXCLUDED.source_hash,
          stale = false,
          synced_at = EXCLUDED.synced_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        tenantId,
        input.edgeType,
        input.sourceNodeId,
        input.targetNodeId,
        input.matterId,
        input.documentId,
        sha256Hex(`${input.edgeType}:${input.sourceNodeId}:${input.targetNodeId}`),
      ],
    );
  }

  private async countActiveAndStale(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<{
    nodeCount: number;
    edgeCount: number;
    staleNodeCount: number;
    staleEdgeCount: number;
  }> {
    const result = await client.query<{
      active_nodes: string;
      active_edges: string;
      stale_nodes: string;
      stale_edges: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM graph_nodes WHERE tenant_id = $1 AND matter_id = $2 AND stale = false)::text AS active_nodes,
          (SELECT count(*) FROM graph_edges WHERE tenant_id = $1 AND matter_id = $2 AND stale = false)::text AS active_edges,
          (SELECT count(*) FROM graph_nodes WHERE tenant_id = $1 AND matter_id = $2 AND stale = true)::text AS stale_nodes,
          (SELECT count(*) FROM graph_edges WHERE tenant_id = $1 AND matter_id = $2 AND stale = true)::text AS stale_edges
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    return {
      nodeCount: Number(row?.active_nodes ?? 0),
      edgeCount: Number(row?.active_edges ?? 0),
      staleNodeCount: Number(row?.stale_nodes ?? 0),
      staleEdgeCount: Number(row?.stale_edges ?? 0),
    };
  }
}
