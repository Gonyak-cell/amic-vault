import type { DocumentDto, DocumentStatus } from '@amic-vault/shared';

export const documentStatusLabels = {
  draft: '초안',
  internal_review: '내부 검토',
  client_sent: '고객 발송',
  counterparty_sent: '상대방 발송',
  markup_received: '마크업 수령',
  negotiation: '협상',
  final: '최종',
  executed: '체결',
  archived: '보관',
  disposal_locked: '처분 잠금',
  deleted: '삭제',
} as const satisfies Record<DocumentStatus, string>;

const transitionTargets = {
  draft: ['internal_review', 'final', 'archived'],
  internal_review: ['draft', 'client_sent', 'counterparty_sent', 'final', 'archived'],
  client_sent: ['counterparty_sent', 'markup_received', 'archived'],
  counterparty_sent: ['markup_received', 'archived'],
  markup_received: ['negotiation', 'archived'],
  negotiation: ['client_sent', 'counterparty_sent', 'final', 'archived'],
  final: ['executed', 'negotiation'],
  executed: ['archived'],
  archived: [],
  disposal_locked: [],
  deleted: [],
} as const satisfies Record<DocumentStatus, readonly DocumentStatus[]>;

export function isDocumentStatusTransitionLocked(document: DocumentDto): boolean {
  return (
    document.legalHold ||
    document.status === 'archived' ||
    document.status === 'disposal_locked' ||
    document.status === 'deleted'
  );
}

export function documentStatusTransitionTargets(document: DocumentDto): readonly DocumentStatus[] {
  if (isDocumentStatusTransitionLocked(document)) return [];
  return transitionTargets[document.status];
}
