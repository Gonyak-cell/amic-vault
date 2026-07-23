import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import { DlpService } from './dlp.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

describe('DlpService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const sourceId = '11111111-1111-4111-8111-11111111d101';

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
      tenantId,
      sourceType: 'text',
      sourceId,
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

  it('separates clean zero findings from every explicit unscannable state', () => {
    const service = new DlpService(
      { log: vi.fn() } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    expect(service.evaluateText('ordinary bounded text')).toMatchObject({
      scanState: 'clean',
      reasonCode: null,
      findingCount: 0,
      requiresReview: false,
      completed: true,
      limitReached: false,
    });
    for (const reasonCode of [
      'assessment_missing',
      'text_pending',
      'ocr_pending',
      'no_text',
      'parser_failed',
      'password_protected',
      'input_oversize',
    ] as const) {
      expect(service.evaluateText(null, { unscannableReasonCode: reasonCode })).toMatchObject({
        scanState: 'unscannable',
        reasonCode,
        findingCount: 0,
        requiresReview: true,
        completed: false,
      });
    }
    expect(service.evaluateText(' \n ')).toMatchObject({
      scanState: 'unscannable',
      reasonCode: 'no_text',
    });
  });

  it('marks restricted findings and detector truncation for review', () => {
    const service = new DlpService(
      { log: vi.fn() } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    expect(service.evaluateText('passport M12345678')).toMatchObject({
      scanState: 'findings',
      findingCount: 1,
      restrictedFindingCount: 1,
      requiresReview: true,
      completed: true,
    });
    expect(
      service.evaluateText('000000-0000000\n900101-5000000\n010-0000-0000', {
        options: { maxFindings: 2 },
      }),
    ).toMatchObject({
      scanState: 'unscannable',
      reasonCode: 'scan_limit_reached',
      findingCount: 2,
      requiresReview: true,
      completed: false,
      limitReached: true,
    });
  });

  it('persists a clean exact-source assessment and bounded scan audit', async () => {
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const createdAt = new Date('2026-07-23T01:00:00.000Z');
    const client: QueryClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            assessment_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            created_at: createdAt,
          },
        ],
        rowCount: 1,
      }),
    };
    const service = new DlpService(
      { log: auditLog } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    const result = await service.assessAndRecord(client, {
      tenantId,
      sourceType: 'text',
      sourceId,
      text: 'ordinary bounded text',
    });

    expect(result).toMatchObject({
      assessmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      scanState: 'clean',
      reasonCode: null,
      findingCount: 0,
      restrictedFindingCount: 0,
      requiresReview: false,
      completed: true,
      policyVersion: 'sf20-dlp-v1',
      createdAt,
    });
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(client.query).mock.calls[0]?.[0])).toContain(
      'INSERT INTO dlp_scan_assessments',
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DLP_SCAN_COMPLETED',
        targetType: 'dlp_assessment',
        metadata: expect.objectContaining({
          dlp_scan_state: 'clean',
          dlp_requires_review: false,
          dlp_policy_version: 'sf20-dlp-v1',
        }),
      }),
      client,
    );
  });

  it('converges on an existing assessment without returning raw values', async () => {
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ finding_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            assessment_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            created_at: '2026-07-23T01:00:00.000Z',
          },
        ],
        rowCount: 1,
      });
    const client: QueryClient = { query };
    const service = new DlpService(
      { log: auditLog } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    const result = await service.assessAndRecord(client, {
      tenantId,
      sourceType: 'text',
      sourceId,
      text: 'passport M12345678',
    });

    expect(result).toMatchObject({
      assessmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      scanState: 'findings',
      findingCount: 1,
      restrictedFindingCount: 1,
      requiresReview: true,
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[2]?.[0])).toContain('FROM dlp_scan_assessments');
    expect(JSON.stringify(result)).not.toContain('M12345678');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('M12345678');
  });

  it('fails closed for empty model egress instead of treating it as clean', async () => {
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const client: QueryClient = { query: vi.fn() };
    const service = new DlpService(
      { log: auditLog } as unknown as AuditService,
      new SensitiveDataDetector(),
    );

    await expect(
      service.checkModelEgress(client, {
        tenantId,
        egressId: '11111111-1111-4111-8111-11111111e601',
        text: '',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      findingCount: 0,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DLP_EGRESS_BLOCKED',
        metadata: expect.objectContaining({
          dlp_scan_state: 'unscannable',
          reason_code: 'no_text',
        }),
      }),
      client,
    );
  });
});
