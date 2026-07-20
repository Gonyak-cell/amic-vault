import { describe, expect, it } from 'vitest';
import { DocumentScopeFilter } from './document-scope.filter';
import type { SearchPermissionActor } from './search-scope.types';

const actor: SearchPermissionActor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111101',
  role: 'matter_owner',
  materializedScope: {
    allowedMatterIds: ['11111111-1111-4111-8111-111111111201'],
    deniedMatterIds: [],
    wallBlockedMatterIds: [],
    allowedDocumentIds: ['11111111-1111-4111-8111-111111111301'],
    deniedDocumentIds: ['11111111-1111-4111-8111-111111111302'],
  },
};

describe('DocumentScopeFilter', () => {
  it('injects document state, explicit deny, unsupported condition, and explicit allow gates', () => {
    const filter = new DocumentScopeFilter().build(actor);

    expect(filter.sql).toContain('FROM documents d');
    expect(filter.sql).toContain('d.document_id = idx.document_id');
    expect(filter.sql).toContain("d.status <> 'deleted'");
    expect(filter.sql).toContain('d.deleted_at IS NULL');
    expect(filter.sql).toContain("? <> 'limited_reviewer'");
    expect(filter.sql).toContain("d.confidentiality_level = 'standard'");
    expect(filter.sql).toContain('idx.document_id = ANY(?::uuid[])');
    expect(filter.sql).toContain('NOT (idx.document_id = ANY(?::uuid[]))');
    expect(filter.params).toEqual([
      actor.role,
      actor.materializedScope?.allowedDocumentIds,
      actor.materializedScope?.deniedDocumentIds,
    ]);
    expect(filter.appliedRules).toEqual(
      expect.arrayContaining([
        'document.status:not_deleted',
        'document.permissions:condition_fail_closed',
        'document.permissions:explicit_deny',
        'document.confidentiality:explicit_allow_when_required',
        'document.limited_reviewer:explicit_allow_required',
      ]),
    );
  });

  it('fails closed for roles that cannot read documents', () => {
    const filter = new DocumentScopeFilter().build({ ...actor, role: 'external_user' });

    expect(filter.sql).toBe('FALSE');
    expect(filter.params).toEqual([]);
    expect(filter.appliedRules).toEqual(['document.read:role_deny']);
  });
});
