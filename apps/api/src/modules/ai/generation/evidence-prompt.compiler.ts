import { Injectable } from '@nestjs/common';
import type { EvidencePackDto } from '@amic-vault/shared';

export interface EvidencePromptCompileOptions {
  purpose?: 'grounded_answer' | 'file_organization_prep' | undefined;
  artifactKind?: string | undefined;
  allowedClaimKinds?: readonly string[] | undefined;
}

export interface EvidencePromptCompilation {
  system: string;
  prompt: string;
  sourceRefs: readonly string[];
}

@Injectable()
export class AiEvidencePromptCompiler {
  compile(pack: EvidencePackDto, options: EvidencePromptCompileOptions = {}): EvidencePromptCompilation {
    const sourceRefs = pack.citationRequirements.sourceRefs;
    const exampleSourceRef = sourceRefs[0] ?? 'chunk:source-ref';
    const allowedClaimKinds = options.allowedClaimKinds?.length
      ? [...new Set(options.allowedClaimKinds)]
      : ['summary', 'key_fact', 'risk', 'issue', 'timeline', 'question', 'clause', 'answer'];
    const isPrep = options.purpose === 'file_organization_prep';
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
    const graphFactsForPrompt = isPrep ? pack.graphFacts.filter(isPrepSafeGraphFact) : pack.graphFacts;
    const ruleFindingsForPrompt = isPrep
      ? pack.ruleFindings.filter(isPrepSafeRuleFinding)
      : pack.ruleFindings;
    const graphFacts = graphFactsForPrompt
      .map(
        (fact) =>
          `GRAPH_REF: graph:${fact.edgeId} ${fact.sourceNodeType}:${fact.sourceNodeId} -> ${fact.edgeType} -> ${fact.targetNodeType}:${fact.targetNodeId} HASH:${fact.sourceHash}`,
      )
      .join('\n');
    const ruleFindings = ruleFindingsForPrompt
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
        'Copy source_refs exactly from ALLOWED_SOURCE_REFS; never invent placeholder refs.',
        'Return JSON only with answer, sections, claims, and optional warnings.',
        'Do not include facts without citations. Do not approve legal conclusions.',
        ...(isPrep
          ? [
              'This is post-upload file-organization prep only.',
              'Do not create legal issue, legal risk, clause-analysis, or legal-advice claims.',
              'Return compact JSON with one short section and one to three short claims.',
            ]
          : []),
      ].join(' '),
      prompt: [
        ...(isPrep
          ? [
              'PURPOSE: file_organization_prep',
              `ARTIFACT_KIND: ${options.artifactKind ?? pack.outputFormat.kind}`,
            ]
          : []),
        `TASK: ${pack.taskType}`,
        `LOCALE: ${pack.outputFormat.locale}`,
        `QUESTION: ${pack.userQuestion}`,
        `CLAIM_KIND_ALLOWLIST: ${allowedClaimKinds.join(', ')}`,
        `ALLOWED_SOURCE_REFS: ${sourceRefs.join(', ')}`,
        'SOURCE_REF_RULE: source_refs values must be exact strings from ALLOWED_SOURCE_REFS.',
        ...(isPrep
          ? [
              'OUTPUT_LIMIT: one section, one to three claims, concise field values, warnings may be empty.',
            ]
          : []),
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
              source_refs: [exampleSourceRef],
            },
          ],
          claims: [
            {
              claim_id: 'string',
              kind: allowedClaimKinds.join('|'),
              text: 'string',
              source_refs: [exampleSourceRef],
              is_legal_conclusion: false,
            },
          ],
          warnings: ['string'],
        }),
      ].join('\n'),
    };
  }
}

const prepSafeGraphEdgeTypes = new Set(['HAS_MATTER', 'HAS_DOCUMENT', 'HAS_VERSION', 'RELATED_TO']);
const prepSafeGraphNodeTypes = new Set(['client', 'matter', 'document', 'version']);
const prepSafeRulePrefixes = [
  'classification.',
  'filing.',
  'file_organization.',
  'document_profile.',
  'metadata.',
];
const prepUnsafeRulePattern = /\b(risk|issue|clause|required_clause|prohibited_term|legal)\b/u;

function isPrepSafeGraphFact(fact: EvidencePackDto['graphFacts'][number]): boolean {
  return (
    fact.documentId !== null &&
    prepSafeGraphEdgeTypes.has(fact.edgeType) &&
    prepSafeGraphNodeTypes.has(fact.sourceNodeType) &&
    prepSafeGraphNodeTypes.has(fact.targetNodeType)
  );
}

function isPrepSafeRuleFinding(finding: EvidencePackDto['ruleFindings'][number]): boolean {
  const ruleKey = finding.ruleKey.toLowerCase();
  const findingCode = finding.findingCode.toLowerCase();
  const refs = finding.evidenceRefs.join(' ').toLowerCase();
  const hasSafePrefix =
    prepSafeRulePrefixes.some((prefix) => ruleKey.startsWith(prefix)) ||
    prepSafeRulePrefixes.some((prefix) => findingCode.startsWith(prefix));
  return (
    finding.clauseId === null &&
    hasSafePrefix &&
    !prepUnsafeRulePattern.test(`${ruleKey} ${findingCode} ${refs}`)
  );
}
