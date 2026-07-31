import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type {
  AiSummaryResponseDto,
  ContractProcessResponseDto,
  GraphConsistencyResponseDto,
  GraphFactsResponseDto,
  GraphNeighborhoodResponseDto,
  GraphNodeReviewResponseDto,
  GraphSyncResponseDto,
} from '../../packages/shared/src';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { GraphSyncOutboxWorker } from '../../apps/api/src/modules/graph/graph-sync-outbox.worker';
import { GraphSyncService } from '../../apps/api/src/modules/graph/graph-sync.service';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import {
  addExplicitPermission,
  addMatterMember,
  addWallMembership,
  alphaFirmAdminUserId,
  alphaMemberUserId,
  alphaOwnerUserId,
  createEthicalWall,
  insertSearchIndexedRow,
  seedSemanticChunksForVersion,
  setDocumentAiAllowed,
} from './search-permission/search-fixtures';
import { loginSearchUser } from './search-permission/search-http-helpers';

interface GraphDocumentFixture {
  documentId: string;
  versionId: string;
  title: string;
  contentText: string;
}

interface F1RelationProjectionFixture {
  evidenceId: string;
  factId: string;
  litigationParentIssueId: string;
  litigationChildIssueId: string;
  rfiId: string;
  ddIssueId: string;
  ddRiskId: string;
  partyId: string;
  factSummary: string;
}

interface GraphProjectionCounts {
  activeNodeCount: number;
  activeEdgeCount: number;
  staleNodeCount: number;
  staleEdgeCount: number;
  activeSourceIds: string[];
  staleSourceIds: string[];
}

interface GraphProvenanceCounts {
  activeNodeCount: number;
  derivedNodeCount: number;
  confirmedNodeCount: number;
  systemNodeCount: number;
}

interface AiClaimFactFixture {
  claimId: string;
  claimText: string;
}

interface AiClaimGraphSnapshot {
  node_id: string;
  source_table: string;
  provenance: string;
  review_status: string | null;
  stale: boolean;
  edge_types: string[];
}

interface QueryableClient {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
}

