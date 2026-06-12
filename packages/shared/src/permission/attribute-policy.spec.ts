import { describe, expect, it } from 'vitest';
import { evaluatePermissionCondition, type PermissionAttributeContext } from './attribute-policy';

const context: PermissionAttributeContext = {
  actor: { role: 'matter_member', practiceGroup: 'litigation' },
  matter: {
    status: 'active',
    practiceGroup: 'litigation',
    clientId: '11111111-1111-4111-8111-111111111122',
  },
  document: {
    status: 'draft',
    documentType: 'contract',
    confidentialityLevel: 'high',
    privilegeStatus: 'none',
  },
};

describe('attribute policy condition evaluator', () => {
  it('matches supported scalar and set conditions', () => {
    expect(
      evaluatePermissionCondition(
        { attribute: 'matter.practice_group', operator: 'eq', value: 'litigation' },
        context,
      ),
    ).toEqual({ outcome: 'match' });

    expect(
      evaluatePermissionCondition(
        {
          all: [
            { attribute: 'actor.practice_group', operator: 'in', value: ['litigation'] },
            { attribute: 'document.confidentiality_level', operator: 'not_eq', value: 'restricted' },
          ],
        },
        context,
      ),
    ).toEqual({ outcome: 'match' });
  });

  it('returns no_match for valid conditions that do not match', () => {
    expect(
      evaluatePermissionCondition(
        { attribute: 'matter.practice_group', operator: 'eq', value: 'tax' },
        context,
      ),
    ).toEqual({ outcome: 'no_match' });
  });

  it('rejects unknown attributes unsupported operators and injection-shaped values', () => {
    expect(
      evaluatePermissionCondition(
        { attribute: 'matter.billing_rate', operator: 'eq', value: 'secret' },
        context,
      ),
    ).toMatchObject({ outcome: 'invalid', reason: 'unknown_attribute' });

    expect(
      evaluatePermissionCondition(
        { attribute: 'matter.practice_group', operator: 'regex', value: '.*' },
        context,
      ),
    ).toMatchObject({ outcome: 'invalid', reason: 'unsupported_operator' });

    expect(
      evaluatePermissionCondition(
        { attribute: 'matter.practice_group', operator: 'eq', value: { '$ne': 'litigation' } },
        context,
      ),
    ).toMatchObject({ outcome: 'invalid', reason: 'invalid_scalar_value' });
  });
});
