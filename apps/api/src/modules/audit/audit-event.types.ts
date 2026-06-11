import type { AuditAction, AuditMetadata } from '@amic-vault/shared';

export type AuditActorType = 'user' | 'system';
export type AuditResult = 'success' | 'denied' | 'failure';

export interface AuditEventRecord {
  eventId: string;
  tenantId: string;
  actorType: AuditActorType;
  actorId: string | null;
  sessionId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  matterId: string | null;
  result: AuditResult;
  metadata: AuditMetadata;
  correlationId: string | null;
  createdAt: Date;
}
