import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MatterWikiExportDto,
  MatterWikiListDto,
  MatterWikiPageDto,
  MatterWikiPageKind,
  MatterWikiPageProvenance,
  MatterWikiRegenerateResponseDto,
  MatterWikiReviewStatus,
  MatterWikiSourceRefDto,
  ReviewMatterWikiPageDto,
  TenantId,
  AiGroundedGenerationOutputDto,
  EvidencePackDto,
} from '@amic-vault/shared';
import { LocalGemmaGenerationService } from '../ai/generation/local-gemma-generation.service';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { WorkService } from '../work/work.service';

const pageKinds = [
  'overview',
  'issue',
  'party',
  'timeline',
] as const satisfies readonly MatterWikiPageKind[];
const pageKindTitles: Record<MatterWikiPageKind, string> = {
  overview: '사건 개요',
  issue: '쟁점',
  party: '관계자',
  timeline: '타임라인',
};

interface MatterWikiPageRow {
  page_id: string;
  matter_id: string;
  page_kind: MatterWikiPageKind;
  title: string;
  markdown_body: string;
  source_refs: unknown;
  provenance: MatterWikiPageProvenance;
  review_status: MatterWikiReviewStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_reason: string | null;
  work_item_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface WikiEvidenceSourceRow {
  source_ref: string;
  source_kind: MatterWikiSourceRefDto['sourceKind'];
  summary: string;
  document_id: string | null;
  version_id: string | null;
  node_id: string | null;
}

interface WikiPromptSource {
  promptRef: string;
  source: WikiEvidenceSourceRow;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function matterWikiLocalGemmaEnabled(): boolean {
  const raw = process.env.MATTER_WIKI_LOCAL_GEMMA_ENABLED ?? 'false';
  return ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

function promptSourcesFor(sources: readonly WikiEvidenceSourceRow[]): WikiPromptSource[] {
  const seen = new Set<string>();
  return sources.slice(0, 12).flatMap((source): WikiPromptSource[] => {
    const promptRef = promptRefFor(source);
    if (seen.has(promptRef)) return [];
    seen.add(promptRef);
    return [{ promptRef, source }];
  });
}

function promptRefFor(source: WikiEvidenceSourceRow): string {
  if (source.source_kind === 'graph_node' && source.node_id) return `graph:${source.node_id}`;
  return `graph:wiki_${sha256Hex(source.source_ref).slice(0, 32)}`;
}

function wikiClaimKinds(kind: MatterWikiPageKind): readonly string[] {
  if (kind === 'issue') return ['issue', 'risk', 'key_fact', 'summary'];
  if (kind === 'timeline') return ['timeline', 'key_fact', 'summary'];
  return ['summary', 'key_fact'];
}

function wikiEvidencePack(input: {
  kind: MatterWikiPageKind;
  matterId: string;
  promptSources: readonly WikiPromptSource[];
  tenantId: TenantId;
}): EvidencePackDto {
  const sourceRefs = input.promptSources.map((source) => source.promptRef);
  const question = wikiUserQuestion(input.kind, input.promptSources);
  return {
    packId: randomUUID(),
    userQuestion: question,
    rewrittenQueries: [`matter wiki ${input.kind}`],
    taskType: 'summary',
    matterContext: { matterId: input.matterId },
    retrievalScope: {
      tenantId: input.tenantId,
      matterId: input.matterId,
      mode: 'hybrid',
      modelRoute: 'local_gemma',
      appliedRules: ['retrieval.hybrid:query_stage_scope', 'matter_wiki:evidence_sources'],
    },
    relevantDocuments: wikiRelevantDocuments(input.promptSources),
    authoritativeSources: input.promptSources.slice(0, 20).map((source) => ({
      sourceType: 'document_chunk',
      sourceId: source.source.source_ref.slice(0, 120),
      reason: source.source.source_kind,
    })),
    retrievedChunks: [],
    omittedChunkIds: [],
    window: {
      tokenBudget: 2000,
      tokenCount: Math.min(2000, Math.max(1, Math.ceil(question.length / 4))),
    },
    graphFacts: [],
    ruleFindings: [],
    conflicts: [],
    uncertainty: [],
    prohibitedAssumptions: [
      'Do not use facts outside the supplied source summaries.',
      'Every section and claim must cite only ALLOWED_SOURCE_REFS.',
    ],
    citationRequirements: {
      required: true,
      style: 'chunk_ref',
      sourceRefs,
    },
    outputFormat: { kind: 'summary', locale: 'ko-KR' },
    escalationFlags: [],
  };
}

function wikiUserQuestion(
  kind: MatterWikiPageKind,
  promptSources: readonly WikiPromptSource[],
): string {
  const sourceLines = promptSources
    .slice(0, 8)
    .map((source) =>
      [
        `SOURCE_REF: ${source.promptRef}`,
        `SOURCE_KIND: ${source.source.source_kind}`,
        `SUMMARY: ${safeSummary(source.source.summary)}`,
      ].join(' '),
    )
    .join('\n');
  return [
    `Create a Korean Matter wiki ${kind} page draft.`,
    'Use only the source summaries below.',
    'Do not include legal conclusions or uncited facts.',
    sourceLines,
  ].join('\n').slice(0, 2000);
}

function wikiRelevantDocuments(
  promptSources: readonly WikiPromptSource[],
): EvidencePackDto['relevantDocuments'] {
  const documents = new Map<
    string,
    {
      documentId: string;
      sourceTextHashes: Set<string>;
      versionIds: Set<string>;
    }
  >();
  for (const source of promptSources) {
    if (!source.source.document_id || !source.source.version_id) continue;
    const existing =
      documents.get(source.source.document_id) ??
      {
        documentId: source.source.document_id,
        sourceTextHashes: new Set<string>(),
        versionIds: new Set<string>(),
      };
    existing.versionIds.add(source.source.version_id);
    existing.sourceTextHashes.add(sha256Hex(`${source.promptRef}:${source.source.source_ref}`));
    documents.set(source.source.document_id, existing);
  }
  return [...documents.values()].map((document) => ({
    documentId: document.documentId,
    versionIds: [...document.versionIds].slice(0, 20),
    chunkCount: document.sourceTextHashes.size,
    sourceTextHashes: [...document.sourceTextHashes].slice(0, 20),
  }));
}

function sourceRefDto(row: WikiEvidenceSourceRow): MatterWikiSourceRefDto {
  return {
    sourceRef: row.source_ref,
    sourceKind: row.source_kind,
    ...(row.document_id ? { documentId: row.document_id } : {}),
    ...(row.version_id ? { versionId: row.version_id } : {}),
    ...(row.node_id ? { nodeId: row.node_id } : {}),
  };
}

function parseSourceRefs(value: unknown): MatterWikiSourceRefDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): MatterWikiSourceRefDto[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.sourceRef !== 'string' || typeof record.sourceKind !== 'string') return [];
    if (!isWikiSourceKind(record.sourceKind)) return [];
    return [
      {
        sourceRef: record.sourceRef,
        sourceKind: record.sourceKind,
        ...(typeof record.documentId === 'string' ? { documentId: record.documentId } : {}),
        ...(typeof record.versionId === 'string' ? { versionId: record.versionId } : {}),
        ...(typeof record.nodeId === 'string' ? { nodeId: record.nodeId } : {}),
      },
    ];
  });
}