describe('knowledge graph integration', () => {
  const marker = `graph-${randomUUID()}`;
  const clientId = randomUUID();
  const matterId = randomUUID();
  const wallMatterId = randomUUID();
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let adminCookie: string;
  let memberCookie: string;
  let visible: GraphDocumentFixture;
  let explicitDenied: GraphDocumentFixture;
  let deletedAfterSync: GraphDocumentFixture;
  let wallDenied: GraphDocumentFixture;

  beforeAll(async () => {
    visible = await insertGraphDocument({
      clientId,
      matterId,
      title: `${marker} Visible Contract`,
      contentText: `${marker} visible graph relationship covenant`,
      index: 1101,
    });
    explicitDenied = await insertGraphDocument({
      clientId,
      matterId,
      title: `${marker} Denied Contract`,
      contentText: `${marker} denied graph relationship covenant`,
      index: 1102,
    });
    deletedAfterSync = await insertGraphDocument({
      clientId,
      matterId,
      title: `${marker} Deleted Contract`,
      contentText: `${marker} deleted graph relationship covenant`,
      index: 1103,
    });
    wallDenied = await insertGraphDocument({
      clientId,
      matterId: wallMatterId,
      title: `${marker} Wall Contract`,
      contentText: `${marker} wall graph relationship covenant`,
      index: 1104,
    });

    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId,
      userId: alphaMemberUserId,
      matterRole: 'member',
      accessLevel: 'read',
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: wallMatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    await addExplicitPermission({
      tenantId: tenantAlphaId,
      resourceType: 'document',
      resourceId: explicitDenied.documentId,
      subjectId: alphaOwnerUserId,
      effect: 'DENY',
    });
    const wallId = await createEthicalWall({
      tenantId: tenantAlphaId,
      matterId: wallMatterId,
      createdBy: alphaFirmAdminUserId,
    });
    await addWallMembership({
      tenantId: tenantAlphaId,
      wallId,
      subjectId: alphaOwnerUserId,
      membershipType: 'excluded',
      createdBy: alphaFirmAdminUserId,
    });
    await enableAiPolicyForMatter(matterId);
    await ensureFreshMatterAppSyncState();

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
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('syncs RDB graph nodes idempotently and stales deleted documents without hard delete', async () => {
    const first = await syncMatter(matterId);
    expect(first.status).toBe('success');
    expect(first.nodeCount).toBeGreaterThan(0);
    expect(first.edgeCount).toBeGreaterThan(0);

    await markDocumentDeleted(deletedAfterSync.documentId);
    const second = await syncMatter(matterId);
    expect(second.status).toBe('success');
    expect(second.nodeCount).toBeGreaterThan(0);
    expect(second.edgeCount).toBeGreaterThan(0);
    expect(second.staleNodeCount + second.staleEdgeCount).toBeGreaterThan(0);
    const provenanceCounts = await graphProvenanceCounts(matterId);
    expect(provenanceCounts).toMatchObject({
      activeNodeCount: second.nodeCount,
      derivedNodeCount: second.nodeCount,
      confirmedNodeCount: second.nodeCount,
      systemNodeCount: second.nodeCount,
    });
    await expect(insertAiProposedGraphNodeWithoutReviewStatus(matterId, visible)).rejects.toThrow(
      /graph_nodes_ai_proposed_review_status_check/u,
    );

    const syncAudit = await latestGraphAudit(matterId, 'GRAPH_SYNCED');
    expect(syncAudit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        node_count: second.nodeCount,
        edge_count: second.edgeCount,
      },
    });
    expect(JSON.stringify(syncAudit?.metadata_json)).not.toContain(marker);
  });

  it('projects relation-table facts, issues, rfis, risks, and parties into the F1 graph taxonomy', async () => {
    const projection = await seedF1RelationRows({
      matterId,
      documentId: visible.documentId,
      versionId: visible.versionId,
    });

    const sync = await syncMatter(matterId);
    expect(sync.nodeCount).toBeGreaterThan(0);
    expect(sync.edgeCount).toBeGreaterThan(0);

    const snapshot = await graphProjectionSnapshot(projection);
    expect(snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_type: 'evidence',
          source_table: 'litigation_evidence_items',
        }),
        expect.objectContaining({ node_type: 'fact', source_table: 'litigation_facts' }),
        expect.objectContaining({ node_type: 'issue', source_table: 'litigation_issue_nodes' }),
        expect.objectContaining({ node_type: 'issue', source_table: 'dd_issues' }),
        expect.objectContaining({ node_type: 'risk', source_table: 'dd_risks' }),
        expect.objectContaining({ node_type: 'rfi', source_table: 'dd_rfis' }),
        expect.objectContaining({ node_type: 'party', source_table: 'parties' }),
      ]),
    );
    expect(snapshot.edgeTypes).toEqual(
      expect.arrayContaining([
        'HAS_FACT',
        'EVIDENCED_BY',
        'HAS_ISSUE',
        'HAS_SUB_ISSUE',
        'REQUIRES_ACTION',
        'HAS_RISK',
        'HAS_PARTY',
      ]),
    );

    const facts = await listFacts(matterId);
    const visibleF1Edges = facts.facts
      .filter(
        (fact) =>
          fact.source.sourceId === projection.factId ||
          fact.target.sourceId === projection.factId ||
          fact.source.sourceId === projection.evidenceId ||
          fact.target.sourceId === projection.evidenceId,
      )
      .map((fact) => fact.edgeType);
    expect(visibleF1Edges).toEqual(expect.arrayContaining(['HAS_FACT', 'EVIDENCED_BY']));
    expect(JSON.stringify(facts)).not.toContain(projection.factSummary);

    const firstCounts = await graphProjectionCounts(projection);
    expect(firstCounts.activeNodeCount).toBe(8);
    expect(firstCounts.staleNodeCount).toBe(0);
    expect(firstCounts.activeEdgeCount).toBeGreaterThanOrEqual(7);

    const betaRlsCounts = await graphProjectionCounts(projection, tenantBetaId, true);
    expect(betaRlsCounts).toMatchObject({
      activeNodeCount: 0,
      activeEdgeCount: 0,
      staleNodeCount: 0,
      staleEdgeCount: 0,
    });

    await syncMatter(matterId);
    await expect(graphProjectionCounts(projection)).resolves.toEqual(firstCounts);

    await deleteF1FactRow(projection.factId);
    await syncMatter(matterId);
    const staleCounts = await graphProjectionCounts(projection);
    expect(staleCounts.activeNodeCount).toBe(firstCounts.activeNodeCount - 1);
    expect(staleCounts.staleNodeCount).toBeGreaterThanOrEqual(1);
    expect(staleCounts.activeSourceIds).not.toContain(projection.factId);
    expect(staleCounts.staleSourceIds).toContain(projection.factId);
    expect(staleCounts.staleEdgeCount).toBeGreaterThanOrEqual(2);
  });

  it('projects negotiation positions as party-linked graph nodes', async () => {
    const projection = await seedF1RelationRows({
      matterId,
      documentId: visible.documentId,
      versionId: visible.versionId,
    });
    const positionId = await seedNegotiationPosition({
      matterId,
      partyId: projection.partyId,
      documentId: visible.documentId,
      versionId: visible.versionId,
    });

    await syncMatter(matterId);
    const snapshot = await negotiationPositionGraphSnapshot(positionId);
    expect(snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_type: 'negotiation_position',
          source_table: 'negotiation_positions',
          source_id: positionId,
        }),
      ]),
    );
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edge_type: 'HAS_POSITION',
          source_node_type: 'party',
          target_node_type: 'negotiation_position',
        }),
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toContain('counterparty asked');
  });

  it('queries permission-scoped graph neighborhoods with depth bounds and cursors', async () => {
    await seedF1RelationRows({
      matterId,
      documentId: visible.documentId,
      versionId: visible.versionId,
    });
    await syncMatter(matterId);
    const rootNodeId = await graphNodeIdForSource(matterId, 'matter');

    const depthOne = await listNeighborhood(rootNodeId, {
      depth: 1,
      edgeTypes: 'HAS_ISSUE,REQUIRES_ACTION',
    });
    expect(depthOne.edges.map((edge) => edge.edgeType)).toContain('HAS_ISSUE');
    expect(depthOne.edges.map((edge) => edge.edgeType)).not.toContain('REQUIRES_ACTION');

    const depthThree = await listNeighborhood(rootNodeId, {
      depth: 3,
      edgeTypes: 'HAS_ISSUE,REQUIRES_ACTION',
    });
    expect(depthThree.edges.map((edge) => edge.edgeType)).toEqual(
      expect.arrayContaining(['HAS_ISSUE', 'REQUIRES_ACTION']),
    );
    expect(depthThree.paths.some((path) => path.edgeIds.length >= 2)).toBe(true);
    expect(JSON.stringify(depthThree)).not.toContain(visible.contentText);

    const firstPage = await listNeighborhood(rootNodeId, { depth: 3, limit: 1 });
    expect(firstPage.edges).toHaveLength(1);
    expect(firstPage.nextCursor).toBe('1');
    const secondPage = await listNeighborhood(rootNodeId, { depth: 3, limit: 1, cursor: 1 });
    expect(secondPage.edges[0]?.edgeId).not.toBe(firstPage.edges[0]?.edgeId);

    const invalidDepth = await fetch(
      `${baseUrl}/v1/graph/neighborhood?nodeId=${rootNodeId}&depth=4`,
      { headers: { cookie: ownerCookie } },
    );
    const invalidBody = await invalidDepth.text();
    expect(invalidDepth.status, invalidBody).toBe(400);

    await syncMatter(wallMatterId);
    const wallRootNodeId = await graphNodeIdForSource(wallMatterId, 'matter');
    const denied = await fetch(
      `${baseUrl}/v1/graph/neighborhood?nodeId=${wallRootNodeId}&depth=1`,
      { headers: { cookie: ownerCookie } },
    );
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).not.toContain(wallDenied.documentId);
    expect(deniedBody).not.toContain(wallDenied.contentText);
  });

  it('projects contract clauses and defined terms as legal graph nodes aligned with text chunks', async () => {
    const contract = await insertGraphContractDocument({
      clientId,
      matterId,
      title: `${marker} Korean Clause Contract`,
      contentText: `제 1 조 정의
"Confidential Information" means all non-public information.

제 2 조 비밀유지
"Confidential Information" means marked information only.`,
      index: 1105,
    });
    const processed = await processContractDocument(contract.documentId);
    expect(processed.clauseCount).toBe(2);
    expect(processed.definedTermCount).toBe(2);

    await syncMatter(matterId);
    const snapshot = await contractClauseGraphSnapshot(contract.versionId);
    expect(snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_type: 'text_chunk', source_table: 'document_chunks' }),
        expect.objectContaining({ node_type: 'clause', source_table: 'contract_clauses' }),
        expect.objectContaining({ node_type: 'defined_term', source_table: 'contract_defined_terms' }),
      ]),
    );
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edge_type: 'HAS_CLAUSE',
          source_node_type: 'version',
          target_node_type: 'text_chunk',
        }),
        expect.objectContaining({
          edge_type: 'CONTAINS_CLAUSE',
          source_node_type: 'version',
          target_node_type: 'clause',
        }),
        expect.objectContaining({
          edge_type: 'DEFINES',
          source_node_type: 'version',
          target_node_type: 'defined_term',
        }),
        expect.objectContaining({
          edge_type: 'ALIGNED_WITH',
          source_node_type: 'clause',
          target_node_type: 'text_chunk',
        }),
      ]),
    );
    expect(snapshot.alignedClauseChunkCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(snapshot)).not.toContain('non-public information');
    expect(JSON.stringify(snapshot)).not.toContain('marked information');
  });

  it('projects AI claims into proposed fact review work and confirms through the graph review API', async () => {
    const claim = await seedAiClaimFact({
      matterId,
      documentId: visible.documentId,
      versionId: visible.versionId,
      claimText: `${marker} 매수인은 잔금을 지급했다.`,
    });

    await syncMatter(matterId);
    const snapshot = await aiClaimGraphSnapshot(claim.claimId);
    expect(snapshot).toMatchObject({
      source_table: 'ai_claims',
      provenance: 'ai_proposed',
      review_status: 'proposed',
      stale: false,
    });
    expect(snapshot.edge_types).toEqual(expect.arrayContaining(['HAS_FACT', 'CITES']));

    const reviewWork = await graphFactReviewWork(snapshot.node_id);
    expect(reviewWork).toMatchObject({
      kind: 'graph_fact_review',
      target_id: snapshot.node_id,
      status: 'open',
    });

    const denied = await fetch(`${baseUrl}/v1/graph/nodes/${snapshot.node_id}/review`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);

    const confirmed = await reviewFactNode(snapshot.node_id, 'confirm');
    expect(confirmed).toMatchObject({
      nodeId: snapshot.node_id,
      matterId,
      action: 'confirm',
      provenance: 'human_confirmed',
      reviewStatus: 'confirmed',
      stale: false,
    });
    const confirmedSnapshot = await aiClaimGraphSnapshot(claim.claimId);
    expect(confirmedSnapshot).toMatchObject({
      provenance: 'human_confirmed',
      review_status: 'confirmed',
      stale: false,
    });
    await expect(graphFactReviewWork(snapshot.node_id)).resolves.toMatchObject({
      status: 'completed',
    });

    const audit = await latestGraphAudit(matterId, 'FACT_CONFIRMED');
    expect(audit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        fact_id: claim.claimId,
        status_after: 'confirmed',
      },
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(claim.claimText);

    await syncMatter(matterId);
    const resyncedSnapshot = await aiClaimGraphSnapshot(claim.claimId);
    expect(resyncedSnapshot).toMatchObject({
      provenance: 'human_confirmed',
      review_status: 'confirmed',
      stale: false,
    });
    await expect(graphFactReviewWork(snapshot.node_id)).resolves.toMatchObject({
      status: 'completed',
    });
  });

  it('injects matter, document, and wall permission before graph traversal', async () => {
    await syncMatter(wallMatterId);

    const facts = await listFacts(matterId);
    const rawFacts = JSON.stringify(facts);
    expect(facts.facts.length).toBeGreaterThan(0);
    expect(rawFacts).toContain(visible.documentId);
    expect(rawFacts).not.toContain(explicitDenied.documentId);
    expect(rawFacts).not.toContain(deletedAfterSync.documentId);
    expect(rawFacts).not.toContain(explicitDenied.title);
    expect(rawFacts).not.toContain(deletedAfterSync.contentText);
    expect(
      facts.facts.map((fact: GraphFactsResponseDto['facts'][number]) => fact.edgeType),
    ).toContain('HAS_CLAUSE');

    const denied = await fetch(`${baseUrl}/v1/graph/facts?matterId=${wallMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).not.toContain(wallDenied.documentId);
    expect(deniedBody).not.toContain(wallDenied.contentText);

    const queryAudit = await latestGraphAudit(matterId, 'GRAPH_QUERY_EXECUTED');
    expect(queryAudit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        graph_scope: 'graph_query',
      },
    });
    const filterRefs = String(queryAudit?.metadata_json?.filter_refs);
    expect(filterRefs).toContain('matter.read');
    expect(filterRefs).toContain('document.read');
    expect(filterRefs).toContain('document.status:not_deleted');
  });

  it('reports consistency drift by ids only and audits the check', async () => {
    const consistency = await checkConsistency(matterId);
    expect(consistency).toMatchObject({
      matterId,
      status: 'consistent',
      driftCount: 0,
      drifts: [],
    });

    const audit = await latestGraphAudit(matterId, 'GRAPH_CONSISTENCY_CHECKED');
    expect(audit).toMatchObject({
      result: 'success',
      metadata_json: {
        matter_id: matterId,
        consistency_status: 'consistent',
        drift_count: 0,
      },
    });
    expect(JSON.stringify(consistency)).not.toContain(visible.title);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(visible.contentText);
  });

  it('derives supersedes edges and reports deterministic legal graph conflicts by ids only', async () => {
    const f10ClientId = randomUUID();
    const f10MatterId = randomUUID();
    const chain = await insertGraphDocument({
      clientId: f10ClientId,
      matterId: f10MatterId,
      title: `${marker} F10 Supersedes Chain`,
      contentText: `${marker} supersedes chain fixture`,
      index: 2101,
    });
    await addMatterMember({
      tenantId: tenantAlphaId,
      matterId: f10MatterId,
      userId: alphaOwnerUserId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
    const lineage = await addSupersedingVersions({ matterId: f10MatterId, document: chain, index: 2102 });
    const broken = await insertGraphDocument({
      clientId: f10ClientId,
      matterId: f10MatterId,
      title: `${marker} F10 Broken Lineage`,
      contentText: `${marker} broken lineage fixture`,
      index: 2103,
      versionNo: 3,
    });
    const contractA = await insertGraphContractDocument({
      clientId: f10ClientId,
      matterId: f10MatterId,
      title: `${marker} F10 Contract A`,
      contentText: `제 1 조 정의
"Confidential Information" means source financial records only.

제 2 조 목적
The parties keep the defined materials controlled.`,
      index: 2104,
    });
    const contractB = await insertGraphContractDocument({
      clientId: f10ClientId,
      matterId: f10MatterId,
      title: `${marker} F10 Contract B`,
      contentText: `제 1 조 정의
"Confidential Information" means technical security reports only.

제 2 조 목적
The parties keep the defined materials controlled.`,
      index: 2105,
    });
    const processedA = await processContractDocument(contractA.documentId);
    const processedB = await processContractDocument(contractB.documentId);
    expect(processedA.definedTermCount).toBeGreaterThan(0);
    expect(processedB.definedTermCount).toBeGreaterThan(0);
    const evidenceGap = await insertVerifiedFactWithoutEvidence({ matterId: f10MatterId });

    await syncMatter(f10MatterId);
    await expect(
      supersedesEdgePairs([chain.versionId, lineage.secondVersionId, lineage.thirdVersionId]),
    ).resolves.toEqual(
      expect.arrayContaining([
        { source_id: lineage.secondVersionId, target_id: chain.versionId },
        { source_id: lineage.thirdVersionId, target_id: lineage.secondVersionId },
      ]),
    );

    const consistency = await checkConsistency(f10MatterId);
    expect(consistency.status).toBe('drift_detected');
    const lineageDrift = consistency.drifts.find(
      (drift) =>
        drift.kind === 'version_lineage_conflict' && drift.sourceVersionId === broken.versionId,
    );
    const termDrift = consistency.drifts.find(
      (drift) =>
        drift.kind === 'defined_term_mismatch' && drift.termKey === 'confidential information',
    );
    const gapDrift = consistency.drifts.find(
      (drift) => drift.kind === 'evidence_gap' && drift.factId === evidenceGap.factId,
    );
    expect(lineageDrift).toMatchObject({
      documentId: broken.documentId,
      versionId: broken.versionId,
      sourceVersionId: broken.versionId,
      targetVersionId: null,
    });
    expect([termDrift?.sourceVersionId, termDrift?.targetVersionId]).toEqual(
      expect.arrayContaining([contractA.versionId, contractB.versionId]),
    );
    expect(gapDrift).toMatchObject({ factId: evidenceGap.factId });
    for (const drift of [lineageDrift, termDrift, gapDrift]) {
      expect(drift).not.toHaveProperty('body');
      expect(drift).not.toHaveProperty('snippet');
      expect(drift).not.toHaveProperty('raw');
      expect(drift).not.toHaveProperty('content');
    }
    const rawConsistency = JSON.stringify(consistency);
    expect(rawConsistency).not.toContain('source financial records');
    expect(rawConsistency).not.toContain('technical security reports');
    expect(rawConsistency).not.toContain(evidenceGap.factSummary);

    const audit = await latestGraphAudit(f10MatterId, 'GRAPH_CONSISTENCY_CHECKED');
    expect(audit).toMatchObject({
      result: 'failure',
      metadata_json: {
        matter_id: f10MatterId,
        consistency_status: 'drift_detected',
        drift_count: consistency.driftCount,
      },
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(evidenceGap.factSummary);
  });

  it('adds graph facts to AI evidence only for retrieval-admitted documents', async () => {
    const summary = await postSummary({
      matterId,
      task: 'matter_summary',
      query: `${marker} visible denied graph relationship`,
      filters: { clientId },
      maxChunks: 6,
    });
    expect(summary.status).toBe('completed');
    expectNoDeniedReference(summary);

    const graphAudit = await latestGraphAudit(matterId, 'GRAPH_QUERY_EXECUTED', 'ai_evidence_pack');
    expect(graphAudit?.metadata_json).toMatchObject({
      matter_id: matterId,
      graph_scope: 'ai_evidence_pack',
    });
    expect(Number(graphAudit?.metadata_json?.result_count ?? 0)).toBeGreaterThan(0);
    expect(JSON.stringify(graphAudit?.metadata_json)).not.toContain(explicitDenied.documentId);
    expect(JSON.stringify(graphAudit?.metadata_json)).not.toContain(deletedAfterSync.documentId);
  });

  it('enqueues graph sync on document upload and completes it through a manual worker tick', async () => {
    const worker = app.get(GraphSyncOutboxWorker);
    await clearGraphOutbox();
    const uploaded = await uploadGraphPdf(`${marker}-outbox-one.pdf`);

    const pending = await latestGraphOutbox(matterId);
    expect(pending).toMatchObject({
      status: 'pending',
      reason_codes: ['document_uploaded'],
    });

    const result = await worker.runOnceForTenant(tenantAlphaId, { limit: 10 });
    expect(result).toMatchObject({
      matterCount: 1,
      syncedCount: 1,
      retryCount: 0,
      deadLetterCount: 0,
    });

    const completed = await latestGraphOutbox(matterId);
    expect(completed).toMatchObject({ status: 'completed' });
    await expect(graphNodeCountForDocument(uploaded.documentId)).resolves.toBeGreaterThan(0);
  });

  it('coalesces three same-matter upload events into one sync call in one worker tick', async () => {
    const worker = app.get(GraphSyncOutboxWorker);
    const syncSpy = vi.spyOn(app.get(GraphSyncService), 'syncMatter');
    await clearGraphOutbox();

    await uploadGraphPdf(`${marker}-coalesce-a.pdf`);
    await uploadGraphPdf(`${marker}-coalesce-b.pdf`);
    await uploadGraphPdf(`${marker}-coalesce-c.pdf`);

    const pending = await latestGraphOutbox(matterId);
    expect(pending).toMatchObject({
      status: 'pending',
      reason_codes: ['document_uploaded'],
    });

    const callCountBefore = syncSpy.mock.calls.length;
    const result = await worker.runOnceForTenant(tenantAlphaId, { limit: 10 });
    const calls = syncSpy.mock.calls.slice(callCountBefore).filter((call) => call[1] === matterId);
    expect(result).toMatchObject({
      selectedCount: 1,
      matterCount: 1,
      syncedCount: 1,
    });
    expect(calls).toHaveLength(1);
    syncSpy.mockRestore();
  });

  it('syncs graph nodes for a 100-document upload burst within the polling budget', async () => {
    const worker = app.get(GraphSyncOutboxWorker);
    await clearGraphOutbox();
    const startedAt = Date.now();
    const uploaded: Array<{ documentId: string; fileObjectId: string }> = [];

    for (let index = 0; index < 100; index += 1) {
      uploaded.push(await uploadGraphPdf(`${marker}-perf-${index}.pdf`));
    }

    const result = await worker.runOnceForTenant(tenantAlphaId, { limit: 10 });
    expect(result).toMatchObject({ matterCount: 1, syncedCount: 1 });
    await expect(graphNodeCountForDocuments(uploaded.map((document) => document.documentId))).resolves.toBe(
      uploaded.length,
    );
    expect(Date.now() - startedAt).toBeLessThan(30_000);
  }, 35_000);

  it('dead-letters failed graph sync outbox rows and records failure audit by refs only', async () => {
    const worker = app.get(GraphSyncOutboxWorker);
    const syncSpy = vi
      .spyOn(app.get(GraphSyncService), 'syncMatter')
      .mockRejectedValueOnce(new Error('forced graph sync failure'));

    await clearGraphOutbox();
    await uploadGraphPdf(`${marker}-dead-letter.pdf`);
    const result = await worker.runOnceForTenant(tenantAlphaId, { limit: 10, maxAttempts: 1 });

    expect(result).toMatchObject({
      matterCount: 1,
      syncedCount: 0,
      retryCount: 0,
      deadLetterCount: 1,
    });
    const deadLetter = await latestGraphOutbox(matterId);
    expect(deadLetter).toMatchObject({
      status: 'dead_letter',
      attempt_count: 1,
      last_error_code: 'GRAPH_SYNC_RETRY_EXHAUSTED',
    });
    const audit = await latestGraphAudit(matterId, 'GRAPH_SYNC_FAILED');
    expect(audit).toMatchObject({
      result: 'failure',
      metadata_json: {
        matter_id: matterId,
        reason_code: 'retry_exhausted',
        error_types: ['GRAPH_SYNC_FAILED'],
      },
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('forced graph sync failure');
    syncSpy.mockRestore();
  });

  async function syncMatter(targetMatterId: string): Promise<GraphSyncResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/sync`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId: targetMatterId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as GraphSyncResponseDto;
  }

  async function listFacts(targetMatterId: string): Promise<GraphFactsResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/facts?matterId=${targetMatterId}&limit=20`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as GraphFactsResponseDto;
  }

  async function listNeighborhood(
    nodeId: string,
    input: { depth?: number; edgeTypes?: string; limit?: number; cursor?: number } = {},
  ): Promise<GraphNeighborhoodResponseDto> {
    const params = new URLSearchParams({ nodeId });
    if (input.depth !== undefined) params.set('depth', String(input.depth));
    if (input.edgeTypes) params.set('edgeTypes', input.edgeTypes);
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    if (input.cursor !== undefined) params.set('cursor', String(input.cursor));
    const response = await fetch(`${baseUrl}/v1/graph/neighborhood?${params.toString()}`, {
      headers: { cookie: ownerCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as GraphNeighborhoodResponseDto;
  }

  async function checkConsistency(targetMatterId: string): Promise<GraphConsistencyResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/consistency?matterId=${targetMatterId}`, {
      headers: { cookie: adminCookie },
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    return JSON.parse(text) as GraphConsistencyResponseDto;
  }

  async function reviewFactNode(
    nodeId: string,
    action: 'confirm' | 'reject',
  ): Promise<GraphNodeReviewResponseDto> {
    const response = await fetch(`${baseUrl}/v1/graph/nodes/${nodeId}/review`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as GraphNodeReviewResponseDto;
  }

  async function postSummary(body: Record<string, unknown>): Promise<AiSummaryResponseDto> {
    const response = await fetch(`${baseUrl}/v1/ai/summaries`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as AiSummaryResponseDto;
  }

  async function processContractDocument(documentId: string): Promise<ContractProcessResponseDto> {
    const response = await fetch(`${baseUrl}/v1/contract-intel/process`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as ContractProcessResponseDto;
  }

  function expectNoDeniedReference(output: unknown): void {
    const raw = JSON.stringify(output);
    for (const denied of [explicitDenied, deletedAfterSync, wallDenied]) {
      expect(raw).not.toContain(denied.title);
      expect(raw).not.toContain(denied.documentId);
      expect(raw).not.toContain(denied.versionId);
      expect(raw).not.toContain(denied.contentText);
    }
  }

  async function uploadGraphPdf(filename: string): Promise<{ documentId: string; fileObjectId: string }> {
    const response = await fetch(`${baseUrl}/v1/matters/${matterId}/documents`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: graphUploadForm(filename),
    });
    const text = await response.text();
    expect(response.status, text).toBe(201);
    return JSON.parse(text) as { documentId: string; fileObjectId: string };
  }
});

function graphUploadForm(filename: string): FormData {
  const form = new FormData();
  const payload = Buffer.from(`%PDF graph outbox fixture ${filename} ${randomUUID()}`);
  form.append('title', `Graph Upload ${randomUUID()}`);
  form.append('file', new Blob([payload], { type: 'application/pdf' }), filename);
  return form;
}

async function insertGraphDocument(input: {
  clientId: string;
  matterId: string;
  title: string;
  contentText: string;
  index: number;
  versionNo?: number;
  versionStatus?: 'current' | 'superseded';
  supersedesVersionId?: string | null;
}): Promise<GraphDocumentFixture> {
  const documentId = randomUUID();
  const versionId = randomUUID();
  await insertSearchIndexedRow(
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: input.clientId,
      matterId: input.matterId,
      documentId,
      versionId,
      title: input.title,
      contentText: input.contentText,
      documentType: 'contract',
      documentStatus: 'draft',
      versionNo: input.versionNo,
      versionStatus: input.versionStatus ?? 'current',
      supersedesVersionId: input.supersedesVersionId,
      updatedAt: '2026-06-27T00:00:00.000Z',
    },
    input.index,
  );
  await seedSemanticChunksForVersion({
    tenantId: tenantAlphaId,
    documentId,
    versionId,
    contentText: input.contentText,
  });
  await setDocumentAiAllowed({ tenantId: tenantAlphaId, documentId, aiAllowed: true });
  return { documentId, versionId, title: input.title, contentText: input.contentText };
}

async function seedAiClaimFact(input: {
  matterId: string;
  documentId: string;
  versionId: string;
  claimText: string;
}): Promise<AiClaimFactFixture> {
  const sessionId = randomUUID();
  const claimId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await setTenant(client, tenantAlphaId);
      await client.query(
        'SET CONSTRAINTS ai_claims_require_citation_after_claim, ai_claims_require_citation_after_citation DEFERRED',
      );
      const chunk = await client.query<{ chunk_id: string }>(
        `
          SELECT chunk_id
          FROM document_chunks
          WHERE tenant_id = $1
            AND document_id = $2
            AND version_id = $3
            AND stale = false
          ORDER BY chunk_ordinal, chunk_id
          LIMIT 1
        `,
        [tenantAlphaId, input.documentId, input.versionId],
      );
      const chunkId = chunk.rows[0]?.chunk_id;
      if (!chunkId) throw new Error('graph AI claim fixture requires a seeded chunk');
      await client.query(
        `
          INSERT INTO ai_sessions (
            ai_session_id, tenant_id, matter_id, actor_id, status,
            prompt_hash, prompt_length, response_hash, response_length
          )
          VALUES ($1, $2, $3, $4, 'responded', $5, 24, $6, 96)
        `,
        [
          sessionId,
          tenantAlphaId,
          input.matterId,
          alphaOwnerUserId,
          'a'.repeat(64),
          'b'.repeat(64),
        ],
      );
      await client.query(
        `
          INSERT INTO ai_claims (
            claim_id, tenant_id, ai_session_id, session_claim_id, claim_hash,
            claim_text, kind, is_legal_conclusion, verification_status
          )
          VALUES ($1, $2, $3, 'f9-claim', $4, $5, 'key_fact', false, 'cited')
        `,
        [claimId, tenantAlphaId, sessionId, 'c'.repeat(64), input.claimText],
      );
      await client.query(
        `
          INSERT INTO ai_claim_citations (
            tenant_id, claim_id, source_ref, document_id, version_id, chunk_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          tenantAlphaId,
          claimId,
          `chunk:${chunkId}`,
          input.documentId,
          input.versionId,
          chunkId,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  return { claimId, claimText: input.claimText };
}

async function aiClaimGraphSnapshot(claimId: string): Promise<AiClaimGraphSnapshot> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<AiClaimGraphSnapshot>(
      `
        SELECT
          gn.node_id::text,
          gn.source_table,
          gn.provenance,
          gn.review_status,
          gn.stale,
          coalesce(array_agg(DISTINCT ge.edge_type) FILTER (WHERE ge.edge_type IS NOT NULL), '{}') AS edge_types
        FROM graph_nodes gn
        LEFT JOIN graph_edges ge
          ON ge.tenant_id = gn.tenant_id
         AND (ge.source_node_id = gn.node_id OR ge.target_node_id = gn.node_id)
         AND ge.stale = false
        WHERE gn.tenant_id = $1
          AND gn.source_id = $2
        GROUP BY gn.node_id, gn.source_table, gn.provenance, gn.review_status, gn.stale
        LIMIT 1
      `,
      [tenantAlphaId, claimId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('ai claim graph node not found');
    return row;
  });
}

async function graphFactReviewWork(nodeId: string): Promise<{
  kind: string;
  target_id: string;
  status: string;
}> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ kind: string; target_id: string; status: string }>(
      `
        SELECT kind, target_id::text, status
        FROM work_items
        WHERE tenant_id = $1
          AND source = 'ai_prep'
          AND kind = 'graph_fact_review'
          AND target_type = 'graph_node'
          AND target_id = $2
        LIMIT 1
      `,
      [tenantAlphaId, nodeId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('graph fact review work item not found');
    return row;
  });
}

async function insertGraphContractDocument(input: {
  clientId: string;
  matterId: string;
  title: string;
  contentText: string;
  index: number;
}): Promise<GraphDocumentFixture> {
  const document = await insertGraphDocument(input);
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO canonical_documents (
          tenant_id, version_id, body_text, extraction_status, extraction_method,
          confidence, extracted_at
        )
        VALUES ($1, $2, $3, 'ready', 'docx', 0.980, now())
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          body_text = EXCLUDED.body_text,
          extraction_status = EXCLUDED.extraction_status,
          extraction_method = EXCLUDED.extraction_method,
          confidence = EXCLUDED.confidence,
          failure_reason_code = NULL,
          extracted_at = EXCLUDED.extracted_at,
          updated_at = now()
      `,
      [tenantAlphaId, document.versionId, input.contentText],
    );
  });
  return document;
}

