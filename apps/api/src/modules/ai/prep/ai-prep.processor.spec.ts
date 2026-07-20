import { describe, expect, it, vi } from 'vitest';
import { AiPrepProcessor } from './ai-prep.processor';

const source = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  documentId: '11111111-1111-4111-8111-111111111112',
  versionId: '11111111-1111-4111-8111-111111111113',
  matterId: '11111111-1111-4111-8111-111111111114',
  actorId: '11111111-1111-4111-8111-111111111115',
  title: 'Fixture',
  chunks: [
    {
      documentId: '11111111-1111-4111-8111-111111111112',
      versionId: '11111111-1111-4111-8111-111111111113',
      matterId: '11111111-1111-4111-8111-111111111114',
      chunkId: '11111111-1111-4111-8111-111111111116',
      parentChunkId: '11111111-1111-4111-8111-111111111117',
      chunkOrdinal: 0,
      tokenCount: 12,
      score: 1,
      chunkText: 'source text',
      textHash: '1'.repeat(64),
      sourceTextHash: '2'.repeat(64),
    },
  ],
};

const sourceChunk = source.chunks[0]!;

const payload = {
  tenantId: source.tenantId,
  documentId: source.documentId,
  versionId: source.versionId,
  matterId: source.matterId,
  artifactKind: 'document_profile' as const,
};

const candidatePayload = {
  ...payload,
  artifactKind: 'fact_candidates' as const,
};

const dateFactsPayload = {
  ...payload,
  artifactKind: 'date_facts' as const,
};

type CompletedPrepPayload = {
  claims: Array<{ kind: string }>;
  warnings?: string[];
};

function firstRejectedPayload(repository: {
  upsertRejected: ReturnType<typeof vi.fn>;
}): CompletedPrepPayload | undefined {
  const calls = repository.upsertRejected.mock.calls as unknown as Array<
    [unknown, { payload: CompletedPrepPayload }]
  >;
  return calls[0]?.[1].payload;
}

function firstCompletedPayload(repository: {
  upsertCompleted: ReturnType<typeof vi.fn>;
}): CompletedPrepPayload | undefined {
  const calls = repository.upsertCompleted.mock.calls as unknown as Array<
    [unknown, { payload: CompletedPrepPayload }]
  >;
  return calls[0]?.[1].payload;
}

