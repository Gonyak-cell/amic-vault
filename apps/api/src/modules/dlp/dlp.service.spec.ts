import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import { DlpService } from './dlp.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

describe('DlpService', () => {
  it('records findings and audit metadata without raw sensitive values', async () => {
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const client: QueryClient = {
      query: vi.fn().mockResolvedValue({
        rows: [{ finding_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
        rowCount: 1,
      }),
    };
    const service = new DlpService(
      { log: auditLog } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    const result = await service.scanAndRecord(client, {
      tenantId: '11111111-1111-4111-8111-111111111111',
      sourceType: 'text',
      sourceId: '11111111-1111-4111-8111-11111111d101',
      text: 'resident 000000-0000000 and email person@example.test',
    });

    expect(result.findings).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('000000-0000000');
    expect(JSON.stringify(result)).not.toContain('person@example.test');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('000000-0000000');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('person@example.test');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DLP_SCAN_COMPLETED' }),
      client,
    );
  });

  it('blocks model egress by default when sensitive data is detected', async () => {
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const client: QueryClient = {
      query: vi.fn(),
    };
    const service = new DlpService(
      { log: auditLog } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    const result = await service.checkModelEgress(client, {
      tenantId: '11111111-1111-4111-8111-111111111111',
      egressId: '11111111-1111-4111-8111-11111111e601',
      matterId: '11111111-1111-4111-8111-11111111e602',
      text: 'draft answer mentions passport M12345678 and card 4111111111111111',
    });

    expect(result).toMatchObject({
      allowed: false,
      findingCount: 2,
    });
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DLP_SCAN_COMPLETED' }),
      client,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DLP_EGRESS_BLOCKED',
        result: 'denied',
        metadata: expect.objectContaining({
          scope_type: 'model_egress',
          scope_id: '11111111-1111-4111-8111-11111111e601',
          result_count: 2,
        }),
      }),
      client,
    );
    expect(JSON.stringify(result)).not.toContain('M12345678');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('M12345678');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('4111111111111111');
  });
});
