import { z } from 'zod';
import { matterTypeSchema } from './matter-type';
import {
  containsSensitiveMatterMetadataKey,
  isMatterDateRangeValid,
  matterMetadataSchema,
  matterOptionalDateSchema,
} from './matter-validation';

export const matterStatuses = [
  'proposed',
  'open',
  'active',
  'closing',
  'closed',
  'archived',
  'disposal_review',
  'disposed',
] as const;

export const matterStatusSchema = z.enum(matterStatuses);

const baseMatterMutationSchema = z
  .object({
    clientId: z.string().uuid(),
    matterCode: z.string().trim().min(1).max(120),
    matterName: z.string().trim().min(1).max(1000),
    matterType: matterTypeSchema,
    leadLawyerId: z.string().uuid().optional(),
    practiceGroup: z.string().trim().min(1).max(128).optional(),
    openedAt: matterOptionalDateSchema,
    closedAt: matterOptionalDateSchema,
    metadata: matterMetadataSchema.optional(),
  })
  .strict();

export const createMatterSchema = baseMatterMutationSchema
  .refine((input) => isMatterDateRangeValid(input.openedAt, input.closedAt), {
    message: 'closedAt must be after openedAt',
    path: ['closedAt'],
  })
  .refine((input) => !containsSensitiveMatterMetadataKey(input.metadata ?? {}), {
    message: 'metadata contains sensitive keys',
    path: ['metadata'],
  });

export const listMattersQuerySchema = z
  .object({
    status: matterStatusSchema.optional(),
    matterType: matterTypeSchema.optional(),
    clientId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export interface MatterDto {
  matterId: string;
  tenantId: string;
  clientId: string;
  matterCode: string;
  matterName: string;
  matterType: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  leadLawyerId: string | null;
  practiceGroup: string | null;
  metadata: Record<string, string>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatterListDto {
  items: MatterDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type MatterStatus = (typeof matterStatuses)[number];
export type CreateMatterDto = z.infer<typeof createMatterSchema>;
export type ListMattersQueryDto = z.infer<typeof listMattersQuerySchema>;
