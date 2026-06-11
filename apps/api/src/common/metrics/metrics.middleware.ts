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

function normalizePath(path: string): string {
  return (path.split('?')[0] ?? '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id');
}

function labelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface Observation {
  method: string;
  path: string;
  status: string;
  durationMs: number;
}

@Injectable()
export class MetricsRegistry {
  private readonly observations: Observation[] = [];
  private documentIntegrityAlerts = 0;
  private readonly extractionResults = new Map<string, number>();

  observe(input: Observation): void {
    this.observations.push(input);
  }

  recordDocumentIntegrityAlert(): void {
    this.documentIntegrityAlerts += 1;
  }

  recordExtractionResult(status: string): void {
    this.extractionResults.set(status, (this.extractionResults.get(status) ?? 0) + 1);
  }

  reset(): void {
    this.observations.splice(0, this.observations.length);
    this.documentIntegrityAlerts = 0;
    this.extractionResults.clear();
  }

  render(): string {
    const totalLines = [
      '# HELP http_requests_total Total HTTP requests.',
      '# TYPE http_requests_total counter',
    ];
    const durationLines = [
      '# HELP http_request_duration_ms HTTP request duration in milliseconds.',
      '# TYPE http_request_duration_ms histogram',
    ];
    const groups = new Map<string, Observation[]>();

    for (const observation of this.observations) {
      const key = `${observation.method}\t${observation.path}\t${observation.status}`;
      groups.set(key, [...(groups.get(key) ?? []), observation]);
    }

    for (const [key, observations] of [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const [method = 'UNKNOWN', path = 'unknown', status = '0'] = key.split('\t');
      const labels = `method="${labelValue(method)}",path="${labelValue(path)}",status="${labelValue(
        status,
      )}"`;
      totalLines.push(`http_requests_total{${labels}} ${observations.length}`);
      let cumulative = 0;
      for (const bucket of buckets) {
        cumulative = observations.filter((item) => item.durationMs <= bucket).length;
        durationLines.push(
          `http_request_duration_ms_bucket{${labels},le="${bucket}"} ${cumulative}`,
        );
      }
      durationLines.push(
        `http_request_duration_ms_bucket{${labels},le="+Inf"} ${observations.length}`,
      );
      durationLines.push(
        `http_request_duration_ms_sum{${labels}} ${observations
          .reduce((sum, item) => sum + item.durationMs, 0)
          .toFixed(3)}`,
      );
      durationLines.push(`http_request_duration_ms_count{${labels}} ${observations.length}`);
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

    return [...totalLines, ...durationLines, ...integrityLines, ...extractionLines, ''].join('\n');
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
