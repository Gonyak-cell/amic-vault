import { Inject, Injectable, NestMiddleware } from '@nestjs/common';

interface RequestLike {
  method?: string;
  originalUrl?: string;
  route?: { path?: string };
}

interface ResponseLike {
  statusCode?: number;
  on(event: 'finish', listener: () => void): void;
}

type NextFunction = () => void;

const buckets = [50, 100, 250, 500, 1000, 5000] as const;
const maxHttpSeries = 256;
const overflowPathLabel = '__overflow__';

function normalizePath(path: string): string {
  return (path.split('?')[0] ?? '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id');
}

function labelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeMethod(method: string): string {
  return /^[A-Z]{1,16}$/.test(method) ? method : 'UNKNOWN';
}

function normalizeStatus(status: string): string {
  return /^[1-5][0-9]{2}$/.test(status) ? status : '0';
}

interface Observation {
  method: string;
  path: string;
  status: string;
  durationMs: number;
}

interface HttpSeries {
  method: string;
  path: string;
  status: string;
  count: number;
  sumMs: number;
  bucketCounts: number[];
}

export interface QueueMetricSnapshot {
  queue: string;
  depth: number;
  deadLetterCount: number;
  oldestAgeSeconds: number;
}

export interface OperationalMetricSnapshot {
  databaseAvailable: boolean;
  databasePoolTotal: number;
  databasePoolIdle: number;
  databasePoolWaiting: number;
  scannerSignatureAvailable: boolean;
  scannerSignatureAgeSeconds: number;
  quarantineCount: number;
  oldestQuarantineAgeSeconds: number;
  backupStatusAvailable: boolean;
  backupAgeSeconds: number;
  lastRestoreDurationSeconds: number;
  monitoredDiskAvailable: boolean;
  monitoredDiskFreeRatio: number;
}

export interface MetricsRegistryStats {
  httpSeriesCount: number;
  httpBucketSlotCount: number;
  httpObservationCount: number;
  bucketCount: number;
  maxHttpSeriesCount: number;
}

@Injectable()
export class MetricsRegistry {
  private readonly httpSeries = new Map<string, HttpSeries>();
  private documentIntegrityAlerts = 0;
  private readonly extractionResults = new Map<string, number>();
  private readonly ingestionResults = new Map<'failure' | 'pending' | 'success', number>();
  private readonly auditWrites = new Map<'failure' | 'success', number>();
  private readonly storageFailures = new Map<StorageFailureClass, number>();
  private searchIndexFailures = 0;