async function addSupersedingVersions(input: {
  matterId: string;
  document: GraphDocumentFixture;
  index: number;
}): Promise<{ secondVersionId: string; thirdVersionId: string }> {
  const secondVersionId = randomUUID();
  const thirdVersionId = randomUUID();
  const secondFileObjectId = randomUUID();
  const thirdFileObjectId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          UPDATE document_versions
          SET version_status = 'superseded'
          WHERE tenant_id = $1
            AND version_id = $2
        `,
        [tenantAlphaId, input.document.versionId],
      );
      await insertGraphFileObject(client, {
        matterId: input.matterId,
        documentId: input.document.documentId,
        fileObjectId: secondFileObjectId,
        index: input.index,
        filename: `${input.document.title}-v2.pdf`,
      });
      await insertGraphFileObject(client, {
        matterId: input.matterId,
        documentId: input.document.documentId,
        fileObjectId: thirdFileObjectId,
        index: input.index + 1,
        filename: `${input.document.title}-v3.pdf`,
      });
      await client.query(
        `
          INSERT INTO document_versions (
            version_id, tenant_id, document_id, version_no, version_status,
            file_object_id, file_hash, created_by, supersedes_version_id
          )
          VALUES
            ($1, $2, $3, 2, 'superseded', $4, $5, $6, $7),
            ($8, $2, $3, 3, 'current', $9, $10, $6, $1)
        `,
        [
          secondVersionId,
          tenantAlphaId,
          input.document.documentId,
          secondFileObjectId,
          fixtureHexHash(input.index),
          alphaOwnerUserId,
          input.document.versionId,
          thirdVersionId,
          thirdFileObjectId,
          fixtureHexHash(input.index + 1),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  return { secondVersionId, thirdVersionId };
}

async function insertGraphFileObject(
  client: QueryableClient,
  input: {
    matterId: string;
    documentId: string;
    fileObjectId: string;
    index: number;
    filename: string;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO file_objects (
        file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
        mime_type, size_bytes, sha256, created_by
      )
      VALUES ($1, $2, $3, $4, $4, 'application/pdf', 32, $5, $6)
    `,
    [
      input.fileObjectId,
      tenantAlphaId,
      graphStorageUri({
        matterId: input.matterId,
        documentId: input.documentId,
        fileObjectId: input.fileObjectId,
      }),
      input.filename,
      fixtureHexHash(input.index),
      alphaOwnerUserId,
    ],
  );
}

