import type { PoolClient } from 'pg';
import type { SendOptions, WorkOptions } from 'pg-boss';
import type { DdExportType, NegotiationIssueStatus } from '@amic-vault/shared';
import { queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from '../document/extraction/pool-client-db-adapter';

export const ddExportQueueName = 'dd.export';
export const ddExportDeadLetterQueueName = 'dd.export.dead';

export interface DdExportJobPayload {
  tenantId: string;
  matterId: string;
  userId: string;
  authSessionId: string | null;
  exportType: DdExportType;
  exportFormat: 'docx';
  documentId?: string;
  status?: NegotiationIssueStatus;
}

export function isDdExportQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('DD_EXPORT_QUEUE_WORKER_ENABLED', env);
}

export function ddExportQueueSendOptions(
  _payload: DdExportJobPayload,
  client: PoolClient,
): SendOptions {
  return {
    retryLimit: 3,
    retryDelay: 1,
    retryBackoff: true,
    deadLetter: ddExportDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export function ddExportQueueWorkOptions(): WorkOptions {
  const configured = Number(process.env.DD_EXPORT_QUEUE_BATCH_SIZE ?? '');
  const batchSize = Number.isInteger(configured) && configured > 0 ? configured : 1;
  return {
    batchSize,
    localConcurrency: 1,
    groupConcurrency: 1,
    pollingIntervalSeconds: 1,
  };
}
