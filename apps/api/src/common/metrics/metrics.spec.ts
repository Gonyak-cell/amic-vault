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
      { queue: 'extraction', depth: 7, deadLetterCount: 1 },
      { queue: 'indexing', depth: 3, deadLetterCount: 0 },
      { queue: 'ai-prep', depth: 5, deadLetterCount: 2 },
    ]);

    expect(rendered).toContain('# TYPE pgboss_queue_depth gauge');
    expect(rendered).toContain('pgboss_queue_depth{queue="ai-prep"} 5');
    expect(rendered).toContain('pgboss_queue_depth{queue="extraction"} 7');
    expect(rendered).toContain('pgboss_queue_depth{queue="indexing"} 3');
    expect(rendered).toContain('pgboss_dead_letter_jobs{queue="ai-prep"} 2');
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
    expect(rendered).not.toContain('document_id');
    expect(rendered).not.toContain('tenant_id');
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