function graphStorageUri(input: {
  matterId: string;
  documentId: string;
  fileObjectId: string;
}): string {
  return `s3://amic-vault-dev/tenants/${tenantAlphaId}/matters/${input.matterId}/documents/${input.documentId}/${input.fileObjectId}`;
}

function fixtureHexHash(index: number): string {
  return index.toString(16).padStart(64, '0').slice(-64);
}

async function supersedesEdgePairs(
  versionIds: string[],
): Promise<Array<{ source_id: string; target_id: string }>> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ source_id: string; target_id: string }>(
      `
        SELECT source_node.source_id::text AS source_id,
          target_node.source_id::text AS target_id
        FROM graph_edges ge
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
          AND source_node.node_id = ge.source_node_id
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
          AND target_node.node_id = ge.target_node_id
        WHERE ge.tenant_id = $1
          AND ge.edge_type = 'SUPERSEDES'
          AND ge.stale = false
          AND source_node.source_id = ANY($2::uuid[])
          AND target_node.source_id = ANY($2::uuid[])
        ORDER BY source_node.source_id, target_node.source_id
      `,
      [tenantAlphaId, versionIds],
    );
    return result.rows;
  });
}

async function graphNodeIdForSource(sourceId: string, nodeType: string): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ node_id: string }>(
      `
        SELECT node_id
        FROM graph_nodes
        WHERE tenant_id = $1
          AND source_id = $2
          AND node_type = $3
          AND stale = false
        ORDER BY created_at DESC, node_id
        LIMIT 1
      `,
      [tenantAlphaId, sourceId, nodeType],
    );
    const nodeId = result.rows[0]?.node_id;
    if (!nodeId) throw new Error(`missing graph node for source ${sourceId}`);
    return nodeId;
  });
}

