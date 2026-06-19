import { z } from 'zod';
import {
  auditActions,
  type AuditAction,
  r2DocumentAuditActions,
  type AuditMetadata,
  type R2DocumentAuditAction,
} from '../../types/audit';
import type { DisplayFieldsDto } from '../../display/display-fields.dto';

export const documentAuditQueryEventTypeSchema = z.enum(r2DocumentAuditActions);
export const auditQueryActionSchema = z.enum(auditActions);
export const auditResultSchema = z.enum(['success', 'denied', 'failure']);
export const auditTargetTypeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,63}$/u);

const dateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime({ local: true }));
const uuidSchema = z.string().uuid();

interface DateRangeFields {
  from?: string | undefined;
  to?: string | undefined;
}

function isOrderedRange(value: DateRangeFields): boolean {
  if (!value.from || !value.to) return true;
  return new Date(value.from).getTime() <= new Date(value.to).getTime();
}

function isBoundedRange(value: DateRangeFields): boolean {
  if (!value.from || !value.to) return true;
  const from = new Date(value.from).getTime();
  const to = new Date(value.to).getTime();
  return to - from <= 366 * 24 * 60 * 60 * 1000;
}

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

export const matterAuditQuerySchema = z
  .object({
    action: auditQueryActionSchema.optional(),
    result: auditResultSchema.optional(),
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(8),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine(isOrderedRange, { message: 'from must be before to' })
  .refine(isBoundedRange, { message: 'audit date range must be bounded' });

function buildAuditQuerySchema(maxLimit: number, defaultLimit: number) {
  return z
    .object({
      actorId: uuidSchema.optional(),
      actor_id: uuidSchema.optional(),
      action: auditQueryActionSchema.optional(),
      result: auditResultSchema.optional(),
      targetType: auditTargetTypeSchema.optional(),
      target_type: auditTargetTypeSchema.optional(),
      targetId: uuidSchema.optional(),
      target_id: uuidSchema.optional(),
      matterId: uuidSchema.optional(),
      matter_id: uuidSchema.optional(),
      from: dateTimeSchema.optional(),
      to: dateTimeSchema.optional(),
      limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
      cursor: z.string().trim().min(1).max(200).optional(),
    })
    .strict()
    .transform((value) => ({
      actorId: value.actorId ?? value.actor_id,
      action: value.action,
      result: value.result,
      targetType: value.targetType ?? value.target_type,
      targetId: value.targetId ?? value.target_id,
      matterId: value.matterId ?? value.matter_id,
      from: value.from,
      to: value.to,
      limit: value.limit,
      cursor: value.cursor,
    }))
    .refine((value) => !value.targetId || value.targetType, {
      message: 'targetType is required when targetId is provided',
    })
    .refine(isOrderedRange, { message: 'from must be before to' })
    .refine(isBoundedRange, { message: 'audit date range must be bounded' });
}

export const auditQuerySchema = buildAuditQuerySchema(100, 50);
export const auditExportQuerySchema = buildAuditQuerySchema(1000, 1000);

export type DocumentAuditQueryEventType = R2DocumentAuditAction;
export type DocumentAuditQueryDto = z.infer<typeof documentAuditQuerySchema>;
export type MatterAuditQueryDto = z.infer<typeof matterAuditQuerySchema>;
export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
export type AuditExportQueryDto = z.infer<typeof auditExportQuerySchema>;

export interface DocumentAuditEventDto extends DisplayFieldsDto {
  eventId: string;
  action: DocumentAuditQueryEventType;
  actorType: 'user' | 'system';
  actorId: string | null;
  actorDisplayName?: string | null;
  actorDisplayEmail?: string | null;
  result: 'success' | 'denied' | 'failure';
  targetType: 'document';
  targetId: string;
  targetDisplayName?: string | null;
  targetDisplayCode?: string | null;
  matterId: string | null;
  matterDisplayName?: string | null;
  matterDisplayCode?: string | null;
  metadata: AuditMetadata;
  createdAt: string;
}

export interface DocumentAuditEventListDto {
  items: DocumentAuditEventDto[];
  nextCursor: string | null;
}

export interface AuditEventDto extends DisplayFieldsDto {
  eventId: string;
  action: AuditAction;
  actorType: 'user' | 'system';
  actorId: string | null;
  actorDisplayName?: string | null;
  actorDisplayEmail?: string | null;
  sessionId: string | null;
  result: 'success' | 'denied' | 'failure';
  targetType: string;
  targetId: string | null;
  targetDisplayName?: string | null;
  targetDisplayCode?: string | null;
  matterId: string | null;
  matterDisplayName?: string | null;
  matterDisplayCode?: string | null;
  metadata: AuditMetadata;
  createdAt: string;
}

export interface AuditEventListDto {
  items: AuditEventDto[];
  nextCursor: string | null;
}

export interface AuditExportResultDto {
  csv: string;
  rowCount: number;
}
