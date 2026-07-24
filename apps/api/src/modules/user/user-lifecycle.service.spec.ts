import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { PgPasswordResetStore } from '../auth/password-reset.service';
import type { SessionRepository } from '../auth/session.repository';
import type { PreviewSessionService } from '../preview/preview-session.service';
import { UserEntity } from './user.entity';
import { UserLifecycleService } from './user-lifecycle.service';
import type { UserService } from './user.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111100';
const targetUserId = '11111111-1111-4111-8111-111111111101';

function user(input: {
  userId: string;
  role: UserEntity['role'];
  status?: UserEntity['status'];
}): UserEntity {
  const now = new Date('2026-07-24T00:00:00.000Z');
  return new UserEntity({
    userId: input.userId,
    tenantId,
    email: `${input.userId}@test.local`,
    name: 'Test User',
    role: input.role,
    practiceGroup: null,
    status: input.status ?? 'active',
    passwordHash: '$argon2id$synthetic',
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

function createService(options: { auditFails?: boolean } = {}) {
  const state = {
    batch: 'uploaded',
    passwordResetsRevoked: false,
    previewRevoked: false,
    sessionsRevoked: false,
    status: 'active' as 'active' | 'inactive',
  };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('UPDATE bulk_upload_batch_items')) {
      state.batch = 'failed';
      return { rowCount: 1, rows: [{ batch_id: '11111111-1111-4111-8111-111111111177' }] };
    }
    if (sql.includes('UPDATE bulk_upload_batches')) {
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });
  const client = { query } satisfies QueryClient;
  const audit = {
    transaction: vi.fn(async (_tenant: string, run: (tx: QueryClient) => Promise<unknown>) => {
      const snapshot = { ...state };
      try {
        return await run(client);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    }),
    log: options.auditFails
      ? vi.fn(async () => {
          throw new Error('AUDIT_INSERT_FAILED');
        })
      : vi.fn(async () => ({ createdAt: new Date(), eventId: 'audit-event' })),
  } as unknown as AuditService;
  const actor = user({ userId: actorUserId, role: 'firm_admin' });
  const target = user({ userId: targetUserId, role: 'matter_member' });
  const users = {
    async findByTenantAndId(_tenantId: TenantId, userId: string) {
      return userId === actorUserId ? actor : userId === targetUserId ? target : null;
    },
    async countActiveUsersByRole() {
      return 2;
    },
    async updateStatus(_tenantId: TenantId, userId: string, status: 'active' | 'inactive') {
      if (userId !== targetUserId) return null;
      state.status = status;
      return user({ userId: targetUserId, role: 'matter_member', status });
    },
  } as unknown as UserService;
  const sessions = {
    revokeAllForUser: vi.fn(async () => {
      state.sessionsRevoked = true;
    }),
  } as unknown as SessionRepository;
  const passwordResets = {
    revokeOpenTokensForUser: vi.fn(async () => {
      state.passwordResetsRevoked = true;
    }),
  } as unknown as PgPasswordResetStore;
  const previews = {
    revokeAllForUser: vi.fn(async () => {
      state.previewRevoked = true;
    }),
  } as unknown as PreviewSessionService;

  return {
    audit,
    passwordResets,
    previews,
    query,
    service: new UserLifecycleService(audit, passwordResets, sessions, previews, users),
    sessions,
    state,
  };
}

describe('UserLifecycleService', () => {
  it('revokes all local authority and terminally fails queued upload authority in one audit transaction', async () => {
    const { audit, passwordResets, previews, query, service, sessions, state } = createService();

    await expect(service.deactivate(tenantId, actorUserId, targetUserId)).resolves.toMatchObject({
      userId: targetUserId,
      status: 'inactive',
    });

    expect(state).toMatchObject({
      batch: 'failed',
      passwordResetsRevoked: true,
      previewRevoked: true,
      sessionsRevoked: true,
      status: 'inactive',
    });
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(tenantId, targetUserId, expect.anything());
    expect(passwordResets.revokeOpenTokensForUser).toHaveBeenCalledWith(
      tenantId,
      targetUserId,
      expect.anything(),
    );
    expect(previews.revokeAllForUser).toHaveBeenCalledWith(tenantId, targetUserId, expect.anything());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("error_reason = 'USER_DEACTIVATED'"),
      [tenantId, targetUserId],
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_DEACTIVATED',
        targetId: targetUserId,
        metadata: {
          reason_code: 'admin_user_deactivated',
          status_before: 'active',
          status_after: 'inactive',
        },
      }),
      expect.anything(),
    );
  });

  it('rolls back status and all authority changes when the audit write fails', async () => {
    const { service, state } = createService({ auditFails: true });

    await expect(service.deactivate(tenantId, actorUserId, targetUserId)).rejects.toThrow(
      'AUDIT_INSERT_FAILED',
    );
    expect(state).toEqual({
      batch: 'uploaded',
      passwordResetsRevoked: false,
      previewRevoked: false,
      sessionsRevoked: false,
      status: 'active',
    });
  });
});
