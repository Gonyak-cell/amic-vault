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
});
