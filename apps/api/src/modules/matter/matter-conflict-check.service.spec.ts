import { describe, expect, it } from 'vitest';
import { normalizeConflictName } from './matter-conflict-check.service';

describe('conflict-check name normalization', () => {
  it('normalizes legal suffixes and spacing for Korean organization names', () => {
    const variants = [
      '한빛',
      '주식회사 한빛',
      '(주) 한빛',
      '㈜한빛',
      '한 빛 주식회사',
      '유한회사 한빛',
      '법무법인 한빛',
      '재단법인 한빛',
    ];

    const normalized = variants.map(normalizeConflictName);

    expect(new Set(normalized)).toEqual(new Set(['한빛']));
  });

  it('keeps unrelated names distinct after normalization', () => {
    expect(normalizeConflictName('주식회사 한빛')).not.toBe(normalizeConflictName('늘푸른 유한회사'));
  });
});
