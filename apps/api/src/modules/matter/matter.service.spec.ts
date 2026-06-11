import { describe, expect, it } from 'vitest';
import { canChangeLegalHoldRole, canCreateMatterRole } from './matter.service';

describe('matter conservative guards', () => {
  it('allows only firm admin and matter owner to create matters', () => {
    expect(canCreateMatterRole('firm_admin')).toBe(true);
    expect(canCreateMatterRole('matter_owner')).toBe(true);
    expect(canCreateMatterRole('matter_member')).toBe(false);
  });

  it('allows only firm admin and security admin to change legal hold flags', () => {
    expect(canChangeLegalHoldRole('firm_admin')).toBe(true);
    expect(canChangeLegalHoldRole('security_admin')).toBe(true);
    expect(canChangeLegalHoldRole('matter_owner')).toBe(false);
    expect(canChangeLegalHoldRole('matter_member')).toBe(false);
  });
});
