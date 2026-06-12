import { createHash } from 'node:crypto';
import type { DlpDetection, DlpFindingType, DlpRuleId, DlpScanOptions } from '@amic-vault/shared';

interface Rule {
  ruleId: DlpRuleId;
  findingType: DlpFindingType;
  pattern: RegExp;
  confidence: number;
  normalize(match: string): string;
  validate?(normalized: string): boolean;
}

const defaultMaxFindings = 200;
const contextRadius = 24;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function digitsOnly(input: string): string {
  return input.replace(/\D/gu, '');
}

function lower(input: string): string {
  return input.toLowerCase();
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (doubleDigit) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    doubleDigit = !doubleDigit;
  }
  return sum > 0 && sum % 10 === 0;
}

const rules: readonly Rule[] = [
  {
    ruleId: 'kr-rrn-format-v1',
    findingType: 'korean_resident_id',
    pattern: /\b\d{6}[- ]?[0-4]\d{6}\b/gu,
    confidence: 0.95,
    normalize: digitsOnly,
  },
  {
    ruleId: 'kr-alien-registration-format-v1',
    findingType: 'korean_alien_registration_number',
    pattern: /\b\d{6}[- ]?[5-8]\d{6}\b/gu,
    confidence: 0.95,
    normalize: digitsOnly,
  },
  {
    ruleId: 'bank-account-format-v1',
    findingType: 'bank_account',
    pattern: /\b(?!01[016789][- ])\d{2,6}[- ]\d{2,8}[- ]\d{1,6}(?:[- ]\d{1,4})?\b/gu,
    confidence: 0.8,
    normalize: digitsOnly,
  },
  {
    ruleId: 'passport-format-v1',
    findingType: 'passport_number',
    pattern: /\b[A-Z][0-9]{8}\b/gu,
    confidence: 0.8,
    normalize: lower,
  },
  {
    ruleId: 'payment-card-format-v1',
    findingType: 'payment_card_number',
    pattern: /\b(?:\d[ -]?){13,19}\b/gu,
    confidence: 0.85,
    normalize: digitsOnly,
    validate: luhnValid,
  },
  {
    ruleId: 'email-address-format-v1',
    findingType: 'email_address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    confidence: 0.9,
    normalize: lower,
  },
  {
    ruleId: 'kr-phone-format-v1',
    findingType: 'phone_number',
    pattern: /\b(?:\+82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}\b/gu,
    confidence: 0.85,
    normalize: digitsOnly,
  },
];

function contextHash(text: string, startOffset: number, endOffset: number): string {
  const start = Math.max(0, startOffset - contextRadius);
  const end = Math.min(text.length, endOffset + contextRadius);
  return sha256Hex(text.slice(start, end));
}

export class SensitiveDataDetector {
  scan(text: string, options: DlpScanOptions = {}): DlpDetection[] {
    const maxFindings = options.maxFindings ?? defaultMaxFindings;
    const detections: DlpDetection[] = [];
    const seen = new Set<string>();

    for (const rule of rules) {
      for (const match of text.matchAll(rule.pattern)) {
        if (match.index === undefined) continue;
        const raw = match[0];
        const normalized = rule.normalize(raw);
        if (!normalized) continue;
        if (rule.validate && !rule.validate(normalized)) continue;
        const startOffset = match.index;
        const endOffset = startOffset + raw.length;
        const valueHash = sha256Hex(`${rule.ruleId}:${normalized}`);
        const key = `${rule.ruleId}:${startOffset}:${endOffset}:${valueHash}`;
        if (seen.has(key)) continue;
        seen.add(key);
        detections.push({
          ruleId: rule.ruleId,
          findingType: rule.findingType,
          valueHash,
          evidenceHash: contextHash(text, startOffset, endOffset),
          startOffset,
          endOffset,
          confidence: rule.confidence,
        });
        if (detections.length >= maxFindings) {
          return detections.sort((left, right) => left.startOffset - right.startOffset);
        }
      }
    }

    return detections.sort((left, right) => left.startOffset - right.startOffset);
  }
}
