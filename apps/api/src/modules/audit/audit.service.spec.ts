import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextService } from '../tenant/tenant-context';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';
import { AuditService, type QueryClient } from './audit.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

class MemoryClient implements QueryClient {
  readonly params: unknown[][] = [];

  async query(_sql: string, params?: readonly unknown[]) {
    this.params.push([...(params ?? [])]);
    return {
      rows: [{ event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: new Date() }],
      rowCount: 1,
    };
  }
}

function createService(context = new TenantContextService()): AuditService {
  return new AuditService(context, new AuditMetadataNormalizer());
}

describe('AuditService', () => {
  it('inserts normalized audit events with permanent retention by default', async () => {
    const context = new TenantContextService();
    const service = createService(context);
    const client = new MemoryClient();

    await context.run({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }, async () => {
      await expect(
        service.log(
          {
            action: 'CLIENT_CREATED',
            actorId: '11111111-1111-4111-8111-111111111101',
            targetType: 'client',
            targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            metadata: {
              client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              name: 'not stored',
            },
          },
          client,
        ),
      ).resolves.toMatchObject({ eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    });

    const params = client.params[0] ?? [];
    expect(params[0]).toBe(tenantId);
    expect(params[4]).toBe('CLIENT_CREATED');
    expect(params[9]).toBe('{"client_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
    expect(params[11]).toBe('PERMANENT');
  });

  it('denies writes when tenant context is unavailable', async () => {
    const service = createService();
    await expect(
      service.log(
        {
          action: 'LOGIN_SUCCESS',
          targetType: 'auth',
        },
        new MemoryClient(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
