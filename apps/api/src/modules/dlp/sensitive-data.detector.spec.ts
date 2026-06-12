import { describe, expect, it } from 'vitest';
import { SensitiveDataDetector } from './sensitive-data.detector';

describe('SensitiveDataDetector', () => {
  it('detects core and R5 identity/card patterns without raw values', () => {
    const detector = new SensitiveDataDetector();
    const rawValues = [
      '000000-0000000',
      '900101-5000000',
      '000-000000-00-000',
      'M12345678',
      '4111111111111111',
      'person@example.test',
      '010-0000-0000',
    ];
    const text = [
      `resident ${rawValues[0]}`,
      `alien ${rawValues[1]}`,
      `account ${rawValues[2]}`,
      `passport ${rawValues[3]}`,
      `card ${rawValues[4]}`,
      `email ${rawValues[5]}`,
      `phone ${rawValues[6]}`,
    ].join('\n');

    const result = detector.scan(text);

    expect(result.map((item) => item.findingType)).toEqual([
      'korean_resident_id',
      'korean_alien_registration_number',
      'bank_account',
      'passport_number',
      'payment_card_number',
      'email_address',
      'phone_number',
    ]);
    for (const item of result) {
      expect(item.valueHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(item.evidenceHash).toMatch(/^[0-9a-f]{64}$/u);
      for (const rawValue of rawValues) {
        expect(JSON.stringify(item)).not.toContain(rawValue);
      }
    }
  });

  it('deduplicates matches and honors the maxFindings cap', () => {
    const detector = new SensitiveDataDetector();
    const result = detector.scan('000000-0000000\n000000-0000000\n010-0000-0000', {
      maxFindings: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.startOffset).toBeLessThan(result[1]?.startOffset ?? Number.MAX_SAFE_INTEGER);
  });
});
