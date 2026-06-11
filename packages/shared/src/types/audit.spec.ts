import { describe, expect, expectTypeOf, it } from 'vitest';
import { auditActions, auditMetadataKeys, type AuditMetadata } from './audit';

describe('audit shared types', () => {
  it('defines the R0 canonical action list', () => {
    expect(auditActions).toEqual([
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'SESSION_REVOKED',
      'PERMISSION_DENIED_HIT',
    ]);
  });

  it('keeps metadata keys restricted to reference-like values', () => {
    const metadata = {
      actor: 'system',
      code: 'PERMISSION_DENIED',
      hash: 'sha256:fixture',
      matter_id: '11111111-1111-4111-8111-111111111111',
    } satisfies AuditMetadata;

    expect(metadata.actor).toBe('system');
    expect(auditMetadataKeys).not.toContain('body');
    expect(auditMetadataKeys).not.toContain('content');
    expect(auditMetadataKeys).not.toContain('snippet');
    expectTypeOf<AuditMetadata>().not.toHaveProperty('body');
  });
});
