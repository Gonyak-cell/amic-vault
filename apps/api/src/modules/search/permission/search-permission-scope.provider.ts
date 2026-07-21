import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { isUserRole } from '@amic-vault/shared';
import type { SearchSqlFragment } from '../query/search-filter.builder';
import { DocumentScopeFilter } from './document-scope.filter';
import { MatterScopeFilter } from './matter-scope.filter';
import type {
  MaterializedSearchPermissionScope,
  SearchPermissionActor,
  SearchScopeFilter,
} from './search-scope.types';
import { WallScopeFilter } from './wall-scope.filter';
import { DatabaseService } from '../../../common/db/database.service';

export interface SearchRequestContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

interface MaterializedScopeRow {
  role: string;
  status: string;
  allowed_matter_ids: string[];
  denied_matter_ids: string[];
  wall_blocked_matter_ids: string[];
  allowed_document_ids: string[];
  denied_document_ids: string[];
}

export type SearchPermissionScopeDecision =
  | { effect: 'DENY'; reasonCode: 'DENY_ALL' | 'SCOPE_ERROR' }
  | { effect: 'ALLOW'; scope: SearchSqlFragment; appliedRules?: string[] };

export interface SearchPermissionScopeProvider {
  scopeForSearch(ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision>;
}

export const SEARCH_PERMISSION_SCOPE_PROVIDER = Symbol('SEARCH_PERMISSION_SCOPE_PROVIDER');

@Injectable()
export class DenyAllSearchPermissionScopeProvider implements SearchPermissionScopeProvider {
  async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
    return { effect: 'DENY', reasonCode: 'DENY_ALL' };
  }
}

@Injectable()
export class PermissionBoundSearchPermissionScopeProvider implements SearchPermissionScopeProvider {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(MatterScopeFilter)
    private readonly matterFilter: MatterScopeFilter,
    @Inject(DocumentScopeFilter)
    private readonly documentFilter: DocumentScopeFilter,
    @Inject(WallScopeFilter)
    private readonly wallFilter: WallScopeFilter,
  ) {}

  async scopeForSearch(ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision> {
    const actor = await this.findActor(ctx);
    if (!actor) return { effect: 'DENY', reasonCode: 'SCOPE_ERROR' };

    const fragments = [
      this.matterFilter.build(actor),
      this.documentFilter.build(actor),
      this.wallFilter.build(actor),
    ];
    return {
      effect: 'ALLOW',
      scope: combineFilters(fragments),
      appliedRules: fragments.flatMap((fragment) => fragment.appliedRules),
    };
  }

  private async findActor(ctx: SearchRequestContext): Promise<SearchPermissionActor | null> {
    return this.databaseService.tenantTransaction(ctx.tenantId, async (client) => {
      const result = await selectActor(client, ctx);
      const row = result.rows[0];
      if (!row || row.status !== 'active' || !isUserRole(row.role)) return null;
      return {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: row.role,
        materializedScope: materializedScopeFromRow(row),
      };
    });
  }
}

