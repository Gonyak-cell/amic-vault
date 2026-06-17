import { z } from 'zod';
import {
  clientConfidentialityLevelSchema,
  clientStatusSchema,
  clientTypeSchema,
} from './client-enums';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

const metadataSchema = z.record(z.string().min(1).max(64), z.string().max(256)).default({});

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(1000),
  clientType: clientTypeSchema.default('corporation'),
  confidentialityLevel: clientConfidentialityLevelSchema.default('standard'),
  status: clientStatusSchema.default('active'),
  metadata: metadataSchema.optional(),
}).strict();

export const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(1000).optional(),
  clientType: clientTypeSchema.optional(),
  confidentialityLevel: clientConfidentialityLevelSchema.optional(),
  status: clientStatusSchema.optional(),
  metadata: metadataSchema.optional(),
}).strict();

export const listClientsQuerySchema = z.object({
  status: clientStatusSchema.optional(),
  clientType: clientTypeSchema.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export interface ClientDto extends DisplayFieldsDto {
  clientId: string;
  tenantId: string;
  name: string;
  clientType: string;
  confidentialityLevel: string;
  status: string;
  metadata: Record<string, string>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientListDto {
  items: ClientDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type CreateClientDto = z.infer<typeof createClientSchema>;
export type UpdateClientDto = z.infer<typeof updateClientSchema>;
export type ListClientsQueryDto = z.infer<typeof listClientsQuerySchema>;
