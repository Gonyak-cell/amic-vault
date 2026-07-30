import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionDecision, TenantId } from '@amic-vault/shared';
import { MetricsRegistry } from '../../common/metrics/metrics.middleware';
import { DatabaseService, type DatabasePool } from '../../common/db/database.service';
import { TenantAwareDataSource } from '../../common/db/tenant-aware-datasource';
import { AuditMetadataNormalizer } from '../audit/audit-metadata.normalizer';
import { AuditService } from '../audit/audit.service';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { FailClosedPermissionWrapper } from '../permission/fail-closed.wrapper';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { PermissionService } from '../permission/permission.service';
import { WallMembershipReader } from '../permission/wall-membership.reader';
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

function createService(
  rowsFor: (sql: string, params: unknown[] | undefined) => unknown[],
  rowCountFor: (sql: string, params: unknown[] | undefined) => number | null = (sql) =>
    sql.includes('UPDATE work_items') ? 1 : null,
) {
  const queries: string[] = [];
  const queryParams: Array<unknown[] | undefined> = [];
  const context = new TenantContextService();
  const pool: DatabasePool = {
    connect: async () => {
      throw new Error('test pool should not connect');
    },
    end: async () => undefined,
    on: () => undefined,
  };
  const databaseService = new DatabaseService(pool, new TenantAwareDataSource(context));
  const auditService = new AuditService(
    context,
    new AuditMetadataNormalizer(),
    databaseService,
    new MetricsRegistry(),
  );
  const auditLog = vi.fn<
    (
      input: Parameters<AuditService['log']>[0],
      client?: Parameters<AuditService['log']>[1],
    ) => Promise<Awaited<ReturnType<AuditService['log']>>>
  >(async () => ({
    eventId: '77777777-7777-4777-8777-777777777777',
    createdAt: new Date('2026-06-21T00:00:00.000Z'),
  }));
  vi.spyOn(auditService, 'log').mockImplementation(auditLog);
  const canReadMatter = vi.fn(
    async (): Promise<PermissionDecision> => ({
      effect: 'ALLOW',
      reasonCode: 'ALLOWED',
      appliedRules: ['test:allowed'],
    }),
  );

  async function query(sql: string, params?: unknown[]) {
    queries.push(sql);
    queryParams.push(params);
    return { rows: rowsFor(sql, params), rowCount: rowCountFor(sql, params) };
  }

  const queryClient = Object.assign(Object.create(null), { query });
  vi.spyOn(auditService, 'transaction').mockImplementation(async (_tenantId, run) =>
    run(queryClient),
  );
  const permissionService = new PermissionService(
    new FailClosedPermissionWrapper(new PermissionEventRecorder(auditService)),
    new WallMembershipReader(databaseService),
    databaseService,
  );
  vi.spyOn(permissionService, 'canReadMatter').mockImplementation(canReadMatter);
  return {
    context,
    auditLog,
    canReadMatter,
    queryParams,
    queries,
    service: new WorkService(
      auditService,
      context,
      new PermissionQueryBuilder(),
      permissionService,
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
            can_mutate: true,
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
          canReassign: true,
          canUpdateDueAt: true,
          dueAt: '2026-06-24T00:00:00.000Z',
        },
      ],
    });
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO work_items'))).toBe(true);
    const workItemsSql = queries.find((sql) => sql.includes('FROM work_items wi'));
    expect(workItemsSql).toContain('ORDER BY\n          wi.due_at ASC');
    expect(workItemsSql).toContain('wi.updated_at DESC');
    expect(workItemsSql).toContain('wi.work_item_id');
    expect(workItemsSql).not.toContain("CASE WHEN wi.source = 'records' THEN 0 ELSE 1 END");
    expect(workItemsSql).toContain('d.deleted_at IS NULL');
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
    const { canReadMatter, context, queries, queryParams, service } = createService((sql) => {
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
            can_mutate: true,
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
          {
            kind: 'contract_review_stage',
            matterId: '33333333-3333-4333-8333-333333333333',
            assignee: 'mine',
            limit: 10,
            offset: 20,
          },
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
        canReassign: true,
        canUpdateDueAt: true,
      }),
    ]);
    const workItemsSql = queries.find((sql) => sql.includes('FROM work_items wi'));
    expect(workItemsSql).toContain('wi.kind = $');
    expect(workItemsSql).toContain('wi.matter_id = $');
    expect(workItemsSql).toContain("= 'mine'");
    expect(workItemsSql).toContain('OFFSET $');
    expect(queryParams.some((params) => params?.includes('contract_review_stage'))).toBe(true);
    expect(queryParams.some((params) => params?.includes('mine'))).toBe(true);
    expect(
      queryParams.some((params) => params?.includes('33333333-3333-4333-8333-333333333333')),
    ).toBe(true);
    expect(queryParams.some((params) => params?.includes(20))).toBe(true);
    expect(canReadMatter).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      '33333333-3333-4333-8333-333333333333',
    );
  });

  it.each([
    ['ordinary denial', 'PERMISSION_DENIED'],
    ['ethical wall denial', 'ETHICAL_WALL_BLOCKED'],
  ] as const)(
    'fails closed before Work SQL for an explicit matterId with %s',
    async (_caseName, reasonCode) => {
      const { canReadMatter, context, queries, service } = createService(() => []);
      canReadMatter.mockResolvedValueOnce({
        effect: 'DENY',
        reasonCode,
        appliedRules: ['test:denied'],
      });

      await context.run(
        { tenantId, slug: 'amic', status: 'active', source: 'session' },
        async () => {
          await expect(
            service.listWorkItems(actorUserId, {
              matterId: '33333333-3333-4333-8333-333333333333',
              assignee: 'all',
              limit: 20,
              offset: 0,
            }),
          ).rejects.toMatchObject({
            response: { code: reasonCode },
          });
        },
      );

      expect(queries).toEqual([]);
    },
  );

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

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(service.listWorkItems(actorUserId)).rejects.toBeInstanceOf(ForbiddenException);
    });
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

  it('returns only safe bounded reassignment candidates for a mutable visible item', async () => {
    const { context, queries, queryParams, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('WITH visible AS')) {
        return [
          {
            user_id: '44444444-4444-4444-8444-444444444444',
            label: 'Bravo Reviewer · bravo@amic.test',
          },
        ];
      }
      return [];
    });

    await expect(
      context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, () =>
        service.listReassignmentCandidates(actorUserId, 'workflow-work-aabbccddeeff', {
          q: 'bravo@amic.test',
          limit: 5,
        }),
      ),
    ).resolves.toEqual({
      items: [
        {
          userId: '44444444-4444-4444-8444-444444444444',
          label: 'Bravo Reviewer · bravo@amic.test',
        },
      ],
    });

    const candidatesSql = queries.find((sql) => sql.includes('WITH visible AS'));
    expect(queries.filter((sql) => sql.includes('WITH visible AS'))).toHaveLength(1);
    expect(candidatesSql).toContain('FOR SHARE OF wi');
    expect(candidatesSql).not.toContain('FOR UPDATE OF wi SKIP LOCKED');
    expect(candidatesSql).toContain("wi.status IN ('open', 'in_progress')");
    expect(candidatesSql).toContain("actor_user.status = 'active'");
    expect(candidatesSql).toContain('actor_user.role = $3::text');
    expect(candidatesSql).toContain("actor_mm.matter_role <> 'limited_reviewer'");
    expect(candidatesSql).toContain("mm.matter_role <> 'limited_reviewer'");
    expect(candidatesSql).toContain("u.role NOT IN ('limited_reviewer', 'external_user')");
    expect(candidatesSql).toContain('LEFT JOIN LATERAL');
    expect(candidatesSql).toContain('strpos(lower(u.name), lower($8::text))');
    expect(candidatesSql).toContain('strpos(lower(u.email), lower($8::text))');
    expect(queryParams).toContainEqual([
      tenantId,
      actorUserId,
      'matter_member',
      actorUserId,
      actorUserId,
      'matter_member',
      'aabbccddeeff',
      'bravo@amic.test',
      5,
    ]);
  });

  it('returns an empty candidate list only when the same-snapshot target remains mutable', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('WITH visible AS')) return [{ user_id: null, label: null }];
      return [];
    });

    await expect(
      context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, () =>
        service.listReassignmentCandidates(actorUserId, 'workflow-work-aabbccddeeff', {
          limit: 25,
        }),
      ),
    ).resolves.toEqual({ items: [] });
    expect(queries.filter((sql) => sql.includes('WITH visible AS'))).toHaveLength(1);
  });

  it('shows no mutation capability and denies without audit for a per-Matter limited reviewer', async () => {
    const row = {
      work_item_id: '11111111-1111-4111-8111-1111111111cc',
      target_id: '22222222-2222-4222-8222-222222222222',
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
      ai_prep_artifact_kind: null,
      graph_claim_text: null,
      can_mutate: false,
      total_count: 1,
    };
    let listReturned = false;
    const { auditLog, context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM work_items wi') && !sql.includes('WITH visible AS') && !listReturned) {
        listReturned = true;
        return [row];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );
    expect(response.items[0]).toMatchObject({
      canReassign: false,
      canUpdateDueAt: false,
    });

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(
        service.updateWorkItemDueAt(actorUserId, 'workflow-work-aabbccddeeff', {
          dueAt: '2026-08-01T00:30:00.000Z',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.listReassignmentCandidates(actorUserId, 'workflow-work-aabbccddeeff', {
          limit: 25,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    expect(
      queries
        .filter((sql) => sql.includes('WITH visible AS'))
        .every((sql) => sql.includes("actor_mm.matter_role <> 'limited_reviewer'")),
    ).toBe(true);
    expect(auditLog).not.toHaveBeenCalled();
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
        service.reassignWorkItem(
          '11111111-1111-4111-8111-111111111102',
          'workflow-work-aabbccddeeff',
          {
            assignedToUserId: '44444444-4444-4444-8444-444444444444',
          },
        ),
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
    expect(queries.some((sql) => sql.includes('FOR UPDATE OF wi SKIP LOCKED'))).toBe(true);
    expect(
      queries.some(
        (sql) =>
          sql.includes('FOR UPDATE OF wi SKIP LOCKED') && sql.includes('d.deleted_at IS NULL'),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (sql) =>
          sql.includes("u.role NOT IN ('limited_reviewer', 'external_user')") &&
          sql.includes("mm.matter_role <> 'limited_reviewer'"),
      ),
    ).toBe(true);
    expect(queries.some((sql) => sql.includes('last_audit_event_id = $4'))).toBe(true);
    expect(queryParams.some((params) => params?.includes('aabbccddeeff'))).toBe(true);
  });

  it('updates a visible work deadline with the locked-row audit contract', async () => {
    const dueAt = '2026-08-01T00:30:00.000Z';
    const { auditLog, context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('WITH visible AS')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111ee',
            kind: 'dd_rfi_due',
            matter_id: '33333333-3333-4333-8333-333333333333',
            assigned_to_user_id: null,
            assignee_name: null,
          },
        ];
      }
      if (sql.includes('UPDATE work_items')) return [{ due_at: new Date(dueAt) }];
      return [];
    });

    await expect(
      context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, () =>
        service.updateWorkItemDueAt(actorUserId, 'workflow-work-aabbccddeeff', { dueAt }),
      ),
    ).resolves.toEqual({
      itemKey: 'workflow-work-aabbccddeeff',
      dueAt,
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORK_ITEM_DUE_AT_CHANGED',
        targetType: 'work_item',
        metadata: expect.objectContaining({
          work_item_ref: 'workflow-work-aabbccddeeff',
          work_kind: 'dd_rfi_due',
        }),
      }),
      expect.anything(),
    );
    expect(queries.some((sql) => sql.includes('FOR UPDATE OF wi SKIP LOCKED'))).toBe(true);
    expect(queries.some((sql) => sql.includes('RETURNING due_at'))).toBe(true);
  });

  it('fails the mutation when the locked target update loses its row', async () => {
    const dueAt = '2026-08-01T00:30:00.000Z';
    const { context, service } = createService(
      (sql) => {
        if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
        if (sql.includes('WITH visible AS')) {
          return [
            {
              work_item_id: '11111111-1111-4111-8111-1111111111ee',
              kind: 'dd_rfi_due',
              matter_id: '33333333-3333-4333-8333-333333333333',
              assigned_to_user_id: null,
              assignee_name: null,
            },
          ];
        }
        if (sql.includes('UPDATE work_items')) return [{ due_at: new Date(dueAt) }];
        return [];
      },
      (sql) => (sql.includes('UPDATE work_items') ? 0 : null),
    );

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(
        service.updateWorkItemDueAt(actorUserId, 'workflow-work-aabbccddeeff', { dueAt }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('does not update a work item when audit persistence fails', async () => {
    const { auditLog, context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('WITH visible AS')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111ee',
            kind: 'dd_rfi_due',
            matter_id: '33333333-3333-4333-8333-333333333333',
            assigned_to_user_id: null,
            assignee_name: null,
          },
        ];
      }
      return [];
    });
    auditLog.mockRejectedValueOnce(new Error('audit unavailable'));

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(
        service.updateWorkItemDueAt(actorUserId, 'workflow-work-aabbccddeeff', {
          dueAt: '2026-08-01T00:30:00.000Z',
        }),
      ).rejects.toThrow('audit unavailable');
    });
    expect(queries.some((sql) => sql.includes('UPDATE work_items'))).toBe(false);
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

  it.each(['limited_reviewer', 'external_user'] as const)(
    'denies global %s Work candidate and mutation access before target lookup',
    async (role) => {
      const { auditLog, context, queries, service } = createService((sql) =>
        sql.includes('FROM users') ? [{ role, status: 'active' }] : [],
      );

      await context.run(
        { tenantId, slug: 'amic', status: 'active', source: 'session' },
        async () => {
          await expect(
            service.listReassignmentCandidates(actorUserId, 'workflow-work-aabbccddeeff', {
              limit: 25,
            }),
          ).rejects.toBeInstanceOf(ForbiddenException);
          await expect(
            service.reassignWorkItem(actorUserId, 'workflow-work-aabbccddeeff', {
              assignedToUserId: '44444444-4444-4444-8444-444444444444',
            }),
          ).rejects.toBeInstanceOf(ForbiddenException);
          await expect(
            service.updateWorkItemDueAt(actorUserId, 'workflow-work-aabbccddeeff', {
              dueAt: '2026-08-01T00:30:00.000Z',
            }),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );

      expect(queries.some((sql) => sql.includes('WITH visible AS'))).toBe(false);
      expect(auditLog).not.toHaveBeenCalled();
    },
  );
});
