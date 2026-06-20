import { describe, expect, it } from 'vitest';
import { orgDirectorySubjectQuerySchema } from './org-directory.dto';

describe('org directory DTO', () => {
  it('requires bounded query text and a purpose', () => {
    expect(
      orgDirectorySubjectQuerySchema.parse({
        purpose: 'ethical-wall',
        q: 'amic',
      }),
    ).toMatchObject({
      limit: 10,
      purpose: 'ethical-wall',
      q: 'amic',
      subjectType: 'all',
    });

    expect(() => orgDirectorySubjectQuerySchema.parse({ purpose: 'records', q: 'a' })).toThrow();
    expect(() => orgDirectorySubjectQuerySchema.parse({ q: 'amic' })).toThrow();
  });

  it('requires matter context for matter team lookups', () => {
    expect(
      orgDirectorySubjectQuerySchema.parse({
        matterId: '11111111-1111-4111-8111-111111111901',
        purpose: 'matter-team',
        q: 'owner',
        subjectType: 'user',
      }),
    ).toMatchObject({
      matterId: '11111111-1111-4111-8111-111111111901',
      purpose: 'matter-team',
      subjectType: 'user',
    });

    expect(() =>
      orgDirectorySubjectQuerySchema.parse({
        purpose: 'matter-team',
        q: 'owner',
      }),
    ).toThrow();
  });
});
