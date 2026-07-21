import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  parseAiPrepArtifactPayload,
  type AiPrepArtifactPayloadDto,
} from '@amic-vault/shared';
import type { QueryClient } from '../../audit/audit.service';
import { AiPrepRepository } from './ai-prep.repository';
import type { AiPrepSourceChunk } from './ai-prep.types';

interface DateFactArtifactRow {
  ai_prep_artifact_id: string;
  document_id: string;
  document_version_id: string;
  payload_json: unknown;
  generated_at: Date | null;
  updated_at: Date;
}

interface ChunkRow {
  document_id: string;
  version_id: string;
  matter_id: string;
  chunk_id: string;
  parent_chunk_id: string | null;
  chunk_ordinal: number;
  token_count: number;
  chunk_text: string;
  text_hash: string;
  source_text_hash: string;
}

export interface MatterTimelineDateFactArtifact {
  artifactId: string;
  documentId: string;
  versionId: string;
  payload: unknown;
  generatedAt?: Date | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface MatterTimelineBuildOutput {
  payload: AiPrepArtifactPayloadDto;
  items: MatterTimelineItemDto[];
  sourceRefs: string[];
  chunkIds: string[];
}

export interface MatterTimelineItemDto {
  timelineId: string;
  date: string;
  label: string;
  detail: string;
  documentId: string;
  versionId: string;
  citationRefs: string[];
}

@Injectable()
export class MatterTimelineBuilder {
  constructor(@Inject(AiPrepRepository) private readonly repository: AiPrepRepository) {}

  async buildForMatter(
    client: QueryClient,
    input: {
      tenantId: string;
      matterId: string;
      actorId: string;
      targetDocumentId: string;
      targetVersionId: string;
    },
  ): Promise<{ artifactId: string; itemCount: number } | null> {
    const artifacts = await this.listDateFactArtifacts(client, input.tenantId, input.matterId);
    const built = buildMatterTimelinePayload(artifacts);
    if (!built) return null;

    const chunks = await this.listSourceChunks(client, input.tenantId, built.chunkIds);
    if (chunks.length === 0) return null;

    const payloadJson = built.payload;
    const responseHash = sha256Hex(JSON.stringify(payloadJson));
    const promptHash = sha256Hex(
      `matter_timeline:${input.matterId}:${built.items.map((item) => item.timelineId).join(':')}`,
    );
    const artifactId = await this.repository.upsertCompleted(client, {
      source: {
        tenantId: input.tenantId,
        matterId: input.matterId,
        documentId: input.targetDocumentId,
        versionId: input.targetVersionId,
        actorId: input.actorId,
        title: 'Matter timeline',
        chunks,
      },
      artifactKind: 'matter_timeline',
      sourceChunks: chunks,
      promptHash,
      responseHash,
      payload: payloadJson,
      modelName: 'deterministic-matter-timeline',
      latencyMs: 0,
    });
    return { artifactId, itemCount: built.items.length };
  }

