import { Injectable } from '@nestjs/common';
import type { EvidencePackDto } from '@amic-vault/shared';

export interface EvidencePromptCompilation {
  system: string;
  prompt: string;
  sourceRefs: readonly string[];
}

@Injectable()
export class AiEvidencePromptCompiler {
  compile(pack: EvidencePackDto): EvidencePromptCompilation {
    const sourceRefs = pack.citationRequirements.sourceRefs;
    const chunks = pack.retrievedChunks
      .map(
        (chunk) =>
          [
            `SOURCE_REF: ${chunk.citationRef}`,
            `DOCUMENT_ID: ${chunk.documentId}`,
            `VERSION_ID: ${chunk.versionId}`,
            `CHUNK_ORDINAL: ${chunk.chunkOrdinal}`,
            `TEXT: ${chunk.redactedText}`,
          ].join('\n'),
      )
      .join('\n\n');
    const graphFacts = pack.graphFacts
      .map(
        (fact) =>
          `GRAPH_REF: graph:${fact.edgeId} ${fact.sourceNodeType}:${fact.sourceNodeId} -> ${fact.edgeType} -> ${fact.targetNodeType}:${fact.targetNodeId} HASH:${fact.sourceHash}`,
      )
      .join('\n');
    const ruleFindings = pack.ruleFindings
      .map(
        (finding) =>
          `RULE_REF: rule:${finding.findingId} ${finding.ruleKey}@${finding.ruleVersion} ${finding.status} ${finding.findingCode} HASH:${finding.findingHash}`,
      )
      .join('\n');

    return {
      sourceRefs,
      system: [
        'You are AMIC Vault local_gemma.',
        'Use only the supplied Evidence Pack.',
        'Every claim must cite source_refs from the allowed SOURCE_REF list.',
        'Return JSON only with answer, sections, claims, and optional warnings.',
        'Do not include facts without citations. Do not approve legal conclusions.',
      ].join(' '),
      prompt: [
        `TASK: ${pack.taskType}`,
        `LOCALE: ${pack.outputFormat.locale}`,
        `QUESTION: ${pack.userQuestion}`,
        `ALLOWED_SOURCE_REFS: ${sourceRefs.join(', ')}`,
        'RETRIEVED_CHUNKS:',
        chunks || 'none',
        'GRAPH_FACTS:',
        graphFacts || 'none',
        'RULE_FINDINGS:',
        ruleFindings || 'none',
        'OUTPUT_SCHEMA:',
        JSON.stringify({
          answer: 'string',
          sections: [
            {
              section_id: 'string',
              heading: 'string',
              text: 'string',
              source_refs: ['chunk:<id>'],
            },
          ],
          claims: [
            {
              claim_id: 'string',
              kind: 'summary|key_fact|risk|issue|timeline|question|clause|answer',
              text: 'string',
              source_refs: ['chunk:<id>'],
              is_legal_conclusion: false,
            },
          ],
          warnings: ['string'],
        }),
      ].join('\n'),
    };
  }
}
