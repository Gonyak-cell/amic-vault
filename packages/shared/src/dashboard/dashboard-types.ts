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
