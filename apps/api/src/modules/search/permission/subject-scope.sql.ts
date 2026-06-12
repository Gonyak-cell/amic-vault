import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor } from './search-scope.types';

export function activePermissionPredicate(alias = 'p'): string {
  return `
    (${alias}.valid_from IS NULL OR ${alias}.valid_from <= now())
    AND (${alias}.valid_to IS NULL OR ${alias}.valid_to > now())
  `;
}

export function unsupportedConditionPredicate(alias = 'p'): string {
  return `${alias}.condition_json IS NOT NULL AND ${alias}.condition_json <> '{}'::jsonb`;
}

export function subjectMatchPredicate(alias = 'p'): string {
  return `
    (
      (${alias}.subject_type = 'user' AND ${alias}.subject_id = ?)
      OR (${alias}.subject_type = 'role' AND ${alias}.subject_id = ?)
      OR (
        ${alias}.subject_type = 'group'
        AND ${alias}.subject_id IN (
          SELECT gm.group_id::text
          FROM group_members gm
          WHERE gm.tenant_id = ${alias}.tenant_id
            AND gm.user_id = ?::uuid
        )
      )
    )
  `;
}

export function subjectMatchParams(actor: SearchPermissionActor): SearchSqlValue[] {
  return [actor.userId, actor.role, actor.userId];
}

export function userWallSubjectPredicate(alias = 'ewm', tenantAlias = 'ew'): string {
  return `
    (
      (${alias}.subject_type = 'user' AND ${alias}.subject_id = ?::uuid)
      OR (
        ${alias}.subject_type = 'group'
        AND ${alias}.subject_id IN (
          SELECT gm.group_id
          FROM group_members gm
          WHERE gm.tenant_id = ${tenantAlias}.tenant_id
            AND gm.user_id = ?::uuid
        )
      )
    )
  `;
}