  observe(input: Observation): void {
    const labels = this.seriesLabels(input);
    const key = `${labels.method}\t${labels.path}\t${labels.status}`;
    const series = this.httpSeries.get(key) ?? this.createHttpSeries(key, labels);
    const durationMs = Math.max(0, input.durationMs);
    series.count += 1;
    series.sumMs += durationMs;
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      if (bucket !== undefined && durationMs <= bucket) {
        series.bucketCounts[index] = (series.bucketCounts[index] ?? 0) + 1;
      }
    }
  }

  recordDocumentIntegrityAlert(): void {
    this.documentIntegrityAlerts += 1;
  }

  recordExtractionResult(status: string): void {
    const boundedStatus = extractionStatus(status);
    this.extractionResults.set(boundedStatus, (this.extractionResults.get(boundedStatus) ?? 0) + 1);
    const outcome =
      boundedStatus === 'ready' ? 'success' : boundedStatus === 'failed' ? 'failure' : 'pending';
    this.ingestionResults.set(outcome, (this.ingestionResults.get(outcome) ?? 0) + 1);
  }

  recordAuditWrite(outcome: 'failure' | 'success'): void {
    this.auditWrites.set(outcome, (this.auditWrites.get(outcome) ?? 0) + 1);
  }

  recordStorageFailure(errorClass: StorageFailureClass): void {
    this.storageFailures.set(errorClass, (this.storageFailures.get(errorClass) ?? 0) + 1);
  }

  recordSearchIndexFailure(): void {
    this.searchIndexFailures += 1;
  }

  reset(): void {
    this.httpSeries.clear();
    this.documentIntegrityAlerts = 0;
    this.extractionResults.clear();
    this.ingestionResults.clear();
    this.auditWrites.clear();
    this.storageFailures.clear();
    this.searchIndexFailures = 0;
  }

  stats(): MetricsRegistryStats {
    const httpObservationCount = [...this.httpSeries.values()].reduce(
      (sum, series) => sum + series.count,
      0,
    );
    return {
      httpSeriesCount: this.httpSeries.size,
      httpBucketSlotCount: this.httpSeries.size * buckets.length,
      httpObservationCount,
      bucketCount: buckets.length,
      maxHttpSeriesCount: maxHttpSeries,
    };
  }

  render(
    queueMetrics: readonly QueueMetricSnapshot[] = [],
    operational: OperationalMetricSnapshot = unavailableOperationalSnapshot,
  ): string {
    const totalLines = [
      '# HELP http_requests_total Total HTTP requests.',
      '# TYPE http_requests_total counter',
    ];
    const durationLines = [
      '# HELP http_request_duration_ms HTTP request duration in milliseconds.',
      '# TYPE http_request_duration_ms histogram',
    ];

    for (const series of [...this.httpSeries.values()].sort((left, right) =>
      `${left.method}\t${left.path}\t${left.status}`.localeCompare(
        `${right.method}\t${right.path}\t${right.status}`,
      ),
    )) {
      const labels = `method="${labelValue(series.method)}",path="${labelValue(
        series.path,
      )}",status="${labelValue(series.status)}"`;
      totalLines.push(`http_requests_total{${labels}} ${series.count}`);
      for (const [index, bucket] of buckets.entries()) {
        durationLines.push(
          `http_request_duration_ms_bucket{${labels},le="${bucket}"} ${
            series.bucketCounts[index] ?? 0
          }`,
        );
      }
      durationLines.push(`http_request_duration_ms_bucket{${labels},le="+Inf"} ${series.count}`);
      durationLines.push(`http_request_duration_ms_sum{${labels}} ${series.sumMs.toFixed(3)}`);
      durationLines.push(`http_request_duration_ms_count{${labels}} ${series.count}`);
    }

    const integrityLines = [
      '# HELP document_integrity_alerts_total Total blocked document integrity hash mismatches.',
      '# TYPE document_integrity_alerts_total counter',
      `document_integrity_alerts_total ${this.documentIntegrityAlerts}`,
    ];

    const extractionLines = [
      '# HELP document_extraction_results_total Total document extraction results by status.',
      '# TYPE document_extraction_results_total counter',
    ];
    for (const [status, count] of [...this.extractionResults.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      extractionLines.push(
        `document_extraction_results_total{status="${labelValue(status)}"} ${count}`,
      );
    }

    const searchIndexLines = [
      '# HELP search_index_failures_total Total failed search indexing jobs.',
      '# TYPE search_index_failures_total counter',
      `search_index_failures_total ${this.searchIndexFailures}`,
    ];

    const ingestionLines = [
      '# HELP document_ingestion_results_total Total bounded ingestion events by outcome.',
      '# TYPE document_ingestion_results_total counter',
      ...(['success', 'pending', 'failure'] as const).map(
        (outcome) =>
          `document_ingestion_results_total{outcome="${outcome}"} ${
            this.ingestionResults.get(outcome) ?? 0
          }`,
      ),
    ];
    const auditLines = [
      '# HELP audit_writes_total Total central audit write attempts by outcome.',
      '# TYPE audit_writes_total counter',
      ...(['success', 'failure'] as const).map(
        (outcome) =>
          `audit_writes_total{outcome="${outcome}"} ${this.auditWrites.get(outcome) ?? 0}`,
      ),
    ];
    const storageLines = [
      '# HELP storage_failures_total Total storage failures by bounded class.',
      '# TYPE storage_failures_total counter',
      ...storageFailureClasses.map(
        (errorClass) =>
          `storage_failures_total{error_class="${errorClass}"} ${
            this.storageFailures.get(errorClass) ?? 0
          }`,
      ),
    ];

    const queueLines = [
      '# HELP pgboss_queue_depth Pending pg-boss jobs by bounded queue name.',
      '# TYPE pgboss_queue_depth gauge',
      '# HELP pgboss_dead_letter_jobs Dead-letter pg-boss jobs by bounded queue name.',
      '# TYPE pgboss_dead_letter_jobs gauge',
      '# HELP pgboss_queue_oldest_age_seconds Age of the oldest pending pg-boss job.',
      '# TYPE pgboss_queue_oldest_age_seconds gauge',
    ];
    for (const metric of [...queueMetrics].sort((left, right) =>
      left.queue.localeCompare(right.queue),
    )) {
      const queueLabel = labelValue(metric.queue);
      queueLines.push(`pgboss_queue_depth{queue="${queueLabel}"} ${metric.depth}`);
      queueLines.push(`pgboss_dead_letter_jobs{queue="${queueLabel}"} ${metric.deadLetterCount}`);
      queueLines.push(
        `pgboss_queue_oldest_age_seconds{queue="${queueLabel}"} ${metric.oldestAgeSeconds}`,
      );
    }

    const operationalLines = [
      '# HELP sf20_database_available Whether aggregate database observations succeeded.',
      '# TYPE sf20_database_available gauge',
      `sf20_database_available ${booleanMetric(operational.databaseAvailable)}`,
      '# HELP sf20_database_pool_connections Database pool connections by closed state.',
      '# TYPE sf20_database_pool_connections gauge',
      `sf20_database_pool_connections{state="total"} ${nonnegative(operational.databasePoolTotal)}`,
      `sf20_database_pool_connections{state="idle"} ${nonnegative(operational.databasePoolIdle)}`,
      `sf20_database_pool_connections{state="waiting"} ${nonnegative(
        operational.databasePoolWaiting,
      )}`,
      '# HELP sf20_scanner_signature_available Whether a verified scanner signature time exists.',
      '# TYPE sf20_scanner_signature_available gauge',
      `sf20_scanner_signature_available ${booleanMetric(operational.scannerSignatureAvailable)}`,
      '# HELP sf20_scanner_signature_age_seconds Age of the freshest verified scanner signature.',
      '# TYPE sf20_scanner_signature_age_seconds gauge',
      `sf20_scanner_signature_age_seconds ${nonnegative(operational.scannerSignatureAgeSeconds)}`,
      '# HELP sf20_quarantine_objects Current non-promoted quarantine objects.',
      '# TYPE sf20_quarantine_objects gauge',
      `sf20_quarantine_objects ${nonnegative(operational.quarantineCount)}`,
      '# HELP sf20_oldest_quarantine_age_seconds Age of the oldest non-promoted quarantine object.',
      '# TYPE sf20_oldest_quarantine_age_seconds gauge',
      `sf20_oldest_quarantine_age_seconds ${nonnegative(operational.oldestQuarantineAgeSeconds)}`,
      '# HELP sf20_backup_status_available Whether a closed backup status document is available.',
      '# TYPE sf20_backup_status_available gauge',
      `sf20_backup_status_available ${booleanMetric(operational.backupStatusAvailable)}`,
      '# HELP sf20_backup_age_seconds Age of the latest completed backup.',
      '# TYPE sf20_backup_age_seconds gauge',
      `sf20_backup_age_seconds ${nonnegative(operational.backupAgeSeconds)}`,
      '# HELP sf20_last_restore_duration_seconds Duration of the latest verified restore.',
      '# TYPE sf20_last_restore_duration_seconds gauge',
      `sf20_last_restore_duration_seconds ${nonnegative(operational.lastRestoreDurationSeconds)}`,
      '# HELP sf20_monitored_disk_available Whether monitored filesystem statistics are available.',
      '# TYPE sf20_monitored_disk_available gauge',
      `sf20_monitored_disk_available ${booleanMetric(operational.monitoredDiskAvailable)}`,
      '# HELP sf20_monitored_disk_free_ratio Free ratio of the bounded monitored filesystem.',
      '# TYPE sf20_monitored_disk_free_ratio gauge',
      `sf20_monitored_disk_free_ratio ${ratio(operational.monitoredDiskFreeRatio)}`,
    ];

    return [
      ...totalLines,
      ...durationLines,
      ...integrityLines,
      ...extractionLines,
      ...searchIndexLines,
      ...ingestionLines,
      ...auditLines,
      ...storageLines,
      ...queueLines,
      ...operationalLines,
      '',
    ].join('\n');
  }

  private seriesLabels(input: Observation): Pick<HttpSeries, 'method' | 'path' | 'status'> {
    const labels = {
      method: normalizeMethod(input.method),
      path: input.path || 'unknown',
      status: normalizeStatus(input.status),
    };
    const key = `${labels.method}\t${labels.path}\t${labels.status}`;
    if (this.httpSeries.has(key) || this.httpSeries.size < maxHttpSeries - 1) return labels;
    return { method: 'OTHER', path: overflowPathLabel, status: '0' };
  }

  private createHttpSeries(
    key: string,
    labels: Pick<HttpSeries, 'method' | 'path' | 'status'>,
  ): HttpSeries {
    const series: HttpSeries = {
      ...labels,
      count: 0,
      sumMs: 0,
      bucketCounts: Array.from({ length: buckets.length }, () => 0),
    };
    this.httpSeries.set(key, series);
    return series;
  }
}

