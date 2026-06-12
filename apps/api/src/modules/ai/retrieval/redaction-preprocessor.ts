import { Inject, Injectable } from '@nestjs/common';
import type { DlpDetection } from '@amic-vault/shared';
import { DlpService } from '../../dlp/dlp.service';
import type { AiRetrievalCandidate, AiRetrievedChunk } from './ai-retrieval.types';

export type AiRedactionResult =
  | {
      effect: 'ALLOW';
      chunks: AiRetrievedChunk[];
      redactionCount: number;
      appliedRules: readonly string[];
    }
  | {
      effect: 'DENY';
      appliedRules: readonly string[];
    };

@Injectable()
export class AiRedactionPreprocessor {
  constructor(@Inject(DlpService) private readonly dlpService: DlpService) {}

  redact(candidates: readonly AiRetrievalCandidate[]): AiRedactionResult {
    try {
      let redactionCount = 0;
      const chunks = candidates.map((candidate): AiRetrievedChunk => {
        const findings = this.dlpService.scanText(candidate.chunkText);
        redactionCount += findings.length;
        return {
          documentId: candidate.documentId,
          versionId: candidate.versionId,
          matterId: candidate.matterId,
          chunkId: candidate.chunkId,
          parentChunkId: candidate.parentChunkId,
          chunkOrdinal: candidate.chunkOrdinal,
          tokenCount: candidate.tokenCount,
          score: candidate.score,
          redactedText: redactText(candidate.chunkText, findings),
          textHash: candidate.textHash,
          sourceTextHash: candidate.sourceTextHash,
        };
      });
      return {
        effect: 'ALLOW',
        chunks,
        redactionCount,
        appliedRules:
          redactionCount > 0
            ? ['dlp.redaction:applied_before_context']
            : ['dlp.redaction:no_findings'],
      };
    } catch {
      return { effect: 'DENY', appliedRules: ['dlp.redaction:failed_closed'] };
    }
  }
}

function redactText(text: string, findings: readonly DlpDetection[]): string {
  let output = text;
  for (const finding of [...findings].sort((left, right) => right.startOffset - left.startOffset)) {
    output = `${output.slice(0, finding.startOffset)}[REDACTED:${finding.findingType}]${output.slice(
      finding.endOffset,
    )}`;
  }
  return output;
}