function isWikiSourceKind(value: string): value is MatterWikiSourceRefDto['sourceKind'] {
  return (
    value === 'ai_claim' ||
    value === 'litigation_fact' ||
    value === 'dd_issue' ||
    value === 'dd_risk' ||
    value === 'graph_node'
  );
}

function toDto(row: MatterWikiPageRow): MatterWikiPageDto {
  return {
    pageId: row.page_id,
    matterId: row.matter_id,
    pageKind: row.page_kind,
    title: row.title,
    markdownBody: row.markdown_body,
    sourceRefs: parseSourceRefs(row.source_refs),
    provenance: row.provenance,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    reviewReason: row.review_reason,
    workItemId: row.work_item_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function safeSummary(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 500);
}

function markdownFor(kind: MatterWikiPageKind, sources: readonly WikiEvidenceSourceRow[]): string {
  const title = pageKindTitles[kind];
  const lead =
    kind === 'overview'
      ? '확인된 근거에서 추출한 사건 개요입니다.'
      : kind === 'issue'
        ? '검토가 필요한 쟁점과 위험을 근거별로 정리했습니다.'
        : kind === 'party'
          ? '관계자 검토에 필요한 근거 연결 페이지입니다.'
          : '일자와 진행 경과를 확인할 때 쓰는 근거 연결 페이지입니다.';
  const bullets = sources.slice(0, 6).map((source, index) => {
    const citation = index + 1;
    return `- ${safeSummary(source.summary)} [^${citation}]`;
  });
  const footnotes = sources.slice(0, 6).map((source, index) => {
    const citation = index + 1;
    return `[^${citation}]: ${source.source_ref}`;
  });
  return [`# ${title}`, '', `${lead} [^1]`, '', ...bullets, '', ...footnotes].join('\n');
}

function markdownFromGroundedOutput(
  kind: MatterWikiPageKind,
  output: AiGroundedGenerationOutputDto,
  promptSources: readonly WikiPromptSource[],
): string | null {
  const footnotes = new Map<string, number>();
  const lines = [`# ${pageKindTitles[kind]}`, ''];
  const answer = lineWithCitations(output.answer, output.sections[0]?.source_refs ?? [], promptSources, footnotes);
  if (answer) lines.push(answer, '');
  for (const section of output.sections.slice(0, 6)) {
    const line = lineWithCitations(section.text, section.source_refs, promptSources, footnotes);
    if (!line) continue;
    lines.push(`## ${safeSummary(section.heading)}`, '', line, '');
  }
  const claims = output.claims
    .slice(0, 6)
    .map((claim) => lineWithCitations(claim.text, claim.source_refs, promptSources, footnotes))
    .filter((line): line is string => Boolean(line));
  if (claims.length > 0) lines.push('## 근거 요약', '', ...claims.map((claim) => `- ${claim}`), '');
  if (footnotes.size === 0) return null;
  for (const [sourceRef, index] of [...footnotes.entries()].sort((left, right) => left[1] - right[1])) {
    lines.push(`[^${index}]: ${sourceRef}`);
  }
  return lines.join('\n');
}

function lineWithCitations(
  text: string,
  promptRefs: readonly string[],
  promptSources: readonly WikiPromptSource[],
  footnotes: Map<string, number>,
): string | null {
  const refs = originalSourceRefs(promptRefs, promptSources);
  if (refs.length === 0) return null;
  const citations = refs.map((sourceRef) => `[^${footnoteIndex(sourceRef, footnotes)}]`).join(' ');
  return `${safeSummary(text)} ${citations}`;
}

function originalSourceRefs(
  promptRefs: readonly string[],
  promptSources: readonly WikiPromptSource[],
): string[] {
  const byPromptRef = new Map(promptSources.map((source) => [source.promptRef, source.source.source_ref]));
  return [...new Set(promptRefs.flatMap((ref) => byPromptRef.get(ref) ?? []))].slice(0, 6);
}

function footnoteIndex(sourceRef: string, footnotes: Map<string, number>): number {
  const existing = footnotes.get(sourceRef);
  if (existing) return existing;
  const next = footnotes.size + 1;
  footnotes.set(sourceRef, next);
  return next;
}

function filenameFor(kind: MatterWikiPageKind): string {
  return `${kind}-${pageKindTitles[kind]}.md`;
}

function makeZip(files: readonly { filename: string; body: string }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.filename, 'utf8');
    const body = Buffer.from(file.body, 'utf8');
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

@Injectable()
export class MatterWikiService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(LocalGemmaGenerationService)
    private readonly localGemmaGeneration: LocalGemmaGenerationService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(WorkService) private readonly workService: WorkService,
  ) {}

  async regenerate(
    actorUserId: string,
    matterId: string,
  ): Promise<MatterWikiRegenerateResponseDto> {
    const context = this.tenantContext.require();
    const sources = await this.auditService.transaction(context.tenantId, async (client) => {
      await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
      return this.collectEvidenceSources(client, context.tenantId, matterId);
    });
    const markdownByKind = await this.markdownByKind(context.tenantId, matterId, sources);
    return this.auditService.transaction(context.tenantId, async (client) => {
      await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
      if (sources.length === 0) {
        return {
          matterId,
          generatedCount: 0,
          pages: await this.listPageDtos(client, context.tenantId, matterId),
        };
      }

      let generatedCount = 0;
      for (const kind of pageKinds) {
        const page = await this.upsertProposedPage(client, {
          actorUserId,
          kind,
          matterId,
          markdownBody: markdownByKind[kind],
          sources,
          tenantId: context.tenantId,
        });
        const proposedAudit = await this.auditService.log(
          {
            tenantId: context.tenantId,
            actorId: actorUserId,
            action: 'WIKI_PAGE_PROPOSED',
            targetType: 'matter_wiki_page',
            targetId: page.page_id,
            matterId,
            metadata: {
              matter_id: matterId,
              page_kind: kind,
              status_after: 'proposed',
              item_count: sources.length,
              filter_refs: sources.slice(0, 10).map((source) => source.source_ref.slice(0, 64)),
            },
          },
          client,
        );
        const work = await this.workService.openWorkflowWork(client, {
          tenantId: context.tenantId,
          kind: 'wiki_page_review',
          targetId: page.page_id,
          matterId,
          assignedToUserId: actorUserId,
          dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          actorUserId,
          auditEventId: proposedAudit.eventId,
        });
        await client.query(
          `
            UPDATE matter_wiki_pages
            SET work_item_id = $3,
              created_audit_event_id = $4,
              last_audit_event_id = $4,
              updated_at = now()
            WHERE tenant_id = $1
              AND page_id = $2
          `,
          [context.tenantId, page.page_id, work.workItemId, proposedAudit.eventId],
        );
        generatedCount += 1;
      }
      return {
        matterId,
        generatedCount,
        pages: await this.listPageDtos(client, context.tenantId, matterId),
      };
    });
  }

  async list(actorUserId: string, matterId: string): Promise<MatterWikiListDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
      return { matterId, pages: await this.listPageDtos(client, context.tenantId, matterId) };
    });
  }

  async reviewPage(
    actorUserId: string,
    matterId: string,
    pageId: string,
    input: ReviewMatterWikiPageDto,
  ): Promise<MatterWikiPageDto> {
    return this.reviewPageInternal(actorUserId, pageId, input, matterId);
  }

  async reviewPageById(
    actorUserId: string,
    pageId: string,
    input: ReviewMatterWikiPageDto,
  ): Promise<MatterWikiPageDto> {
    return this.reviewPageInternal(actorUserId, pageId, input);
  }

  private async reviewPageInternal(
    actorUserId: string,
    pageId: string,
    input: ReviewMatterWikiPageDto,
    expectedMatterId?: string,
  ): Promise<MatterWikiPageDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const page = expectedMatterId
        ? await this.findPageForUpdate(client, context.tenantId, expectedMatterId, pageId)
        : await this.findPageByIdForUpdate(client, context.tenantId, pageId);
      if (!page) throw notFoundDenied();
      const matterId = page.matter_id;
      if (expectedMatterId && expectedMatterId !== matterId) throw notFoundDenied();
      await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
      if (page.review_status !== 'proposed') throw validationFailed();
      const reviewStatus = input.action === 'confirm' ? 'confirmed' : 'rejected';
      const provenance = input.action === 'confirm' ? 'human_confirmed' : page.provenance;
      const audit = await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'WIKI_PAGE_REVIEWED',
          targetType: 'matter_wiki_page',
          targetId: page.page_id,
          matterId,
          metadata: {
            matter_id: matterId,
            page_kind: page.page_kind,
            status_before: page.review_status,
            status_after: reviewStatus,
            reason_code: `wiki_page_${input.action}`,
            work_item_ref: page.work_item_id ?? page.page_id,
          },
        },
        client,
      );
      const updated = await this.updateReviewedPage(client, {
        actorUserId,
        auditEventId: audit.eventId,
        matterId,
        pageId,
        provenance,
        reviewReason: input.reviewReason,
        reviewStatus,
        tenantId: context.tenantId,
      });
      if (input.action === 'confirm') {
        await this.workService.completeWorkflowWork(client, {
          tenantId: context.tenantId,
          kind: 'wiki_page_review',
          targetId: page.page_id,
          actorUserId,
          auditEventId: audit.eventId,
        });
      } else {
        await this.workService.cancelWorkflowWork(client, {
          tenantId: context.tenantId,
          kind: 'wiki_page_review',
          targetId: page.page_id,
          actorUserId,
          auditEventId: audit.eventId,
        });
      }
      return toDto(updated);
    });
  }

  async exportConfirmed(actorUserId: string, matterId: string): Promise<MatterWikiExportDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
      const pages = await this.listConfirmedPageRows(client, context.tenantId, matterId);
      const body = makeZip(
        pages.map((page) => ({
          filename: filenameFor(page.page_kind),
          body: page.markdown_body,
        })),
      );
      const hash = sha256Hex(body);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'WIKI_EXPORTED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            item_count: pages.length,
            export_format: 'obsidian_zip',
            hash,
            filter_refs: pages.map((page) => `${page.page_kind}:${page.page_id}`.slice(0, 64)),
          },
        },
        client,
      );
      return {
        filename: `matter-${matterId}-wiki.zip`,
        mimeType: 'application/zip',
        body,
        pageCount: pages.length,
        sha256: hash,
      };
    });
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    try {
      const decision = await this.permissionService.canReadMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
      if (decision.effect === 'ALLOW') return;
    } catch {
      throw permissionDenied();
    }
    throw permissionDenied();
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    try {
      const decision = await this.permissionService.canEditMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
      if (decision.effect === 'ALLOW') return;
      if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') {
        throw new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw permissionDenied();
    }
    throw permissionDenied();
  }

  private async collectEvidenceSources(
    client: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<WikiEvidenceSourceRow[]> {
    const result = await client.query(
      `
        WITH ai_sources AS (
          SELECT
            'ai_claim:' || c.claim_id::text AS source_ref,
            'ai_claim' AS source_kind,
            c.claim_text AS summary,
            cit.document_id,
            cit.version_id,
            null::uuid AS node_id,
            c.created_at AS ordered_at
          FROM ai_claims c
          JOIN ai_sessions s
            ON s.tenant_id = c.tenant_id
           AND s.ai_session_id = c.ai_session_id
          JOIN LATERAL (
            SELECT document_id, version_id
            FROM ai_claim_citations
            WHERE tenant_id = c.tenant_id
              AND claim_id = c.claim_id
            ORDER BY created_at ASC, claim_citation_id ASC
            LIMIT 1
          ) cit ON TRUE
          WHERE c.tenant_id = $1
            AND s.matter_id = $2
        ),
        litigation_sources AS (
          SELECT
            'litigation_fact:' || fact_id::text AS source_ref,
            'litigation_fact' AS source_kind,
            fact_summary AS summary,
            null::uuid AS document_id,
            null::uuid AS version_id,
            null::uuid AS node_id,
            created_at AS ordered_at
          FROM litigation_facts
          WHERE tenant_id = $1
            AND matter_id = $2
            AND cardinality(citation_refs) > 0
            AND status IN ('verified', 'disputed', 'draft')
        ),
        dd_issue_sources AS (
          SELECT
            'dd_issue:' || issue_id::text AS source_ref,
            'dd_issue' AS source_kind,
            title AS summary,
            document_id,
            null::uuid AS version_id,
            null::uuid AS node_id,
            created_at AS ordered_at
          FROM dd_issues
          WHERE tenant_id = $1
            AND matter_id = $2
            AND cardinality(citation_refs) > 0
        ),
        dd_risk_sources AS (
          SELECT
            'dd_risk:' || risk_id::text AS source_ref,
            'dd_risk' AS source_kind,
            coalesce(mitigation_summary, category || ' ' || severity || ' risk') AS summary,
            null::uuid AS document_id,
            null::uuid AS version_id,
            null::uuid AS node_id,
            created_at AS ordered_at
          FROM dd_risks
          WHERE tenant_id = $1
            AND matter_id = $2
            AND cardinality(citation_refs) > 0
        )
        SELECT source_ref, source_kind, summary, document_id, version_id, node_id
        FROM (
          SELECT * FROM ai_sources
          UNION ALL
          SELECT * FROM litigation_sources
          UNION ALL
          SELECT * FROM dd_issue_sources
          UNION ALL
          SELECT * FROM dd_risk_sources
        ) sources
        ORDER BY ordered_at DESC, source_ref ASC
        LIMIT 12
      `,
      [tenantId, matterId],
    );
    return result.rows as WikiEvidenceSourceRow[];
  }

  private async upsertProposedPage(
    client: QueryClient,
    input: {
      actorUserId: string;
      kind: MatterWikiPageKind;
      markdownBody: string;
      matterId: string;
      sources: readonly WikiEvidenceSourceRow[];
      tenantId: string;
    },
  ): Promise<MatterWikiPageRow> {
    const sourceRefs = input.sources.map(sourceRefDto);
    const result = await client.query(
      `
        INSERT INTO matter_wiki_pages (
          tenant_id, matter_id, page_kind, title, markdown_body, source_refs,
          provenance, review_status, generated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'ai_proposed', 'proposed', $7)
        ON CONFLICT (tenant_id, matter_id, page_kind)
        DO UPDATE SET
          title = EXCLUDED.title,
          markdown_body = EXCLUDED.markdown_body,
          source_refs = EXCLUDED.source_refs,
          provenance = 'ai_proposed',
          review_status = 'proposed',
          reviewed_by = NULL,
          reviewed_at = NULL,
          review_reason = NULL,
          generated_by = EXCLUDED.generated_by,
          generated_at = now(),
          updated_at = now()
        RETURNING
          page_id, matter_id, page_kind, title, markdown_body, source_refs, provenance,
          review_status, reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
      `,
      [
        input.tenantId,
        input.matterId,
        input.kind,
        pageKindTitles[input.kind],
        input.markdownBody,
        JSON.stringify(sourceRefs),
        input.actorUserId,
      ],
    );
    const row = result.rows[0] as MatterWikiPageRow | undefined;
    if (!row) throw new Error('matter wiki page upsert returned no row');
    return row;
  }

  private async markdownByKind(
    tenantId: TenantId,
    matterId: string,
    sources: readonly WikiEvidenceSourceRow[],
  ): Promise<Record<MatterWikiPageKind, string>> {
    const fallback = Object.fromEntries(
      pageKinds.map((kind) => [kind, markdownFor(kind, sources)]),
    ) as Record<MatterWikiPageKind, string>;
    if (!matterWikiLocalGemmaEnabled() || sources.length === 0) return fallback;

    const markdowns = { ...fallback };
    for (const kind of pageKinds) {
      const promptSources = promptSourcesFor(sources);
      const pack = wikiEvidencePack({ kind, matterId, promptSources, tenantId });
      try {
        const result = await this.localGemmaGeneration.generateGrounded(pack, {
          compileOptions: {
            purpose: 'grounded_answer',
            artifactKind: `matter_wiki_${kind}`,
            allowedClaimKinds: wikiClaimKinds(kind),
          },
          maxTokens: 1000,
        });
        if (result.status !== 'completed' || !result.output) continue;
        const markdown = markdownFromGroundedOutput(kind, result.output, promptSources);
        if (markdown) markdowns[kind] = markdown;
      } catch {
        continue;
      }
    }
    return markdowns;
  }

  private async findPageForUpdate(
    client: QueryClient,
    tenantId: string,
    matterId: string,
    pageId: string,
  ): Promise<MatterWikiPageRow | null> {
    const result = await client.query(
      `
        SELECT
          page_id, matter_id, page_kind, title, markdown_body, source_refs, provenance,
          review_status, reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
        FROM matter_wiki_pages
        WHERE tenant_id = $1
          AND matter_id = $2
          AND page_id = $3
        FOR UPDATE
      `,
      [tenantId, matterId, pageId],
    );
    return (result.rows[0] as MatterWikiPageRow | undefined) ?? null;
  }

  private async findPageByIdForUpdate(
    client: QueryClient,
    tenantId: string,
    pageId: string,
  ): Promise<MatterWikiPageRow | null> {
    const result = await client.query(
      `
        SELECT
          page_id, matter_id, page_kind, title, markdown_body, source_refs, provenance,
          review_status, reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
        FROM matter_wiki_pages
        WHERE tenant_id = $1
          AND page_id = $2
        FOR UPDATE
      `,
      [tenantId, pageId],
    );
    return (result.rows[0] as MatterWikiPageRow | undefined) ?? null;
  }

  private async updateReviewedPage(
    client: QueryClient,
    input: {
      actorUserId: string;
      auditEventId: string;
      matterId: string;
      pageId: string;
      provenance: MatterWikiPageProvenance;
      reviewReason: string;
      reviewStatus: MatterWikiReviewStatus;
      tenantId: string;
    },
  ): Promise<MatterWikiPageRow> {
    const result = await client.query(
      `
        UPDATE matter_wiki_pages
        SET provenance = $4,
          review_status = $5,
          reviewed_by = $6,
          reviewed_at = now(),
          review_reason = $7,
          last_audit_event_id = $8,
          updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND page_id = $3
        RETURNING
          page_id, matter_id, page_kind, title, markdown_body, source_refs, provenance,
          review_status, reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
      `,
      [
        input.tenantId,
        input.matterId,
        input.pageId,
        input.provenance,
        input.reviewStatus,
        input.actorUserId,
        input.reviewReason,
        input.auditEventId,
      ],
    );
    const row = result.rows[0] as MatterWikiPageRow | undefined;
    if (!row) throw notFoundDenied();
    return row;
  }

  private async listPageDtos(
    client: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterWikiPageDto[]> {
    const result = await client.query(
      `
        SELECT
          page_id, matter_id, page_kind, title, markdown_body, source_refs, provenance,
          review_status, reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
        FROM matter_wiki_pages
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY array_position(ARRAY['overview', 'issue', 'party', 'timeline']::text[], page_kind), updated_at DESC
      `,
      [tenantId, matterId],
    );
    return (result.rows as MatterWikiPageRow[]).map(toDto);
  }

  private async listConfirmedPageRows(
    client: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterWikiPageRow[]> {
    const result = await client.query(
      `
        SELECT
          page_id, matter_id, page_kind, title, markdown_body, source_refs, provenance,
          review_status, reviewed_by, reviewed_at, review_reason, work_item_id, created_at, updated_at
        FROM matter_wiki_pages
        WHERE tenant_id = $1
          AND matter_id = $2
          AND review_status = 'confirmed'
        ORDER BY array_position(ARRAY['overview', 'issue', 'party', 'timeline']::text[], page_kind), updated_at DESC
      `,
      [tenantId, matterId],
    );
    return result.rows as MatterWikiPageRow[];
  }
}
