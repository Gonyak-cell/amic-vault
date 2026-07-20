import { afterEach, describe, expect, it } from 'vitest';
import { isAiPrepQueueWorkerEnabled } from './modules/ai/prep/ai-prep-queue.service';
import { isAuditAnchorQueueWorkerEnabled } from './modules/audit/audit-anchor-job.service';
import { isBulkDownloadMonitorWorkerEnabled } from './modules/dlp/bulk-download-monitor.service';
import { isExtractionQueueWorkerEnabled } from './modules/document/extraction/extraction-queue.service';
import { isRetentionSchedulerWorkerEnabled } from './modules/records/retention-scheduler.service';
import { isSearchIndexQueueWorkerEnabled } from './modules/search/index/indexing.service';
import { configureWorkerProcessEnv } from './worker-main';

describe('worker process bootstrap contract', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('defaults an unset worker entrypoint to PROCESS_ROLE=worker', () => {
    delete process.env.PROCESS_ROLE;
    delete process.env.AI_PREP_QUEUE_WORKER_ENABLED;
    delete process.env.AUDIT_ANCHOR_QUEUE_WORKER_ENABLED;
    delete process.env.DLP_BULK_DOWNLOAD_MONITOR_WORKER_ENABLED;
    delete process.env.EXTRACTION_QUEUE_WORKER_ENABLED;
    delete process.env.RETENTION_REVIEW_QUEUE_WORKER_ENABLED;
    delete process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;

    configureWorkerProcessEnv();

    expect(process.env.PROCESS_ROLE).toBe('worker');
    expect(isAiPrepQueueWorkerEnabled()).toBe(true);
    expect(isAuditAnchorQueueWorkerEnabled()).toBe(true);
    expect(isBulkDownloadMonitorWorkerEnabled()).toBe(true);
    expect(isExtractionQueueWorkerEnabled()).toBe(true);
    expect(isRetentionSchedulerWorkerEnabled()).toBe(true);
    expect(isSearchIndexQueueWorkerEnabled()).toBe(true);
  });

  it('does not override an explicit process role', () => {
    process.env.PROCESS_ROLE = 'api';

    configureWorkerProcessEnv();

    expect(process.env.PROCESS_ROLE).toBe('api');
  });
});
