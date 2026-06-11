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

  it('records integrity alerts without tenant or document labels', () => {
    const registry = new MetricsRegistry();
    registry.recordDocumentIntegrityAlert();
    const rendered = registry.render();
    expect(rendered).toContain('document_integrity_alerts_total 1');
    expect(rendered).not.toContain('document_id');
    expect(rendered).not.toContain('tenant_id');
  });
});
