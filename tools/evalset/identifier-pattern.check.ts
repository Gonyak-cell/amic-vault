export interface IdentifierPatternHit {
  pattern: string;
  field: string;
}

const identifierPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: 'resident_registration_number', pattern: /\b\d{6}-[1-4]\d{6}\b/ },
  { name: 'alien_registration_number', pattern: /\b\d{6}-[5-8]\d{6}\b/ },
  { name: 'passport_number', pattern: /\b[A-Z][0-9]{8}\b/i },
  { name: 'payment_card_number', pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/ },
  { name: 'bank_account_number', pattern: /\b\d{2,6}-\d{2,6}-\d{2,8}\b/ },
  { name: 'email_address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: 'phone_number', pattern: /\b01[016789]-?\d{3,4}-?\d{4}\b/ },
];

export function findIdentifierPatternHits(fields: Record<string, unknown>): IdentifierPatternHit[] {
  const hits: IdentifierPatternHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    for (const item of identifierPatterns) {
      if (item.pattern.test(text)) hits.push({ pattern: item.name, field });
    }
  }
  return hits;
}

export function assertNoIdentifierPatterns(fields: Record<string, unknown>): void {
  const hits = findIdentifierPatternHits(fields);
  if (hits.length > 0) {
    const first = hits[0]!;
    throw new Error(`evalset identifier pattern blocked: ${first.pattern} in ${first.field}`);
  }
}