export const storageFailureClasses = [
  'access_denied',
  'exact_version',
  'timeout',
  'unavailable',
  'versioning',
  'unknown',
] as const;
export type StorageFailureClass = (typeof storageFailureClasses)[number];

const extractionStatuses = new Set(['failed', 'ocr_pending', 'pending', 'ready']);
const unavailableOperationalSnapshot: OperationalMetricSnapshot = {
  databaseAvailable: false,
  databasePoolTotal: 0,
  databasePoolIdle: 0,
  databasePoolWaiting: 0,
  scannerSignatureAvailable: false,
  scannerSignatureAgeSeconds: 0,
  quarantineCount: 0,
  oldestQuarantineAgeSeconds: 0,
  backupStatusAvailable: false,
  backupAgeSeconds: 0,
  lastRestoreDurationSeconds: 0,
  monitoredDiskAvailable: false,
  monitoredDiskFreeRatio: 0,
};

function extractionStatus(value: string): string {
  return extractionStatuses.has(value) ? value : 'unknown';
}

function booleanMetric(value: boolean): number {
  return value ? 1 : 0;
}

function nonnegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function ratio(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(@Inject(MetricsRegistry) private readonly registry: MetricsRegistry) {}

  use(request: RequestLike, response: ResponseLike, next: NextFunction): void {
    const startedAt = performance.now();
    response.on('finish', () => {
      const routePath = request.route?.path
        ? String(request.route.path)
        : (request.originalUrl ?? '');
      this.registry.observe({
        method: request.method ?? 'UNKNOWN',
        path: normalizePath(routePath),
        status: String(response.statusCode ?? 0),
        durationMs: performance.now() - startedAt,
      });
    });
    next();
  }
}
