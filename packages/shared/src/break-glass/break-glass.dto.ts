import { z } from 'zod';

export const breakGlassRequestStatuses = ['pending', 'approved', 'revoked', 'expired'] as const;
export const breakGlassReasonCodes = [
  'client_emergency',
  'court_deadline',
  'privileged_access_review',
  'security_review',
] as const;

export type BreakGlassRequestStatus = (typeof breakGlassRequestStatuses)[number];
export type BreakGlassReasonCode = (typeof breakGlassReasonCodes)[number];

const uuidSchema = z.string().uuid();

export const createBreakGlassRequestSchema = z.object({
  wallId: uuidSchema,
  reasonCode: z.enum(breakGlassReasonCodes),
  expiresAt: z.string().datetime({ offset: true }),
});

export const revokeBreakGlassRequestSchema = z
  .object({
    reasonCode: z.enum(breakGlassReasonCodes).optional(),
  })
  .default({});

export interface CreateBreakGlassRequestDto {
  wallId: string;
  reasonCode: BreakGlassReasonCode;
  expiresAt: string;
}

export interface RevokeBreakGlassRequestDto {
  reasonCode?: BreakGlassReasonCode | undefined;
}

export interface BreakGlassRequestDto {
  requestId: string;
  tenantId: string;
  wallId: string;
  matterId: string;
  requesterId: string;
  reasonCode: BreakGlassReasonCode;
  status: BreakGlassRequestStatus;
  expiresAt: string;
  approvalCount: number;
  approvedAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
}
