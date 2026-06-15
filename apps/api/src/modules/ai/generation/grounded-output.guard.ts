import { BadRequestException, Injectable } from '@nestjs/common';
import {
  aiGroundedGenerationOutputSchema,
  type AiGroundedGenerationOutputDto,
  type EvidencePackDto,
} from '@amic-vault/shared';

@Injectable()
export class AiGroundedOutputGuard {
  parseAndAssert(input: {
    output: unknown;
    pack: EvidencePackDto;
  }): AiGroundedGenerationOutputDto {
    const parsed = aiGroundedGenerationOutputSchema.safeParse(input.output);
    if (!parsed.success) throw validationFailed();

    const allowedRefs = new Set(input.pack.citationRequirements.sourceRefs);
    for (const section of parsed.data.sections) {
      this.assertRefsAllowed(section.source_refs, allowedRefs);
    }
    for (const claim of parsed.data.claims) {
      this.assertRefsAllowed(claim.source_refs, allowedRefs);
      if (claim.is_legal_conclusion === true) throw validationFailed();
    }
    return parsed.data;
  }

  private assertRefsAllowed(refs: readonly string[], allowedRefs: ReadonlySet<string>): void {
    if (refs.length === 0) throw validationFailed();
    for (const ref of refs) {
      if (!allowedRefs.has(ref)) throw validationFailed();
    }
  }
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}
