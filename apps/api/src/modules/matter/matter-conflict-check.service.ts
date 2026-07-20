import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  ConflictCheckCandidateDto,
  ConflictCheckDto,
  ConflictCheckListDto,
  ConflictCheckStatus,
  PermissionDecision,
  ResolveConflictCheckDto,
  TenantId,
} from '@amic-vault/shared';
import { tenantQuery } from '../../common/db/tenant-query';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const legalSuffixPattern =
  '(주식회사|\\(주\\)|㈜|유한책임회사|유한회사|합자회사|합명회사|법무법인|사단법인|재단법인|의료법인|학교법인|농업회사법인|영농조합법인|corporation|corp\\.?|inc\\.?|incorporated|company|co\\.?|ltd\\.?|limited|llc|llp)';
const stripPattern = String.raw`[[:space:]\.,·ㆍ\-_\/\\\(\)\[\]\{\}"']+`;
const conflictSimilarityThreshold = 0.62;
const maxConflictCandidates = 50;

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface ConflictCandidateRow {
  source_type: ConflictCheckCandidateDto['sourceType'];
  source_id: string;
  source_name: string;
  source_matter_id: string | null;
  source_matter_name: string | null;
  target_name: string;
  similarity: number | string;
}

interface ConflictCheckRow {
  conflict_check_id: string;
  matter_id: string;
  status: ConflictCheckStatus;
  target_names: unknown;
  match_results: unknown;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_rationale: string | null;
}

interface TargetNameRow {
  target_name: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw notFoundDenied();
}

function throwWriteDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw permissionDenied();
}

