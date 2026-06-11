import { z } from 'zod';
import {
  r2DocumentAuditActions,
  type AuditMetadata,
  type R2DocumentAuditAction,
} from '../../types/audit';

export const documentAuditQueryEventTypeSchema = z.enum(r2DocumentAuditActions);

const dateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime({ local: true }));

export const documentAuditQuerySchema = z
  .object({
    eventType: documentAuditQueryEventTypeSchema.optional(),
    event_type: documentAuditQueryEventTypeSchema.optional(),
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .transform((value) => ({
    eventType: value.eventType ?? value.event_type,
    from: value.from,
    to: value.to,
    limit: value.limit,
    cursor: value.cursor,
  }));

export type DocumentAuditQueryEventType = R2DocumentAuditAction;
export type DocumentAuditQueryDto = z.infer<typeof documentAuditQuerySchema>;

export interface DocumentAuditEventDto {
  eventId: string;
  action: DocumentAuditQueryEventType;
  actorType: 'user' | 'system';
  actorId: string | null;
  result: 'success' | 'denied' | 'failure';
  targetType: 'document';
  targetId: string;
  matterId: string | null;
  metadata: AuditMetadata;
  createdAt: string;
}

export interface DocumentAuditEventListDto {
  items: DocumentAuditEventDto[];
  nextCursor: string | null;
}