function createProcessor(
  options: {
    generationStatus?: 'completed' | 'blocked';
    generationReasonCode?: string | undefined;
    sourceText?: string | undefined;
    packSourceRefs?: string[] | undefined;
    staleRows?: Array<{
      ai_prep_artifact_id: string;
      artifact_kind: 'document_profile' | 'fact_candidates';
    }> | undefined;
    minutesQcReport?:
      | {
          artifactId: string;
          inconsistencyCount: number;
          sourceChunkCount: number;
        }
      | null
      | undefined;
    generationOutput?: {
      answer: string;
      sections: Array<{
        section_id: string;
        heading: string;
        text: string;
        source_refs: string[];
      }>;
      claims: Array<{
        claim_id: string;
        kind: string;
        text: string;
        source_refs: string[];
        is_legal_conclusion?: boolean;
      }>;
    };
  } = {},
) {
  const effectiveSource =
    options.sourceText === undefined
      ? source
      : {
          ...source,
          chunks: [
            {
              ...sourceChunk,
              chunkText: options.sourceText,
            },
          ],
        };
  const effectiveSourceChunk = effectiveSource.chunks[0]!;
  const auditLogs: unknown[] = [];
  const audit = {
    transaction: vi.fn(async (_tenantId: string, run: (client: never) => Promise<unknown>) =>
      run({ query: vi.fn() } as never),
    ),
    log: vi.fn(async (input: unknown) => {
      auditLogs.push(input);
      return { eventId: 'event', createdAt: new Date() };
    }),
  };
  const repository = {
    findTarget: vi.fn(async () => effectiveSource),
    markSupersededArtifactsStale: vi.fn(async () => options.staleRows ?? []),
    findScopedSource: vi.fn(async () => effectiveSource),
    buildEvidencePack: vi.fn(() => ({
      packId: '11111111-1111-4111-8111-111111111118',
      userQuestion: 'brief',
      rewrittenQueries: ['brief'],
      taskType: 'summary',
      matterContext: { matterId: source.matterId },
      retrievalScope: {
        tenantId: source.tenantId,
        matterId: source.matterId,
        mode: 'hybrid',
        modelRoute: 'local_gemma',
        appliedRules: ['retrieval.hybrid:query_stage_scope'],
      },
      relevantDocuments: [
        {
          documentId: effectiveSource.documentId,
          versionIds: [effectiveSource.versionId],
          chunkCount: 1,
          sourceTextHashes: ['2'.repeat(64)],
        },
      ],
      authoritativeSources: [],
      retrievedChunks: [
        {
          citationRef: `chunk:${effectiveSourceChunk.chunkId}`,
          documentId: effectiveSource.documentId,
          versionId: effectiveSource.versionId,
          matterId: effectiveSource.matterId,
          chunkId: effectiveSourceChunk.chunkId,
          parentChunkId: effectiveSourceChunk.parentChunkId,
          chunkOrdinal: effectiveSourceChunk.chunkOrdinal,
          tokenCount: effectiveSourceChunk.tokenCount,
          score: 1,
          redactedText: effectiveSourceChunk.chunkText,
          textHash: effectiveSourceChunk.textHash,
          sourceTextHash: effectiveSourceChunk.sourceTextHash,
        },
      ],
      omittedChunkIds: [],
      window: { tokenBudget: 2400, tokenCount: 12 },
      graphFacts: [],
      ruleFindings: [],
      conflicts: [],
      uncertainty: [],
      prohibitedAssumptions: ['Do not use facts outside retrieved chunks.'],
      citationRequirements: {
        required: true,
        style: 'chunk_ref',
        sourceRefs: options.packSourceRefs ?? [`chunk:${effectiveSourceChunk.chunkId}`],
      },
      outputFormat: { kind: 'summary', locale: 'ko-KR' },
      escalationFlags: [],
    })),
    upsertCompleted: vi.fn(async () => 'artifact-completed'),
    upsertBlocked: vi.fn(async () => 'artifact-blocked'),
    upsertFailed: vi.fn(async () => 'artifact-failed'),
    upsertRejected: vi.fn(async () => 'artifact-rejected'),
  };
  const promptCompiler = {
    compile: vi.fn(() => ({
      system: 'system',
      prompt: 'prompt',
      sourceRefs: [`chunk:${effectiveSourceChunk.chunkId}`],
    })),
  };
  const generation = {
    generateGrounded: vi.fn(async () =>
      options.generationStatus === 'blocked'
        ? { status: 'blocked', reasonCode: options.generationReasonCode ?? 'unsupported_claim' }
        : {
            status: 'completed',
            model: 'gemma4:12b',
            latencyMs: 7,
            output: options.generationOutput ?? {
              answer: 'answer',
              sections: [
                {
                  section_id: 'brief',
                  heading: 'Brief',
                  text: 'answer',
                  source_refs: [`chunk:${effectiveSourceChunk.chunkId}`],
                },
              ],
              claims: [
                {
                  claim_id: 'claim-1',
                  kind: 'summary',
                  text: 'answer',
                  source_refs: [`chunk:${effectiveSourceChunk.chunkId}`],
                  is_legal_conclusion: false,
                },
              ],
            },
          },
      ),
  };
  const workService = {
    openAiCandidateReviewWork: vi.fn(async () => ({
      workItemId: '11111111-1111-4111-8111-111111111120',
      dueAt: new Date('2026-06-15T00:00:00.000Z'),
    })),
  };
  const matterTimeline = {
    buildForMatter: vi.fn(async () => ({
      artifactId: '11111111-1111-4111-8111-111111111121',
      itemCount: 2,
    })),
  };
  const minutesQc = {
    buildForDocument: vi.fn(async () => options.minutesQcReport ?? null),
  };
  const dd = {
    suggestMappingsFromAiPrepArtifact: vi.fn(async () => ({
      suggestedCount: 1,
      mappingIds: ['11111111-1111-4111-8111-111111111124'],
    })),
  };
  const litigationClassifier = {
    suggestFromAiPrepArtifact: vi.fn(async () => ({
      suggestionId: '11111111-1111-4111-8111-111111111123',
      matterId: source.matterId,
      documentId: source.documentId,
      versionId: source.versionId,
      suggestionKind: 'issue_evidence_mapping',
      suggestedEvidenceDirection: 'gap',
      suggestedEvidenceType: 'exhibit',
      suggestedIssueTitle: '손해액 입증',
      confidence: 0.78,
      sourceArtifactId: 'artifact-completed',
      sourceHash: '3'.repeat(64),
      status: 'pending',
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    })),
  };
  const processor = new AiPrepProcessor(
    audit as never,
    { evaluate: vi.fn(async () => ({ effect: 'ALLOW' })) } as never,
    repository as never,
    {
      scopeForSearch: vi.fn(async () => ({
        effect: 'ALLOW',
        scope: { sql: 'idx.tenant_id = ?', params: [source.tenantId] },
        appliedRules: ['retrieval.hybrid:query_stage_scope'],
      })),
    } as never,
    {
      redact: vi.fn(() => ({
        effect: 'ALLOW',
        chunks: effectiveSource.chunks.map((chunk) => ({
          ...chunk,
          redactedText: chunk.chunkText,
        })),
        appliedRules: ['dlp.redaction:no_findings'],
      })),
    } as never,
    promptCompiler as never,
    generation as never,
    workService as never,
    matterTimeline as never,
    minutesQc as never,
    dd as never,
    litigationClassifier as never,
  );
  return {
    audit,
    auditLogs,
    generation,
    promptCompiler,
    repository,
    processor,
    workService,
    matterTimeline,
    minutesQc,
    dd,
    litigationClassifier,
  };
}

