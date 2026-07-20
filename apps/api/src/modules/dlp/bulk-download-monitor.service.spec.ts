import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import {
  bulkDownloadMonitorCron,
  bulkDownloadMonitorDeadLetterQueueName,
  bulkDownloadMonitorQueueName,
  bulkDownloadMonitorScheduleOptions,
  bulkDownloadMonitorWorkOptions,
  BulkDownloadMonitorService,
  isBulkDownloadMonitorWorkerEnabled,
  resolveBulkDownloadThresholds,
} from './bulk-download-monitor.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111102';
const matterId = '11111111-1111-4111-8111-111111111199';
const alertId = '11111111-1111-4111-8111-1111111111aa';
const auditEventId = '11111111-1111-4111-8111-1111111111ab';

interface QueryRecord {
  params: readonly unknown[];
  sql: string;
}

function createService(
  input: {
    candidates?: unknown[];
    insertedAlerts?: unknown[];
    settings?: unknown;
  } = {},
) {
  const queries: QueryRecord[] = [];
  const auditLog = vi.fn().mockResolvedValue({
    eventId: auditEventId,
    createdAt: new Date('2026-07-04T00:20:00.000Z'),
  });
  const client: QueryClient = {
    async query(sql: string, params: readonly unknown[] = []) {
      queries.push({ sql, params });
      if (sql.includes('SELECT settings_json')) {
        return { rows: [{ settings_json: input.settings ?? {} }], rowCount: 1 };
      }
      if (sql.includes('FROM audit_events ae')) {
        return { rows: input.candidates ?? [], rowCount: null };
      }
      if (sql.includes('INSERT INTO dlp_behavior_alerts')) {
        return { rows: input.insertedAlerts ?? [{ alert_id: alertId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const auditService = {
    async transaction<T>(_tenantId: string, run: (tx: QueryClient) => Promise<T>) {
      return run(client);
    },
    log: auditLog,
  };
  const tenantReader = {
    listActiveTenantIds: vi.fn().mockResolvedValue([tenantId]),
  };
  return {
    auditLog,
    queries,
    service: new BulkDownloadMonitorService(auditService as unknown as AuditService, tenantReader),
    tenantReader,
  };
}

describe('BulkDownloadMonitorService', () => {
  it('uses enterprise DMS threshold overrides and detects byte-only bulk download candidates', async () => {
    const { auditLog, queries, service } = createService({
      settings: {
        dlpBulkDownloadThresholdBytes: 1024,
        dlpBulkDownloadThresholdCount: 100,
        dlpBulkDownloadWindowMinutes: 30,
      },
      candidates: [
        {
          actor_user_id: actorUserId,
          matter_id: matterId,
          event_count: 1,
          total_bytes: '2048',
          first_download_at: new Date('2026-07-04T00:00:00.000Z'),
          last_download_at: new Date('2026-07-04T00:10:00.000Z'),
        },
      ],
    });

    await expect(
      service.sweepBulkDownloadAlerts({
        asOf: new Date('2026-07-04T00:30:00.000Z'),
        tenantIds: [tenantId],
      }),
    ).resolves.toEqual({ alertCount: 1, reviewedTenantCount: 1, tenantCount: 1 });

    const candidateQuery = queries.find((query) => query.sql.includes('FROM audit_events ae'));
    expect(candidateQuery?.params).toEqual([
      tenantId,
      new Date('2026-07-04T00:00:00.000Z'),
      new Date('2026-07-04T00:30:00.000Z'),
      100,
      1024,
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DLP_BULK_DOWNLOAD_DETECTED',
        actorType: 'system',
        matterId,
        metadata: expect.objectContaining({
          download_byte_count: 2048,
          threshold_byte_count: 1024,
          threshold_event_count: 100,
          target_user_id: actorUserId,
        }),
        targetId: alertId,
        targetType: 'dlp_behavior_alert',
      }),
      expect.objectContaining({ query: expect.any(Function) }),
    );
    expect(queries.some((query) => query.sql.includes('kind, target_type, target_id'))).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.sql.includes("'dlp_bulk_download'") && query.sql.includes("'records_admin'"),
      ),
    ).toBe(true);
  });

  it('does not duplicate alert audit or notifications when the window already has an alert', async () => {
    const { auditLog, queries, service } = createService({
      candidates: [
        {
          actor_user_id: actorUserId,
          matter_id: matterId,
          event_count: 51,
          total_bytes: '0',
          first_download_at: new Date('2026-07-04T00:00:00.000Z'),
          last_download_at: new Date('2026-07-04T00:10:00.000Z'),
        },
      ],
      insertedAlerts: [],
    });

    await expect(
      service.sweepBulkDownloadAlerts({
        asOf: new Date('2026-07-04T01:00:00.000Z'),
        tenantIds: [tenantId],
      }),
    ).resolves.toMatchObject({ alertCount: 0 });

    expect(auditLog).not.toHaveBeenCalled();
    expect(queries.some((query) => query.sql.includes('INSERT INTO notifications'))).toBe(false);
  });

  it('keeps monitor schedule and default worker role behavior deterministic', () => {
    expect(resolveBulkDownloadThresholds({})).toEqual({
      thresholdBytes: 524_288_000,
      thresholdCount: 50,
      windowMinutes: 60,
    });
    expect(
      isBulkDownloadMonitorWorkerEnabled({
        PROCESS_ROLE: 'worker',
      }),
    ).toBe(true);
    expect(bulkDownloadMonitorCron({})).toBe('*/5 * * * *');
    expect(bulkDownloadMonitorWorkOptions()).toMatchObject({
      batchSize: 1,
      localConcurrency: 1,
    });
    expect(bulkDownloadMonitorScheduleOptions()).toMatchObject({
      deadLetter: bulkDownloadMonitorDeadLetterQueueName,
      key: 'every-five-minutes',
      singletonKey: 'every-five-minutes',
    });
    expect(bulkDownloadMonitorQueueName).toBe('dlp.bulk-download.monitor');
  });
});
