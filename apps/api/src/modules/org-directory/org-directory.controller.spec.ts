import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { OrgDirectoryController } from './org-directory.controller';
import type { OrgDirectoryService } from './org-directory.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

const request: RequestWithSession = {
  headers: {},
  session: {
    expiresAt: new Date('2026-06-20T00:00:00.000Z'),
    mfaVerified: true,
    revokedAt: null,
    sessionId: 'session-1',
    tenantId,
    tokenHash: 'sha256:test',
    userId: '11111111-1111-4111-8111-111111111101',
  },
};
const session = request.session;
if (!session) throw new Error('missing org directory test session');

describe('OrgDirectoryController', () => {
  it('parses bounded search query input for the service', async () => {
    const searchSubjects = vi.fn(async () => ({ items: [] }));
    const controller = new OrgDirectoryController({ searchSubjects } as unknown as OrgDirectoryService);

    await expect(
      controller.searchSubjects(request, {
        limit: '7',
        purpose: 'ethical-wall',
        q: 'Alpha',
        subjectType: 'group',
      }),
    ).resolves.toEqual({ items: [] });
    expect(searchSubjects).toHaveBeenCalledWith(
      {
        sessionId: session.sessionId,
        tenantId,
        userId: session.userId,
      },
      {
        limit: 7,
        purpose: 'ethical-wall',
        q: 'Alpha',
        subjectType: 'group',
      },
    );
  });

  it('rejects matter-team search without matter context', () => {
    const controller = new OrgDirectoryController({ searchSubjects: vi.fn() } as unknown as OrgDirectoryService);

    expect(() =>
      controller.searchSubjects(request, {
        purpose: 'matter-team',
        q: 'Alpha',
      }),
    ).toThrow(BadRequestException);
  });

  it('fails closed without a complete session context', () => {
    const controller = new OrgDirectoryController({ searchSubjects: vi.fn() } as unknown as OrgDirectoryService);

    expect(() =>
      controller.searchSubjects(
        { headers: {}, session: { ...session, userId: '' } },
        {
          purpose: 'records',
          q: 'Alpha',
        },
      ),
    ).toThrow(ForbiddenException);
  });
});
