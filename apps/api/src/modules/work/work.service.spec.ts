import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { WorkService } from './work.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111102';
const workflowKinds = [
  'contract_review_stage',
  'dd_rfi_due',
  'dd_mapping_review',
  'external_qa_approval',
  'litigation_deadline',
] as const;

function createService(rowsFor: (sql: string, params: unknown[] | undefined) => unknown[]) {
  const queries: string[] = [];
  const queryParams: Array<unknown[] | undefined> = [];
  const auditLog = vi.fn(async () => ({
    eventId: '77777777-7777-4777-8777-777777777777',
    createdAt: new Date('2026-06-21T00:00:00.000Z'),
  }));
  const auditService = {
    async transaction<T>(_tenantId: string, run: (client: { query: typeof query }) => Promise<T>) {
      return run({ query });
    },
    log: auditLog,
  };

  async function query(sql: string, params?: unknown[]) {
    queries.push(sql);
    queryParams.push(params);
    return { rows: rowsFor(sql, params), rowCount: null };
  }

  const context = new TenantContextService();
  return {
    context,
    auditLog,
    queryParams,
    queries,
    service: new WorkService(
      auditService as never,
      context,
      new PermissionQueryBuilder(),
    ),
  };
}

describe('WorkService', () => {
  it('lists permission-scoped persisted records disposal tasks without raw ids', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'security_admin', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111aa',
            source: 'records',
            kind: 'records_disposal_approval',
            status: 'open',
            due_at: new Date('2026-06-24T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            assigned_to_user_id: null,
            assignee_name: null,
            matter_label: 'AMIC-2026-0001 · Governance',
            disposal_status: 'requested',
            reason_code: 'CLIENT_RECORDS',
            document_title: null,
            document_status: null,
            document_type: null,
            extraction_status: null,
            total_count: 1,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response).toMatchObject({
      source: 'persisted_work_items',
      items: [
        {
          source: 'records',
          sourceLabel: '기록 보존',
          title: '삭제 승인 요청',
          href: '/records?tab=disposal',
          status: 'open',
          dueAt: '2026-06-24T00:00:00.000Z',
        },
      ],
    });
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO work_items'))).toBe(true);
    const workItemsSql = queries.find((sql) => sql.includes('FROM work_items wi'));
    expect(workItemsSql).toContain("CASE WHEN wi.source = 'records' THEN 0 ELSE 1 END");
    expect(JSON.stringify(response)).not.toMatch(
      /workItemId|documentId|matterId|targetId|11111111-1111-4111-8111-1111111111aa/u,
    );
  });

  it('materializes and lists real document operational work items for assigned users', async () => {
    const { context, queries, queryParams, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111bb',
            source: 'operational_data',
            kind: 'document_extraction_failed',
            status: 'open',
            due_at: new Date('2026-06-22T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            assigned_to_user_id: actorUserId,
            assignee_name: 'Alpha Member',
            matter_label: 'AMIC-2026-0002 · Evidence',
            disposal_status: null,
            reason_code: null,
            document_title: '계약 증거 파일',
            document_status: 'draft',
            document_type: 'contract',
            extraction_status: 'failed',
            total_count: 1,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        source: 'operational_data',
        sourceLabel: '문서 운영',
        title: '추출 실패 확인',
        description: 'AMIC-2026-0002 · Evidence · 계약 증거 파일 · 추출 실패',
        href: '/files?extractionStatus=failed',
        tone: 'blocked',
        status: 'open',
      }),
    ]);
    expect(queries.some((sql) => sql.includes('canonical_documents'))).toBe(true);
    expect(queries.some((sql) => sql.includes("source = 'operational_data'"))).toBe(true);
    expect(queryParams.some((params) => params?.includes(false))).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(
      /workItemId|documentId|matterId|targetId|11111111-1111-4111-8111-1111111111bb/u,
    );
  });

  it('returns no assigned admin work for non-admin actors', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'active' }] : [],
    );

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([]);
  });

  it('lists workflow work with kind and assignee filters plus pagination metadata', async () => {
    const { context, queries, queryParams, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'firm_admin', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111cc',
            source: 'operational_data',
            kind: 'contract_review_stage',
            status: 'open',
            due_at: new Date('2026-06-22T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            assigned_to_user_id: actorUserId,
            assignee_name: 'Alpha Reviewer',
            matter_label: 'AMIC-2026-0003 · Contract',
            disposal_status: null,
            reason_code: null,
            document_title: null,
            document_status: null,
            document_type: null,
            extraction_status: null,
            total_count: 25,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () =>
        service.listWorkItems(
          actorUserId,
          { kind: 'contract_review_stage', assignee: 'mine', limit: 10, offset: 20 },
          new Date('2026-06-21T00:00:00.000Z'),
        ),
    );

    expect(response.page).toEqual({ limit: 10, offset: 20, total: 25, hasNext: false });
    expect(response.items).toEqual([
      expect.objectContaining({
        itemKey: expect.stringMatching(/^workflow-work-[0-9a-f]{12}$/u),
        source: 'operational_data',
        kind: 'contract_review_stage',
        sourceLabel: '워크플로',
        title: '계약 검토 단계 확인',
        assignedToLabel: 'Alpha Reviewer',
      }),
    ]);
    const workItemsSql = queries.find((sql) => sql.includes('FROM work_items wi'));
    expect(workItemsSql).toContain('wi.kind = $');
    expect(workItemsSql).toContain("= 'mine'");
    expect(workItemsSql).toContain('OFFSET $');
    expect(queryParams.some((params) => params?.includes('contract_review_stage'))).toBe(true);
    expect(queryParams.some((params) => params?.includes('mine'))).toBe(true);
    expect(queryParams.some((params) => params?.includes(20))).toBe(true);
  });

  it('lists AI prep candidate review work items without exposing artifact ids', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111ac',
            source: 'ai_prep',
            kind: 'ai_candidate_review',
            status: 'open',
            due_at: new Date('2026-06-22T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            assigned_to_user_id: actorUserId,
            assignee_name: 'Alpha Reviewer',
            matter_label: 'AMIC-2026-0004 · Candidate Matter',
            disposal_status: null,
            reason_code: null,
            document_title: '후보 계약서',
            document_status: 'draft',
            document_type: 'contract',
            extraction_status: 'completed',
            ai_prep_artifact_kind: 'fact_candidates',
            total_count: 1,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        itemKey: expect.stringMatching(/^ai-prep-work-[0-9a-f]{12}$/u),
        source: 'ai_prep',
        kind: 'ai_candidate_review',
        sourceLabel: 'AI 준비',
        title: 'AI 후보 검토',
        description: 'AMIC-2026-0004 · Candidate Matter · 후보 계약서 · 청크 인용 후보',
        href: '/work?kind=ai_candidate_review',
        tone: 'warning',
        status: 'open',
      }),
    ]);
    const workItemsSql = queries.find((sql) => sql.includes('FROM work_items wi'));
    expect(workItemsSql).toContain("wi.source IN ('records', 'operational_data', 'ai_prep')");
    expect(workItemsSql).toContain("wi.target_type = 'ai_prep_artifact'");
    expect(JSON.stringify(response)).not.toMatch(
      /workItemId|artifactId|targetId|11111111-1111-4111-8111-1111111111ac/u,
    );
  });

  it('labels minutes QC AI prep work items separately from generic candidates', async () => {
    const { context, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111ad',
            source: 'ai_prep',
            kind: 'ai_candidate_review',
            status: 'open',
            due_at: new Date('2026-06-22T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            assigned_to_user_id: actorUserId,
            assignee_name: 'Alpha Reviewer',
            matter_label: 'AMIC-2026-0004 · Candidate Matter',
            disposal_status: null,
            reason_code: null,
            document_title: '회의록',
            document_status: 'draft',
            document_type: 'corporate_record',
            extraction_status: 'completed',
            ai_prep_artifact_kind: 'minutes_qc',
            total_count: 1,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        source: 'ai_prep',
        kind: 'ai_candidate_review',
        title: '회의록 정합성 QC',
        description: 'AMIC-2026-0004 · Candidate Matter · 회의록 · 회의록 불일치 검토',
      }),
    ]);
  });

  it('lists graph fact review work items with the review node target only', async () => {
    const nodeId = '22222222-2222-4222-8222-222222222222';
    const { context, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111ad',
            target_id: nodeId,
            source: 'ai_prep',
            kind: 'graph_fact_review',
            status: 'open',
            due_at: new Date('2026-06-22T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            assigned_to_user_id: actorUserId,
            assignee_name: 'Alpha Reviewer',
            matter_label: 'AMIC-2026-0005 · Graph Matter',
            disposal_status: null,
            reason_code: null,
            document_title: '후보 Fact 계약서',
            document_status: 'draft',
            document_type: 'contract',
            extraction_status: 'completed',
            graph_claim_text: '매수인은 잔금을 지급했다.',
            total_count: 1,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        itemKey: expect.stringMatching(/^graph-fact-review-[0-9a-f]{12}$/u),
        targetId: nodeId,
        source: 'ai_prep',
        kind: 'graph_fact_review',
        sourceLabel: 'AI 준비',
        title: 'AI Fact 후보 확인',
        description: 'AMIC-2026-0005 · Graph Matter · 후보 Fact 계약서 · 매수인은 잔금을 지급했다.',
        href: '/work?kind=graph_fact_review',
        tone: 'warning',
        status: 'open',
      }),
    ]);
    expect(JSON.stringify(response)).not.toContain('11111111-1111-4111-8111-1111111111ad');
  });

  it('fails closed when actor lookup is inactive', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'security_admin', status: 'locked' }] : [],
    );

    await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      async () => {
        await expect(service.listWorkItems(actorUserId)).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });

  it('persists open and completed disposal work item transitions', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              work_item_id: '11111111-1111-4111-8111-1111111111aa',
              due_at: new Date('2026-06-27T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const { service } = createService(() => []);

    await expect(
      service.openRecordsDisposalWork(tx, {
        tenantId,
        disposalRequestId: '22222222-2222-4222-8222-222222222222',
        matterId: '33333333-3333-4333-8333-333333333333',
        documentId: '44444444-4444-4444-8444-444444444444',
        actorUserId,
        auditEventId: '55555555-5555-4555-8555-555555555555',
        kind: 'records_disposal_approval',
      }),
    ).resolves.toMatchObject({
      workItemId: '11111111-1111-4111-8111-1111111111aa',
    });

    await service.completeRecordsDisposalWork(tx, {
      tenantId,
      disposalRequestId: '22222222-2222-4222-8222-222222222222',
      actorUserId,
      auditEventId: '66666666-6666-4666-8666-666666666666',
      kind: 'records_disposal_approval',
    });

    expect(tx.query).toHaveBeenCalledTimes(2);
    expect(tx.query.mock.calls[0]?.[0]).toContain('INSERT INTO work_items');
    expect(tx.query.mock.calls[1]?.[0]).toContain("SET status = 'completed'");
  });

  it('persists open and completed workflow work item transitions for every workflow kind', async () => {
    const tx = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        void params;
        return sql.includes('INSERT INTO work_items')
          ? {
              rows: [
                {
                  work_item_id: '11111111-1111-4111-8111-1111111111dd',
                  due_at: new Date('2026-06-27T00:00:00.000Z'),
                },
              ],
              rowCount: 1,
            }
          : { rows: [], rowCount: 1 };
      }),
    };
    const { service } = createService(() => []);

    for (const kind of workflowKinds) {
      await expect(
        service.openWorkflowWork(tx, {
          tenantId,
          kind,
          targetId: '22222222-2222-4222-8222-222222222222',
          matterId: '33333333-3333-4333-8333-333333333333',
          documentId: null,
          assignedToUserId: '44444444-4444-4444-8444-444444444444',
          dueAt: new Date('2026-06-27T00:00:00.000Z'),
          actorUserId,
          auditEventId: '55555555-5555-4555-8555-555555555555',
        }),
      ).resolves.toMatchObject({
        workItemId: '11111111-1111-4111-8111-1111111111dd',
      });

      await service.completeWorkflowWork(tx, {
        tenantId,
        kind,
        targetId: '22222222-2222-4222-8222-222222222222',
        actorUserId,
        auditEventId: '66666666-6666-4666-8666-666666666666',
      });

      await service.cancelWorkflowWork(tx, {
        tenantId,
        kind,
        targetId: '22222222-2222-4222-8222-222222222222',
        actorUserId,
        auditEventId: '66666666-6666-4666-8666-666666666667',
      });
    }

    expect(tx.query).toHaveBeenCalledTimes(workflowKinds.length * 3);
    for (const kind of workflowKinds) {
      expect(
        tx.query.mock.calls.some((call) => {
          const params = call[1] as unknown[] | undefined;
          return Array.isArray(params) && params.includes(kind);
        }),
      ).toBe(true);
    }
  });

  it('persists AI candidate review work items against ai_prep_artifact targets', async () => {
    const tx = {
      query: vi.fn(async () => ({
        rows: [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111af',
            due_at: new Date('2026-06-23T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      })),
    };
    const { service } = createService(() => []);

    await expect(
      service.openAiCandidateReviewWork(tx, {
        tenantId,
        artifactId: '22222222-2222-4222-8222-222222222222',
        matterId: '33333333-3333-4333-8333-333333333333',
        documentId: '44444444-4444-4444-8444-444444444444',
        actorUserId,
        auditEventId: '55555555-5555-4555-8555-555555555555',
        dueAt: new Date('2026-06-23T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      workItemId: '11111111-1111-4111-8111-1111111111af',
    });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining("$1, 'ai_prep', 'ai_candidate_review', 'ai_prep_artifact'"),
      expect.arrayContaining([
        tenantId,
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        actorUserId,
        new Date('2026-06-23T00:00:00.000Z'),
        '55555555-5555-4555-8555-555555555555',
      ]),
    );
  });

  it('reassigns visible work items with a same-transaction audit event', async () => {
    const { auditLog, context, queries, queryParams, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'firm_admin', status: 'active' }];
      if (sql.includes('WITH visible AS')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111ee',
            kind: 'dd_rfi_due',
            matter_id: '33333333-3333-4333-8333-333333333333',
            assigned_to_user_id: '44444444-4444-4444-8444-444444444444',
            assignee_name: 'Bravo Reviewer',
          },
        ];
      }
      return [];
    });

    await expect(
      context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, () =>
        service.reassignWorkItem('11111111-1111-4111-8111-111111111102', 'workflow-work-aabbccddeeff', {
          assignedToUserId: '44444444-4444-4444-8444-444444444444',
        }),
      ),
    ).resolves.toEqual({
      itemKey: 'workflow-work-aabbccddeeff',
      assignedToUserId: '44444444-4444-4444-8444-444444444444',
      assignedToLabel: 'Bravo Reviewer',
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORK_ITEM_REASSIGNED',
        targetType: 'work_item',
        metadata: expect.objectContaining({
          work_item_ref: 'workflow-work-aabbccddeeff',
          work_kind: 'dd_rfi_due',
          target_user_id: '44444444-4444-4444-8444-444444444444',
        }),
      }),
      expect.anything(),
    );
    expect(queries.some((sql) => sql.includes('last_audit_event_id = $4'))).toBe(true);
    expect(queryParams.some((params) => params?.includes('aabbccddeeff'))).toBe(true);
  });

  it('fails closed and skips audit when reassignment target is not visible', async () => {
    const { auditLog, context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'active' }] : [],
    );

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(
        service.reassignWorkItem(actorUserId, 'workflow-work-aabbccddeeff', {
          assignedToUserId: '44444444-4444-4444-8444-444444444444',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    expect(auditLog).not.toHaveBeenCalled();
  });
});
