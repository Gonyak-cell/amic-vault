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