async function insertVerifiedFactWithoutEvidence(input: {
  matterId: string;
}): Promise<{ factId: string; factSummary: string }> {
  const factId = randomUUID();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const factSummary = `Graph evidence gap fact ${suffix} remains outside consistency output.`;
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO litigation_facts (
          fact_id, tenant_id, matter_id, evidence_id, fact_code, fact_summary,
          fact_date, status, materiality, citation_refs, created_by, updated_by
        )
        VALUES ($1, $2, $3, NULL, $4, $5, DATE '2026-07-04', 'verified', 'high', $6, $7, $7)
      `,
      [
        factId,
        tenantAlphaId,
        input.matterId,
        `FACT-${suffix}`,
        factSummary,
        [`matter:${input.matterId}`],
        alphaOwnerUserId,
      ],
    );
  });
  return { factId, factSummary };
}

async function contractClauseGraphSnapshot(versionId: string): Promise<{
  nodes: Array<{ node_type: string; source_table: string; source_id: string }>;
  edges: Array<{
    edge_type: string;
    source_node_type: string;
    target_node_type: string;
    source_table: string;
    target_table: string;
  }>;
  alignedClauseChunkCount: number;
}> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const nodes = await client.query<{ node_type: string; source_table: string; source_id: string }>(
      `
        SELECT node_type, source_table, source_id::text AS source_id
        FROM graph_nodes
        WHERE tenant_id = $1
          AND version_id = $2
          AND source_table IN (
            'document_chunks',
            'contract_clauses',
            'contract_defined_terms'
          )
          AND stale = false
        ORDER BY node_type, source_table, source_id
      `,
      [tenantAlphaId, versionId],
    );
    const edges = await client.query<{
      edge_type: string;
      source_node_type: string;
      target_node_type: string;
      source_table: string;
      target_table: string;
    }>(
      `
        SELECT
          ge.edge_type,
          source_node.node_type AS source_node_type,
          target_node.node_type AS target_node_type,
          source_node.source_table AS source_table,
          target_node.source_table AS target_table
        FROM graph_edges ge
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
         AND source_node.node_id = ge.source_node_id
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
         AND target_node.node_id = ge.target_node_id
        WHERE ge.tenant_id = $1
          AND ge.stale = false
          AND (
            source_node.version_id = $2
            OR target_node.version_id = $2
          )
          AND ge.edge_type IN (
            'HAS_CLAUSE',
            'CONTAINS_CLAUSE',
            'DEFINES',
            'ALIGNED_WITH'
          )
        ORDER BY ge.edge_type, source_node.node_type, target_node.node_type
      `,
      [tenantAlphaId, versionId],
    );
    const aligned = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM contract_clause_chunks
        WHERE tenant_id = $1
          AND version_id = $2
          AND stale = false
          AND chunk_id IS NOT NULL
      `,
      [tenantAlphaId, versionId],
    );
    return {
      nodes: nodes.rows,
      edges: edges.rows,
      alignedClauseChunkCount: Number(aligned.rows[0]?.count ?? 0),
    };
  });
}

