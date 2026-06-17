import { z } from 'zod';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

export const matterMemberRoles = ['owner', 'member', 'limited_reviewer'] as const;
export const matterMemberAccessLevels = ['read', 'edit'] as const;

export type MatterMemberRole = (typeof matterMemberRoles)[number];
export type MatterMemberAccessLevel = (typeof matterMemberAccessLevels)[number];

export const matterMemberRoleSchema = z.enum(matterMemberRoles);
export const matterMemberAccessLevelSchema = z.enum(matterMemberAccessLevels);

export const addMatterMemberSchema = z
  .object({
    userId: z.string().uuid(),
    matterRole: matterMemberRoleSchema.default('member'),
    accessLevel: matterMemberAccessLevelSchema.default('read'),
  })
  .strict()
  .refine((input) => input.matterRole !== 'limited_reviewer' || input.accessLevel === 'read', {
    message: 'limited_reviewer is read-only',
    path: ['accessLevel'],
  });

export const updateMatterMemberSchema = z
  .object({
    matterRole: matterMemberRoleSchema.optional(),
    accessLevel: matterMemberAccessLevelSchema.optional(),
  })
  .strict()
  .refine((input) => input.matterRole !== undefined || input.accessLevel !== undefined, {
    message: 'at least one field is required',
  })
  .refine(
    (input) =>
      input.matterRole !== 'limited_reviewer' ||
      input.accessLevel === undefined ||
      input.accessLevel === 'read',
    {
      message: 'limited_reviewer is read-only',
      path: ['accessLevel'],
    },
  );

export interface MatterMemberDto extends DisplayFieldsDto {
  matterId: string;
  tenantId: string;
  userId: string;
  userDisplayName?: string | null;
  userDisplayEmail?: string | null;
  matterRole: MatterMemberRole;
  accessLevel: MatterMemberAccessLevel;
  addedBy: string;
  addedAt: string;
}

export interface MatterMemberListDto {
  items: MatterMemberDto[];
  canManage: boolean;
}

export type AddMatterMemberDto = z.infer<typeof addMatterMemberSchema>;
export type UpdateMatterMemberDto = z.infer<typeof updateMatterMemberSchema>;
