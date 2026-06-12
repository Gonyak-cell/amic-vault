import { Injectable } from '@nestjs/common';
import { searchFiltersSchema, type SearchFiltersDto } from '@amic-vault/shared';

export type AiMetadataFilterDecision =
  | {
      effect: 'ALLOW';
      filters: SearchFiltersDto;
      appliedRules: readonly string[];
    }
  | {
      effect: 'DENY';
      reasonCode: 'invalid_metadata_filter' | 'metadata_matter_mismatch';
      appliedRules: readonly string[];
    };

@Injectable()
export class AiMetadataFilterBuilder {
  build(input: {
    matterId: string;
    filters?: SearchFiltersDto | undefined;
  }): AiMetadataFilterDecision {
    let parsed: SearchFiltersDto;
    try {
      parsed = searchFiltersSchema.parse(input.filters ?? {});
    } catch {
      return {
        effect: 'DENY',
        reasonCode: 'invalid_metadata_filter',
        appliedRules: ['metadata_filter:invalid_fail_closed'],
      };
    }

    if (parsed.matterId && parsed.matterId !== input.matterId) {
      return {
        effect: 'DENY',
        reasonCode: 'metadata_matter_mismatch',
        appliedRules: ['metadata_filter:matter_mismatch'],
      };
    }

    return {
      effect: 'ALLOW',
      filters: { ...parsed, matterId: input.matterId },
      appliedRules: ['metadata_filter:matter_forced', 'metadata_filter:schema_valid'],
    };
  }
}
