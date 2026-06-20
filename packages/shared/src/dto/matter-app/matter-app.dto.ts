import { z } from 'zod';

export const matterAppSourceModes = [
  'unconfigured',
  'matter_app_api',
  'matter_app_event_projection',
  'vault_projection_only',
] as const;

export const matterAppSourceModeSchema = z.enum(matterAppSourceModes);

export const matterAppUnavailableReasons = [
  'unconfigured',
  'not_configured',
  'runtime_not_ready',
  'stale_projection',
  'production_projection_blocked',
] as const;

export const matterAppUnavailableReasonSchema = z.enum(matterAppUnavailableReasons);

export const matterAppSourceStatusSchema = z
  .object({
    mode: matterAppSourceModeSchema,
    requestedMode: matterAppSourceModeSchema,
    label: z.string().min(1),
    description: z.string().min(1),
    sourceConfigured: z.boolean(),
    runtimeReady: z.boolean(),
    sourceContractReady: z.boolean(),
    sourceAvailable: z.boolean(),
    uploadAuthoritative: z.boolean(),
    productionRuntime: z.boolean(),
    projectionFallbackAllowed: z.boolean(),
    stalenessMaxSeconds: z.number().int().min(1),
    sourceUpdatedAt: z.string().datetime().nullable(),
    sourceStale: z.boolean(),
    unavailableReason: matterAppUnavailableReasonSchema.optional(),
  })
  .strict();

export const matterAppLookupQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    matterCode: z.string().trim().max(120).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const matterAppMatterOptionSchema = z
  .object({
    matterReference: z.string().uuid(),
    matterCode: z.string().min(1),
    matterName: z.string().min(1),
    clientDisplayName: z.string().min(1).nullable(),
    status: z.string().min(1),
    practiceGroup: z.string().min(1).nullable(),
    sourceMode: matterAppSourceModeSchema,
    sourceUpdatedAt: z.string().datetime().nullable(),
    sourceRevision: z.string().min(1).nullable(),
    uploadEligible: z.boolean(),
    blockedReason: z.string().min(1).nullable(),
  })
  .strict();

export const matterAppLookupResponseSchema = z
  .object({
    source: matterAppSourceStatusSchema,
    lookupAvailable: z.boolean(),
    items: z.array(matterAppMatterOptionSchema),
    totalCount: z.number().int().min(0),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();

export type MatterAppSourceMode = (typeof matterAppSourceModes)[number];
export type MatterAppUnavailableReason = (typeof matterAppUnavailableReasons)[number];
export type MatterAppSourceStatusDto = z.infer<typeof matterAppSourceStatusSchema>;
export type MatterAppLookupQueryDto = z.infer<typeof matterAppLookupQuerySchema>;
export type MatterAppMatterOptionDto = z.infer<typeof matterAppMatterOptionSchema>;
export type MatterAppLookupResponseDto = z.infer<typeof matterAppLookupResponseSchema>;
