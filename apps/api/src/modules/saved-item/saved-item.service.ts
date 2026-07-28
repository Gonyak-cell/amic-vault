import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import {
  isUserRole,
  type CreateSavedItemDto,
  type ReorderSavedItemsDto,
  type SavedItemDto,
  type SavedItemListDto,
  type SavedItemTargetType,
  type UserRole,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../search/permission/search-permission-scope.provider';

const maximumSavedItems = 100;

interface SavedItemContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

interface ActorRow extends QueryResultRow {
  role: string;
  status: string;
}

interface SavedItemRow extends QueryResultRow {
  saved_item_id: string;
  target_type: SavedItemTargetType;
  target_id: string;
  label: string;
  context_label: string | null;
  href: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface StoredSavedItemRow extends QueryResultRow {
  saved_item_id: string;
  target_type: SavedItemTargetType;
  target_id: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface VisibleTarget {
  targetType: SavedItemTargetType;
  targetId: string;
  label: string;
  contextLabel: string | null;
  href: string;
  matterId: string | null;
}

function denied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function invalid(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function bindQuestionMarks(sql: string, firstParamIndex: number): string {
  let next = firstParamIndex;
  return sql.replaceAll('?', () => `$${next++}`);
}

function toDto(row: SavedItemRow): SavedItemDto {
  return {
    savedItemId: row.saved_item_id,
    targetType: row.target_type,
    targetId: row.target_id,
    label: row.label,
    contextLabel: row.context_label,
    href: row.href,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function storedToDto(row: StoredSavedItemRow, target: VisibleTarget): SavedItemDto {
  return {
    savedItemId: row.saved_item_id,
    targetType: target.targetType,
    targetId: target.targetId,
    label: target.label,
    contextLabel: target.contextLabel,
    href: target.href,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class SavedItemService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionQueryBuilder)
    private readonly permissionQueryBuilder: PermissionQueryBuilder,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly searchPermissionScopeProvider: SearchPermissionScopeProvider,
  ) {}

  async list(ctx: SavedItemContext): Promise<SavedItemListDto> {
    const searchDecision = await this.searchPermissionScopeProvider.scopeForSearch(ctx);
    if (searchDecision.effect !== 'ALLOW') throw denied();

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const role = await this.lockActiveActor(client, ctx);
      const searchScopeSql = bindQuestionMarks(searchDecision.scope.sql, 3);
      const matterParamStart = 3 + searchDecision.scope.params.length;
      const matterFilter = this.permissionQueryBuilder.buildMatterFilter(
        { tenantId: ctx.tenantId, userId: ctx.userId, role },
        matterParamStart,
        'm',
      );
      const result = await client.query<SavedItemRow>(
        `
          SELECT *
          FROM (
            SELECT
              si.saved_item_id,
              si.target_type,
              si.target_id,
              d.title AS label,
              concat_ws(' · ', m.matter_code, m.matter_name) AS context_label,
              '/documents/' || d.document_id::text AS href,
              si.position,
              si.created_at,
              si.updated_at
            FROM saved_items si
            JOIN documents d
              ON d.tenant_id = si.tenant_id
             AND d.document_id = si.target_id
            JOIN matters m
              ON m.tenant_id = d.tenant_id
             AND m.matter_id = d.matter_id
            CROSS JOIN LATERAL (
              SELECT d.tenant_id, d.document_id, d.matter_id
            ) idx
            WHERE si.tenant_id = $1
              AND si.user_id = $2
              AND si.target_type = 'document'
              AND (${searchScopeSql})

            UNION ALL

            SELECT
              si.saved_item_id,
              si.target_type,
              si.target_id,
              m.matter_name AS label,
              m.matter_code AS context_label,
              '/matters/' || m.matter_id::text AS href,
              si.position,
              si.created_at,
              si.updated_at
            FROM saved_items si
            JOIN matters m
              ON m.tenant_id = si.tenant_id
             AND m.matter_id = si.target_id
            WHERE si.tenant_id = $1
              AND si.user_id = $2
              AND si.target_type = 'matter'
              AND (${matterFilter.sql})

            UNION ALL

            SELECT
              si.saved_item_id,
              si.target_type,
              si.target_id,
              ss.name AS label,
              '저장 검색'::text AS context_label,
              '/search?searchRef=' || ss.saved_search_id::text AS href,
              si.position,
              si.created_at,
              si.updated_at
            FROM saved_items si
            JOIN saved_searches ss
              ON ss.tenant_id = si.tenant_id
             AND ss.saved_search_id = si.target_id
            WHERE si.tenant_id = $1
              AND si.user_id = $2
              AND si.target_type = 'saved_search'
              AND ss.user_id = $2
              AND ss.scope_type = 'personal'
              AND ss.revoked_at IS NULL
          ) visible_saved_items
          ORDER BY position, saved_item_id
          LIMIT ${maximumSavedItems}
        `,
        [
          ctx.tenantId,
          ctx.userId,
          ...searchDecision.scope.params,
          ...matterFilter.params,
        ],
      );
      const visibleIds = result.rows.map((row) => row.saved_item_id);
      await client.query('SET CONSTRAINTS saved_items_position_unique DEFERRED');
      const stale = await client.query<StoredSavedItemRow>(
        `
          DELETE FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
            AND NOT (saved_item_id = ANY($3::uuid[]))
          RETURNING saved_item_id, target_type, target_id, position, created_at, updated_at
        `,
        [ctx.tenantId, ctx.userId, visibleIds],
      );
      if (stale.rows.length > 0) {
        await this.compactPositions(client, ctx);
        for (const row of stale.rows) {
          await this.auditService.log(
            {
              tenantId: ctx.tenantId,
              actorId: ctx.userId,
              sessionId: ctx.sessionId,
              action: 'SAVED_ITEM_REMOVED',
              targetType: 'saved_item',
              targetId: row.saved_item_id,
              metadata: {
                request_id: row.saved_item_id,
                scope_type: row.target_type,
                scope_id: row.target_id,
                stale_reason: 'target_not_visible',
              },
            },
            client,
          );
        }
      }
      return {
        items: result.rows.map((row, position) => ({ ...toDto(row), position })),
      };
    });
  }

  async create(ctx: SavedItemContext, input: CreateSavedItemDto): Promise<SavedItemDto> {
    const target = await this.findVisibleTarget(ctx, input.targetType, input.targetId);
    if (!target) throw denied();

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.lockActiveActor(client, ctx);
      const existing = await client.query<StoredSavedItemRow>(
        `
          SELECT saved_item_id, target_type, target_id, position, created_at, updated_at
          FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
            AND target_type = $3
            AND target_id = $4
          LIMIT 1
        `,
        [ctx.tenantId, ctx.userId, input.targetType, input.targetId],
      );
      if (existing.rows[0]) return storedToDto(existing.rows[0], target);

      const countResult = await client.query<{ item_count: string }>(
        `
          SELECT count(*)::text AS item_count
          FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
        `,
        [ctx.tenantId, ctx.userId],
      );
      const position = Number(countResult.rows[0]?.item_count ?? 0);
      if (!Number.isSafeInteger(position) || position >= maximumSavedItems) throw invalid();

      const inserted = await client.query<StoredSavedItemRow>(
        `
          INSERT INTO saved_items (
            tenant_id, user_id, target_type, target_id, position
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING saved_item_id, target_type, target_id, position, created_at, updated_at
        `,
        [ctx.tenantId, ctx.userId, input.targetType, input.targetId, position],
      );
      const row = inserted.rows[0];
      if (!row) throw invalid();

      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId,
          action: 'SAVED_ITEM_ADDED',
          targetType: 'saved_item',
          targetId: row.saved_item_id,
          matterId: target.matterId,
          metadata: {
            request_id: row.saved_item_id,
            scope_type: target.targetType,
            scope_id: target.targetId,
          },
        },
        client,
      );
      return storedToDto(row, target);
    });
  }

  async remove(ctx: SavedItemContext, savedItemId: string): Promise<void> {
    await this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.lockActiveActor(client, ctx);
      await client.query('SET CONSTRAINTS saved_items_position_unique DEFERRED');
      const removed = await client.query<StoredSavedItemRow>(
        `
          DELETE FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
            AND saved_item_id = $3
          RETURNING saved_item_id, target_type, target_id, position, created_at, updated_at
        `,
        [ctx.tenantId, ctx.userId, savedItemId],
      );
      const row = removed.rows[0];
      if (!row) throw denied();

      await this.compactPositions(client, ctx);

      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId,
          action: 'SAVED_ITEM_REMOVED',
          targetType: 'saved_item',
          targetId: row.saved_item_id,
          metadata: {
            request_id: row.saved_item_id,
            scope_type: row.target_type,
            scope_id: row.target_id,
          },
        },
        client,
      );
    });
  }

  async reorder(ctx: SavedItemContext, input: ReorderSavedItemsDto): Promise<void> {
    await this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.lockActiveActor(client, ctx);
      const current = await client.query<{ saved_item_id: string }>(
        `
          SELECT saved_item_id
          FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
          ORDER BY position, saved_item_id
          FOR UPDATE
        `,
        [ctx.tenantId, ctx.userId],
      );
      const currentIds = current.rows.map((row) => row.saved_item_id);
      if (
        currentIds.length !== input.savedItemIds.length ||
        currentIds.some((id) => !input.savedItemIds.includes(id))
      ) {
        throw invalid();
      }
      if (currentIds.every((id, index) => id === input.savedItemIds[index])) return;

      await client.query('SET CONSTRAINTS saved_items_position_unique DEFERRED');
      await client.query(
        `
          UPDATE saved_items si
          SET position = requested.position,
              updated_at = now()
          FROM (
            SELECT saved_item_id, ordinality - 1 AS position
            FROM unnest($3::uuid[]) WITH ORDINALITY AS ids(saved_item_id, ordinality)
          ) requested
          WHERE si.tenant_id = $1
            AND si.user_id = $2
            AND si.saved_item_id = requested.saved_item_id
        `,
        [ctx.tenantId, ctx.userId, input.savedItemIds],
      );
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId,
          action: 'SAVED_ITEMS_REORDERED',
          targetType: 'user_saved_items',
          targetId: ctx.userId,
          metadata: { item_count: input.savedItemIds.length },
        },
        client,
      );
    });
  }

  private async findVisibleTarget(
    ctx: SavedItemContext,
    targetType: SavedItemTargetType,
    targetId: string,
  ): Promise<VisibleTarget | null> {
    if (targetType === 'document') return this.findVisibleDocument(ctx, targetId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const role = await this.activeActorRole(client, ctx);
      if (targetType === 'matter') {
        const filter = this.permissionQueryBuilder.buildMatterFilter(
          { tenantId: ctx.tenantId, userId: ctx.userId, role },
          3,
          'm',
        );
        const result = await client.query<{
          matter_id: string;
          matter_name: string;
          matter_code: string;
        }>(
          `
            SELECT m.matter_id, m.matter_name, m.matter_code
            FROM matters m
            WHERE m.tenant_id = $1
              AND m.matter_id = $2
              AND (${filter.sql})
            LIMIT 1
          `,
          [ctx.tenantId, targetId, ...filter.params],
        );
        const row = result.rows[0];
        return row
          ? {
              targetType,
              targetId: row.matter_id,
              label: row.matter_name,
              contextLabel: row.matter_code,
              href: `/matters/${row.matter_id}`,
              matterId: row.matter_id,
            }
          : null;
      }

      const result = await client.query<{
        saved_search_id: string;
        name: string;
      }>(
        `
          SELECT saved_search_id, name
          FROM saved_searches
          WHERE tenant_id = $1
            AND user_id = $2
            AND saved_search_id = $3
            AND scope_type = 'personal'
            AND revoked_at IS NULL
          LIMIT 1
        `,
        [ctx.tenantId, ctx.userId, targetId],
      );
      const row = result.rows[0];
      return row
        ? {
            targetType,
            targetId: row.saved_search_id,
            label: row.name,
            contextLabel: '저장 검색',
            href: `/search?searchRef=${row.saved_search_id}`,
            matterId: null,
          }
        : null;
    });
  }

  private async findVisibleDocument(
    ctx: SavedItemContext,
    targetId: string,
  ): Promise<VisibleTarget | null> {
    const decision = await this.searchPermissionScopeProvider.scopeForSearch(ctx);
    if (decision.effect !== 'ALLOW') return null;
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.activeActorRole(client, ctx);
      const scopeSql = bindQuestionMarks(decision.scope.sql, 3);
      const result = await client.query<{
        document_id: string;
        matter_id: string;
        title: string;
        matter_code: string;
        matter_name: string;
      }>(
        `
          SELECT d.document_id, d.matter_id, d.title, m.matter_code, m.matter_name
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          CROSS JOIN LATERAL (
            SELECT d.tenant_id, d.document_id, d.matter_id
          ) idx
          WHERE d.tenant_id = $1
            AND d.document_id = $2
            AND (${scopeSql})
          LIMIT 1
        `,
        [ctx.tenantId, targetId, ...decision.scope.params],
      );
      const row = result.rows[0];
      return row
        ? {
            targetType: 'document',
            targetId: row.document_id,
            label: row.title,
            contextLabel: [row.matter_code, row.matter_name].filter(Boolean).join(' · '),
            href: `/documents/${row.document_id}`,
            matterId: row.matter_id,
          }
        : null;
    });
  }

  private async activeActorRole(
    client: PoolClient,
    ctx: SavedItemContext,
  ): Promise<UserRole> {
    const result = await client.query<ActorRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active' || !isUserRole(row.role)) throw denied();
    return row.role;
  }

  private async lockActiveActor(
    client: PoolClient,
    ctx: SavedItemContext,
  ): Promise<UserRole> {
    const result = await client.query<ActorRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [ctx.tenantId, ctx.userId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active' || !isUserRole(row.role)) throw denied();
    return row.role;
  }

  private async compactPositions(client: PoolClient, ctx: SavedItemContext): Promise<void> {
    await client.query(
      `
        WITH ordered AS (
          SELECT
            saved_item_id,
            row_number() OVER (ORDER BY position, saved_item_id) - 1 AS next_position
          FROM saved_items
          WHERE tenant_id = $1
            AND user_id = $2
        )
        UPDATE saved_items si
        SET position = ordered.next_position,
            updated_at = now()
        FROM ordered
        WHERE si.tenant_id = $1
          AND si.user_id = $2
          AND si.saved_item_id = ordered.saved_item_id
          AND si.position <> ordered.next_position
      `,
      [ctx.tenantId, ctx.userId],
    );
  }
}
