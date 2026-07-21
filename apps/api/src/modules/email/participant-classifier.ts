import type { EmailParticipantClass } from '@amic-vault/shared';

export interface ParticipantClassificationContext {
  tenantDomains: ReadonlySet<string>;
  clientDomains: ReadonlySet<string>;
  opposingDomains: ReadonlySet<string>;
}

export interface ClassifiableEmailParticipant {
  domainRef: string;
}

export function normalizeDomainRef(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized || normalized.length > 255) return null;
  if (!/^[a-z0-9.-]+$/.test(normalized)) return null;
  return normalized;
}

export function extractDomainRefsFromText(value: string | null | undefined): string[] {
  const text = value?.toLowerCase() ?? '';
  const domains = new Set<string>();
  for (const match of text.matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/g)) {
    const domain = normalizeDomainRef(match[1]);
    if (domain) domains.add(domain);
  }
  for (const match of text.matchAll(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/g)) {
    const domain = normalizeDomainRef(match[1]);
    if (domain && domain.includes('.')) domains.add(domain);
  }
  return [...domains].sort();
}

export function classifyEmailParticipant(
  participant: ClassifiableEmailParticipant,
  context: ParticipantClassificationContext,
): EmailParticipantClass {
  const domain = normalizeDomainRef(participant.domainRef);
  if (!domain) return 'other_external';
  if (context.tenantDomains.has(domain)) return 'internal';
  if (context.clientDomains.has(domain)) return 'client';
  if (context.opposingDomains.has(domain)) return 'opposing';
  return 'other_external';
}

export function isOutsideParticipantClass(participantClass: EmailParticipantClass): boolean {
  return participantClass !== 'internal';
}
