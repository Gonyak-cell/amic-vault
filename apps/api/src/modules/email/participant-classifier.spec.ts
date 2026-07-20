import { describe, expect, it } from 'vitest';
import {
  classifyEmailParticipant,
  extractDomainRefsFromText,
  normalizeDomainRef,
  type ParticipantClassificationContext,
} from './participant-classifier';

function context(input: {
  clientDomains?: string[];
  opposingDomains?: string[];
  tenantDomains?: string[];
}): ParticipantClassificationContext {
  return {
    tenantDomains: new Set(input.tenantDomains ?? []),
    clientDomains: new Set(input.clientDomains ?? []),
    opposingDomains: new Set(input.opposingDomains ?? []),
  };
}

describe('participant classifier', () => {
  it('classifies tenant domains as internal', () => {
    expect(
      classifyEmailParticipant(
        { domainRef: 'amic.test' },
        context({ tenantDomains: ['amic.test'], clientDomains: ['client.example'] }),
      ),
    ).toBe('internal');
  });

  it('classifies client domains as client', () => {
    expect(
      classifyEmailParticipant(
        { domainRef: 'client.example' },
        context({ tenantDomains: ['amic.test'], clientDomains: ['client.example'] }),
      ),
    ).toBe('client');
  });

  it('classifies opposing party domains as opposing', () => {
    expect(
      classifyEmailParticipant(
        { domainRef: 'opposing.example' },
        context({ tenantDomains: ['amic.test'], opposingDomains: ['opposing.example'] }),
      ),
    ).toBe('opposing');
  });

  it('does not treat an unset tenant domain configuration as internal', () => {
    expect(classifyEmailParticipant({ domainRef: 'unknown.example' }, context({}))).toBe(
      'other_external',
    );
  });

  it('normalizes and extracts bounded domain refs from party text', () => {
    expect(normalizeDomainRef(' Client.Example ')).toBe('client.example');
    expect(extractDomainRefsFromText('Opposing Counsel <lawyer@opposing.example>')).toEqual([
      'opposing.example',
    ]);
  });
});
