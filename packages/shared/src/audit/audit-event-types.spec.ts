import { describe, expect, it } from 'vitest';
import {
  auditActions,
  auditAnchorActions,
  dmsWorkAuditActions,
  isAuditAction,
  knowledgeBankAuditActions,
} from './audit-event-types';

describe('shared audit declaration bridge', () => {
  it('publishes only the approved shared declaration groups', () => {
    expect(auditAnchorActions).toEqual(['AUDIT_ANCHOR_RECORDED']);
    expect(dmsWorkAuditActions).toEqual(['WORK_ITEM_REASSIGNED']);
    expect(knowledgeBankAuditActions).toEqual([
      'KNOWLEDGE_CANDIDATE_PROPOSED',
      'KNOWLEDGE_CANDIDATE_REVIEWED',
      'WIKI_PAGE_PROPOSED',
      'WIKI_PAGE_REVIEWED',
      'WIKI_EXPORTED',
    ]);
    expect(auditActions).toEqual(expect.arrayContaining([
      ...auditAnchorActions,
      ...dmsWorkAuditActions,
      ...knowledgeBankAuditActions,
    ]));
    expect(isAuditAction('OIDC_LOGIN_SUCCEEDED')).toBe(false);
  });
});
