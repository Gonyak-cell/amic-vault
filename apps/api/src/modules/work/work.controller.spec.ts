import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { WorkQueueController } from './work.controller';
import { WorkService } from './work.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111102';
const matterId = '22222222-2222-4222-8222-222222222222';
const itemKey = 'workflow-work-aabbccddeeff';

function request(): RequestWithSession {
  return {
    headers: {},
    session: {
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      mfaVerified: true,
      revokedAt: null,
      sessionId: 'work-controller-test-session',
      tenantId,
      tokenHash: 'sha256:work-controller-test',
      userId: actorUserId,
    },
  };
}

type WorkControllerService = Pick<
  WorkService,
  'listWorkItems' | 'listReassignmentCandidates' | 'reassignWorkItem' | 'updateWorkItemDueAt'
>;

function serviceMock(overrides: Partial<WorkControllerService>): WorkService {
  return Object.assign(Object.create(WorkService.prototype) as WorkService, overrides);
}

describe('WorkQueueController', () => {
  it('passes a validated optional matterId into the permission-scoped list', () => {
    const listWorkItems = vi.fn<WorkService['listWorkItems']>();
    const controller = new WorkQueueController(serviceMock({ listWorkItems }));

    controller.listWorkItems(request(), { matterId, limit: '10' });

    expect(listWorkItems).toHaveBeenCalledWith(actorUserId, {
      matterId,
      assignee: 'all',
      limit: 10,
      offset: 0,
    });
    expect(() => controller.listWorkItems(request(), { matterId: 'not-a-uuid' })).toThrow(
      BadRequestException,
    );
  });

  it('validates and forwards assignee and non-null ISO dueAt mutations', () => {
    const reassignWorkItem = vi.fn<WorkService['reassignWorkItem']>();
    const updateWorkItemDueAt = vi.fn<WorkService['updateWorkItemDueAt']>();
    const controller = new WorkQueueController(
      serviceMock({
        reassignWorkItem,
        updateWorkItemDueAt,
      }),
    );

    controller.reassignWorkItem(request(), itemKey, {
      assignedToUserId: matterId,
    });
    controller.updateWorkItemDueAt(request(), itemKey, {
      dueAt: '2026-08-01T09:30:00+09:00',
    });

    expect(reassignWorkItem).toHaveBeenCalledWith(actorUserId, itemKey, {
      assignedToUserId: matterId,
    });
    expect(updateWorkItemDueAt).toHaveBeenCalledWith(actorUserId, itemKey, {
      dueAt: '2026-08-01T09:30:00+09:00',
    });
    expect(() => controller.updateWorkItemDueAt(request(), itemKey, { dueAt: null })).toThrow(
      BadRequestException,
    );
  });

  it('validates and forwards bounded reassignment candidate queries', () => {
    const listReassignmentCandidates = vi.fn<WorkService['listReassignmentCandidates']>();
    const controller = new WorkQueueController(
      serviceMock({
        listReassignmentCandidates,
      }),
    );

    controller.listReassignmentCandidates(request(), itemKey, {
      q: '  Alpha  ',
      limit: '10',
    });

    expect(listReassignmentCandidates).toHaveBeenCalledWith(actorUserId, itemKey, {
      q: 'Alpha',
      limit: 10,
    });
    expect(() =>
      controller.listReassignmentCandidates(request(), itemKey, { limit: '26' }),
    ).toThrow(BadRequestException);
    expect(() => controller.listReassignmentCandidates(request(), itemKey, { matterId })).toThrow(
      BadRequestException,
    );
  });
});
