import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { PermissionQueryBuilder } from '../../permission/permission-query.builder';
import { TenantContextService } from '../../tenant/tenant-context';
import { tenantQuery } from '../../../common/db/tenant-query';
import { MatterAppRuntimeService } from './matter-app-runtime.service';

vi.mock('../../../common/db/tenant-query', () => ({
  tenantQuery: vi.fn(),
}));

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const userId = '11111111-1111-4111-8111-111111111102';

function createService() {
  const context = new TenantContextService();
  const userService = {
    findByTenantAndId: vi.fn().mockResolvedValue({
      role: 'matter_member',
      status: 'active',
    }),
  };
  return {
    context,
    service: new MatterAppRuntimeService(
      new PermissionQueryBuilder(),
      context,
      userService as never,
    ),
    userService,
  };
}

describe('MatterAppRuntimeService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    vi.mocked(tenantQuery).mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails closed when the Matter app source is unconfigured', async () => {
    const { service } = createService();

    const status = await service.status(new Date('2026-06-20T00:00:00.000Z'));

    expect(status).toMatchObject({
      mode: 'unconfigured',
      requestedMode: 'unconfigured',
      sourceAvailable: false,
      uploadAuthoritative: false,
      lastSyncAt: null,
      driftCount: 0,
      syncStateAvailable: false,
      unavailableReason: 'unconfigured',
    });
  });

  it('blocks Vault projection fallback in production runtime', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MATTER_APP_SOURCE_MODE = 'vault_projection_only';
    process.env.ALLOW_VAULT_PROJECTION_MATTER_SOURCE = 'true';
    const { service } = createService();

    const status = await service.status(new Date('2026-06-20T00:00:00.000Z'));

    expect(status).toMatchObject({
      mode: 'unconfigured',
      requestedMode: 'vault_projection_only',
      sourceAvailable: false,
      unavailableReason: 'production_projection_blocked',
    });
  });

  it('blocks stale source projections before lookup', async () => {
    process.env.MATTER_APP_SOURCE_MODE = 'matter_app_event_projection';
    process.env.MATTER_APP_SOURCE_CONFIGURED = 'true';
    process.env.MATTER_APP_RUNTIME_READY = 'true';
    process.env.MATTER_APP_STALENESS_MAX_SECONDS = '60';
    process.env.MATTER_APP_SOURCE_UPDATED_AT = '2026-06-20T00:00:00.000Z';
    const { service } = createService();

    const status = await service.status(new Date('2026-06-20T00:02:00.000Z'));

    expect(status).toMatchObject({
      mode: 'unconfigured',
      requestedMode: 'matter_app_event_projection',
      sourceStale: true,
      unavailableReason: 'stale_projection',
    });
  });

  it('blocks Matter app API mode until endpoint and auth are configured', async () => {
    process.env.MATTER_APP_SOURCE_MODE = 'matter_app_api';
    process.env.MATTER_APP_SOURCE_CONFIGURED = 'true';
    process.env.MATTER_APP_RUNTIME_READY = 'true';
    const { service } = createService();

    const status = await service.status(new Date('2026-06-20T00:00:00.000Z'));

    expect(status).toMatchObject({
      mode: 'unconfigured',
      requestedMode: 'matter_app_api',
      sourceAvailable: false,
      uploadAuthoritative: false,
      unavailableReason: 'matter_app_api_config_missing',
    });
  });

  it('uses tenant sync state as Matter app projection health', async () => {
    vi.mocked(tenantQuery).mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          last_sync_at: new Date('2026-06-20T00:00:30.000Z'),
          reflected_count: 5,
          drift_count: 0,
        },
      ],
    } as never);
    const { context, service } = createService();

    const status = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.status(new Date('2026-06-20T00:01:00.000Z')),
    );

    expect(status).toMatchObject({
      mode: 'matter_app_event_projection',
      requestedMode: 'matter_app_event_projection',
      sourceAvailable: true,
      sourceContractReady: true,
      lastSyncAt: '2026-06-20T00:00:30.000Z',
      reflectedCount: 5,
      driftCount: 0,
      syncStateAvailable: true,
      sourceUpdatedAt: '2026-06-20T00:00:30.000Z',
      sourceStale: false,
    });
  });

  it('returns safe empty lookup without touching the projection when source is unavailable', async () => {
    const { service } = createService();

    const response = await service.lookup(userId, { q: 'AMIC', pageSize: 20 });

    expect(response).toMatchObject({
      lookupAvailable: false,
      items: [],
      totalCount: 0,
    });
    expect(tenantQuery).not.toHaveBeenCalled();
  });

  it('rejects UUID-shaped lookup input without querying the projection', async () => {
    process.env.MATTER_APP_SOURCE_MODE = 'vault_projection_only';
    process.env.ALLOW_VAULT_PROJECTION_MATTER_SOURCE = 'true';
    const { context, service } = createService();

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () =>
        service.lookup(userId, {
          q: '22222222-2222-4222-8222-222222222222',
          pageSize: 20,
        }),
    );

    expect(response).toMatchObject({
      lookupAvailable: true,
      items: [],
      totalCount: 0,
    });
    const lookupSqls = vi
      .mocked(tenantQuery)
      .mock.calls.map((call) => String(call[2]))
      .filter((sql) => sql.includes('FROM matters m'));
    expect(lookupSqls).toHaveLength(0);
  });

  it('queries Matter options with SQL-stage permission and wall filters', async () => {
    process.env.MATTER_APP_SOURCE_MODE = 'matter_app_api';
    process.env.MATTER_APP_SOURCE_CONFIGURED = 'true';
    process.env.MATTER_APP_RUNTIME_READY = 'true';
    process.env.MATTER_APP_API_BASE_URL = 'http://127.0.0.1:4180';
    process.env.MATTER_APP_API_TOKEN = 'test-token';
    vi.mocked(tenantQuery).mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          matter_id: '22222222-2222-4222-8222-222222222222',
          matter_code: 'AMIC-2026-0001',
          matter_name: 'Investment Advisory',
          client_name: 'Canonical Client',
          status: 'active',
          practice_group: 'Finance',
          metadata_json: {},
          updated_at: new Date('2026-06-20T00:00:00.000Z'),
          total_count: '1',
        },
      ],
    } as never);
    const { context, service } = createService();

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.lookup(userId, { q: 'AMIC-2026-0001', pageSize: 20 }),
    );

    const sql = vi.mocked(tenantQuery).mock.calls[0]?.[2] ?? '';
    expect(sql).toContain('FROM matter_members mm');
    expect(sql).toContain('FROM ethical_walls ew');
    expect(sql).toContain('LEFT JOIN clients c');
    expect(sql).toContain('lower(coalesce(c.name, \'\')) LIKE');
    expect(response.items).toEqual([
      expect.objectContaining({
        matterCode: 'AMIC-2026-0001',
        clientDisplayName: 'Canonical Client',
        sourceMode: 'matter_app_api',
        uploadEligible: true,
      }),
    ]);
  });
});
