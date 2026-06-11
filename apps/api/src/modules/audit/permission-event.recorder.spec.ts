import { describe, expect, it } from 'vitest';
import type { AuditService } from './audit.service';
import { PermissionEventRecorder } from './permission-event.recorder';

class MemoryAuditService {
  readonly events: unknown[] = [];
  shouldFail = false;

  async log(input: unknown): Promise<void> {
    if (this.shouldFail) throw new Error('audit unavailable');
    this.events.push(input);
  }
}

describe('PermissionEventRecorder', () => {
  it('records PERMISSION_CHANGED with reference-only metadata', async () => {
    const audit = new MemoryAuditService();
    const recorder = new PermissionEventRecorder(audit as unknown as AuditService);
    await recorder.recordPermissionChanged(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        actorId: '11111111-1111-4111-8111-111111111100',
        targetType: 'matter',
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        matterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        beforeRef: 'none',
        afterRef: 'member:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:member:read',
        reasonCode: 'member_added',
        memberUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      { query: async () => ({ rows: [], rowCount: 0 }) },
    );

    expect(JSON.stringify(audit.events)).not.toContain('test.local');
    expect(audit.events[0]).toMatchObject({
      action: 'PERMISSION_CHANGED',
      metadata: {
        before_ref: 'none',
        reason_code: 'member_added',
      },
    });
  });

  it('does not block denied responses when ACCESS_DENIED audit recording fails', async () => {
    const audit = new MemoryAuditService();
    audit.shouldFail = true;
    const recorder = new PermissionEventRecorder(audit as unknown as AuditService);

    await expect(
      recorder.recordAccessDenied({
        tenantId: '11111111-1111-4111-8111-111111111111',
        actorId: '11111111-1111-4111-8111-111111111101',
        targetType: 'matter',
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        matterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reasonCode: 'PERMISSION_DENIED',
      }),
    ).resolves.toBeUndefined();
  });
});