describe('AiPrepProcessor', () => {
  it('stores completed grounded prep and audits hashes only', async () => {
    const { auditLogs, repository, processor, workService } = createProcessor();
    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        modelName: 'gemma4:12b',
      }),
    );
    expect(workService.openAiCandidateReviewWork).not.toHaveBeenCalled();
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            generation_result: 'gemma',
            prompt_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
  });

  it('bridges completed document profiles into DD and Litigation suggestion review paths', async () => {
    const { dd, litigationClassifier, processor } = createProcessor({
      sourceText:
        'Non-disclosure agreement witness exhibit packet with damages and liability evidence.',
    });

    await processor.handle(payload);

    expect(dd.suggestMappingsFromAiPrepArtifact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: source.tenantId,
        matterId: source.matterId,
        documentId: source.documentId,
        versionId: source.versionId,
        sourceArtifactId: 'artifact-completed',
        sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        bodyText: expect.stringContaining('Non-disclosure agreement'),
      }),
    );
    expect(litigationClassifier.suggestFromAiPrepArtifact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: source.tenantId,
        matterId: source.matterId,
        documentId: source.documentId,
        versionId: source.versionId,
        sourceArtifactId: 'artifact-completed',
        sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        actorUserId: source.actorId,
        suggestedEvidenceDirection: 'gap',
        suggestedEvidenceType: 'testimony',
        suggestedIssueTitle: '손해액 입증',
        confidence: 0.78,
      }),
    );
  });

  it('builds a matter timeline after date facts complete', async () => {
    const { auditLogs, matterTimeline, minutesQc, processor } = createProcessor({
      generationOutput: {
        answer: '날짜 사실',
        sections: [
          {
            section_id: 'date',
            heading: '날짜',
            text: '2026-06-15 계약서 수령',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'timeline',
            text: '2026-06-15 계약서 수령',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
            is_legal_conclusion: false,
          },
        ],
      },
    });

    await processor.handle(dateFactsPayload);

    expect(matterTimeline.buildForMatter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: source.tenantId,
        matterId: source.matterId,
        actorId: source.actorId,
        targetDocumentId: source.documentId,
        targetVersionId: source.versionId,
      }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            ai_prep_kind: 'matter_timeline',
            generation_result: 'fallback',
          }),
        }),
      ]),
    );
    expect(minutesQc.buildForDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: source.tenantId,
        matterId: source.matterId,
        actorId: source.actorId,
        targetDocumentId: source.documentId,
        targetVersionId: source.versionId,
      }),
    );
  });

  it('stores minutes QC artifacts and opens review work when inconsistencies exist', async () => {
    const { auditLogs, processor, workService } = createProcessor({
      minutesQcReport: {
        artifactId: '11111111-1111-4111-8111-111111111122',
        inconsistencyCount: 1,
        sourceChunkCount: 2,
      },
      generationOutput: {
        answer: '날짜 사실',
        sections: [
          {
            section_id: 'date',
            heading: '날짜',
            text: '2026-06-15 계약서 수령',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'timeline',
            text: '2026-06-15 계약서 수령',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
            is_legal_conclusion: false,
          },
        ],
      },
    });

    await processor.handle(dateFactsPayload);

    expect(workService.openAiCandidateReviewWork).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: source.tenantId,
        artifactId: '11111111-1111-4111-8111-111111111122',
        matterId: source.matterId,
        documentId: source.documentId,
        actorUserId: source.actorId,
        auditEventId: 'event',
      }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            ai_prep_kind: 'minutes_qc',
            generation_result: 'fallback',
            source_chunk_count: 2,
          }),
        }),
      ]),
    );
  });

  it('stores candidate artifacts and opens one AI candidate review work item', async () => {
    const { auditLogs, repository, processor, workService } = createProcessor({
      generationOutput: {
        answer: '후보 사실',
        sections: [
          {
            section_id: 'fact',
            heading: '후보',
            text: '후보 사실',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'key_fact',
            text: '후보 사실',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
            is_legal_conclusion: false,
          },
        ],
      },
    });

    await processor.handle(candidatePayload);

    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        artifactKind: 'fact_candidates',
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(workService.openAiCandidateReviewWork).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: source.tenantId,
        artifactId: 'artifact-completed',
        matterId: source.matterId,
        documentId: source.documentId,
        actorUserId: source.actorId,
        auditEventId: 'event',
      }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            ai_prep_kind: 'fact_candidates',
            generation_result: 'gemma',
          }),
        }),
      ]),
    );
  });

  it('rejects uncited candidate claims without opening review work', async () => {
    const { repository, processor, workService } = createProcessor({
      generationOutput: {
        answer: '후보 사실',
        sections: [
          {
            section_id: 'fact',
            heading: '후보',
            text: '후보 사실',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'key_fact',
            text: '후보 사실',
            source_refs: [],
            is_legal_conclusion: false,
          },
        ],
      },
    });

    await processor.handle(candidatePayload);

    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reasonCode: 'AI_PREP_VALIDATION_FAILED' }),
    );
    expect(workService.openAiCandidateReviewWork).not.toHaveBeenCalled();
  });

  it('audits superseded prep artifacts as stale with a bounded reason', async () => {
    const { auditLogs, processor } = createProcessor({
      staleRows: [
        {
          ai_prep_artifact_id: '11111111-1111-4111-8111-111111111199',
          artifact_kind: 'document_profile',
        },
      ],
    });

    await processor.handle(payload);

    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_STALE',
          metadata: expect.objectContaining({
            ai_prep_status: 'stale',
            stale_reason: 'new_version',
          }),
        }),
      ]),
    );
  });

  it('discards legal-analysis claim kinds and records a rejected artifact', async () => {
    const { auditLogs, repository, processor } = createProcessor({
      generationOutput: {
        answer: 'answer',
        sections: [
          {
            section_id: 'brief',
            heading: 'Brief',
            text: 'answer',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
          },
        ],
        claims: [
          {
            claim_id: 'claim-1',
            kind: 'risk',
            text: 'not allowed in prep',
            source_refs: [`chunk:${sourceChunk.chunkId}`],
            is_legal_conclusion: false,
          },
        ],
      },
    });

    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reasonCode: 'AI_PREP_VALIDATION_FAILED',
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    const rejectedPayload = firstRejectedPayload(repository);
    expect(rejectedPayload).toBeDefined();
    if (!rejectedPayload) throw new Error('expected rejected payload');
    expect(JSON.stringify(rejectedPayload)).not.toContain('not allowed in prep');
    expect(rejectedPayload.claims.map((claim) => claim.kind)).toEqual(['key_fact']);
    expect(rejectedPayload.warnings).toContain('LOCAL_GEMMA_AI_PREP_VALIDATION_FAILED_REJECTED');
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_REJECTED',
          metadata: expect.objectContaining({
            ai_prep_status: 'rejected',
            generation_result: 'rejected',
            reason_code: 'AI_PREP_VALIDATION_FAILED',
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
  });

  it('passes file-organization compile options into Gemma generation', async () => {
    const { generation, processor, promptCompiler } = createProcessor();

    await processor.handle(payload);

    expect(promptCompiler.compile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        purpose: 'file_organization_prep',
        artifactKind: 'document_profile',
        allowedClaimKinds: ['summary', 'key_fact'],
      }),
    );
    expect(generation.generateGrounded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        compileOptions: expect.objectContaining({
          purpose: 'file_organization_prep',
          artifactKind: 'document_profile',
        }),
      }),
    );
  });

  it('uses the artifact retrieval plan when building and storing prep evidence', async () => {
    const { repository, processor } = createProcessor();

    await processor.handle(payload);

    expect(repository.buildEvidencePack).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: [
          expect.objectContaining({
            chunkId: sourceChunk.chunkId,
            redactedText: sourceChunk.chunkText,
          }),
        ],
        tokenBudget: 1200,
        appliedRules: expect.arrayContaining([
          'ai_prep.retrieval_plan:document_profile',
          'ai_prep.metadata_filter:current_version',
          'ai_prep.metadata_filter:ai_allowed_true',
          'ai_prep.permission_filter:query_stage',
        ]),
      }),
    );
    expect(repository.upsertCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceChunks: [sourceChunk],
      }),
    );
  });

  it('fails closed before Gemma generation when evidence source refs are mismatched', async () => {
    const { auditLogs, generation, repository, processor } = createProcessor({
      packSourceRefs: ['chunk:unknown'],
    });

    await processor.handle(payload);

    expect(generation.generateGrounded).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertBlocked).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reasonCode: 'AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH' }),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_BLOCKED',
          metadata: expect.objectContaining({
            ai_prep_status: 'blocked',
            reason_code: 'AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH',
          }),
        }),
      ]),
    );
  });

  it('stores deterministic completed fallback for transient Gemma generation failure', async () => {
    const { auditLogs, repository, processor } = createProcessor({
      generationStatus: 'blocked',
      generationReasonCode: 'generation_failed',
    });

    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    const completedPayload = firstCompletedPayload(repository);
    expect(completedPayload).toBeDefined();
    if (!completedPayload) throw new Error('expected completed fallback payload');
    expect(completedPayload.claims.map((claim) => claim.kind)).toEqual(['key_fact']);
    expect(completedPayload.warnings).toContain('LOCAL_GEMMA_GENERATION_FAILED_FALLBACK');
    expect(JSON.stringify(completedPayload)).not.toContain('source text');
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            ai_prep_status: 'completed',
            generation_result: 'fallback',
            fallback_reason_code: 'GENERATION_FAILED',
            prompt_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toMatch(/"response"|"prompt"|"raw"/u);
  });

  it('stores deterministic completed fallback for invalid Gemma JSON without raw response storage', async () => {
    const { auditLogs, repository, processor } = createProcessor({
      generationStatus: 'blocked',
      generationReasonCode: 'invalid_json',
    });

    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        responseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    const completedPayload = firstCompletedPayload(repository);
    expect(completedPayload).toBeDefined();
    if (!completedPayload) throw new Error('expected completed invalid-json fallback payload');
    expect(completedPayload.warnings).toContain('LOCAL_GEMMA_INVALID_JSON_FALLBACK');
    expect(JSON.stringify(completedPayload)).not.toContain('source text');
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_COMPLETED',
          metadata: expect.objectContaining({
            ai_prep_status: 'completed',
            generation_result: 'fallback',
            fallback_reason_code: 'INVALID_JSON',
            prompt_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toMatch(/"response"|"prompt"|"raw"/u);
  });

  it('records unsupported model output as rejected without storing a raw response', async () => {
    const { auditLogs, repository, processor } = createProcessor({ generationStatus: 'blocked' });
    await processor.handle(payload);

    expect(repository.upsertBlocked).not.toHaveBeenCalled();
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reasonCode: 'UNSUPPORTED_CLAIM' }),
    );
    const rejectedPayload = firstRejectedPayload(repository);
    expect(rejectedPayload).toBeDefined();
    if (!rejectedPayload) throw new Error('expected rejected payload');
    expect(rejectedPayload.warnings).toContain('LOCAL_GEMMA_UNSUPPORTED_CLAIM_REJECTED');
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_REJECTED',
          metadata: expect.objectContaining({
            ai_prep_status: 'rejected',
            generation_result: 'rejected',
            reason_code: 'UNSUPPORTED_CLAIM',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toMatch(/"response"|"prompt"|"raw"/u);
  });

  it('marks unexpected worker failures as failed without raw prompt or response storage', async () => {
    const { auditLogs, repository, processor } = createProcessor();

    await processor.markWorkerFailure(payload, 'AI_PREP_WORKER_EXCEPTION');

    expect(repository.upsertFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        artifactKind: 'document_profile',
        reasonCode: 'AI_PREP_WORKER_EXCEPTION',
      }),
    );
    expect(repository.upsertCompleted).not.toHaveBeenCalled();
    expect(repository.upsertRejected).not.toHaveBeenCalled();
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_FAILED',
          metadata: expect.objectContaining({
            ai_prep_status: 'failed',
            reason_code: 'AI_PREP_WORKER_EXCEPTION',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toMatch(/"response"|"prompt"|"raw"/u);
  });
});
