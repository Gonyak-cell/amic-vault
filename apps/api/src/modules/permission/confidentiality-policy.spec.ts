import { describe, expect, it } from 'vitest';
import {
  effectiveConfidentialityLevel,
  requiresDownloadReason,
  requiresExplicitDocumentAllow,
  roleAllowsDocumentAction,
} from './confidentiality-policy';

describe('confidentiality policy', () => {
  it('treats privileged standard documents as high confidentiality', () => {
    expect(
      effectiveConfidentialityLevel({
        confidentialityLevel: 'standard',
        privilegeStatus: 'privileged',
      }),
    ).toBe('high');
    expect(
      effectiveConfidentialityLevel({
        confidentialityLevel: 'standard',
        privilegeStatus: 'none',
      }),
    ).toBe('standard');
  });

  it('requires explicit allow and download reason for high and restricted documents', () => {
    expect(requiresExplicitDocumentAllow('standard')).toBe(false);
    expect(requiresExplicitDocumentAllow('high')).toBe(true);
    expect(requiresExplicitDocumentAllow('restricted')).toBe(true);
    expect(requiresDownloadReason('restricted')).toBe(true);
  });

  it('keeps download narrower than read', () => {
    expect(roleAllowsDocumentAction('knowledge_manager', 'read')).toBe(true);
    expect(roleAllowsDocumentAction('knowledge_manager', 'download')).toBe(false);
    expect(roleAllowsDocumentAction('firm_admin', 'download')).toBe(false);
    expect(roleAllowsDocumentAction('matter_member', 'download')).toBe(true);
  });
});
