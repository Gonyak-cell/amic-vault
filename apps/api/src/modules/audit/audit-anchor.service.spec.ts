import { describe, expect, it, vi } from 'vitest';
import { computeAuditAnchor, stableJsonStringify } from './audit-anchor.service';
import type { QueryClient } from './audit.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const previousAnchorHash = 'a'.repeat(64);

function auditRow(input: {
  seq: string;
  eventId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    seq: input.seq,
    event_id: input.eventId,
    tenant_id: tenantId,
    actor_type: 'system',
    actor_id: null,
    session_id: null,
    action: 'SESSION_REVOKED',
    target_type: 'session',
    target_id: null,
    matter_id: null,
    result: 'success',
    metadata_json: input.metadata ?? {},
    ip_address: null,
    correlation_id: null,
    retention_label: 'PERMANENT',
    created_at: input.createdAt,
  };
}

function fakeClient(rows: unknown[]): QueryClient {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  };
}

describe('AuditAnchorService hashing', () => {
  it('serializes JSON deterministically for hash input', () => {
    expect(stableJsonStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
  });

  it('computes identical hashes for identical audit event input', async () => {
    const rows = [
      auditRow({
        seq: '10',
        eventId: '11111111-1111-4111-8111-111111111210',
        createdAt: '2026-07-02T01:00:00.000Z',
        metadata: { z: 'last', a: 'first' },
      }),
    ];

    const first = await computeAuditAnchor(fakeClient(rows), {
      tenantId,
      anchorDate: '2026-07-02',
      previousAnchorHash,
    });
    const second = await computeAuditAnchor(fakeClient(rows), {
      tenantId,
      anchorDate: '2026-07-02',
      previousAnchorHash,
    });

    expect(second).toEqual(first);
    expect(first.eventCount).toBe(1);
    expect(first.seqStart).toBe('10');
    expect(first.seqEnd).toBe('10');
    expect(first.anchorHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('anchors empty days with null sequence boundaries', async () => {
    const anchor = await computeAuditAnchor(fakeClient([]), {
      tenantId,
      anchorDate: '2026-07-02',
      previousAnchorHash: null,
    });

    expect(anchor.eventCount).toBe(0);
    expect(anchor.seqStart).toBeNull();
    expect(anchor.seqEnd).toBeNull();
    expect(anchor.eventsHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('excludes anchor receipt events from digest input', async () => {
    const client = fakeClient([]);

    await computeAuditAnchor(client, {
      tenantId,
      anchorDate: '2026-07-02',
      previousAnchorHash,
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("AND action <> 'AUDIT_ANCHOR_RECORDED'"),
      [tenantId, '2026-07-02'],
    );
  });

  it('uses the first and last sequence for the anchored UTC day', async () => {
    const rows = [
      auditRow({
        seq: '21',
        eventId: '11111111-1111-4111-8111-111111111221',
        createdAt: '2026-07-02T00:00:00.000Z',
      }),
      auditRow({
        seq: '22',
        eventId: '11111111-1111-4111-8111-111111111222',
        createdAt: '2026-07-02T23:59:59.999Z',
      }),
    ];

    const anchor = await computeAuditAnchor(fakeClient(rows), {
      tenantId,
      anchorDate: '2026-07-02',
      previousAnchorHash,
    });

    expect(anchor.eventCount).toBe(2);
    expect(anchor.seqStart).toBe('21');
    expect(anchor.seqEnd).toBe('22');
  });
});
