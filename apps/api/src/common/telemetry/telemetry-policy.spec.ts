import { describe, expect, it } from 'vitest';
import { assertTelemetryAttributes, TelemetryCardinalityBudget, telemetryPolicy } from './telemetry-policy';

describe('telemetry policy', () => {
  it('accepts only bounded semantic attributes', () => {
    expect(() =>
      assertTelemetryAttributes({
        service: 'api',
        operation: 'document.upload',
        route: '/v1/documents/:id',
        result: 'succeeded',
        error_class: 'VALIDATION_FAILED',
        queue: 'extraction',
        http_method: 'POST',
        http_status: '201',
      }),
    ).not.toThrow();
  });

  it.each([
    [{ tenant_id: 'tenant-1' }, 'TELEMETRY_ATTRIBUTE_FORBIDDEN'],
    [{ document_id: 'document-1' }, 'TELEMETRY_ATTRIBUTE_FORBIDDEN'],
    [{ query: 'confidential phrase' }, 'TELEMETRY_ATTRIBUTE_FORBIDDEN'],
    [{ token: 'eyJhbGciOiJIUzI1NiJ9' }, 'TELEMETRY_ATTRIBUTE_FORBIDDEN'],
    [{ route: '/v1/documents/550e8400-e29b-41d4-a716-446655440000' }, 'TELEMETRY_ROUTE_TEMPLATE_REQUIRED'],
    [{ error_class: 'DatabaseError: secret detail' }, 'TELEMETRY_ERROR_CLASS_INVALID'],
    [{ queue: 'customer-provided-queue' }, 'TELEMETRY_QUEUE_INVALID'],
  ] as const)('rejects sensitive or unbounded telemetry input %#', (attributes, code) => {
    expect(() => assertTelemetryAttributes(attributes)).toThrow(code);
  });

  it('rejects dynamic cardinality after the configured budget', () => {
    const budget = new TelemetryCardinalityBudget();
    for (let index = 0; index < telemetryPolicy.maxValuesPerKey; index += 1) {
      budget.record({ operation: `operation-${index}` });
    }

    expect(() => budget.record({ operation: 'operation-overflow' })).toThrow(
      'TELEMETRY_CARDINALITY_LIMIT',
    );
  });
});
