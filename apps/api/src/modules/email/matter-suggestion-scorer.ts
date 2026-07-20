import type {
  EmailMatterSuggestionConfidenceBand,
  EmailMatterSuggestionReasonCode,
} from '@amic-vault/shared';

export interface MatterSuggestionSignalInput {
  subjectMatch?: boolean;
  domainMatch?: boolean;
  threadFiledCount?: number;
  senderMatterFilingCount?: number;
  senderTotalFilingCount?: number;
  clientParticipantMatch?: boolean;
  opposingDomainConflict?: boolean;
}

export interface MatterSuggestionScore {
  confidence: number;
  confidenceBand: EmailMatterSuggestionConfidenceBand;
  reasonCodes: EmailMatterSuggestionReasonCode[];
}

export function scoreMatterSuggestion(input: MatterSuggestionSignalInput): MatterSuggestionScore {
  const threadFiledCount = boundedCount(input.threadFiledCount);
  const senderMatterFilingCount = boundedCount(input.senderMatterFilingCount);
  const senderTotalFilingCount = boundedCount(input.senderTotalFilingCount);
  const senderShare =
    senderTotalFilingCount > 0 ? senderMatterFilingCount / senderTotalFilingCount : 0;

  let logit = -2.5;
  const reasonCodes: EmailMatterSuggestionReasonCode[] = [];
  if (threadFiledCount > 0) {
    logit += 5.7 + Math.min(threadFiledCount, 5) * 0.22;
    reasonCodes.push('thread');
  }
  if (senderMatterFilingCount > 0) {
    logit += 1.55 + Math.min(senderMatterFilingCount, 6) * 0.12 + senderShare * 0.45;
    reasonCodes.push('sender_history');
  }
  if (input.domainMatch) {
    logit += 2.5;
    reasonCodes.push('participant_domain');
  }
  if (input.clientParticipantMatch) {
    logit += 0.85;
    reasonCodes.push('participant_class');
  }
  if (input.subjectMatch) {
    logit += 1;
    reasonCodes.push('subject');
  }
  if (input.opposingDomainConflict) {
    logit -= 1.6;
    reasonCodes.push('opposing_signal');
  }

  const confidence = Math.max(0, Math.min(100, Math.round(100 / (1 + Math.exp(-logit)))));
  return {
    confidence,
    confidenceBand: bandForConfidence(confidence),
    reasonCodes,
  };
}

export function bandForConfidence(confidence: number): EmailMatterSuggestionConfidenceBand {
  if (confidence >= 95) return 'auto_file';
  if (confidence >= 80) return 'confirm';
  if (confidence >= 50) return 'candidate';
  return 'manual';
}

function boundedCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10_000, Math.trunc(value ?? 0)));
}
