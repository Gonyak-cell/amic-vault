import { lstatSync, readFileSync, statfsSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import type { OperationalMetricSnapshot } from './metrics.middleware';

const backupStatusSchema = 'amic-vault.sf20-backup-status.v1';
const backupStatusMaximumBytes = 4096;
const defaultBackupStatusFile = '/run/amic-vault/operations/backup-status.json';
const defaultMonitoredDiskPath = '/tmp';
const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export interface BackupMetrics {
  available: boolean;
  ageSeconds: number;
  lastRestoreDurationSeconds: number;
}

@Injectable()
export class OperationalMetricsService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async collect(
    env: NodeJS.ProcessEnv = process.env,
    now: Date = new Date(),
  ): Promise<OperationalMetricSnapshot> {
    const pool = this.databaseService.databasePoolMetrics();
    let databaseAvailable = false;
    let scannerSignatureAvailable = false;
    let scannerSignatureAgeSeconds = 0;
    let quarantineCount = 0;
    let oldestQuarantineAgeSeconds = 0;
    try {
      const fileSecurity = await this.databaseService.readFileSecurityOperationalMetrics();
      databaseAvailable = true;
      quarantineCount = fileSecurity.quarantineCount;
      const signatureAge = ageSeconds(fileSecurity.scannerSignatureAt, now);
      if (signatureAge !== undefined) {
        scannerSignatureAvailable = true;
        scannerSignatureAgeSeconds = signatureAge;
      }
      oldestQuarantineAgeSeconds =
        quarantineCount > 0 ? (ageSeconds(fileSecurity.oldestQuarantineAt, now) ?? 0) : 0;
    } catch {
      // An unavailable aggregate must render as unavailable, never as fresh.
    }

    const backup = readBackupMetrics(
      env.SF20_BACKUP_STATUS_FILE?.trim() || defaultBackupStatusFile,
      now,
    );
    const disk = readDiskMetrics(env.SF20_MONITORED_DISK_PATH?.trim() || defaultMonitoredDiskPath);

    return {
      databaseAvailable,
      databasePoolTotal: pool.total,
      databasePoolIdle: pool.idle,
      databasePoolWaiting: pool.waiting,
      scannerSignatureAvailable,
      scannerSignatureAgeSeconds,
      quarantineCount,
      oldestQuarantineAgeSeconds,
      backupStatusAvailable: backup.available,
      backupAgeSeconds: backup.ageSeconds,
      lastRestoreDurationSeconds: backup.lastRestoreDurationSeconds,
      monitoredDiskAvailable: disk.available,
      monitoredDiskFreeRatio: disk.freeRatio,
    };
  }
}

export function readBackupMetrics(path: string, now: Date): BackupMetrics {
  try {
    const metadata = lstatSync(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > backupStatusMaximumBytes
    ) {
      return unavailableBackupMetrics;
    }
    const raw = readFileSync(path, 'utf8');
    if (Buffer.byteLength(raw) > backupStatusMaximumBytes) return unavailableBackupMetrics;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return unavailableBackupMetrics;
    if (
      !exactKeys(value, ['backupCompletedAt', 'lastRestoreDurationSeconds', 'schemaVersion']) ||
      value.schemaVersion !== backupStatusSchema ||
      typeof value.backupCompletedAt !== 'string' ||
      !canonicalUtc.test(value.backupCompletedAt) ||
      !Number.isSafeInteger(value.lastRestoreDurationSeconds) ||
      Number(value.lastRestoreDurationSeconds) < 0 ||
      Number(value.lastRestoreDurationSeconds) > 7 * 24 * 60 * 60
    ) {
      return unavailableBackupMetrics;
    }
    const completedAt = new Date(value.backupCompletedAt);
    const age = ageSeconds(completedAt, now);
    if (age === undefined) return unavailableBackupMetrics;
    return {
      available: true,
      ageSeconds: age,
      lastRestoreDurationSeconds: Number(value.lastRestoreDurationSeconds),
    };
  } catch {
    return unavailableBackupMetrics;
  }
}

export function readDiskMetrics(path: string): { available: boolean; freeRatio: number } {
  try {
    if (!path.startsWith('/') || path.includes('\0')) return unavailableDiskMetrics;
    const statistics = statfsSync(path);
    const blocks = Number(statistics.blocks);
    const available = Number(statistics.bavail);
    if (!Number.isFinite(blocks) || !Number.isFinite(available) || blocks <= 0 || available < 0) {
      return unavailableDiskMetrics;
    }
    return { available: true, freeRatio: Math.min(1, available / blocks) };
  } catch {
    return unavailableDiskMetrics;
  }
}

const unavailableBackupMetrics: BackupMetrics = Object.freeze({
  available: false,
  ageSeconds: 0,
  lastRestoreDurationSeconds: 0,
});
const unavailableDiskMetrics = Object.freeze({ available: false, freeRatio: 0 });

function ageSeconds(value: Date | null, now: Date): number | undefined {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime()) ||
    !Number.isFinite(now.getTime())
  ) {
    return undefined;
  }
  const milliseconds = now.getTime() - value.getTime();
  return milliseconds >= 0 ? Math.floor(milliseconds / 1000) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
