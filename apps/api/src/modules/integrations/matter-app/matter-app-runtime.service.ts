import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  isUserRole,
  matterAppLookupResponseSchema,
  matterAppSourceModes,
  matterAppSourceStatusSchema,
  type MatterAppLookupQueryDto,
  type MatterAppLookupResponseDto,
  type MatterAppMatterOptionDto,
  type MatterAppSourceMode,
  type MatterAppSourceStatusDto,
  type MatterAppUnavailableReason,
  type TenantId,
  type UserRole,
} from '@amic-vault/shared';
import { tenantQuery } from '../../../common/db/tenant-query';
import { PermissionQueryBuilder } from '../../permission/permission-query.builder';
import { TenantContextService } from '../../tenant/tenant-context';
import { UserService } from '../../user/user.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const sourceLabels = {
  unconfigured: 'Matter app connection required',
  matter_app_api: 'Matter app API',
  matter_app_event_projection: 'Matter app event projection',
  vault_projection_only: 'Vault projection only',
} as const satisfies Record<MatterAppSourceMode, string>;

const sourceDescriptions = {
  unconfigured: 'Matter app runtime is not ready for Matter Code lookup.',
  matter_app_api: 'Matter Codes are resolved through the approved Matter app API contract.',
  matter_app_event_projection:
    'Matter Codes are resolved through the approved Matter app event projection.',
  vault_projection_only: 'Local Vault matter projection is enabled for development or test only.',
} as const satisfies Record<MatterAppSourceMode, string>;

const vaultInternalReferencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface MatterLookupRow {
  matter_id: string;
  matter_code: string;
  matter_name: string;
  client_name: string | null;
  status: string;
  practice_group: string | null;
  metadata_json: Record<string, unknown> | null;
  updated_at: Date;
  total_count: string;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

function envFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function matterAppApiConfigured(): boolean {
  return Boolean(envValue('MATTER_APP_API_BASE_URL')?.trim()) && Boolean(envValue('MATTER_APP_API_TOKEN')?.trim());
}

function normalizeSourceMode(value: string | undefined): MatterAppSourceMode {
  return matterAppSourceModes.includes(value as MatterAppSourceMode)
    ? (value as MatterAppSourceMode)
    : 'unconfigured';
}

function parseSourceUpdatedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

function stalenessMaxSeconds(): number {
  const value = Number.parseInt(envValue('MATTER_APP_STALENESS_MAX_SECONDS') ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 900;
}

function sourceUnavailableReason(input: {
  configured: boolean;
  mode: MatterAppSourceMode;
  productionRuntime: boolean;
  projectionFallbackAllowed: boolean;
  runtimeReady: boolean;
  stale: boolean;
}): MatterAppUnavailableReason | undefined {
  if (input.mode === 'unconfigured') return 'unconfigured';
  if (input.mode === 'vault_projection_only') {
    if (input.productionRuntime) return 'production_projection_blocked';
    if (!input.projectionFallbackAllowed) return 'not_configured';
    return undefined;
  }
  if (input.mode === 'matter_app_api' && !matterAppApiConfigured()) {
    return 'matter_app_api_config_missing';
  }
  if (!input.configured) return 'not_configured';
  if (!input.runtimeReady) return 'runtime_not_ready';
  if (input.stale) return 'stale_projection';
  return undefined;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`).toLocaleLowerCase();
}

function isVaultInternalReferenceLike(value: string): boolean {
  return vaultInternalReferencePattern.test(value.trim());
}

function metadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeDisplayLabel(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || isVaultInternalReferenceLike(trimmed)) return null;
  return trimmed;
}

function clientDisplayName(
  metadata: Record<string, unknown> | null,
  clientName: string | null,
): string | null {
  return (
    safeDisplayLabel(metadataString(metadata, 'clientDisplayName')) ??
    safeDisplayLabel(metadataString(metadata, 'clientName')) ??
    safeDisplayLabel(metadataString(metadata, 'client_name')) ??
    safeDisplayLabel(clientName ?? undefined)
  );
}

function sourceRevision(metadata: Record<string, unknown> | null): string | null {
  return (
    metadataString(metadata, 'matterAppSourceRevision') ??
    metadataString(metadata, 'sourceRevision') ??
    null
  );
}

function uploadEligibility(status: string): { blockedReason: string | null; uploadEligible: boolean } {
  if (['closed', 'archived', 'disposal_review', 'disposed'].includes(status)) {
    return { blockedReason: `status:${status}`, uploadEligible: false };
  }
  return { blockedReason: null, uploadEligible: true };
}

@Injectable()
export class MatterAppRuntimeService {
  constructor(
    @Inject(PermissionQueryBuilder) private readonly permissionQuery: PermissionQueryBuilder,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  status(now = new Date()): MatterAppSourceStatusDto {
    const requestedMode = normalizeSourceMode(
      envValue('MATTER_APP_SOURCE_MODE', 'NEXT_PUBLIC_MATTER_APP_SOURCE_MODE'),
    );
    const sourceConfigured = envFlag(
      envValue('MATTER_APP_SOURCE_CONFIGURED', 'NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED'),
    );
    const runtimeReady = envFlag(
      envValue('MATTER_APP_RUNTIME_READY', 'NEXT_PUBLIC_MATTER_APP_RUNTIME_READY'),
    );
    const projectionFallbackAllowed = envFlag(
      envValue(
        'ALLOW_VAULT_PROJECTION_MATTER_SOURCE',
        'NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE',
      ),
    );
    const productionRuntime = process.env.NODE_ENV === 'production';
    const maxSeconds = stalenessMaxSeconds();
    const sourceUpdatedAt = parseSourceUpdatedAt(
      envValue('MATTER_APP_SOURCE_UPDATED_AT', 'NEXT_PUBLIC_MATTER_APP_SOURCE_UPDATED_AT'),
    );
    const sourceStale =
      sourceUpdatedAt !== null && now.getTime() - sourceUpdatedAt.getTime() > maxSeconds * 1000;
    const unavailableReason = sourceUnavailableReason({
      configured: sourceConfigured,
      mode: requestedMode,
      productionRuntime,
      projectionFallbackAllowed,
      runtimeReady,
      stale: sourceStale,
    });
    const sourceContractReady = unavailableReason === undefined;
    const mode = sourceContractReady ? requestedMode : 'unconfigured';

    return matterAppSourceStatusSchema.parse({
      mode,
      requestedMode,
      label: sourceLabels[mode],
      description: sourceDescriptions[mode],
      sourceConfigured,
      runtimeReady,
      sourceContractReady,
      sourceAvailable: mode !== 'unconfigured' && (mode !== 'vault_projection_only' || !productionRuntime),
      uploadAuthoritative: mode === 'matter_app_api' || mode === 'matter_app_event_projection',
      productionRuntime,
      projectionFallbackAllowed,
      stalenessMaxSeconds: maxSeconds,
      sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null,
      sourceStale,
      ...(unavailableReason ? { unavailableReason } : {}),
    });
  }

  async lookup(
    actorUserId: string,
    query: MatterAppLookupQueryDto,
  ): Promise<MatterAppLookupResponseDto> {
    const source = this.status();
    if (!source.sourceAvailable) {
      return matterAppLookupResponseSchema.parse({
        source,
        lookupAvailable: false,
        items: [],
        totalCount: 0,
        pageSize: query.pageSize,
      });
    }

    const lookupText = (query.matterCode ?? query.q).trim();
    if (isVaultInternalReferenceLike(lookupText)) {
      return matterAppLookupResponseSchema.parse({
        source,
        lookupAvailable: true,
        items: [],
        totalCount: 0,
        pageSize: query.pageSize,
      });
    }

    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor || actor.status !== 'active' || !isUserRole(actor.role)) throw permissionDenied();

    const { items, totalCount } = await this.lookupForTenant(
      context.tenantId,
      actorUserId,
      actor.role,
      source,
      query.pageSize,
      lookupText,
    );

    return matterAppLookupResponseSchema.parse({
      source,
      lookupAvailable: true,
      items,
      totalCount,
      pageSize: query.pageSize,
    });
  }

  private async lookupForTenant(
    tenantId: TenantId,
    actorUserId: string,
    actorRole: UserRole,
    source: MatterAppSourceStatusDto,
    pageSize: number,
    lookupText: string,
  ): Promise<{ items: MatterAppMatterOptionDto[]; totalCount: number }> {
    const filters = ['m.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    const permissionFilter = this.permissionQuery.buildMatterFilter(
      { tenantId, userId: actorUserId, role: actorRole },
      params.length + 1,
      'm',
    );
    filters.push(`(${permissionFilter.sql})`);
    params.push(...permissionFilter.params);

    let exactCodeParamIndex: number | null = null;
    if (lookupText) {
      params.push(lookupText);
      exactCodeParamIndex = params.length;
      params.push(`%${escapeLike(lookupText)}%`);
      filters.push(`
        (
          lower(m.matter_code) LIKE $${params.length} ESCAPE '\\'
          OR lower(m.matter_name) LIKE $${params.length} ESCAPE '\\'
          OR lower(coalesce(m.metadata_json->>'clientDisplayName', '')) LIKE $${params.length} ESCAPE '\\'
          OR lower(coalesce(m.metadata_json->>'clientName', '')) LIKE $${params.length} ESCAPE '\\'
          OR lower(coalesce(m.metadata_json->>'client_name', '')) LIKE $${params.length} ESCAPE '\\'
          OR lower(coalesce(c.name, '')) LIKE $${params.length} ESCAPE '\\'
          OR lower(coalesce(m.practice_group, '')) LIKE $${params.length} ESCAPE '\\'
        )
      `);
    }

    const exactCodeOrder = exactCodeParamIndex
      ? `CASE WHEN lower(m.matter_code) = lower($${exactCodeParamIndex}) THEN 0 ELSE 1 END,`
      : '';
    params.push(pageSize);
    const result = await tenantQuery<MatterLookupRow>(
      getPool(),
      tenantId,
      `
        SELECT
          m.matter_id,
          m.matter_code,
          m.matter_name,
          c.name AS client_name,
          m.status,
          m.practice_group,
          m.metadata_json,
          m.updated_at,
          count(*) OVER()::text AS total_count
        FROM matters m
        LEFT JOIN clients c
          ON c.tenant_id = m.tenant_id
          AND c.client_id = m.client_id
        WHERE ${filters.join(' AND ')}
        ORDER BY
          ${exactCodeOrder}
          m.updated_at DESC,
          m.matter_id
        LIMIT $${params.length}
      `,
      params,
    );

    return {
      items: result.rows.map((row) => this.toMatterOption(row, source)),
      totalCount: Number.parseInt(result.rows[0]?.total_count ?? '0', 10) || 0,
    };
  }

  private toMatterOption(
    row: MatterLookupRow,
    source: MatterAppSourceStatusDto,
  ): MatterAppMatterOptionDto {
    const eligibility = uploadEligibility(row.status);
    return {
      matterReference: row.matter_id,
      matterCode: row.matter_code,
      matterName: row.matter_name,
      clientDisplayName: clientDisplayName(row.metadata_json, row.client_name),
      status: row.status,
      practiceGroup: row.practice_group,
      sourceMode: source.mode,
      sourceUpdatedAt: source.sourceUpdatedAt ?? row.updated_at.toISOString(),
      sourceRevision: sourceRevision(row.metadata_json),
      uploadEligible: eligibility.uploadEligible,
      blockedReason: eligibility.blockedReason,
    };
  }
}
