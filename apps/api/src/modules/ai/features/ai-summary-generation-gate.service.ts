import { Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { AiSessionRequestContext } from '../session/ai-session-log.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

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
  async getPolicy(
    ctx: AiSessionRequestContext,
    matterId: string,
  ): Promise<AiSummaryGenerationPolicy> {
    try {
      return await withTenantClient(ctx.tenantId, async (client) => {
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
          sessionPayloadPreservationEnabled:
            row?.session_payload_preservation_enabled === true,
        };
      });
    } catch {
      return { summaryGenerationEnabled: false, sessionPayloadPreservationEnabled: false };
    }
  }
}

async function withTenantClient<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
