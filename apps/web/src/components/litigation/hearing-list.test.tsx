import { describe, expect, it, vi } from 'vitest';
import type { LitigationHearingDto } from '@amic-vault/shared';
import {
  buildHearingInput,
  submitHearingRegistration,
  submitHearingStatus,
  type HearingFormState,
} from './hearing-list';

const matterId = '11111111-1111-4111-8111-111111111122';
const hearingId = '11111111-1111-4111-8111-111111111447';
const timestamp = '2026-07-03T00:00:00.000Z';

const state = {
  courtName: '서울중앙지방법원',
  hearingType: 'deadline',
  internalDeadline: '2026-07-03',
  location: '',
  scheduledAt: '2026-07-10T09:30',
  title: '준비서면 제출기한',
} satisfies HearingFormState;

const hearing = {
  hearingId,
  matterId,
  pleadingId: null,
  title: '준비서면 제출기한',
  hearingType: 'deadline',
  scheduledAt: '2026-07-10T00:30:00.000Z',
  courtName: '서울중앙지방법원',
  location: null,
  internalDeadline: '2026-07-03',
  status: 'scheduled',
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies LitigationHearingDto;

describe('HearingList helpers', () => {
  it('builds safe hearing input with ISO scheduledAt and optional place fields', () => {
    expect(buildHearingInput(matterId, state)).toMatchObject({
      matterId,
      title: '준비서면 제출기한',
      hearingType: 'deadline',
      courtName: '서울중앙지방법원',
      internalDeadline: '2026-07-03',
    });
    expect(buildHearingInput(matterId, state).scheduledAt).toMatch(/2026-07-10T/);
  });

  it('submits hearing registration and refresh callback', async () => {
    const createHearing = vi.fn(async () => hearing);
    const onSubmitted = vi.fn();

    await expect(
      submitHearingRegistration({ createHearing, matterId, onSubmitted, state }),
    ).resolves.toEqual(hearing);

    expect(createHearing).toHaveBeenCalledWith(expect.objectContaining({ matterId }));
    expect(onSubmitted).toHaveBeenCalledWith(hearing);
  });

  it('submits status changes through the update schema', async () => {
    const updateHearing = vi.fn(async () => ({ ...hearing, status: 'completed' as const }));

    await expect(
      submitHearingStatus({ hearing, status: 'completed', updateHearing }),
    ).resolves.toMatchObject({ status: 'completed' });

    expect(updateHearing).toHaveBeenCalledWith(hearingId, { status: 'completed' });
  });
});
