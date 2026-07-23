import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OperationalMetricsService,
  readBackupMetrics,
  readDiskMetrics,
} from './operational-metrics.service';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'amic-vault-ops-'));
  temporaryDirectories.push(path);
  return path;
}

describe('OperationalMetricsService', () => {
  it('combines database, scanner, quarantine, backup, and disk aggregates', async () => {
    const directory = temporaryDirectory();
    const backupStatus = join(directory, 'backup-status.json');
    writeFileSync(
      backupStatus,
      JSON.stringify({
        schemaVersion: 'amic-vault.sf20-backup-status.v1',
        backupCompletedAt: '2026-07-23T11:00:00Z',
        lastRestoreDurationSeconds: 600,
      }),
    );
    const database = {
      databasePoolMetrics: vi.fn(() => ({ total: 4, idle: 3, waiting: 1 })),
      readFileSecurityOperationalMetrics: vi.fn(async () => ({
        scannerSignatureAt: new Date('2026-07-23T11:30:00Z'),
        oldestQuarantineAt: new Date('2026-07-23T10:00:00Z'),
        quarantineCount: 2,
      })),
    };
    const service = new OperationalMetricsService(database as never);

    await expect(
      service.collect(
        {
          SF20_BACKUP_STATUS_FILE: backupStatus,
          SF20_MONITORED_DISK_PATH: directory,
        },
        new Date('2026-07-23T12:00:00Z'),
      ),
    ).resolves.toMatchObject({
      databaseAvailable: true,
      databasePoolTotal: 4,
      databasePoolIdle: 3,
      databasePoolWaiting: 1,
      scannerSignatureAvailable: true,
      scannerSignatureAgeSeconds: 1800,
      quarantineCount: 2,
      oldestQuarantineAgeSeconds: 7200,
      backupStatusAvailable: true,
      backupAgeSeconds: 3600,
      lastRestoreDurationSeconds: 600,
      monitoredDiskAvailable: true,
    });
  });

  it('renders failed database and missing status inputs as unavailable', async () => {
    const database = {
      databasePoolMetrics: vi.fn(() => ({ total: 0, idle: 0, waiting: 0 })),
      readFileSecurityOperationalMetrics: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    };

    await expect(
      new OperationalMetricsService(database as never).collect(
        {
          SF20_BACKUP_STATUS_FILE: '/missing/backup-status.json',
          SF20_MONITORED_DISK_PATH: '/missing/disk',
        },
        new Date('2026-07-23T12:00:00Z'),
      ),
    ).resolves.toEqual({
      databaseAvailable: false,
      databasePoolTotal: 0,
      databasePoolIdle: 0,
      databasePoolWaiting: 0,
      scannerSignatureAvailable: false,
      scannerSignatureAgeSeconds: 0,
      quarantineCount: 0,
      oldestQuarantineAgeSeconds: 0,
      backupStatusAvailable: false,
      backupAgeSeconds: 0,
      lastRestoreDurationSeconds: 0,
      monitoredDiskAvailable: false,
      monitoredDiskFreeRatio: 0,
    });
  });

  it('rejects future, unknown-field, symlinked, and oversized backup status inputs', () => {
    const directory = temporaryDirectory();
    const status = join(directory, 'status.json');
    const now = new Date('2026-07-23T12:00:00Z');

    writeFileSync(
      status,
      JSON.stringify({
        schemaVersion: 'amic-vault.sf20-backup-status.v1',
        backupCompletedAt: '2026-07-23T13:00:00Z',
        lastRestoreDurationSeconds: 60,
      }),
    );
    expect(readBackupMetrics(status, now).available).toBe(false);

    writeFileSync(
      status,
      JSON.stringify({
        schemaVersion: 'amic-vault.sf20-backup-status.v1',
        backupCompletedAt: '2026-07-23T11:00:00Z',
        lastRestoreDurationSeconds: 60,
        provider: 'forbidden',
      }),
    );
    expect(readBackupMetrics(status, now).available).toBe(false);

    const link = join(directory, 'status-link.json');
    symlinkSync(status, link);
    expect(readBackupMetrics(link, now).available).toBe(false);

    writeFileSync(status, 'x'.repeat(4097));
    expect(readBackupMetrics(status, now).available).toBe(false);
  });

  it('bounds the monitored disk path and ratio', () => {
    expect(readDiskMetrics('relative').available).toBe(false);
    const result = readDiskMetrics(temporaryDirectory());
    expect(result.available).toBe(true);
    expect(result.freeRatio).toBeGreaterThanOrEqual(0);
    expect(result.freeRatio).toBeLessThanOrEqual(1);
  });
});
