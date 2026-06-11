export enum DocumentStatus {
  Draft = 'draft',
  InternalReview = 'internal_review',
  ClientSent = 'client_sent',
  CounterpartySent = 'counterparty_sent',
  MarkupReceived = 'markup_received',
  Negotiation = 'negotiation',
  Final = 'final',
  Executed = 'executed',
  Archived = 'archived',
  DisposalLocked = 'disposal_locked',
  Deleted = 'deleted',
}

export const documentStatusValues = [
  DocumentStatus.Draft,
  DocumentStatus.InternalReview,
  DocumentStatus.ClientSent,
  DocumentStatus.CounterpartySent,
  DocumentStatus.MarkupReceived,
  DocumentStatus.Negotiation,
  DocumentStatus.Final,
  DocumentStatus.Executed,
  DocumentStatus.Archived,
  DocumentStatus.DisposalLocked,
  DocumentStatus.Deleted,
] as const;

export type DocumentStatusValue = (typeof documentStatusValues)[number];

export const allowedDocumentTransitions = [
  [DocumentStatus.Draft, DocumentStatus.InternalReview],
  [DocumentStatus.InternalReview, DocumentStatus.Draft],
  [DocumentStatus.InternalReview, DocumentStatus.ClientSent],
  [DocumentStatus.InternalReview, DocumentStatus.CounterpartySent],
  [DocumentStatus.ClientSent, DocumentStatus.CounterpartySent],
  [DocumentStatus.ClientSent, DocumentStatus.MarkupReceived],
  [DocumentStatus.CounterpartySent, DocumentStatus.MarkupReceived],
  [DocumentStatus.MarkupReceived, DocumentStatus.Negotiation],
  [DocumentStatus.Negotiation, DocumentStatus.ClientSent],
  [DocumentStatus.Negotiation, DocumentStatus.CounterpartySent],
  [DocumentStatus.Negotiation, DocumentStatus.Final],
  [DocumentStatus.Draft, DocumentStatus.Final],
  [DocumentStatus.InternalReview, DocumentStatus.Final],
  [DocumentStatus.Final, DocumentStatus.Executed],
  [DocumentStatus.Final, DocumentStatus.Negotiation],
  [DocumentStatus.Executed, DocumentStatus.Archived],
  [DocumentStatus.Draft, DocumentStatus.Archived],
  [DocumentStatus.InternalReview, DocumentStatus.Archived],
  [DocumentStatus.ClientSent, DocumentStatus.Archived],
  [DocumentStatus.CounterpartySent, DocumentStatus.Archived],
  [DocumentStatus.MarkupReceived, DocumentStatus.Archived],
  [DocumentStatus.Negotiation, DocumentStatus.Archived],
  [DocumentStatus.Draft, DocumentStatus.Deleted],
  [DocumentStatus.InternalReview, DocumentStatus.Deleted],
  [DocumentStatus.ClientSent, DocumentStatus.Deleted],
  [DocumentStatus.CounterpartySent, DocumentStatus.Deleted],
  [DocumentStatus.MarkupReceived, DocumentStatus.Deleted],
  [DocumentStatus.Negotiation, DocumentStatus.Deleted],
  [DocumentStatus.Final, DocumentStatus.Deleted],
  [DocumentStatus.Executed, DocumentStatus.Deleted],
  [DocumentStatus.Archived, DocumentStatus.Deleted],
] as const satisfies readonly (readonly [DocumentStatusValue, DocumentStatusValue])[];

const transitionKeys = new Set(
  allowedDocumentTransitions.map(([from, to]) => transitionKey(from, to)),
);

function transitionKey(from: DocumentStatusValue, to: DocumentStatusValue): string {
  return `${from}->${to}`;
}

export function isDocumentStatus(value: string): value is DocumentStatusValue {
  return (documentStatusValues as readonly string[]).includes(value);
}

export function canTransitionDocumentStatus(
  from: DocumentStatusValue,
  to: DocumentStatusValue,
): boolean {
  return transitionKeys.has(transitionKey(from, to));
}
