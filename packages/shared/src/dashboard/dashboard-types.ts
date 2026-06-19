import { z } from 'zod';

export const dashboardSectionIds = [
  'recentFiles',
  'recentActivity',
  'permissionPolicyAlerts',
  'aiPrepStatus',
  'integrationStatus',
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

export const dmsOperationalToneSchema = z.enum(['success', 'warning', 'blocked', 'neutral']);
export type DmsOperationalTone = z.infer<typeof dmsOperationalToneSchema>;

export const dmsWorkItemSourceSchema = z.enum([
  'permission_policy',
  'ai_prep',
  'integration',
  'operational_data',
]);
export type DmsWorkItemSource = z.infer<typeof dmsWorkItemSourceSchema>;

export const dmsWorkQueueItemSchema = z
  .object({
    itemKey: z.string().min(1).max(120),
    source: dmsWorkItemSourceSchema,
    sourceLabel: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    href: z.string().min(1).max(500),
    tone: dmsOperationalToneSchema,
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DmsWorkQueueItemDto = z.infer<typeof dmsWorkQueueItemSchema>;

export const dmsWorkQueueResponseSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    source: z.literal('dashboard_operational_state'),
    items: z.array(dmsWorkQueueItemSchema).max(20),
  })
  .strict();
export type DmsWorkQueueResponseDto = z.infer<typeof dmsWorkQueueResponseSchema>;

export const dmsNotificationSourceSchema = z.enum([
  'permission_policy',
  'ai_prep',
  'integration',
  'recent_activity',
]);
export type DmsNotificationSource = z.infer<typeof dmsNotificationSourceSchema>;

export const dmsNotificationItemSchema = z
  .object({
    itemKey: z.string().min(1).max(120),
    source: dmsNotificationSourceSchema,
    category: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    tone: dmsOperationalToneSchema,
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DmsNotificationItemDto = z.infer<typeof dmsNotificationItemSchema>;

export const dmsNotificationCenterResponseSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    source: z.literal('dashboard_operational_state'),
    items: z.array(dmsNotificationItemSchema).max(20),
  })
  .strict();
export type DmsNotificationCenterResponseDto = z.infer<
  typeof dmsNotificationCenterResponseSchema
>;
