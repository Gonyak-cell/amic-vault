import { describe, expect, it, vi } from 'vitest';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  it('renders queue and operational snapshots from the same scrape', async () => {
    const queueSnapshot = [
      {
        queue: 'document.extract',
        depth: 2,
        deadLetterCount: 1,
        oldestAgeSeconds: 30,
      },
    ];
    const operationalSnapshot = {
      databaseAvailable: true,
      databasePoolTotal: 4,
      databasePoolIdle: 3,
      databasePoolWaiting: 1,
      scannerSignatureAvailable: true,
      scannerSignatureAgeSeconds: 60,
      quarantineCount: 1,
      oldestQuarantineAgeSeconds: 120,
      backupStatusAvailable: true,
      backupAgeSeconds: 180,
      lastRestoreDurationSeconds: 240,
      monitoredDiskAvailable: true,
      monitoredDiskFreeRatio: 0.75,
    };
    const registry = { render: vi.fn(() => 'metrics\n') };
    const queueMetrics = { collect: vi.fn(async () => queueSnapshot) };
    const operationalMetrics = { collect: vi.fn(async () => operationalSnapshot) };
    const controller = new MetricsController(
      registry as never,
      queueMetrics as never,
      operationalMetrics as never,
    );

    await expect(controller.metrics()).resolves.toBe('metrics\n');
    expect(registry.render).toHaveBeenCalledWith(queueSnapshot, operationalSnapshot);
  });
});
