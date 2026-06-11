import { describe, expect, it } from 'vitest';
import { canCreateMatterRole } from './matter.service';

describe('matter conservative guards', () => {
  it('allows only firm admin and matter owner to create matters', () => {
    expect(canCreateMatterRole('firm_admin')).toBe(true);
    expect(canCreateMatterRole('matter_owner')).toBe(true);
    expect(canCreateMatterRole('matter_member')).toBe(false);
  });
});