export function normalizeConflictName(value: string): string {
  let normalized = value.normalize('NFKC').toLocaleLowerCase('ko-KR');
  normalized = normalized.replace(
    /주식회사|\(주\)|㈜|유한책임회사|유한회사|합자회사|합명회사|법무법인|사단법인|재단법인|의료법인|학교법인|농업회사법인|영농조합법인|corporation|corp\.?|inc\.?|incorporated|company|co\.?|ltd\.?|limited|llc|llp/g,
    '',
  );
  normalized = normalized.replace(/[\s.,·ㆍ\-_/\\()[\]{}"']/g, '');
  return normalized;
}

function candidateFromRow(row: ConflictCandidateRow): ConflictCheckCandidateDto {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceMatterId: row.source_matter_id,
    sourceMatterName: row.source_matter_name,
    targetName: row.target_name,
    similarity: Number(row.similarity),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function numberValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function candidateFromStored(value: unknown): ConflictCheckCandidateDto | null {
  if (!isRecord(value)) return null;
  const sourceType = stringValue(value, 'sourceType');
  if (sourceType !== 'client' && sourceType !== 'party' && sourceType !== 'matter') return null;
  const sourceId = stringValue(value, 'sourceId');
  const sourceName = stringValue(value, 'sourceName');
  const targetName = stringValue(value, 'targetName');
  const similarity = numberValue(value, 'similarity');
  if (!sourceId || !sourceName || !targetName || similarity === null) return null;
  return {
    sourceType,
    sourceId,
    sourceName,
    sourceMatterId: stringValue(value, 'sourceMatterId'),
    sourceMatterName: stringValue(value, 'sourceMatterName'),
    targetName,
    similarity,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function candidateArray(value: unknown): ConflictCheckCandidateDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const candidate = candidateFromStored(entry);
    return candidate ? [candidate] : [];
  });
}

function mapConflictCheck(row: ConflictCheckRow): ConflictCheckDto {
  return {
    conflictCheckId: row.conflict_check_id,
    matterId: row.matter_id,
    status: row.status,
    targetNames: stringArray(row.target_names),
    candidates: candidateArray(row.match_results),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    resolutionRationale: row.resolution_rationale,
  };
}

@Injectable()
export class MatterConflictCheckService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async run(actorUserId: string, matterId: string): Promise<ConflictCheckDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);

    return this.auditService.transaction(context.tenantId, async (tx) => {
      const targetNames = await this.findTargetNames(tx, context.tenantId, matterId);
      if (targetNames.length === 0) throw notFoundDenied();
      const candidates = await this.findCandidates(tx, context.tenantId, matterId);
      const check = await this.insertConflictCheck(
        tx,
        context.tenantId,
        matterId,
        actorUserId,
        targetNames,
        candidates,
      );
      await this.updateMatterConflictStatus(tx, context.tenantId, matterId, 'in_review');
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'CONFLICT_CHECK_EXECUTED',
          targetType: 'conflict_check',
          targetId: check.conflictCheckId,
          matterId,
          metadata: {
            conflict_check_id: check.conflictCheckId,
            matter_id: matterId,
            result_count: candidates.length,
          },
        },
        tx,
      );
      return check;
    });
  }

  async list(actorUserId: string, matterId: string): Promise<ConflictCheckListDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const result = await tenantQuery<ConflictCheckRow>(
      getPool(),
      context.tenantId,
      `
        SELECT conflict_check_id, matter_id, status, target_names, match_results,
          created_by, created_at, updated_at, resolved_by, resolved_at, resolution_rationale
        FROM conflict_checks
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY created_at DESC, conflict_check_id DESC
      `,
      [context.tenantId, matterId],
    );
    return { items: result.rows.map(mapConflictCheck) };
  }

  async resolve(
    actorUserId: string,
    matterId: string,
    conflictCheckId: string,
    input: ResolveConflictCheckDto,
  ): Promise<ConflictCheckDto> {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);

    return this.auditService.transaction(context.tenantId, async (tx) => {
      const before = await this.findCheckForMatter(tx, context.tenantId, matterId, conflictCheckId);
      if (!before) throw notFoundDenied();
      const updated = await this.updateConflictCheckResolution(
        tx,
        context.tenantId,
        matterId,
        conflictCheckId,
        actorUserId,
        input,
      );
      if (!updated) throw notFoundDenied();
      await this.updateMatterConflictStatus(tx, context.tenantId, matterId, input.status);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'CONFLICT_CHECK_RESOLVED',
          targetType: 'conflict_check',
          targetId: conflictCheckId,
          matterId,
          metadata: {
            conflict_check_id: conflictCheckId,
            matter_id: matterId,
            status_before: before.status,
            status_after: input.status,
            reason_code: 'conflict_check_resolved',
          },
        },
        tx,
      );
      return mapConflictCheck(updated);
    });
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canReadMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwReadDenied(decision);
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canEditMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwWriteDenied(decision);
  }

  private async findTargetNames(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<string[]> {
    const result = await tx.query(
      `
        WITH target_names AS (
          SELECT clients.name AS target_name
          FROM matters
          JOIN clients
            ON clients.tenant_id = matters.tenant_id
           AND clients.client_id = matters.client_id
          WHERE matters.tenant_id = $1
            AND matters.matter_id = $2
          UNION ALL
          SELECT client_alias.alias_name AS target_name
          FROM matters
          JOIN clients
            ON clients.tenant_id = matters.tenant_id
           AND clients.client_id = matters.client_id
          CROSS JOIN LATERAL unnest(clients.aliases) AS client_alias(alias_name)
          WHERE matters.tenant_id = $1
            AND matters.matter_id = $2
          UNION ALL
          SELECT matter_name AS target_name
          FROM matters
          WHERE tenant_id = $1
            AND matter_id = $2
          UNION ALL
          SELECT name AS target_name
          FROM parties
          WHERE tenant_id = $1
            AND matter_id = $2
        )
        SELECT DISTINCT target_name
        FROM target_names
        WHERE char_length(trim(target_name)) > 0
        ORDER BY target_name ASC
      `,
      [tenantId, matterId],
    );
    return result.rows.map((row) => (row as TargetNameRow).target_name);
  }

  private async findCandidates(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<ConflictCheckCandidateDto[]> {
    const result = await tx.query(
      `
        WITH target_names AS (
          SELECT clients.name AS target_name
          FROM matters
          JOIN clients
            ON clients.tenant_id = matters.tenant_id
           AND clients.client_id = matters.client_id
          WHERE matters.tenant_id = $1
            AND matters.matter_id = $2
          UNION ALL
          SELECT client_alias.alias_name AS target_name
          FROM matters
          JOIN clients
            ON clients.tenant_id = matters.tenant_id
           AND clients.client_id = matters.client_id
          CROSS JOIN LATERAL unnest(clients.aliases) AS client_alias(alias_name)
          WHERE matters.tenant_id = $1
            AND matters.matter_id = $2
          UNION ALL
          SELECT matter_name AS target_name
          FROM matters
          WHERE tenant_id = $1
            AND matter_id = $2
          UNION ALL
          SELECT name AS target_name
          FROM parties
          WHERE tenant_id = $1
            AND matter_id = $2
        ),
        normalized_targets AS (
          SELECT DISTINCT target_name,
            regexp_replace(
              regexp_replace(lower(target_name), $3, '', 'g'),
              $4,
              '',
              'g'
            ) AS target_norm
          FROM target_names
          WHERE char_length(trim(target_name)) > 0
        ),
        target_matter AS (
          SELECT matter_id, client_id
          FROM matters
          WHERE tenant_id = $1
            AND matter_id = $2
        ),
        candidate_sources AS (
          SELECT 'client'::text AS source_type,
            clients.client_id::text AS source_id,
            client_names.source_name,
            NULL::text AS source_matter_id,
            NULL::text AS source_matter_name,
            regexp_replace(
              regexp_replace(lower(client_names.source_name), $3, '', 'g'),
              $4,
              '',
              'g'
            ) AS source_norm
          FROM clients
          CROSS JOIN target_matter
          CROSS JOIN LATERAL unnest(ARRAY[clients.name] || clients.aliases) AS client_names(source_name)
          WHERE clients.tenant_id = $1
            AND clients.client_id <> target_matter.client_id
          UNION ALL
          SELECT 'party'::text AS source_type,
            parties.party_id::text AS source_id,
            parties.name AS source_name,
            parties.matter_id::text AS source_matter_id,
            matters.matter_name AS source_matter_name,
            regexp_replace(
              regexp_replace(lower(parties.name), $3, '', 'g'),
              $4,
              '',
              'g'
            ) AS source_norm
          FROM parties
          JOIN matters
            ON matters.tenant_id = parties.tenant_id
           AND matters.matter_id = parties.matter_id
          WHERE parties.tenant_id = $1
            AND parties.matter_id <> $2
          UNION ALL
          SELECT 'matter'::text AS source_type,
            matters.matter_id::text AS source_id,
            matters.matter_name AS source_name,
            matters.matter_id::text AS source_matter_id,
            matters.matter_name AS source_matter_name,
            regexp_replace(
              regexp_replace(lower(matters.matter_name), $3, '', 'g'),
              $4,
              '',
              'g'
            ) AS source_norm
          FROM matters
          WHERE matters.tenant_id = $1
            AND matters.matter_id <> $2
        ),
        matches AS (
          SELECT candidate_sources.source_type,
            candidate_sources.source_id,
            candidate_sources.source_name,
            candidate_sources.source_matter_id,
            candidate_sources.source_matter_name,
            normalized_targets.target_name,
            similarity(candidate_sources.source_norm, normalized_targets.target_norm)::double precision AS similarity
          FROM candidate_sources
          JOIN normalized_targets
            ON candidate_sources.source_norm <> ''
           AND normalized_targets.target_norm <> ''
           AND (
             candidate_sources.source_norm = normalized_targets.target_norm
             OR similarity(candidate_sources.source_norm, normalized_targets.target_norm) >= $5
           )
        ),
        deduped AS (
          SELECT DISTINCT ON (source_type, source_id, target_name)
            source_type,
            source_id,
            source_name,
            source_matter_id,
            source_matter_name,
            target_name,
            similarity
          FROM matches
          ORDER BY source_type, source_id, target_name, similarity DESC
        )
        SELECT source_type, source_id, source_name, source_matter_id, source_matter_name,
          target_name, similarity
        FROM deduped
        ORDER BY similarity DESC, source_type ASC, source_name ASC
        LIMIT $6
      `,
      [
        tenantId,
        matterId,
        legalSuffixPattern,
        stripPattern,
        conflictSimilarityThreshold,
        maxConflictCandidates,
      ],
    );
    return result.rows.map((row) => candidateFromRow(row as ConflictCandidateRow));
  }

  private async insertConflictCheck(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    actorUserId: string,
    targetNames: string[],
    candidates: ConflictCheckCandidateDto[],
  ): Promise<ConflictCheckDto> {
    const result = await tx.query(
      `
        INSERT INTO conflict_checks (
          tenant_id, matter_id, status, target_names, match_results, created_by
        )
        VALUES ($1, $2, 'in_review', $3::jsonb, $4::jsonb, $5)
        RETURNING conflict_check_id, matter_id, status, target_names, match_results,
          created_by, created_at, updated_at, resolved_by, resolved_at, resolution_rationale
      `,
      [tenantId, matterId, JSON.stringify(targetNames), JSON.stringify(candidates), actorUserId],
    );
    const row = result.rows[0] as ConflictCheckRow | undefined;
    if (!row) throw new Error('conflict check insert returned no row');
    return mapConflictCheck(row);
  }

  private async findCheckForMatter(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    conflictCheckId: string,
  ): Promise<ConflictCheckRow | null> {
    const result = await tx.query(
      `
        SELECT conflict_check_id, matter_id, status, target_names, match_results,
          created_by, created_at, updated_at, resolved_by, resolved_at, resolution_rationale
        FROM conflict_checks
        WHERE tenant_id = $1
          AND matter_id = $2
          AND conflict_check_id = $3
        FOR UPDATE
      `,
      [tenantId, matterId, conflictCheckId],
    );
    return (result.rows[0] as ConflictCheckRow | undefined) ?? null;
  }

  private async updateConflictCheckResolution(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    conflictCheckId: string,
    actorUserId: string,
    input: ResolveConflictCheckDto,
  ): Promise<ConflictCheckRow | null> {
    if (input.rationale.trim().length === 0) throw validationFailed();
    const result = await tx.query(
      `
        UPDATE conflict_checks
        SET status = $4,
            resolution_rationale = $5,
            resolved_by = $6,
            resolved_at = now(),
            updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
          AND conflict_check_id = $3
        RETURNING conflict_check_id, matter_id, status, target_names, match_results,
          created_by, created_at, updated_at, resolved_by, resolved_at, resolution_rationale
      `,
      [tenantId, matterId, conflictCheckId, input.status, input.rationale, actorUserId],
    );
    return (result.rows[0] as ConflictCheckRow | undefined) ?? null;
  }

  private async updateMatterConflictStatus(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    status: 'in_review' | 'cleared' | 'blocked',
  ): Promise<void> {
    const result = await tx.query(
      `
        UPDATE matters
        SET conflicts_status = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantId, matterId, status],
    );
    if ((result.rowCount ?? 0) === 0) throw notFoundDenied();
  }
}