async function negotiationPositionGraphSnapshot(positionId: string): Promise<{
  nodes: Array<{ node_type: string; source_table: string; source_id: string }>;
  edges: Array<{
    edge_type: string;
    source_node_type: string;
    target_node_type: string;
    source_table: string;
    target_table: string;
  }>;
}> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const nodes = await client.query<{ node_type: string; source_table: string; source_id: string }>(
      `
        SELECT node_type, source_table, source_id::text AS source_id
        FROM graph_nodes
        WHERE tenant_id = $1
          AND source_id = $2
          AND stale = false
        ORDER BY node_type, source_table, source_id
      `,
      [tenantAlphaId, positionId],
    );
    const edges = await client.query<{
      edge_type: string;
      source_node_type: string;
      target_node_type: string;
      source_table: string;
      target_table: string;
    }>(
      `
        SELECT
          ge.edge_type,
          source_node.node_type AS source_node_type,
          target_node.node_type AS target_node_type,
          source_node.source_table AS source_table,
          target_node.source_table AS target_table
        FROM graph_edges ge
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
         AND source_node.node_id = ge.source_node_id
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
         AND target_node.node_id = ge.target_node_id
        WHERE ge.tenant_id = $1
          AND ge.stale = false
          AND (
            source_node.source_id = $2
            OR target_node.source_id = $2
          )
        ORDER BY ge.edge_type, source_node.node_type, target_node.node_type
      `,
      [tenantAlphaId, positionId],
    );
    return { nodes: nodes.rows, edges: edges.rows };
  });
}

