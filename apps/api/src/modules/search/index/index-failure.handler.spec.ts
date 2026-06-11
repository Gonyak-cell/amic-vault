import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from '../../../common/metrics/metrics.middleware';
import { IndexFailureHandler } from './index-failure.handler';

describe('IndexFailureHandler', () => {
  it('records failures without document text labels', () => {
    const metrics = new MetricsRegistry();
    new IndexFailureHandler(metrics).recordDeadLetter(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        documentId: '11111111-1111-4111-8111-111111111122',
        versionId: '11111111-1111-4111-8111-111111111133',
      },
      'RETRY_EXHAUSTED',
    );

    const rendered = metrics.render();
    expect(rendered).toContain('search_index_failures_total 1');
    expect(rendered).not.toContain('document_id');
    expect(rendered).not.toContain('tenant_id');
  });
});
