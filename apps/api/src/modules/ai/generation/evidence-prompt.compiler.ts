import { Injectable } from '@nestjs/common';
import type { EvidencePackDto } from '@amic-vault/shared';

export interface EvidencePromptCompileOptions {
  purpose?:
    | 'grounded_answer'
    | 'file_organization_prep'
    | 'clause_risk_analysis'
    | 'email_thread_summary'
    | undefined;
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
    const isClauseRiskAnalysis = options.purpose === 'clause_risk_analysis';
    const isEmailThreadSummary = options.purpose === 'email_thread_summary';
    const isPrepCandidateArtifact =
      isPrep &&
      ['fact_candidates', 'issue_candidates', 'risk_candidates', 'graph_candidate_edges'].includes(
        options.artifactKind ?? '',
      );
    const prepClaimKind = allowedClaimKinds[0] ?? 'summary';
    const prepCompactExample = JSON.stringify({
      answer: '짧은 파일 정리 정보',
      sections: [
        {
          section_id: 's1',
          heading: '문서 성격',
          text: '짧은 정리 문장',
          source_refs: [exampleSourceRef],
        },
      ],
      claims: [
        {
          claim_id: 'c1',
          kind: prepClaimKind,
          text: '짧은 근거 문장',
          source_refs: [exampleSourceRef],
          is_legal_conclusion: false,
        },
      ],
      warnings: [],
    });
    const chunks = pack.retrievedChunks
      .map((chunk) => {
        const lines = isPrep
          ? [`SOURCE_REF: ${chunk.citationRef}`, `TEXT: ${boundedPrepText(chunk.redactedText)}`]
          : [
              `SOURCE_REF: ${chunk.citationRef}`,
              `DOCUMENT_ID: ${chunk.documentId}`,
              `VERSION_ID: ${chunk.versionId}`,
              `CHUNK_ORDINAL: ${chunk.chunkOrdinal}`,
              `TEXT: ${chunk.redactedText}`,
            ];
        return lines.join('\n');
      })
      .join('\n\n');
    const graphFactsForPrompt = isPrep ? pack.graphFacts.filter(isPrepSafeGraphFact) : pack.graphFacts;
    const ruleFindingsForPrompt = isPrep
      ? pack.ruleFindings.filter(isPrepSafeRuleFinding)
      : pack.ruleFindings;
    const graphFacts = graphFactsForPrompt.map(formatGraphFactForPrompt).join('\n');
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
              isPrepCandidateArtifact
                ? 'Create proposed candidate claims only; do not mark them as confirmed or give legal advice.'
                : 'Do not create legal issue, legal risk, clause-analysis, or legal-advice claims.',
              'Return one-line minified JSON only with exactly one short section and one short claim.',
            ]
          : []),
        ...(isClauseRiskAnalysis
          ? [
              'This is cited clause risk analysis only.',
              'Use RULE_FINDINGS as contract rule-engine context and cite only allowed source_refs.',
              'Do not draft replacement clauses or fallback clause language.',
            ]
          : []),
        ...(isEmailThreadSummary
          ? [
              'This is filed email thread summarization only.',
              'Extract requests as key_fact claims and deadlines or dated commitments as timeline claims.',
              'Do not draft replies, proposed response text, or external email content.',
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
        ...(!isPrep && options.purpose ? [`PURPOSE: ${options.purpose}`] : []),
        ...(isPrep ? [] : [`TASK: ${pack.taskType}`]),
        `LOCALE: ${pack.outputFormat.locale}`,
        ...(isPrep ? [] : [`QUESTION: ${pack.userQuestion}`]),
        `CLAIM_KIND_ALLOWLIST: ${allowedClaimKinds.join(', ')}`,
        `ALLOWED_SOURCE_REFS: ${sourceRefs.join(', ')}`,
        'SOURCE_REF_RULE: source_refs values must be exact strings from ALLOWED_SOURCE_REFS.',
        ...(isPrep
          ? [
              'OUTPUT_LIMIT: exactly one section, exactly one claim, warnings []. Keep answer/heading/text fields under 80 characters each.',
              `PREP_COMPACT_JSON_EXAMPLE: ${prepCompactExample}`,
            ]
          : []),
        'RETRIEVED_CHUNKS:',
        chunks || 'none',
        ...(isClauseRiskAnalysis
          ? [
              'RULE_FINDINGS_CONTEXT: contract-rule-engine findings are context only; explain risk against cited chunks and require human review.',
            ]
          : []),
        ...(isEmailThreadSummary
          ? [
              'EMAIL_THREAD_INSTRUCTIONS: summarize the filed email thread, extract requested actions as key_fact claims, extract due dates or dated commitments as timeline claims, and do not generate reply drafts.',
            ]
          : []),
        ...(isPrep ? [] : ['GRAPH_FACTS:', graphFacts || 'none', 'RULE_FINDINGS:', ruleFindings || 'none']),
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

function boundedPrepText(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  return normalized.length > 1600 ? `${normalized.slice(0, 1600)}...` : normalized;
}

function graphFactReviewLabel(fact: EvidencePackDto['graphFacts'][number]): '[확정]' | '[미검토]' {
  if (fact.sourceReviewStatus === 'confirmed' && fact.targetReviewStatus === 'confirmed') {
    return '[확정]';
  }
  return '[미검토]';
}

function formatGraphFactForPrompt(fact: EvidencePackDto['graphFacts'][number]): string {
  const sourceStatus = graphFactNodeStatus(
    fact.sourceProvenance,
    fact.sourceReviewStatus,
    fact.sourceCreatedByKind,
  );
  const targetStatus = graphFactNodeStatus(
    fact.targetProvenance,
    fact.targetReviewStatus,
    fact.targetCreatedByKind,
  );
  return [
    `GRAPH_REF: ${graphFactReviewLabel(fact)} graph:${fact.edgeId}`,
    `${fact.sourceNodeType}:${fact.sourceNodeId}(${sourceStatus})`,
    `-> ${fact.edgeType} ->`,
    `${fact.targetNodeType}:${fact.targetNodeId}(${targetStatus})`,
    `HASH:${fact.sourceHash}`,
  ].join(' ');
}

function graphFactNodeStatus(
  provenance: EvidencePackDto['graphFacts'][number]['sourceProvenance'],
  reviewStatus: EvidencePackDto['graphFacts'][number]['sourceReviewStatus'],
  createdByKind: EvidencePackDto['graphFacts'][number]['sourceCreatedByKind'],
): string {
  return `${provenance}/${reviewStatus ?? 'unreviewed'}/${createdByKind}`;
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
