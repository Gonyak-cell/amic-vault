import { z } from 'zod';

export const dashboardSectionIds = [
  'recentFiles',
  'recentActivity',
  'permissionPolicyAlerts',
  'aiPrepStatus',
  'integrationStatus',
  'usageStats',
] as const;
export type DashboardSectionId = (typeof dashboardSectionIds)[number];

export const dashboardRecentFileSchema = z
  .object({
    title: z.string().min(1).max(1000),
    matterLabel: z.string().min(1).max(1200).optional(),
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DashboardRecentFileDto = z.infer<typeof dashboardRecentFileSchema>;

export const dashboardRecentActivitySchema = z
  .object({
    actionLabel: z.string().min(1).max(160),
    targetLabel: z.string().min(1).max(1200),
    resultLabel: z.string().min(1).max(80),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DashboardRecentActivityDto = z.infer<typeof dashboardRecentActivitySchema>;

export const dashboardPolicyAlertSchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DashboardPolicyAlertDto = z.infer<typeof dashboardPolicyAlertSchema>;

export const dashboardAiPrepStatusSchema = z
  .object({
    matterLabel: z.string().min(1).max(1200),
    statusLabel: z.string().min(1).max(160),
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DashboardAiPrepStatusDto = z.infer<typeof dashboardAiPrepStatusSchema>;

export const dashboardIntegrationStatusSchema = z
  .object({
    integrationLabel: z.string().min(1).max(160),
    statusLabel: z.string().min(1).max(160),
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DashboardIntegrationStatusDto = z.infer<typeof dashboardIntegrationStatusSchema>;

export const dashboardOverviewSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    recentFiles: z.array(dashboardRecentFileSchema).max(10),
    recentActivity: z.array(dashboardRecentActivitySchema).max(10),
    permissionPolicyAlerts: z.array(dashboardPolicyAlertSchema).max(10),
    aiPrepStatus: z.array(dashboardAiPrepStatusSchema).max(10),
    integrationStatus: z.array(dashboardIntegrationStatusSchema).max(10),
  })
  .strict();
export type DashboardOverviewDto = z.infer<typeof dashboardOverviewSchema>;

export const dashboardUsageStatsQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (!query.from || !query.to) return;
    if (new Date(query.from).getTime() <= new Date(query.to).getTime()) return;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from must be before to',
      path: ['from'],
    });
  });
export type DashboardUsageStatsQueryDto = z.infer<typeof dashboardUsageStatsQuerySchema>;

export const dashboardUsageStatsTopMatterSchema = z
  .object({
    matterLabel: z.string().min(1).max(1200),
    activityCount: z.number().int().min(0),
  })
  .strict();
export type DashboardUsageStatsTopMatterDto = z.infer<typeof dashboardUsageStatsTopMatterSchema>;

export const dashboardUsageStatsResponseSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    period: z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
      })
      .strict(),
    totals: z
      .object({
        activeUsers: z.number().int().min(0),
        uploads: z.number().int().min(0),
        downloads: z.number().int().min(0),
        searches: z.number().int().min(0),
        storageBytes: z.number().int().min(0),
      })
      .strict(),
    topMatters: z.array(dashboardUsageStatsTopMatterSchema).max(10),
  })
  .strict();
export type DashboardUsageStatsResponseDto = z.infer<typeof dashboardUsageStatsResponseSchema>;

export const dmsOperationalToneSchema = z.enum(['success', 'warning', 'blocked', 'neutral']);
export type DmsOperationalTone = z.infer<typeof dmsOperationalToneSchema>;

export const dmsWorkItemSourceSchema = z.enum([
  'permission_policy',
  'ai_prep',
  'integration',
  'operational_data',
  'records',
]);
export type DmsWorkItemSource = z.infer<typeof dmsWorkItemSourceSchema>;

export const dmsWorkItemStatusSchema = z.enum(['open', 'in_progress', 'completed', 'cancelled']);
export type DmsWorkItemStatus = z.infer<typeof dmsWorkItemStatusSchema>;

export const dmsRecordsWorkItemKindSchema = z.enum([
  'records_disposal_approval',
  'records_disposal_execution',
]);
export type DmsRecordsWorkItemKind = z.infer<typeof dmsRecordsWorkItemKindSchema>;

