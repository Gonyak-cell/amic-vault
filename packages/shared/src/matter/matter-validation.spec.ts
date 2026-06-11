import { describe, expect, it } from 'vitest';
import { createMatterSchema } from './matter.dto';
import { containsSensitiveMatterMetadataKey, isMatterDateRangeValid } from './matter-validation';

const validInput = {
  clientId: '11111111-1111-4111-8111-1111111111aa',
  matterCode: 'M-2026-001',
  matterName: ' Alpha Matter ',
  matterType: 'contract',
};

describe('matter validation', () => {
  it.each([
    ['valid input', validInput, true],
    ['trimmed matter name', { ...validInput, matterName: '  Matter Name  ' }, true],
    ['future openedAt', { ...validInput, openedAt: '2030-01-01T00:00:00.000Z' }, true],
    ['closed after opened', {
      ...validInput,
      openedAt: '2026-01-01T00:00:00.000Z',
      closedAt: '2026-01-02T00:00:00.000Z',
    }, true],
    ['empty matterCode', { ...validInput, matterCode: '' }, false],
    ['empty matterName after trim', { ...validInput, matterName: '   ' }, false],
    ['invalid client uuid', { ...validInput, clientId: 'not-a-uuid' }, false],
    ['invalid matter type', { ...validInput, matterType: 'MA' }, false],
    ['unknown key', { ...validInput, unknown: 'nope' }, false],
    ['closed before opened', {
      ...validInput,
      openedAt: '2026-01-02T00:00:00.000Z',
      closedAt: '2026-01-01T00:00:00.000Z',
    }, false],
  ])('%s', (_name, input, expected) => {
    expect(createMatterSchema.safeParse(input).success).toBe(expected);
  });

  it('keeps date ordering and sensitive metadata checks reusable', () => {
    expect(isMatterDateRangeValid('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')).toBe(
      true,
    );
    expect(isMatterDateRangeValid('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(
      false,
    );
    expect(containsSensitiveMatterMetadataKey({ token: 'x' })).toBe(true);
    expect(containsSensitiveMatterMetadataKey({ external_ref: 'x' })).toBe(false);
  });
});
