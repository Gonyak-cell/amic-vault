import { z } from 'zod';

export const dlpFindingTypes = [
  'korean_resident_id',
  'korean_alien_registration_number',
  'bank_account',
  'passport_number',
  'payment_card_number',
  'email_address',
  'phone_number',
] as const;

export type DlpFindingType = (typeof dlpFindingTypes)[number];

export const dlpRuleIds = [
  'kr-rrn-format-v1',
  'kr-alien-registration-format-v1',
  'bank-account-format-v1',
  'passport-format-v1',
  'payment-card-format-v1',
  'email-address-format-v1',
  'kr-phone-format-v1',
] as const;

export type DlpRuleId = (typeof dlpRuleIds)[number];

export interface DlpDetection {
  ruleId: DlpRuleId;
  findingType: DlpFindingType;
  valueHash: string;
  evidenceHash: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
}

export interface DlpScanOptions {
  maxFindings?: number;
}

const uuidSchema = z.string().uuid();

export const dlpBehaviorAlertStatuses = ['open', 'acknowledged', 'dismissed'] as const;
export const dlpBehaviorAlertStatusSchema = z.enum(dlpBehaviorAlertStatuses);

export const dlpBehaviorAlertSchema = z.object({
  alertId: uuidSchema,
  tenantId: uuidSchema,
  actorUserId: uuidSchema,
  actorSafeLabel: z.string().min(1).max(200),
  actorDisplayEmail: z.string().max(320).nullable(),
  matterId: uuidSchema,
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  eventCount: z.number().int().positive(),
  totalBytes: z.number().int().nonnegative(),
  thresholdCount: z.number().int().positive(),
  thresholdBytes: z.number().int().positive(),
  status: dlpBehaviorAlertStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
});

export const dlpBehaviorAlertListResponseSchema = z.object({
  items: z.array(dlpBehaviorAlertSchema).max(100),
});

export type DlpBehaviorAlertStatus = (typeof dlpBehaviorAlertStatuses)[number];
export type DlpBehaviorAlertDto = z.infer<typeof dlpBehaviorAlertSchema>;
export type DlpBehaviorAlertListResponseDto = z.infer<typeof dlpBehaviorAlertListResponseSchema>;
