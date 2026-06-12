import { describe, expect, it } from 'vitest';
import { SensitiveDataDetector } from './sensitive-data.detector';

describe('SensitiveDataDetector', () => {
  it('detects core Korean resident id, bank account, email, and phone patterns without raw values', () => {
    const detector = new SensitiveDataDetector();
    const text = [
      'resident 000000-0000000',
      'account 000-000000-00-000',
      'email person@example.test',
      'phone 010-0000-0000',
    ].join('\n');

    const result = detector.scan(text);

    expect(result.map((item) => item.findingType)).toEqual([
      'korean_resident_id',
      'bank_account',
      'email_address',
      'phone_number',
    ]);
    for (const item of result) {
      expect(item.valueHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(item.evidenceHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(JSON.stringify(item)).not.toContain('000000-0000000');
      expect(JSON.stringify(item)).not.toContain('000-000000-00-000');
      expect(JSON.stringify(item)).not.toContain('person@example.test');
      expect(JSON.stringify(item)).not.toContain('010-0000-0000');
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
