import { describe, expect, it } from 'vitest';
import { addMatterMemberSchema, updateMatterMemberSchema } from '@amic-vault/shared';

describe('matter member DTO validation', () => {
  it('rejects limited_reviewer edit access before service mutation', () => {
    expect(() =>
      addMatterMemberSchema.parse({
        userId: '11111111-1111-4111-8111-111111111102',
        matterRole: 'limited_reviewer',
        accessLevel: 'edit',
      }),
    ).toThrow();
    expect(() =>
      updateMatterMemberSchema.parse({
        matterRole: 'limited_reviewer',
        accessLevel: 'edit',
      }),
    ).toThrow();
  });
});
