import { describe, expect, it } from 'vitest';
import {
  auditActions,
  auditAnchorActions,
  dmsWorkAuditActions,
  fileSecurityAuditActions,
  isAuditAction,
  knowledgeBankAuditActions,
  r5DlpAuditActions,
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
    expect(fileSecurityAuditActions).toEqual([
      'FILE_QUARANTINED',
      'FILE_SCAN_COMPLETED',
      'FILE_SECURITY_HELD',
      'FILE_PROMOTED',
      'FILE_SECURITY_RECONCILIATION_REVIEWED',
      'FILE_SECURITY_RECONCILIATION_RETRY_REQUESTED',
    ]);
    expect(r5DlpAuditActions).toEqual([
      'DLP_EGRESS_BLOCKED',
      'DLP_REVIEW_RECORDED',
      'DLP_REVIEW_APPLIED',
    ]);
    expect(auditActions).toEqual(expect.arrayContaining([
      ...auditAnchorActions,
      ...dmsWorkAuditActions,
      ...knowledgeBankAuditActions,
      ...fileSecurityAuditActions,
    ]));
    expect(isAuditAction('OIDC_LOGIN_SUCCEEDED')).toBe(false);
  });
});
