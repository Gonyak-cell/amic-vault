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

export const dlpScanStates = ['clean', 'findings', 'unscannable'] as const;
export type DlpScanState = (typeof dlpScanStates)[number];

export const dlpUnscannableReasonCodes = [
  'assessment_missing',
  'text_pending',
  'ocr_pending',
  'no_text',
  'parser_failed',
  'password_protected',
  'input_oversize',
  'scan_limit_reached',
] as const;
export type DlpUnscannableReasonCode = (typeof dlpUnscannableReasonCodes)[number];

export const dlpAssessmentSourceTypes = [
  'document',
  'email',
  'attachment',
  'text',
  'email_egress',
  'model_egress',
] as const;
export type DlpAssessmentSourceType = (typeof dlpAssessmentSourceTypes)[number];

export const dlpRestrictedFindingTypes = [
  'korean_resident_id',
  'korean_alien_registration_number',
  'passport_number',
  'payment_card_number',
] as const satisfies readonly DlpFindingType[];

export const sf20DlpPolicyVersion = 'sf20-dlp-v1';
export const sf20DlpTotalFindingReviewThreshold = 20;
export const sf20DlpDefaultMaxFindings = 200;
export const sf20DlpMaxScanCharacters = 2_000_000;
export const sf20DlpMaxReviewDays = 30;

export const dlpReviewDecisions = ['allow', 'deny'] as const;
export type DlpReviewDecision = (typeof dlpReviewDecisions)[number];

export const dlpReviewReasonCodes = [
  'verified_safe',
  'known_encrypted_source',
  'business_justified',
  'sensitive_content_denied',
] as const;
export type DlpReviewReasonCode = (typeof dlpReviewReasonCodes)[number];

export const dlpEgressPurposes = [
  'document_download',
  'external_link',
  'external_ticket',
  'raw_email_download',
  'outlook_document_insertion',
] as const;
export type DlpEgressPurpose = (typeof dlpEgressPurposes)[number];

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

export interface DlpSensitiveDataScanResult {
  detections: DlpDetection[];
  completed: boolean;
  limitReached: boolean;
}

export interface DlpAssessmentSummary {
  scanState: DlpScanState;
  reasonCode: DlpUnscannableReasonCode | null;
  findingCount: number;
  restrictedFindingCount: number;
  requiresReview: boolean;
  completed: boolean;
  limitReached: boolean;
  policyVersion: typeof sf20DlpPolicyVersion;
  resultHash: string;
}

const uuidSchema = z.string().uuid();

export const createDlpReviewRequestSchema = z
  .object({
    decision: z.enum(dlpReviewDecisions),
    reasonCode: z.enum(dlpReviewReasonCodes),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'allow' && value.reasonCode === 'sensitive_content_denied') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCode'],
        message: 'allow decision requires an allow reason',
      });
    }
    if (value.decision === 'deny' && value.reasonCode !== 'sensitive_content_denied') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCode'],
        message: 'deny decision requires sensitive_content_denied',
      });
    }
  });

export const dlpReviewResponseSchema = z.object({
  assessmentId: uuidSchema,
  reviewId: uuidSchema,
  decision: z.enum(dlpReviewDecisions),
  reasonCode: z.enum(dlpReviewReasonCodes),
  expiresAt: z.string().datetime({ offset: true }),
  reviewedAt: z.string().datetime({ offset: true }),
});

export type CreateDlpReviewRequestDto = z.infer<typeof createDlpReviewRequestSchema>;
export type DlpReviewResponseDto = z.infer<typeof dlpReviewResponseSchema>;

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
