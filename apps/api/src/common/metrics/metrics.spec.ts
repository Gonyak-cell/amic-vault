import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from './metrics.middleware';

describe('MetricsRegistry', () => {
  it('renders prometheus counters and histograms without tenant or user labels', () => {
    const registry = new MetricsRegistry();

    registry.observe({
      method: 'GET',
      path: '/v1/tenant/workspaces/:id',
      status: '200',
      durationMs: 12,
    });

    const rendered = registry.render();
    expect(rendered).toContain('http_requests_total');
    expect(rendered).toContain('http_request_duration_ms_bucket');
    expect(rendered).toContain('document_integrity_alerts_total 0');
    expect(rendered).toContain('path="/v1/tenant/workspaces/:id"');
    expect(rendered).not.toContain('tenant_id');
    expect(rendered).not.toContain('user_id');
    expect(rendered).not.toContain('@test.local');
  });

  it('keeps HTTP histogram storage bounded after high-volume observations', () => {
    const registry = new MetricsRegistry();

    for (let index = 0; index < 100_000; index += 1) {
      registry.observe({
        method: 'GET',
        path: `/v1/documents/custom-route-${index}`,
        status: '200',
        durationMs: index % 6000,
      });
    }

    const stats = registry.stats();
    expect(stats.httpObservationCount).toBe(100_000);
    expect(stats.httpSeriesCount).toBeLessThanOrEqual(stats.maxHttpSeriesCount);
    expect(stats.httpBucketSlotCount).toBeLessThanOrEqual(
      stats.maxHttpSeriesCount * stats.bucketCount,
    );
    expect(registry.render()).toContain('path="__overflow__"');
  });

  it('renders bounded pg-boss queue depth and dead-letter gauges', () => {
    const registry = new MetricsRegistry();

    const rendered = registry.render([
      { queue: 'extraction', depth: 7, deadLetterCount: 1, oldestAgeSeconds: 41 },
      { queue: 'indexing', depth: 3, deadLetterCount: 0, oldestAgeSeconds: 17 },
      { queue: 'ai-prep', depth: 5, deadLetterCount: 2, oldestAgeSeconds: 73 },
    ]);

    expect(rendered).toContain('# TYPE pgboss_queue_depth gauge');
    expect(rendered).toContain('pgboss_queue_depth{queue="ai-prep"} 5');
    expect(rendered).toContain('pgboss_queue_depth{queue="extraction"} 7');
    expect(rendered).toContain('pgboss_queue_depth{queue="indexing"} 3');
    expect(rendered).toContain('pgboss_dead_letter_jobs{queue="ai-prep"} 2');
    expect(rendered).toContain('pgboss_queue_oldest_age_seconds{queue="ai-prep"} 73');
    expect(rendered).not.toContain('tenant_id');
    expect(rendered).not.toContain('document_id');
  });

  it('records integrity alerts without tenant or document labels', () => {
    const registry = new MetricsRegistry();
    registry.recordDocumentIntegrityAlert();
    const rendered = registry.render();
    expect(rendered).toContain('document_integrity_alerts_total 1');
    expect(rendered).not.toContain('document_id');
    expect(rendered).not.toContain('tenant_id');
  });

  it('records extraction results by status without tenant or document labels', () => {
    const registry = new MetricsRegistry();
    registry.recordExtractionResult('ready');
    registry.recordExtractionResult('failed');
    registry.recordExtractionResult('failed');

    const rendered = registry.render();
    expect(rendered).toContain('document_extraction_results_total{status="ready"} 1');
    expect(rendered).toContain('document_extraction_results_total{status="failed"} 2');
    expect(rendered).toContain('document_ingestion_results_total{outcome="success"} 1');
    expect(rendered).toContain('document_ingestion_results_total{outcome="failure"} 2');
    expect(rendered).not.toContain('document_id');
    expect(rendered).not.toContain('tenant_id');
  });

  it('bounds unknown extraction statuses and central failure classes', () => {
    const registry = new MetricsRegistry();
    registry.recordExtractionResult('document-secret-status');
    registry.recordAuditWrite('success');
    registry.recordAuditWrite('failure');
    registry.recordStorageFailure('timeout');

    const rendered = registry.render();
    expect(rendered).toContain('document_extraction_results_total{status="unknown"} 1');
    expect(rendered).toContain('document_ingestion_results_total{outcome="pending"} 1');
    expect(rendered).toContain('audit_writes_total{outcome="success"} 1');
    expect(rendered).toContain('audit_writes_total{outcome="failure"} 1');
    expect(rendered).toContain('storage_failures_total{error_class="timeout"} 1');
    expect(rendered).not.toContain('document-secret-status');
  });

  it('renders bounded operational gauges without sensitive dimensions', () => {
    const registry = new MetricsRegistry();
    const rendered = registry.render([], {
      databaseAvailable: true,
      databasePoolTotal: 4,
      databasePoolIdle: 3,
      databasePoolWaiting: 1,
      scannerSignatureAvailable: true,
      scannerSignatureAgeSeconds: 120,
      quarantineCount: 2,
      oldestQuarantineAgeSeconds: 3600,
      backupStatusAvailable: true,
      backupAgeSeconds: 7200,
      lastRestoreDurationSeconds: 900,
      monitoredDiskAvailable: true,
      monitoredDiskFreeRatio: 0.75,
    });

    expect(rendered).toContain('sf20_database_available 1');
    expect(rendered).toContain('sf20_database_pool_connections{state="waiting"} 1');
    expect(rendered).toContain('sf20_scanner_signature_age_seconds 120');
    expect(rendered).toContain('sf20_oldest_quarantine_age_seconds 3600');
    expect(rendered).toContain('sf20_backup_age_seconds 7200');
    expect(rendered).toContain('sf20_monitored_disk_free_ratio 0.75');
    expect(rendered).not.toContain('tenant_id');
    expect(rendered).not.toContain('file_name');
    expect(rendered).not.toContain('token');
  });

  it('records search index failures without tenant or document labels', () => {
    const registry = new MetricsRegistry();
    registry.recordSearchIndexFailure();

    const rendered = registry.render();
    expect(rendered).toContain('search_index_failures_total 1');
    expect(rendered).not.toContain('document_id');
    expect(rendered).not.toContain('tenant_id');
  });
});
