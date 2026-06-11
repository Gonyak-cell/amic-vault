import fs from 'node:fs';
import path from 'node:path';
import type { RolePermissionDecision } from '../../../packages/shared/src/permission/role-permission-matrix';
import type { UserRole } from '../../../packages/shared/src/permission/roles';

export const matrixMemberships = ['none', 'member_read', 'member_edit', 'owner'] as const;
export const matrixWallStates = [
  'none',
  'excluded',
  'insider_nonmember',
  'insider',
  'released',
] as const;

export type MatrixMembership = (typeof matrixMemberships)[number];
export type MatrixWallState = (typeof matrixWallStates)[number];
export type MatrixExpectedDecision = 'ALLOW' | 'DENY';

export interface PermissionMatrixFixture {
  version: string;
  roles: UserRole[];
  decisions: Record<string, Record<UserRole, RolePermissionDecision>>;
}

export interface MatrixExpectedRow {
  scenarioId: string;
  role: UserRole;
  action: string;
  membership: MatrixMembership;
  wallState: MatrixWallState;
  expected: MatrixExpectedDecision;
  reasonCode: string;
}

export const tenantLevelActions = new Set([
  'tenant.settings_read',
  'tenant.settings_update',
  'user.create_invite',
  'group.manage',
  'client.create',
  'client.read',
  'client.update',
  'matter.create',
  'matter.reopen',
  'user.role_assign',
  'wall.create',
  'wall.manage',
  'wall.release',
  'audit.read.tenant',
]);

const repoRoot = process.cwd();

export function loadPermissionMatrixFixture(): PermissionMatrixFixture {
  const fixturePath = path.join(repoRoot, 'tests/fixtures/permission-matrix.json');
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as PermissionMatrixFixture;
}

export function loadMatrixExpectedRows(): MatrixExpectedRow[] {
  const csvPath = path.join(repoRoot, 'tests/integration/permission-matrix/matrix-expected.csv');
  const [header, ...lines] = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  if (header !== 'scenario_id,role,action,membership,wall_state,expected,reason_code') {
    throw new Error('unexpected permission matrix CSV header');
  }
  return lines.map((line) => {
    const [scenarioId, role, action, membership, wallState, expected, reasonCode] = line.split(',');
    return {
      scenarioId,
      role: role as UserRole,
      action,
      membership: membership as MatrixMembership,
      wallState: wallState as MatrixWallState,
      expected: expected as MatrixExpectedDecision,
      reasonCode,
    };
  });
}
