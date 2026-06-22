import { z } from 'zod';
import type { DisplayFieldsDto } from '../../display/display-fields.dto';
import type { UserRole } from '../../permission/roles';

export const orgDirectoryPurposes = [
  'matter-team',
  'ethical-wall',
  'records',
  'user-admin',
] as const;
export const orgDirectoryPurposeSchema = z.enum(orgDirectoryPurposes);

export const orgDirectorySubjectTypes = ['user', 'group'] as const;
export const orgDirectorySubjectTypeSchema = z.enum(orgDirectorySubjectTypes);
export const orgDirectorySubjectFilters = ['all', ...orgDirectorySubjectTypes] as const;
export const orgDirectorySubjectFilterSchema = z.enum(orgDirectorySubjectFilters);

export const orgDirectorySubjectQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(25).default(10),
    matterId: z.string().uuid().optional(),
    purpose: orgDirectoryPurposeSchema,
    q: z.string().trim().min(2).max(128),
    subjectType: orgDirectorySubjectFilterSchema.default('all'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.purpose === 'matter-team' && !value.matterId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'matter-team org directory lookups require a matterId',
        path: ['matterId'],
      });
    }
  });

export type OrgDirectoryPurpose = (typeof orgDirectoryPurposes)[number];
export type OrgDirectorySubjectType = (typeof orgDirectorySubjectTypes)[number];
export type OrgDirectorySubjectFilter = (typeof orgDirectorySubjectFilters)[number];
export type OrgDirectorySubjectQueryDto = z.infer<typeof orgDirectorySubjectQuerySchema>;

export interface OrgDirectorySubjectDto extends DisplayFieldsDto {
  groupType?: 'practice_group' | 'team' | 'custom';
  role?: UserRole;
  subjectId: string;
  subjectType: OrgDirectorySubjectType;
}

export interface OrgDirectorySubjectListDto {
  items: OrgDirectorySubjectDto[];
}
