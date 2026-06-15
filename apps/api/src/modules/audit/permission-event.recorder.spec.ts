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

  it('marks matter prep artifacts stale on permission changes with bounded metadata', async () => {
    const audit = new MemoryAuditService();
    const recorder = new PermissionEventRecorder(audit as unknown as AuditService);
    const client = {
      query: async () => ({
        rows: [
          {
            ai_prep_artifact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            artifact_kind: 'document_profile',
            matter_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            document_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            document_version_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          },
        ],
        rowCount: 1,
      }),
    };

    await recorder.recordPermissionChanged(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        actorId: '11111111-1111-4111-8111-111111111100',
        targetType: 'matter',
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        matterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        beforeRef: 'member:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:member:edit',
        afterRef: 'none',
        reasonCode: 'member_removed',
        memberUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      client,
    );

    expect(audit.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_STALE',
          targetType: 'ai_prep_artifact',
          metadata: expect.objectContaining({
            ai_prep_artifact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            ai_prep_kind: 'document_profile',
            ai_prep_status: 'stale',
            stale_reason: 'permission_changed',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(audit.events)).not.toMatch(/source text|prompt|response|raw/u);
  });

  it('uses the ethical wall stale reason for wall permission changes', async () => {
    const audit = new MemoryAuditService();
    const recorder = new PermissionEventRecorder(audit as unknown as AuditService);
    const client = {
      query: async () => ({
        rows: [
          {
            ai_prep_artifact_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            artifact_kind: 'document_profile',
            matter_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            document_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            document_version_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          },
        ],
        rowCount: 1,
      }),
    };

    await recorder.recordPermissionChanged(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        actorId: '11111111-1111-4111-8111-111111111100',
        targetType: 'ethical_wall',
        targetId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        matterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        beforeRef: 'none',
        afterRef: 'wall:ffffffff-ffff-4fff-8fff-ffffffffffff:active',
        reasonCode: 'ethical_wall_created',
        wallId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      },
      client,
    );

    expect(audit.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'AI_PREP_STALE',
          metadata: expect.objectContaining({ stale_reason: 'ethical_wall_changed' }),
        }),
      ]),
    );
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