  private async listDateFactArtifacts(
    client: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterTimelineDateFactArtifact[]> {
    const result = await client.query(
      `
        SELECT ai_prep_artifact_id, document_id, document_version_id,
          payload_json, generated_at, updated_at
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND matter_id = $2
          AND artifact_kind = 'date_facts'
          AND status = 'completed'
          AND is_stale = false
        ORDER BY generated_at ASC NULLS LAST, updated_at ASC, ai_prep_artifact_id ASC
        LIMIT 100
      `,
      [tenantId, matterId],
    );
    const rows = result.rows as DateFactArtifactRow[];
    return rows.map((row) => ({
      artifactId: row.ai_prep_artifact_id,
      documentId: row.document_id,
      versionId: row.document_version_id,
      payload: row.payload_json,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
    }));
  }

  private async listSourceChunks(
    client: QueryClient,
    tenantId: string,
    chunkIds: readonly string[],
  ): Promise<AiPrepSourceChunk[]> {
    const uniqueChunkIds = [...new Set(chunkIds)].slice(0, 50);
    if (uniqueChunkIds.length === 0) return [];
    const result = await client.query(
      `
        SELECT dc.document_id, dc.version_id, d.matter_id, dc.chunk_id, dc.parent_chunk_id,
          dc.chunk_ordinal, dc.token_count, dc.chunk_text, dc.text_hash, dc.source_text_hash
        FROM document_chunks dc
        JOIN documents d
          ON d.tenant_id = dc.tenant_id
          AND d.document_id = dc.document_id
        WHERE dc.tenant_id = $1
          AND dc.chunk_id = ANY($2::uuid[])
          AND dc.stale = false
        ORDER BY dc.chunk_ordinal ASC, dc.chunk_id ASC
      `,
      [tenantId, uniqueChunkIds],
    );
    const rows = result.rows as ChunkRow[];
    return rows.map((row, index) => ({
      documentId: row.document_id,
      versionId: row.version_id,
      matterId: row.matter_id,
      chunkId: row.chunk_id,
      parentChunkId: row.parent_chunk_id,
      chunkOrdinal: row.chunk_ordinal,
      tokenCount: row.token_count,
      score: Math.max(0.01, 1 - index * 0.01),
      chunkText: row.chunk_text,
      textHash: row.text_hash,
      sourceTextHash: row.source_text_hash,
    }));
  }
}

export function buildMatterTimelinePayload(
  artifacts: readonly MatterTimelineDateFactArtifact[],
): MatterTimelineBuildOutput | null {
  const byEvent = new Map<
    string,
    {
      date: string;
      detail: string;
      documentId: string;
      versionId: string;
      sourceRefs: Set<string>;
    }
  >();

  for (const artifact of artifacts) {
    let parsed: AiPrepArtifactPayloadDto;
    try {
      parsed = parseAiPrepArtifactPayload(artifact.payload, 'date_facts');
    } catch {
      continue;
    }
    for (const claim of parsed.claims) {
      if (claim.kind !== 'timeline' && claim.kind !== 'key_fact') continue;
      const date = extractTimelineDate(claim.text);
      if (!date) continue;
      const detail = compactWhitespace(claim.text);
      const key = `${date}:${compactEventKey(detail)}`;
      const existing = byEvent.get(key);
      if (existing) {
        for (const ref of claim.source_refs) existing.sourceRefs.add(ref);
        continue;
      }
      byEvent.set(key, {
        date,
        detail,
        documentId: artifact.documentId,
        versionId: artifact.versionId,
        sourceRefs: new Set(claim.source_refs),
      });
    }
  }

  const items = [...byEvent.values()]
    .sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return left.detail.localeCompare(right.detail);
    })
    .slice(0, 50)
    .map((item): MatterTimelineItemDto => {
      const timelineId = `timeline-${sha256Hex(`${item.date}:${item.detail}`).slice(0, 16)}`;
      const citationRefs = [...item.sourceRefs].sort().slice(0, 20);
      return {
        timelineId,
        date: item.date,
        label: labelFromDetail(item.detail),
        detail: item.detail,
        documentId: item.documentId,
        versionId: item.versionId,
        citationRefs,
      };
    });

  if (items.length === 0) return null;

  const sourceRefs = [...new Set(items.flatMap((item) => item.citationRefs))].slice(0, 50);
  const claims: AiPrepArtifactPayloadDto['claims'] = items.map((item) => ({
    claim_id: item.timelineId,
    kind: 'timeline' as const,
    text: `${item.date} ${item.detail}`,
    source_refs: item.citationRefs,
    is_legal_conclusion: false as const,
  }));
  return {
    items,
    sourceRefs,
    chunkIds: sourceRefs.flatMap(chunkIdFromRef),
    payload: {
      answer: `Matter timeline contains ${items.length} cited dated fact${items.length === 1 ? '' : 's'}.`,
      sections: items.map((item, index) => ({
        section_id: `timeline-${index + 1}`,
        heading: item.label,
        text: `${item.date} ${item.detail}`,
        source_refs: item.citationRefs,
      })),
      claims,
      source_refs: sourceRefs,
    },
  };
}

export function matterTimelineItemsFromPayload(
  artifact: MatterTimelineDateFactArtifact,
): MatterTimelineItemDto[] {
  let parsed: AiPrepArtifactPayloadDto;
  try {
    parsed = parseAiPrepArtifactPayload(artifact.payload, 'matter_timeline');
  } catch {
    return [];
  }
  return parsed.claims
    .filter((claim) => claim.kind === 'timeline' || claim.kind === 'key_fact')
    .flatMap((claim) => {
      const date = extractTimelineDate(claim.text);
      if (!date) return [];
      return [
        {
          timelineId: claim.claim_id,
          date,
          label: labelFromDetail(claim.text),
          detail: compactWhitespace(claim.text.replace(date, '')),
          documentId: artifact.documentId,
          versionId: artifact.versionId,
          citationRefs: claim.source_refs,
        },
      ];
    });
}

function extractTimelineDate(value: string): string | null {
  const normalized = compactWhitespace(value);
  const numeric = normalized.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/u);
  if (numeric) {
    const [, year, month, day] = numeric;
    if (year && month && day) return validDate(year, month, day);
  }
  const korean = normalized.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/u);
  if (korean) {
    const [, year, month, day] = korean;
    if (year && month && day) return validDate(year, month, day);
  }
  return null;
}

function validDate(year: string, month: string, day: string): string | null {
  const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== candidate) return null;
  return candidate;
}

function labelFromDetail(value: string): string {
  const label = compactWhitespace(value.replace(/^\d{4}-\d{2}-\d{2}\s*/u, '')).slice(0, 80);
  return label || '날짜 사실';
}

function compactEventKey(value: string): string {
  return compactWhitespace(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function chunkIdFromRef(ref: string): string[] {
  const match = /^chunk:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.exec(
    ref,
  );
  return match?.[1] ? [match[1].toLowerCase()] : [];
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