export const dmsDocumentWorkItemKindSchema = z.enum([
  'document_extraction_failed',
  'document_ocr_pending',
  'document_metadata_required',
  'duplicate_decision_pending',
  'upload_exception',
]);
export type DmsDocumentWorkItemKind = z.infer<typeof dmsDocumentWorkItemKindSchema>;

export const dmsWorkflowWorkItemKindSchema = z.enum([
  'contract_review_stage',
  'dd_rfi_due',
  'dd_mapping_review',
  'external_qa_approval',
  'litigation_deadline',
  'knowledge_candidate_review',
  'wiki_page_review',
]);
export type DmsWorkflowWorkItemKind = z.infer<typeof dmsWorkflowWorkItemKindSchema>;

export const dmsAiPrepWorkItemKindSchema = z.enum(['ai_candidate_review', 'graph_fact_review']);
export type DmsAiPrepWorkItemKind = z.infer<typeof dmsAiPrepWorkItemKindSchema>;

export const dmsWorkItemKindSchema = z.union([
  dmsRecordsWorkItemKindSchema,
  dmsDocumentWorkItemKindSchema,
  dmsWorkflowWorkItemKindSchema,
  dmsAiPrepWorkItemKindSchema,
]);
export type DmsWorkItemKind = z.infer<typeof dmsWorkItemKindSchema>;

export const dmsWorkQueueItemSchema = z
  .object({
    itemKey: z.string().min(1).max(120),
    targetId: z.string().uuid().optional(),
    source: dmsWorkItemSourceSchema,
    kind: dmsWorkItemKindSchema.optional(),
    sourceLabel: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    href: z.string().min(1).max(500),
    tone: dmsOperationalToneSchema,
    status: dmsWorkItemStatusSchema.optional(),
    statusLabel: z.string().min(1).max(120).optional(),
    assignedToLabel: z.string().min(1).max(160).optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DmsWorkQueueItemDto = z.infer<typeof dmsWorkQueueItemSchema>;

export const dmsWorkQueueAssigneeFilterSchema = z.enum(['all', 'mine', 'unassigned']);
export type DmsWorkQueueAssigneeFilter = z.infer<typeof dmsWorkQueueAssigneeFilterSchema>;

export const dmsWorkQueueQuerySchema = z
  .object({
    kind: dmsWorkItemKindSchema.optional(),
    assignee: dmsWorkQueueAssigneeFilterSchema.default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type DmsWorkQueueQueryDto = z.infer<typeof dmsWorkQueueQuerySchema>;

export const reassignWorkItemSchema = z
  .object({
    assignedToUserId: z.string().uuid(),
  })
  .strict();
export type ReassignWorkItemDto = z.infer<typeof reassignWorkItemSchema>;

export const dmsWorkQueueResponseSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    source: z.enum(['dashboard_operational_state', 'persisted_work_items']),
    items: z.array(dmsWorkQueueItemSchema).max(100),
    page: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().min(0),
        total: z.number().int().min(0),
        hasNext: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DmsWorkQueueResponseDto = z.infer<typeof dmsWorkQueueResponseSchema>;

export const dmsNotificationSourceSchema = z.enum([
  'permission_policy',
  'ai_prep',
  'integration',
  'operational_data',
  'records',
  'recent_activity',
]);
export type DmsNotificationSource = z.infer<typeof dmsNotificationSourceSchema>;

export const dmsNotificationStatusSchema = z.enum(['unread', 'read']);
export type DmsNotificationStatus = z.infer<typeof dmsNotificationStatusSchema>;

export const dmsNotificationItemSchema = z
  .object({
    itemKey: z.string().min(1).max(120),
    source: dmsNotificationSourceSchema,
    category: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    tone: dmsOperationalToneSchema,
    href: z.string().min(1).max(500).optional(),
    status: dmsNotificationStatusSchema.optional(),
    statusLabel: z.string().min(1).max(120).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DmsNotificationItemDto = z.infer<typeof dmsNotificationItemSchema>;

export const dmsNotificationCenterResponseSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    source: z.enum(['dashboard_operational_state', 'persisted_notifications']),
    items: z.array(dmsNotificationItemSchema).max(20),
  })
  .strict();
export type DmsNotificationCenterResponseDto = z.infer<typeof dmsNotificationCenterResponseSchema>;
