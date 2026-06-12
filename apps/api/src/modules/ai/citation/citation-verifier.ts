import { Injectable } from '@nestjs/common';
import {
  aiCitationVerificationResponseSchema,
  type AiCitationVerificationRequestDto,
  type AiCitationVerificationResponseDto,
  type AiCitationVerificationWarningDto,
} from '@amic-vault/shared';

@Injectable()
export class AiCitationVerifier {
  verify(input: AiCitationVerificationRequestDto): AiCitationVerificationResponseDto {
    const knownRefs = new Set(input.citations.map((citation) => citation.citationRef));
    const warnings: AiCitationVerificationWarningDto[] = [];

    for (const claim of input.claims) {
      if (claim.citationRefs.length === 0) {
        warnings.push({
          code: 'UNCITED_CLAIM',
          claimId: claim.claimId,
          escalationRequired: Boolean(claim.isLegalConclusion),
        });
      }
      for (const citationRef of claim.citationRefs) {
        if (!knownRefs.has(citationRef)) {
          warnings.push({
            code: 'UNKNOWN_CITATION',
            claimId: claim.claimId,
            citationRef,
            escalationRequired: true,
          });
        }
      }
      if (claim.isLegalConclusion) {
        warnings.push({
          code: 'LEGAL_CONCLUSION_REQUIRES_REVIEW',
          claimId: claim.claimId,
          escalationRequired: true,
        });
      }
    }

    return aiCitationVerificationResponseSchema.parse({
      warnings,
      legalConclusionAutoApproval: false,
    });
  }
}