function selectActor(client: PoolClient, ctx: SearchRequestContext) {
  return client.query<MaterializedScopeRow>(
    `
      WITH actor_row AS (
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      ),
      actor_groups AS (
        SELECT gm.group_id
        FROM group_members gm
        WHERE gm.tenant_id = $1
          AND gm.user_id = $2
      ),
      subject_permissions AS (
        SELECT p.resource_type, p.resource_id, p.effect, p.condition_json
        FROM permissions p
        WHERE p.tenant_id = $1
          AND p.action = 'read'
          AND (p.valid_from IS NULL OR p.valid_from <= now())
          AND (p.valid_to IS NULL OR p.valid_to > now())
          AND (
            (p.subject_type = 'user' AND p.subject_id = $2::text)
            OR (p.subject_type = 'role' AND p.subject_id = (SELECT role FROM actor_row))
            OR (
              p.subject_type = 'group'
              AND p.subject_id IN (SELECT group_id::text FROM actor_groups)
            )
          )
      ),
      denied_matter_ids AS (
        SELECT DISTINCT sp.resource_id::uuid AS matter_id
        FROM subject_permissions sp
        WHERE sp.resource_type = 'matter'
          AND (
            sp.effect = 'DENY'
            OR (sp.condition_json IS NOT NULL AND sp.condition_json <> '{}'::jsonb)
          )
      ),
      allowed_matter_ids AS (
        SELECT m.matter_id
        FROM matters m
        WHERE m.tenant_id = $1
          AND EXISTS (
            SELECT 1
            FROM matter_members mm
            WHERE mm.tenant_id = m.tenant_id
              AND mm.matter_id = m.matter_id
              AND mm.user_id = $2
          )
          AND NOT EXISTS (
            SELECT 1
            FROM denied_matter_ids denied
            WHERE denied.matter_id = m.matter_id
          )
      ),
      denied_document_ids AS (
        SELECT DISTINCT sp.resource_id::uuid AS document_id
        FROM subject_permissions sp
        WHERE sp.resource_type = 'document'
          AND (
            sp.effect = 'DENY'
            OR (sp.condition_json IS NOT NULL AND sp.condition_json <> '{}'::jsonb)
          )
      ),
      allowed_document_ids AS (
        SELECT DISTINCT sp.resource_id::uuid AS document_id
        FROM subject_permissions sp
        WHERE sp.resource_type = 'document'
          AND sp.effect = 'ALLOW'
          AND NOT (sp.condition_json IS NOT NULL AND sp.condition_json <> '{}'::jsonb)
      ),
      wall_overrides AS (
        SELECT DISTINCT bgr.wall_id
        FROM break_glass_requests bgr
        WHERE bgr.tenant_id = $1
          AND bgr.requester_id = $2
          AND bgr.status = 'approved'
          AND bgr.revoked_at IS NULL
          AND bgr.expires_at > now()
          AND (
            SELECT count(*)
            FROM break_glass_approvals bga
            WHERE bga.tenant_id = bgr.tenant_id
              AND bga.request_id = bgr.request_id
          ) >= 2
      ),
      wall_blocked_matter_ids AS (
        SELECT DISTINCT ew.matter_id
        FROM ethical_walls ew
        WHERE ew.tenant_id = $1
          AND ew.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM wall_overrides override
            WHERE override.wall_id = ew.wall_id
          )
          AND (
            EXISTS (
              SELECT 1
              FROM ethical_wall_memberships excluded
              WHERE excluded.tenant_id = ew.tenant_id
                AND excluded.wall_id = ew.wall_id
                AND excluded.membership_type = 'excluded'
                AND (
                  (excluded.subject_type = 'user' AND excluded.subject_id = $2)
                  OR (
                    excluded.subject_type = 'group'
                    AND excluded.subject_id IN (SELECT group_id FROM actor_groups)
                  )
                )
            )
            OR (
              EXISTS (
                SELECT 1
                FROM ethical_wall_memberships any_insider
                WHERE any_insider.tenant_id = ew.tenant_id
                  AND any_insider.wall_id = ew.wall_id
                  AND any_insider.membership_type = 'insider'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM ethical_wall_memberships insider
                WHERE insider.tenant_id = ew.tenant_id
                  AND insider.wall_id = ew.wall_id
                  AND insider.membership_type = 'insider'
                  AND (
                    (insider.subject_type = 'user' AND insider.subject_id = $2)
                    OR (
                      insider.subject_type = 'group'
                      AND insider.subject_id IN (SELECT group_id FROM actor_groups)
                    )
                  )
              )
            )
          )
      )
      SELECT
        actor_row.role,
        actor_row.status,
        COALESCE((SELECT array_agg(matter_id) FROM allowed_matter_ids), ARRAY[]::uuid[]) AS allowed_matter_ids,
        COALESCE((SELECT array_agg(matter_id) FROM denied_matter_ids), ARRAY[]::uuid[]) AS denied_matter_ids,
        COALESCE((SELECT array_agg(matter_id) FROM wall_blocked_matter_ids), ARRAY[]::uuid[]) AS wall_blocked_matter_ids,
        COALESCE((SELECT array_agg(document_id) FROM allowed_document_ids), ARRAY[]::uuid[]) AS allowed_document_ids,
        COALESCE((SELECT array_agg(document_id) FROM denied_document_ids), ARRAY[]::uuid[]) AS denied_document_ids
      FROM actor_row
    `,
    [ctx.tenantId, ctx.userId],
  );
}

function materializedScopeFromRow(row: MaterializedScopeRow): MaterializedSearchPermissionScope {
  return {
    allowedMatterIds: row.allowed_matter_ids,
    deniedMatterIds: row.denied_matter_ids,
    wallBlockedMatterIds: row.wall_blocked_matter_ids,
    allowedDocumentIds: row.allowed_document_ids,
    deniedDocumentIds: row.denied_document_ids,
  };
}

function combineFilters(filters: readonly SearchScopeFilter[]): SearchSqlFragment {
  return {
    sql: filters.map((filter) => `(${filter.sql})`).join('\nAND '),
    params: filters.flatMap((filter) => [...filter.params]),
  };
}
