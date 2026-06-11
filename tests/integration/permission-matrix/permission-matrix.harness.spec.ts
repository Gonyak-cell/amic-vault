import { describe, expect, it } from 'vitest';
import { rolePermissionActions } from '../../../packages/shared/src/permission/permission-actions';
import { rolePermissionMatrix } from '../../../packages/shared/src/permission/role-permission-matrix';
import { userRoles } from '../../../packages/shared/src/permission/roles';
import {
  loadMatrixExpectedRows,
  loadPermissionMatrixFixture,
  matrixMemberships,
  matrixWallStates,
} from './fixtures';
import { referenceEvaluate } from './reference-evaluator';

describe('permission matrix harness', () => {
  it('keeps the expected fixture in lockstep with the R1 role/action surface', () => {
    const fixture = loadPermissionMatrixFixture();

    expect(fixture.roles).toEqual(userRoles);
    expect(Object.keys(fixture.decisions).sort()).toEqual([...rolePermissionActions].sort());

    for (const action of rolePermissionActions) {
      expect(fixture.decisions[action]).toEqual(rolePermissionMatrix[action]);
    }
  });

  it('covers every role/action/membership/wall scenario exactly once', () => {
    const fixture = loadPermissionMatrixFixture();
    const rows = loadMatrixExpectedRows();
    const expectedRowCount =
      fixture.roles.length *
      Object.keys(fixture.decisions).length *
      matrixMemberships.length *
      matrixWallStates.length;

    expect(rows).toHaveLength(expectedRowCount);
    expect(new Set(rows.map((row) => row.scenarioId)).size).toBe(expectedRowCount);
  });

  it('matches every committed CSV expected cell against the independent reference evaluator', () => {
    const fixture = loadPermissionMatrixFixture();
    const rows = loadMatrixExpectedRows();
    let denyRows = 0;

    for (const row of rows) {
      const matrixDecision = fixture.decisions[row.action]?.[row.role];
      const expected = referenceEvaluate({
        role: row.role,
        action: row.action,
        matrixDecision,
        membership: row.membership,
        wallState: row.wallState,
      });

      expect(
        {
          expected: row.expected,
          reasonCode: row.reasonCode,
        },
        row.scenarioId,
      ).toEqual({
        expected: expected.expected,
        reasonCode: expected.reasonCode,
      });
      if (expected.expected === 'DENY') {
        denyRows += 1;
        expect(expected.auditExpected, row.scenarioId).toBe(true);
      }
    }

    expect(denyRows).toBeGreaterThan(0);
  });
});
