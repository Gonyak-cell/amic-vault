import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import { DlpService } from './dlp.service';
import { SensitiveDataDetector } from './sensitive-data.detector';
import type { PermissionService } from '../permission/permission.service';

const allowingPermissionService = {
  canReadDocument: vi.fn().mockResolvedValue({ effect: 'ALLOW' }),
  canReadMatter: vi.fn().mockResolvedValue({ effect: 'ALLOW' }),
} as unknown as PermissionService;

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
      allowingPermissionService,
    );

    const result = await service.scanAndRecord(client, {
      tenantId,
      sourceType: 'text',
      sourceId,
      text: 'resident 000101-1000000 and email person@example.test',
    });

    expect(result.findings).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('000101-1000000');
    expect(JSON.stringify(result)).not.toContain('person@example.test');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('000101-1000000');
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
      allowingPermissionService,
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
      allowingPermissionService,
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
      allowingPermissionService,
    );

    expect(service.evaluateText('passport M12345678')).toMatchObject({
      scanState: 'findings',
      findingCount: 1,
      restrictedFindingCount: 1,
      requiresReview: true,
      completed: true,
    });
    expect(
      service.evaluateText('000101-1000000\n900101-5000000\n010-0000-0000', {
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
      allowingPermissionService,
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
      allowingPermissionService,
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
      allowingPermissionService,
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

  it('blocks exact document egress when a review-required assessment has no decision', async () => {
    const documentId = '11111111-1111-4111-8111-11111111d201';
    const versionId = '11111111-1111-4111-8111-11111111d202';
    const matterId = '11111111-1111-4111-8111-11111111d203';
    const assessmentId = '11111111-1111-4111-8111-11111111d204';
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            version_id: versionId,
            extraction_status: 'ready',
            extraction_method: 'pdf_text',
            failure_reason_code: null,
            body_length: 20,
            scan_text: 'passport M12345678',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            assessment_id: assessmentId,
            tenant_id: tenantId,
            source_type: 'document',
            source_id: versionId,
            matter_id: matterId,
            document_id: documentId,
            version_id: versionId,
            scan_state: 'findings',
            reason_code: null,
            finding_count: 1,
            restricted_finding_count: 1,
            requires_review: true,
            policy_version: 'sf20-dlp-v1',
            result_hash: 'a'.repeat(64),
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const service = new DlpService(
      { log: auditLog } as unknown as AuditService,
      new SensitiveDataDetector(),
      allowingPermissionService,
    );
    const client: QueryClient = { query };

    await expect(
      service.evaluateDocumentEgress(client, {
        tenantId,
        matterId,
        documentId,
        versionId,
        purpose: 'document_download',
        authorization: { kind: 'internal', userId: sourceId },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      assessmentId,
      reviewId: null,
      requiresReview: true,
    });
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      documentId,
      versionId,
      2_000_000,
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DLP_EGRESS_BLOCKED',
        result: 'denied',
        metadata: expect.objectContaining({
          dlp_assessment_id: assessmentId,
          document_id: documentId,
          version_id: versionId,
          channel: 'document_download',
          reason_code: 'DLP_REVIEW_REQUIRED',
        }),
      }),
      client,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('M12345678');
  });

  it('applies only an unexpired allow for the exact assessment and rejects an expired latest allow', async () => {
    const documentId = '11111111-1111-4111-8111-11111111d211';
    const versionId = '11111111-1111-4111-8111-11111111d212';
    const matterId = '11111111-1111-4111-8111-11111111d213';
    const assessmentId = '11111111-1111-4111-8111-11111111d214';
    const reviewId = '11111111-1111-4111-8111-11111111d215';
    const assessment = {
      assessment_id: assessmentId,
      tenant_id: tenantId,
      source_type: 'document',
      source_id: versionId,
      matter_id: matterId,
      document_id: documentId,
      version_id: versionId,
      scan_state: 'unscannable',
      reason_code: 'password_protected',
      finding_count: 0,
      restricted_finding_count: 0,
      requires_review: true,
      policy_version: 'sf20-dlp-v1',
      result_hash: 'b'.repeat(64),
      created_at: new Date(),
    };
    const canonical = {
      version_id: versionId,
      extraction_status: 'failed',
      extraction_method: 'failed',
      failure_reason_code: 'PASSWORD_PROTECTED',
      body_length: 0,
      scan_text: null,
    };

    for (const isUnexpired of [true, false]) {
      const auditLog = vi.fn().mockResolvedValue({
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        createdAt: new Date(),
      });
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [canonical], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [assessment], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              review_id: reviewId,
              decision: 'allow',
              reason_code: 'known_encrypted_source',
              reviewed_at: new Date(),
              expires_at: new Date(Date.now() + 60_000),
              is_unexpired: isUnexpired,
            },
          ],
          rowCount: 1,
        });
      const service = new DlpService(
        { log: auditLog } as unknown as AuditService,
        new SensitiveDataDetector(),
        allowingPermissionService,
      );

      await expect(
        service.evaluateDocumentEgress(
          { query },
          {
            tenantId,
            matterId,
            documentId,
            versionId,
            purpose: 'outlook_document_insertion',
            authorization: { kind: 'internal', userId: sourceId },
          },
        ),
      ).resolves.toMatchObject({
        allowed: isUnexpired,
        assessmentId,
        reviewId,
      });
      expect(String(query.mock.calls[2]?.[0])).toContain(
        "ORDER BY reviewed_at DESC, (decision = 'deny') DESC, review_id DESC",
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: isUnexpired ? 'DLP_REVIEW_APPLIED' : 'DLP_EGRESS_BLOCKED',
          metadata: expect.objectContaining({
            dlp_assessment_id: assessmentId,
            dlp_review_id: reviewId,
            reason_code: isUnexpired ? 'known_encrypted_source' : 'DLP_REVIEW_EXPIRED',
          }),
        }),
        expect.anything(),
      );
    }
  });

  it('records a role- and ordinary-permission-bound review atomically', async () => {
    const assessmentId = '11111111-1111-4111-8111-11111111d221';
    const reviewId = '11111111-1111-4111-8111-11111111d222';
    const documentId = '11111111-1111-4111-8111-11111111d223';
    const matterId = '11111111-1111-4111-8111-11111111d224';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            assessment_id: assessmentId,
            tenant_id: tenantId,
            source_type: 'document',
            source_id: documentId,
            matter_id: matterId,
            document_id: documentId,
            version_id: null,
            scan_state: 'unscannable',
            reason_code: 'assessment_missing',
            finding_count: 0,
            restricted_finding_count: 0,
            requires_review: true,
            policy_version: 'sf20-dlp-v1',
            result_hash: 'c'.repeat(64),
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ role: 'security_admin', status: 'active' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            review_id: reviewId,
            decision: 'deny',
            reason_code: 'sensitive_content_denied',
            reviewed_at: new Date(),
            expires_at: expiresAt,
          },
        ],
        rowCount: 1,
      });
    const auditLog = vi.fn().mockResolvedValue({
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: new Date(),
    });
    const auditService = {
      transaction: vi.fn(
        async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) =>
          run({ query }),
      ),
      log: auditLog,
    } as unknown as AuditService;
    const canReadDocument = vi.fn().mockResolvedValue({ effect: 'ALLOW' });
    const service = new DlpService(
      auditService,
      new SensitiveDataDetector(),
      {
        canReadDocument,
        canReadMatter: vi.fn(),
      } as unknown as PermissionService,
    );

    await expect(
      service.createReview(
        { tenantId, userId: sourceId, sessionId: 'session-review' },
        assessmentId,
        {
          decision: 'deny',
          reasonCode: 'sensitive_content_denied',
          expiresAt: expiresAt.toISOString(),
        },
      ),
    ).resolves.toMatchObject({
      assessmentId,
      reviewId,
      decision: 'deny',
      reasonCode: 'sensitive_content_denied',
    });
    expect(canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId: sourceId, sessionId: 'session-review' },
      documentId,
    );
    expect(String(query.mock.calls[2]?.[0])).toContain('INSERT INTO dlp_review_decisions');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DLP_REVIEW_RECORDED',
        actorId: sourceId,
        sessionId: 'session-review',
        metadata: expect.objectContaining({
          dlp_assessment_id: assessmentId,
          dlp_review_id: reviewId,
          reason_code: 'sensitive_content_denied',
        }),
      }),
      expect.anything(),
    );
  });

  it('does not insert a review for inactive reviewers or ordinary permission denial', async () => {
    const assessmentId = '11111111-1111-4111-8111-11111111d231';
    const documentId = '11111111-1111-4111-8111-11111111d232';
    const assessment = {
      assessment_id: assessmentId,
      tenant_id: tenantId,
      source_type: 'document',
      source_id: documentId,
      matter_id: null,
      document_id: documentId,
      version_id: null,
      scan_state: 'unscannable',
      reason_code: 'assessment_missing',
      finding_count: 0,
      restricted_finding_count: 0,
      requires_review: true,
      policy_version: 'sf20-dlp-v1',
      result_hash: 'd'.repeat(64),
      created_at: new Date(),
    };
    for (const mode of ['inactive', 'permission_denied'] as const) {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [assessment], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ role: 'firm_admin', status: mode === 'inactive' ? 'inactive' : 'active' }],
          rowCount: 1,
        });
      const auditService = {
        transaction: vi.fn(
          async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) =>
            run({ query }),
        ),
        log: vi.fn(),
      } as unknown as AuditService;
      const service = new DlpService(
        auditService,
        new SensitiveDataDetector(),
        {
          canReadDocument: vi
            .fn()
            .mockResolvedValue({ effect: mode === 'permission_denied' ? 'DENY' : 'ALLOW' }),
          canReadMatter: vi.fn(),
        } as unknown as PermissionService,
      );

      await expect(
        service.createReview(
          { tenantId, userId: sourceId },
          assessmentId,
          {
            decision: 'allow',
            reasonCode: 'verified_safe',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ),
      ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO dlp_review_decisions')),
      ).toBe(false);
    }
  });
});