async function seedF1RelationRows(input: {
  matterId: string;
  documentId: string;
  versionId: string;
}): Promise<F1RelationProjectionFixture> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const fixture: F1RelationProjectionFixture = {
    evidenceId: randomUUID(),
    factId: randomUUID(),
    litigationParentIssueId: randomUUID(),
    litigationChildIssueId: randomUUID(),
    rfiId: randomUUID(),
    ddIssueId: randomUUID(),
    ddRiskId: randomUUID(),
    partyId: randomUUID(),
    factSummary: `Graph projection fact ${suffix} remains out of graph facts.`,
  };
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO litigation_evidence_items (
          evidence_id, tenant_id, matter_id, document_id, version_id, evidence_code,
          evidence_type, source_hash, evidence_direction, evidence_sequence, created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, 'document', $7, 'gap',
          (
            SELECT coalesce(max(evidence_sequence), 0) + 1
            FROM litigation_evidence_items
            WHERE tenant_id = $2
              AND matter_id = $3
              AND evidence_direction = 'gap'
          ),
          $8, $8
        )
      `,
      [
        fixture.evidenceId,
        tenantAlphaId,
        input.matterId,
        input.documentId,
        input.versionId,
        `EV-${suffix}`,
        'c'.repeat(64),
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO litigation_facts (
          fact_id, tenant_id, matter_id, evidence_id, fact_code, fact_summary,
          fact_date, status, materiality, citation_refs, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, DATE '2026-07-04', 'verified', 'high', $7, $8, $8)
      `,
      [
        fixture.factId,
        tenantAlphaId,
        input.matterId,
        fixture.evidenceId,
        `FACT-${suffix}`,
        fixture.factSummary,
        [`evidence:${fixture.evidenceId}`],
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO litigation_issue_nodes (
          issue_id, tenant_id, matter_id, issue_code, label, issue_type, status,
          position, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, 'claim', 'open', 1, $6, $6)
      `,
      [
        fixture.litigationParentIssueId,
        tenantAlphaId,
        input.matterId,
        `ISS-P-${suffix}`,
        `Parent issue ${suffix}`,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO litigation_issue_nodes (
          issue_id, tenant_id, matter_id, parent_issue_id, issue_code, label,
          issue_type, status, position, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'argument', 'developing', 2, $7, $7)
      `,
      [
        fixture.litigationChildIssueId,
        tenantAlphaId,
        input.matterId,
        fixture.litigationParentIssueId,
        `ISS-C-${suffix}`,
        `Child issue ${suffix}`,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO dd_rfis (
          rfi_id, tenant_id, matter_id, rfi_code, category, title, status,
          priority, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, 'litigation', $5, 'requested', 'high', $6, $6)
      `,
      [
        fixture.rfiId,
        tenantAlphaId,
        input.matterId,
        `RFI-${suffix}`,
        `RFI ${suffix}`,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO dd_issues (
          issue_id, tenant_id, matter_id, rfi_id, document_id, issue_code, title,
          severity, status, citation_refs, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'high', 'open', $8, $9, $9)
      `,
      [
        fixture.ddIssueId,
        tenantAlphaId,
        input.matterId,
        fixture.rfiId,
        input.documentId,
        `DDI-${suffix}`,
        `DD issue ${suffix}`,
        [`document:${input.documentId}`],
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO dd_risks (
          risk_id, tenant_id, matter_id, issue_id, risk_code, category, severity,
          likelihood, status, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, 'legal', 'high', 'medium', 'open', $6, $6)
      `,
      [
        fixture.ddRiskId,
        tenantAlphaId,
        input.matterId,
        fixture.ddIssueId,
        `DDR-${suffix}`,
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO parties (
          party_id, tenant_id, matter_id, name, party_type, party_role, created_by
        )
        VALUES ($1, $2, $3, $4, 'corporation', 'counterparty', $5)
      `,
      [
        fixture.partyId,
        tenantAlphaId,
        input.matterId,
        `Graph Party ${suffix}`,
        alphaOwnerUserId,
      ],
    );
  });
  return fixture;
}

async function seedNegotiationPosition(input: {
  matterId: string;
  partyId: string;
  documentId: string;
  versionId: string;
}): Promise<string> {
  const positionId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO negotiation_positions (
          position_id, tenant_id, matter_id, party_id, issue_label, clause_kind,
          position_summary, position_summary_hash, source_document_id, source_version_id,
          source_clause_id, round_no, created_by
        )
        VALUES (
          $1, $2, $3, $4, 'indemnity', 'indemnity',
          'counterparty asked for a broader indemnity cap', $5, $6, $7,
          NULL, 1, $8
        )
      `,
      [
        positionId,
        tenantAlphaId,
        input.matterId,
        input.partyId,
        'f'.repeat(64),
        input.documentId,
        input.versionId,
        alphaOwnerUserId,
      ],
    );
  });
  return positionId;
}

async function graphProjectionSnapshot(input: F1RelationProjectionFixture): Promise<{
  nodes: Array<{ node_type: string; source_table: string; source_id: string }>;
  edgeTypes: string[];
}> {
  const sourceIds = f1ProjectionSourceIds(input);
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const nodes = await client.query<{ node_type: string; source_table: string; source_id: string }>(
      `
        SELECT node_type, source_table, source_id::text AS source_id
        FROM graph_nodes
        WHERE tenant_id = $1
          AND source_id = ANY($2::uuid[])
          AND stale = false
        ORDER BY node_type, source_table, source_id
      `,
      [tenantAlphaId, sourceIds],
    );
    const edges = await client.query<{ edge_type: string }>(
      `
        SELECT DISTINCT ge.edge_type
        FROM graph_edges ge
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
         AND source_node.node_id = ge.source_node_id
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
         AND target_node.node_id = ge.target_node_id
        WHERE ge.tenant_id = $1
          AND ge.stale = false
          AND (
            source_node.source_id = ANY($2::uuid[])
            OR target_node.source_id = ANY($2::uuid[])
          )
        ORDER BY ge.edge_type
      `,
      [tenantAlphaId, sourceIds],
    );
    return {
      nodes: nodes.rows,
      edgeTypes: edges.rows.map((row) => row.edge_type),
    };
  });
}

function f1ProjectionSourceIds(input: F1RelationProjectionFixture): string[] {
  return [
    input.evidenceId,
    input.factId,
    input.litigationParentIssueId,
    input.litigationChildIssueId,
    input.rfiId,
    input.ddIssueId,
    input.ddRiskId,
    input.partyId,
  ];
}

async function graphProjectionCounts(
  input: F1RelationProjectionFixture,
  tenantId = tenantAlphaId,
  useAppRole = false,
): Promise<GraphProjectionCounts> {
  const sourceIds = f1ProjectionSourceIds(input);
  return withClient(useAppRole ? createAppClient() : createOwnerClient(), async (client) => {
    await setTenant(client, tenantId);
    const nodes = await client.query<{ source_id: string; stale: boolean }>(
      `
        SELECT source_id::text AS source_id, stale
        FROM graph_nodes
        WHERE source_id = ANY($1::uuid[])
        ORDER BY source_id, stale
      `,
      [sourceIds],
    );
    const edges = await client.query<{ stale: boolean }>(
      `
        SELECT ge.stale
        FROM graph_edges ge
        JOIN graph_nodes source_node
          ON source_node.tenant_id = ge.tenant_id
         AND source_node.node_id = ge.source_node_id
        JOIN graph_nodes target_node
          ON target_node.tenant_id = ge.tenant_id
         AND target_node.node_id = ge.target_node_id
        WHERE source_node.source_id = ANY($1::uuid[])
           OR target_node.source_id = ANY($1::uuid[])
      `,
      [sourceIds],
    );
    return {
      activeNodeCount: nodes.rows.filter((row) => !row.stale).length,
      activeEdgeCount: edges.rows.filter((row) => !row.stale).length,
      staleNodeCount: nodes.rows.filter((row) => row.stale).length,
      staleEdgeCount: edges.rows.filter((row) => row.stale).length,
      activeSourceIds: nodes.rows.filter((row) => !row.stale).map((row) => row.source_id),
      staleSourceIds: nodes.rows.filter((row) => row.stale).map((row) => row.source_id),
    };
  });
}

async function deleteF1FactRow(factId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        DELETE FROM litigation_facts
        WHERE tenant_id = $1
          AND fact_id = $2
      `,
      [tenantAlphaId, factId],
    );
  });
}

