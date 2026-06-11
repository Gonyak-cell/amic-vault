import { describe, expect, it } from 'vitest';
import { PartyService } from './party.service';

describe('PartyService', () => {
  it('can be constructed with its required collaborators', () => {
    const service = new PartyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(service).toBeInstanceOf(PartyService);
  });
});
