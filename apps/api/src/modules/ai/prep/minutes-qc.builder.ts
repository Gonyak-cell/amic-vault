import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  parseAiPrepArtifactPayload,
  type AiPrepArtifactPayloadDto,
} from '@amic-vault/shared';
import type { QueryClient } from '../../audit/audit.service';
import { AiPrepRepository } from './ai-prep.repository';
import {
  matterTimelineItemsFromPayload,
  type MatterTimelineDateFactArtifact,
} from './matter-timeline.builder';
import type { AiPrepSourceChunk } from './ai-prep.types';

interface ArtifactPayloadRow {
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

export interface MinutesQcInconsistency {
  kind: 'date_mismatch';
  meetingDate: string;
  timelineDate: string;
  meetingDetail: string;
  timelineDetail: string;
  meetingCitationRefs: string[];
  timelineCitationRefs: string[];
}

export interface MinutesQcBuildOutput {
  payload: AiPrepArtifactPayloadDto;
  inconsistencies: MinutesQcInconsistency[];
  sourceRefs: string[];
  chunkIds: string[];
}

interface DateFactEvent {
  date: string;
  detail: string;
  eventKey: string;
  citationRefs: string[];
}

@Injectable()
export class MinutesQcBuilder {
  constructor(@Inject(AiPrepRepository) private readonly repository: AiPrepRepository) {}

  async buildForDocument(
    client: QueryClient,
    input: {
      tenantId: string;
      matterId: string;
      actorId: string;
      targetDocumentId: string;
      targetVersionId: string;
      title: string;
    },
  ): Promise<{
    artifactId: string;
    inconsistencyCount: number;
    sourceChunkCount: number;
  } | null> {
    const profile = await this.findArtifact(client, input, 'document_profile');
    if (!profile || !isMeetingMinutesProfile(input.title, profile.payload_json)) return null;

    const dateFacts = await this.findArtifact(client, input, 'date_facts');
    if (!dateFacts) return null;

    const timelineArtifacts = await this.listMatterTimelineArtifacts(client, input);
    const built = buildMinutesQcReport({
      target: {
        documentId: input.targetDocumentId,
        versionId: input.targetVersionId,
        payload: dateFacts.payload_json,
      },
      timelineArtifacts,
    });
    if (!built) return null;

    const chunks = await this.listSourceChunks(client, input.tenantId, built.chunkIds);
    if (chunks.length === 0) return null;

    const payloadJson = built.payload;
    const responseHash = sha256Hex(JSON.stringify(payloadJson));
    const promptHash = sha256Hex(
      `minutes_qc:${input.matterId}:${input.targetDocumentId}:${input.targetVersionId}`,
    );
    const artifactId = await this.repository.upsertCompleted(client, {
      source: {
        tenantId: input.tenantId,
        matterId: input.matterId,
        documentId: input.targetDocumentId,
        versionId: input.targetVersionId,
        actorId: input.actorId,
        title: input.title,
        chunks,
      },
      artifactKind: 'minutes_qc',
      sourceChunks: chunks,
      promptHash,
      responseHash,
      payload: payloadJson,
      modelName: 'deterministic-minutes-qc',
      latencyMs: 0,
    });
    return {
      artifactId,
      inconsistencyCount: built.inconsistencies.length,
      sourceChunkCount: chunks.length,
    };
  }

  private async findArtifact(
    client: QueryClient,
    input: { tenantId: string; targetVersionId: string },
    artifactKind: 'document_profile' | 'date_facts',
  ): Promise<ArtifactPayloadRow | null> {
    const result = await client.query(
      `
        SELECT ai_prep_artifact_id, document_id, document_version_id,
          payload_json, generated_at, updated_at
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND document_version_id = $2
          AND artifact_kind = $3
          AND status = 'completed'
          AND is_stale = false
        ORDER BY generated_at DESC NULLS LAST, updated_at DESC, ai_prep_artifact_id DESC
        LIMIT 1
      `,
      [input.tenantId, input.targetVersionId, artifactKind],
    );
    return (result.rows[0] as ArtifactPayloadRow | undefined) ?? null;
  }

