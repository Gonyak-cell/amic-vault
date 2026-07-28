import type { AuditLogInput } from '../audit/audit.service';

interface BaseBulkActionAuditInput {
  actorUserId: string;
  batchId: string;
  tenantId: string;
  actionKind: string;
  itemCount: number;
}

export function documentBulkActionCreatedAudit(
  input: BaseBulkActionAuditInput & { requestHash: string },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    action: 'DOCUMENT_BULK_ACTION_CREATED',
    targetType: 'document_bulk_action_batch',
    targetId: input.batchId,
    metadata: {
      request_id: input.batchId,
      batch_size: input.itemCount,
      idempotency_hash: input.requestHash,
      work_kind: input.actionKind,
      status_after: 'queued',
    },
  };
}

export function documentBulkActionCompletedAudit(
  input: BaseBulkActionAuditInput & {
    failedCount: number;
    status: 'completed' | 'failed' | 'partial';
    succeededCount: number;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    action: 'DOCUMENT_BULK_ACTION_COMPLETED',
    targetType: 'document_bulk_action_batch',
    targetId: input.batchId,
    metadata: {
      request_id: input.batchId,
      batch_size: input.itemCount,
      pass_count: input.succeededCount,
      fail_count: input.failedCount,
      work_kind: input.actionKind,
      status_after: input.status,
    },
  };
}

export function documentBulkActionRetriedAudit(
  input: BaseBulkActionAuditInput & { retryCount: number },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorUserId,
    action: 'DOCUMENT_BULK_ACTION_RETRIED',
    targetType: 'document_bulk_action_batch',
    targetId: input.batchId,
    metadata: {
      request_id: input.batchId,
      batch_size: input.itemCount,
      retry_count: input.retryCount,
      work_kind: input.actionKind,
      status_after: 'queued',
    },
  };
}
