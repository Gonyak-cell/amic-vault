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
    this.extractionResults.set(status, (this.extractionResults.get(status) ?? 0) + 1);
  }

  recordSearchIndexFailure(): void {
    this.searchIndexFailures += 1;
  }

  reset(): void {
    this.httpSeries.clear();
    this.documentIntegrityAlerts = 0;
    this.extractionResults.clear();
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

  render(queueMetrics: readonly QueueMetricSnapshot[] = []): string {
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

    const queueLines = [
      '# HELP pgboss_queue_depth Pending pg-boss jobs by bounded queue name.',
      '# TYPE pgboss_queue_depth gauge',
      '# HELP pgboss_dead_letter_jobs Dead-letter pg-boss jobs by bounded queue name.',
      '# TYPE pgboss_dead_letter_jobs gauge',
    ];
    for (const metric of [...queueMetrics].sort((left, right) =>
      left.queue.localeCompare(right.queue),
    )) {
      const queueLabel = labelValue(metric.queue);
      queueLines.push(`pgboss_queue_depth{queue="${queueLabel}"} ${metric.depth}`);
      queueLines.push(`pgboss_dead_letter_jobs{queue="${queueLabel}"} ${metric.deadLetterCount}`);
    }

    return [
      ...totalLines,
      ...durationLines,
      ...integrityLines,
      ...extractionLines,
      ...searchIndexLines,
      ...queueLines,
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