  private async listMatterTimelineArtifacts(
    client: QueryClient,
    input: { tenantId: string; matterId: string },
  ): Promise<MatterTimelineDateFactArtifact[]> {
    const result = await client.query(
      `
        SELECT ai_prep_artifact_id, document_id, document_version_id,
          payload_json, generated_at, updated_at
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND matter_id = $2
          AND artifact_kind = 'matter_timeline'
          AND status = 'completed'
          AND is_stale = false
        ORDER BY generated_at DESC NULLS LAST, updated_at DESC, ai_prep_artifact_id DESC
        LIMIT 20
      `,
      [input.tenantId, input.matterId],
    );
    const rows = result.rows as ArtifactPayloadRow[];
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

export function buildMinutesQcReport(input: {
  target: { documentId: string; versionId: string; payload: unknown };
  timelineArtifacts: readonly MatterTimelineDateFactArtifact[];
}): MinutesQcBuildOutput | null {
  const meetingEvents = dateFactEventsFromPayload(input.target.payload);
  if (meetingEvents.length === 0) return null;
  const timelineEvents = input.timelineArtifacts
    .flatMap((artifact) =>
      matterTimelineItemsFromPayload(artifact).map((item): DateFactEvent & {
        documentId: string;
        versionId: string;
      } => ({
        date: item.date,
        detail: item.detail,
        eventKey: eventKey(item.detail),
        citationRefs: item.citationRefs,
        documentId: item.documentId,
        versionId: item.versionId,
      })),
    )
    .filter(
      (event) =>
        event.documentId !== input.target.documentId || event.versionId !== input.target.versionId,
    );

  const inconsistencies: MinutesQcInconsistency[] = [];
  const seen = new Set<string>();
  for (const meetingEvent of meetingEvents) {
    if (meetingEvent.eventKey.length === 0) continue;
    for (const timelineEvent of timelineEvents) {
      if (meetingEvent.eventKey !== timelineEvent.eventKey) continue;
      if (meetingEvent.date === timelineEvent.date) continue;
      const key = `${meetingEvent.eventKey}:${meetingEvent.date}:${timelineEvent.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      inconsistencies.push({
        kind: 'date_mismatch',
        meetingDate: meetingEvent.date,
        timelineDate: timelineEvent.date,
        meetingDetail: meetingEvent.detail,
        timelineDetail: timelineEvent.detail,
        meetingCitationRefs: meetingEvent.citationRefs,
        timelineCitationRefs: timelineEvent.citationRefs,
      });
    }
  }

  const sourceRefs = [
    ...new Set(
      (inconsistencies.length > 0
        ? inconsistencies.flatMap((item) => [
            ...item.meetingCitationRefs,
            ...item.timelineCitationRefs,
          ])
        : meetingEvents.flatMap((item) => item.citationRefs)
      ).filter(Boolean),
    ),
  ].slice(0, 50);
  if (sourceRefs.length === 0) return null;
  return {
    inconsistencies,
    sourceRefs,
    chunkIds: sourceRefs.flatMap(chunkIdFromRef),
    payload: buildPayload(inconsistencies, sourceRefs),
  };
}

function isMeetingMinutesProfile(title: string, payload: unknown): boolean {
  const text = `${title}\n${profileText(payload)}`.toLowerCase();
  return /회의록|의사록|minutes|meeting minutes|board minutes|meeting record/u.test(text);
}

function profileText(payload: unknown): string {
  try {
    const parsed = parseAiPrepArtifactPayload(payload, 'document_profile');
    return [
      parsed.answer,
      ...parsed.sections.map((section) => `${section.heading} ${section.text}`),
      ...parsed.claims.map((claim) => claim.text),
    ].join('\n');
  } catch {
    return '';
  }
}

function dateFactEventsFromPayload(payload: unknown): DateFactEvent[] {
  let parsed: AiPrepArtifactPayloadDto;
  try {
    parsed = parseAiPrepArtifactPayload(payload, 'date_facts');
  } catch {
    return [];
  }
  return parsed.claims
    .filter((claim) => claim.kind === 'timeline' || claim.kind === 'key_fact')
    .flatMap((claim) => {
      const date = extractDate(claim.text);
      if (!date) return [];
      const detail = compactWhitespace(claim.text.replace(date, ''));
      return [
        {
          date,
          detail,
          eventKey: eventKey(detail),
          citationRefs: claim.source_refs,
        },
      ];
    });
}

function buildPayload(
  inconsistencies: readonly MinutesQcInconsistency[],
  sourceRefs: readonly string[],
): AiPrepArtifactPayloadDto {
  const primaryRef = sourceRefs[0];
  if (!primaryRef) throw new Error('minutes QC payload requires at least one source ref');
  const sections =
    inconsistencies.length > 0
      ? inconsistencies.slice(0, 12).map((item, index) => {
          const refs = [...new Set([...item.meetingCitationRefs, ...item.timelineCitationRefs])];
          return {
            section_id: `minutes-qc-${index + 1}`,
            heading: '날짜 불일치',
            text: `회의록 날짜 ${item.meetingDate}와 확정 타임라인 날짜 ${item.timelineDate}가 다릅니다. 회의록: ${item.meetingDetail}. 타임라인: ${item.timelineDetail}.`,
            source_refs: refs,
          };
        })
      : [
          {
            section_id: 'minutes-qc-clean',
            heading: '불일치 없음',
            text: '회의록 날짜 사실과 확정 타임라인 사이에서 날짜 불일치를 찾지 못했습니다.',
            source_refs: sourceRefs.slice(0, 20),
          },
        ];
  const claims =
    inconsistencies.length > 0
      ? inconsistencies.slice(0, 50).map((item, index) => ({
          claim_id: `minutes-qc-${index + 1}`,
          kind: 'key_fact' as const,
          text: `회의록 날짜 ${item.meetingDate}와 확정 타임라인 날짜 ${item.timelineDate}가 다릅니다: ${item.meetingDetail}.`,
          source_refs: [...new Set([...item.meetingCitationRefs, ...item.timelineCitationRefs])],
          is_legal_conclusion: false as const,
        }))
      : [
          {
            claim_id: 'minutes-qc-clean',
            kind: 'key_fact' as const,
            text: '회의록 정합성 QC에서 날짜 불일치를 찾지 못했습니다.',
            source_refs: [primaryRef],
            is_legal_conclusion: false as const,
          },
        ];
  return parseAiPrepArtifactPayload(
    {
      answer:
        inconsistencies.length > 0
          ? `회의록 정합성 QC에서 날짜 불일치 ${inconsistencies.length}건을 찾았습니다.`
          : '회의록 정합성 QC에서 날짜 불일치를 찾지 못했습니다.',
      sections,
      claims,
      source_refs: sourceRefs,
    },
    'minutes_qc',
  );
}

function extractDate(value: string): string | null {
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

function eventKey(value: string): string {
  return compactWhitespace(value)
    .replace(/\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/gu, ' ')
    .replace(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일/gu, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
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
