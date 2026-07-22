import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../common/db/database.service';
import type { AiSessionRequestContext } from '../session/ai-session-log.service';

interface SummaryGenerationPolicyRow {
  summary_generation_enabled: boolean | null;
  session_payload_preservation_enabled: boolean | null;
}

export interface AiSummaryGenerationPolicy {
  summaryGenerationEnabled: boolean;
  sessionPayloadPreservationEnabled: boolean;
}

@Injectable()
export class AiSummaryGenerationGateService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async getPolicy(
    ctx: AiSessionRequestContext,
    matterId: string,
  ): Promise<AiSummaryGenerationPolicy> {
    try {
      return await this.databaseService.tenantTransaction(ctx.tenantId, async (client) => {
        const result = await client.query<SummaryGenerationPolicyRow>(
          `
            SELECT
              coalesce(p.summary_generation_enabled, false) AS summary_generation_enabled,
              coalesce(p.session_payload_preservation_enabled, false)
                AS session_payload_preservation_enabled
            FROM matters m
            LEFT JOIN ai_policies p
              ON p.tenant_id = m.tenant_id
             AND p.policy_id = m.ai_policy_id
            WHERE m.tenant_id = $1
              AND m.matter_id = $2
            LIMIT 1
          `,
          [ctx.tenantId, matterId],
        );
        const row = result.rows[0];
        return {
          summaryGenerationEnabled: row?.summary_generation_enabled === true,
          sessionPayloadPreservationEnabled: row?.session_payload_preservation_enabled === true,
        };
      });
    } catch {
      return { summaryGenerationEnabled: false, sessionPayloadPreservationEnabled: false };
    }
  }
}
