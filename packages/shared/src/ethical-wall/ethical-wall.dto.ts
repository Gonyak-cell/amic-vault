import { z } from 'zod';

export const ethicalWallStatuses = ['active', 'released'] as const;
export const wallSubjectTypes = ['user', 'group'] as const;
export const wallMembershipTypes = ['insider', 'excluded'] as const;

export type EthicalWallStatus = (typeof ethicalWallStatuses)[number];
export type WallSubjectType = (typeof wallSubjectTypes)[number];
export type WallMembershipType = (typeof wallMembershipTypes)[number];

const uuidSchema = z.string().uuid();
export const listEthicalWallsQuerySchema = z
  .object({
    matterId: uuidSchema.optional(),
    matter_id: uuidSchema.optional(),
    status: z.enum(ethicalWallStatuses).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .transform((value) => ({
    matterId: value.matterId ?? value.matter_id,
    status: value.status,
    limit: value.limit,
  }));

export const ethicalWallMembershipInputSchema = z.object({
  subjectType: z.enum(wallSubjectTypes),
  subjectId: uuidSchema,
  membershipType: z.enum(wallMembershipTypes),
});

export const createEthicalWallSchema = z.object({
  matterId: uuidSchema,
  wallName: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(2000),
  members: z.array(ethicalWallMembershipInputSchema).default([]),
});

export type CreateEthicalWallMemberDto = z.infer<typeof ethicalWallMembershipInputSchema>;
export type AddEthicalWallMembershipDto = CreateEthicalWallMemberDto;
export type ListEthicalWallsQueryDto = z.infer<typeof listEthicalWallsQuerySchema>;

export interface CreateEthicalWallDto {
  matterId: string;
  wallName: string;
  reason: string;
  members: CreateEthicalWallMemberDto[];
}

export interface EthicalWallDto {
  wallId: string;
  tenantId: string;
  matterId: string;
  wallName: string;
  status: EthicalWallStatus;
  createdBy: string;
  createdAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
}

export interface EthicalWallMembershipDto {
  membershipId: string;
  wallId: string;
  tenantId: string;
  subjectType: WallSubjectType;
  subjectId: string;
  membershipType: WallMembershipType;
  createdBy: string;
  createdAt: string;
}

export interface EthicalWallDetailDto {
  wall: EthicalWallDto;
  memberships: EthicalWallMembershipDto[];
}

export interface EthicalWallListDto {
  items: EthicalWallDetailDto[];
}
