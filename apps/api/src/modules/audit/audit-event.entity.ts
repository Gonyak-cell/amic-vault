import type { AuditEventRecord } from './audit-event.types';

export class AuditEventEntity {
  constructor(readonly record: AuditEventRecord) {}
}
