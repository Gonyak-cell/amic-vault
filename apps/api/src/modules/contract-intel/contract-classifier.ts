import type { ContractClassificationDto, ContractType } from '@amic-vault/shared';

export const contractClassifierVersion = 'r8-local-v1';

interface Rule {
  type: Exclude<ContractType, 'unknown'>;
  signalRef: string;
  pattern: RegExp;
  weight: number;
}

const rules: Rule[] = [
  { type: 'nda', signalRef: 'keyword:non-disclosure', pattern: /\b(non[- ]disclosure|confidential information|nda)\b/i, weight: 0.44 },
  { type: 'nda', signalRef: 'keyword:confidentiality', pattern: /\bconfidentiality obligations?\b/i, weight: 0.24 },
  { type: 'msa', signalRef: 'keyword:master-services', pattern: /\b(master services agreement|statement of work|services agreement)\b/i, weight: 0.42 },
  { type: 'msa', signalRef: 'keyword:service-level', pattern: /\b(service levels?|deliverables?)\b/i, weight: 0.18 },
  { type: 'share_purchase', signalRef: 'keyword:share-purchase', pattern: /\b(share purchase|stock purchase|purchase and sale of shares)\b/i, weight: 0.46 },
  { type: 'employment', signalRef: 'keyword:employment', pattern: /\b(employment agreement|employee|compensation|termination for cause)\b/i, weight: 0.42 },
  { type: 'lease', signalRef: 'keyword:lease', pattern: /\b(lease agreement|landlord|tenant|premises)\b/i, weight: 0.42 },
  { type: 'loan', signalRef: 'keyword:loan', pattern: /\b(loan agreement|borrower|lender|interest rate|principal amount)\b/i, weight: 0.42 },
];

export function classifyContractText(input: {
  documentId: string;
  versionId: string;
  matterId: string;
  text: string;
}): ContractClassificationDto {
  const scores = new Map<ContractType, { score: number; signals: string[] }>();
  for (const rule of rules) {
    if (!rule.pattern.test(input.text)) continue;
    const current = scores.get(rule.type) ?? { score: 0, signals: [] };
    current.score += rule.weight;
    current.signals.push(rule.signalRef);
    scores.set(rule.type, current);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const winner = ranked[0];
  const contractType = winner?.[0] ?? 'unknown';
  const confidence = winner ? Math.min(0.98, Math.max(0.51, winner[1].score)) : 0;
  return {
    documentId: input.documentId,
    versionId: input.versionId,
    matterId: input.matterId,
    contractType,
    confidence,
    classifierVersion: contractClassifierVersion,
    unsupported: contractType === 'unknown',
    signalRefs: winner?.[1].signals.slice(0, 12) ?? [],
  };
}