async function markDocumentDeleted(documentId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE documents
        SET status = 'deleted',
          deleted_at = now(),
          deleted_by = $3,
          deleted_previous_status = 'draft',
          updated_at = now()
        WHERE tenant_id = $1
          AND document_id = $2
      `,
      [tenantAlphaId, documentId, alphaOwnerUserId],
    );
  });
}

async function graphProvenanceCounts(matterId: string): Promise<GraphProvenanceCounts> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      active_node_count: string;
      derived_node_count: string;
      confirmed_node_count: string;
      system_node_count: string;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE stale = false)::text AS active_node_count,
          count(*) FILTER (WHERE stale = false AND provenance = 'derived')::text AS derived_node_count,
          count(*) FILTER (WHERE stale = false AND review_status = 'confirmed')::text AS confirmed_node_count,
          count(*) FILTER (WHERE stale = false AND created_by_kind = 'system')::text AS system_node_count
        FROM graph_nodes
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId],
    );
    const row = result.rows[0];
    return {
      activeNodeCount: Number(row?.active_node_count ?? 0),
      derivedNodeCount: Number(row?.derived_node_count ?? 0),
      confirmedNodeCount: Number(row?.confirmed_node_count ?? 0),
      systemNodeCount: Number(row?.system_node_count ?? 0),
    };
  });
}

async function insertAiProposedGraphNodeWithoutReviewStatus(
  matterId: string,
  document: GraphDocumentFixture,
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO graph_nodes (
          tenant_id, node_type, source_table, source_id, matter_id, document_id,
          version_id, source_hash, provenance, review_status, created_by_kind
        )
        VALUES (
          $1, 'risk', 'dd_risks', $2, $3, $4, $5, $6,
          'ai_proposed', NULL, 'ai'
        )
      `,
      [tenantAlphaId, randomUUID(), matterId, document.documentId, document.versionId, 'd'.repeat(64)],
    );
  });
}

async function enableAiPolicyForMatter(matterId: string): Promise<void> {
  const policyId = randomUUID();
  const accessPolicyId = randomUUID();
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO ai_policies (
          policy_id, tenant_id, name, allowed_model_tiers
        )
        VALUES ($1, $2, 'R7 graph local policy', ARRAY['local']::text[])
      `,
      [policyId, tenantAlphaId],
    );
    await client.query(
      `
        INSERT INTO ai_model_access_policies (
          access_policy_id, tenant_id, route_key, model_tier, status
        )
        VALUES ($1, $2, 'local_gemma', 'local', 'enabled')
        ON CONFLICT (tenant_id, route_key)
        DO UPDATE SET status = 'enabled', updated_at = now()
      `,
      [accessPolicyId, tenantAlphaId],
    );
    await client.query(
      `
        UPDATE matters
        SET ai_policy_id = $3,
          updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantAlphaId, matterId, policyId],
    );
  });
}

async function ensureFreshMatterAppSyncState(): Promise<void> {
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
          repeat('a', 64),
          repeat('b', 64),
          repeat('c', 64),
          'pass',
          '{"fixture":"graph_sync_outbox"}'::jsonb
        )
        ON CONFLICT (tenant_id, source_ref)
        DO UPDATE SET
          last_sync_at = EXCLUDED.last_sync_at,
          reflected_count = EXCLUDED.reflected_count,
          drift_count = EXCLUDED.drift_count,
          source_revision_hash = EXCLUDED.source_revision_hash,
          source_artifact_hash = EXCLUDED.source_artifact_hash,
          run_id_hash = EXCLUDED.run_id_hash,
          status = EXCLUDED.status,
          summary_json = EXCLUDED.summary_json,
          updated_at = now()
      `,
      [tenantAlphaId],
    );
  });
}

async function latestGraphOutbox(matterId: string): Promise<{
  status: string;
  reason_codes: string[];
  attempt_count: number;
  last_error_code: string | null;
} | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      status: string;
      reason_codes: string[];
      attempt_count: number;
      last_error_code: string | null;
    }>(
      `
        SELECT status, reason_codes, attempt_count, last_error_code
        FROM graph_sync_outbox
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows[0] ?? null;
  });
}

async function clearGraphOutbox(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query('DELETE FROM graph_sync_outbox WHERE tenant_id = $1', [tenantAlphaId]);
  });
}

async function graphNodeCountForDocument(documentId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM graph_nodes
        WHERE tenant_id = $1
          AND document_id = $2
          AND stale = false
      `,
      [tenantAlphaId, documentId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function graphNodeCountForDocuments(documentIds: string[]): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ count: string }>(
      `
        SELECT count(DISTINCT document_id)::text
        FROM graph_nodes
        WHERE tenant_id = $1
          AND document_id = ANY($2::uuid[])
          AND stale = false
      `,
      [tenantAlphaId, documentIds],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

async function latestGraphAudit(
  matterId: string,
  action:
    | 'GRAPH_SYNCED'
    | 'GRAPH_SYNC_FAILED'
    | 'GRAPH_QUERY_EXECUTED'
    | 'GRAPH_CONSISTENCY_CHECKED'
    | 'FACT_CONFIRMED',
  graphScope?: string,
): Promise<{
  result: string;
  metadata_json: Record<string, unknown>;
} | null> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      result: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = $3
          AND ($4::text IS NULL OR metadata_json->>'graph_scope' = $4)
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId, action, graphScope ?? null],
    );
    return result.rows[0] ?? null;
  });
}
