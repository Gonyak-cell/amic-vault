import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import {
  isAuditAction,
  type AuditAction,
  type AuditMetadata,
  type AuditMetadataValue,
} from '@amic-vault/shared';
import { currentRequestId } from '../../common/logging/correlation.middleware';
import { TenantContextService } from '../tenant/tenant-context';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface QueryClient {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export interface AuditLogInput {
  tenantId?: string;
  actorType?: 'user' | 'system';
  actorId?: string | null;
  sessionId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  matterId?: string | null;
  result?: 'success' | 'denied' | 'failure';
  metadata?: AuditMetadata | Record<string, unknown>;
  retentionLabel?: 'PERMANENT';
}

export interface AuditLogResult {
  eventId: string;
  createdAt: Date;
}

interface AuditRow {
  event_id: string;
  created_at: Date;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AuditMetadataNormalizer)
    private readonly metadataNormalizer: AuditMetadataNormalizer,
  ) {}

  async transaction<T>(tenantId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async log(input: AuditLogInput, client?: QueryClient): Promise<AuditLogResult> {
    if (!isAuditAction(input.action)) {
      throw new Error(`unsupported audit action: ${input.action}`);
    }
    const tenantId = input.tenantId ?? this.tenantContext.current()?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    if (!client) {
      return this.transaction(tenantId, (tx) => this.insertLog(input, tenantId, tx));
    }

    return this.insertLog(input, tenantId, client);
  }

  private async insertLog(
    input: AuditLogInput,
    tenantId: string,
    queryClient: QueryClient,
  ): Promise<AuditLogResult> {
    const metadata = this.metadataNormalizer.normalize(input.metadata);
    const result = await queryClient.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
          matter_id, result, metadata_json, correlation_id, retention_label
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
        RETURNING event_id, created_at
      `,
      [
        tenantId,
        input.actorType ?? (input.actorId ? 'user' : 'system'),
        input.actorId ?? null,
        input.sessionId ?? null,
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.matterId ?? null,
        input.result ?? 'success',
        JSON.stringify(metadata),
        input.metadata && hasMetadataValue(input.metadata, 'correlation_id')
          ? String((input.metadata as Record<string, unknown>).correlation_id)
          : (currentRequestId() ?? null),
        input.retentionLabel ?? 'PERMANENT',
      ],
    );
    const row = result.rows[0] as AuditRow | undefined;
    if (!row) {
      throw new Error('audit insert returned no row');
    }
    return { eventId: row.event_id, createdAt: row.created_at };
  }
}

function hasMetadataValue(
  metadata: AuditLogInput['metadata'],
  key: keyof AuditMetadata,
): metadata is Record<typeof key, AuditMetadataValue> {
  return typeof metadata === 'object' && metadata !== null && key in metadata;
}
