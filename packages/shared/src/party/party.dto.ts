import { z } from 'zod';
import { partyRoleSchema, partyTypeSchema } from './party-enums';

export const createPartySchema = z
  .object({
    name: z.string().trim().min(1).max(1000),
    partyType: partyTypeSchema.default('corporation'),
    partyRole: partyRoleSchema,
    relatedClientId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const listPartiesQuerySchema = z
  .object({
    partyRole: partyRoleSchema.optional(),
    partyType: partyTypeSchema.optional(),
    isRestricted: z.coerce.boolean().optional(),
  })
  .strict();

export const updatePartySchema = z
  .object({
    name: z.string().trim().min(1).max(1000).optional(),
    partyType: partyTypeSchema.optional(),
    partyRole: partyRoleSchema.optional(),
    relatedClientId: z.string().uuid().nullable().optional(),
    isRestricted: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'at least one party field is required',
  });

export interface PartyDto {
  partyId: string;
  tenantId: string;
  matterId: string;
  name: string;
  partyType: string;
  partyRole: string;
  relatedClientId: string | null;
  isRestricted: boolean;
  createdBy: string;
  createdAt: string;
}

export interface PartyListDto {
  items: PartyDto[];
}

export type CreatePartyDto = z.infer<typeof createPartySchema>;
export type ListPartiesQueryDto = z.infer<typeof listPartiesQuerySchema>;
export type UpdatePartyDto = z.infer<typeof updatePartySchema>;
