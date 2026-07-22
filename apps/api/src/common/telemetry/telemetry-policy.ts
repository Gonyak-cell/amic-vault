export const TELEMETRY_ATTRIBUTE_KEYS = [
  'service',
  'operation',
  'route',
  'result',
  'error_class',
  'queue',
  'parser_state',
  'security_state',
  'http_method',
  'http_status',
  'duration_bucket',
  'retry_count',
  'worker_role',
  'code',
] as const;

export type TelemetryAttributeKey = (typeof TELEMETRY_ATTRIBUTE_KEYS)[number];
export type TelemetryAttributes = Readonly<Partial<Record<TelemetryAttributeKey, string | number>>>;

export const telemetryPolicy = {
  maxAttributes: 8,
  maxStringLength: 96,
  maxValuesPerKey: 64,
  errorClasses: [
    'AI_POLICY_BLOCKED',
    'AUTH_REQUIRED',
    'DEPENDENCY_UNAVAILABLE',
    'DOCUMENT_LOCKED',
    'ETHICAL_WALL_BLOCKED',
    'EXTERNAL_LINK_EXPIRED',
    'INTERNAL_ERROR',
    'PERMISSION_DENIED',
    'TENANT_ISOLATION_VIOLATION',
    'TIMEOUT',
    'UNSUPPORTED_FILE_TYPE',
    'VALIDATION_FAILED',
  ],
  queues: ['ai-prep', 'audit-anchor', 'extraction', 'indexing', 'ocr', 'retention-review'],
  parserStates: ['failed', 'parsed', 'pending', 'queued', 'rejected', 'retrying', 'skipped', 'started'],
  results: ['allowed', 'blocked', 'failed', 'partial', 'rejected', 'succeeded'],
  securityStates: ['allowed', 'blocked', 'clean', 'denied', 'infected', 'quarantined', 'unavailable'],
} as const;

const allowedKeySet = new Set<string>(TELEMETRY_ATTRIBUTE_KEYS);
const errorClassSet = new Set<string>(telemetryPolicy.errorClasses);
const queueSet = new Set<string>(telemetryPolicy.queues);
const parserStateSet = new Set<string>(telemetryPolicy.parserStates);
const resultSet = new Set<string>(telemetryPolicy.results);
const securityStateSet = new Set<string>(telemetryPolicy.securityStates);
const sensitiveIdentifierKeys = new Set([
  'authorization',
  'body',
  'content',
  'cookie',
  'document',
  'documentid',
  'email',
  'emailid',
  'file',
  'fileid',
  'filename',
  'matter',
  'matterid',
  'node',
  'nodeid',
  'password',
  'prompt',
  'query',
  'snippet',
  'sql',
  'storage',
  'storagekey',
  'storageuri',
  'tenant',
  'tenantid',
  'text',
  'token',
  'user',
  'userid',
  'version',
  'versionid',
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const opaqueTokenPattern = /(?:^|[._-])(?:eyJ[a-zA-Z0-9_-]{8,}|bearer|secret|token)(?:$|[._-])/iu;
const genericValuePattern = /^[A-Za-z0-9_.:-]+$/u;
const routePattern = /^\/(?:[a-z0-9-]+|:[a-z][a-z0-9_]*)?(?:\/(?:[a-z0-9-]+|:[a-z][a-z0-9_]*))*$/u;
const enumValuePattern = /^[a-z][a-z0-9_.-]*$/u;

export class TelemetryPolicyError extends Error {
  constructor(readonly code: string, readonly attribute?: string) {
    super(code);
  }
}

export function assertTelemetryAttributes(attributes: Record<string, unknown>): asserts attributes is TelemetryAttributes {
  const entries = Object.entries(attributes);
  if (entries.length > telemetryPolicy.maxAttributes) {
    throw new TelemetryPolicyError('TELEMETRY_ATTRIBUTE_LIMIT');
  }

  for (const [key, value] of entries) {
    if (!allowedKeySet.has(key) || isSensitiveIdentifierKey(key)) {
      throw new TelemetryPolicyError('TELEMETRY_ATTRIBUTE_FORBIDDEN', key);
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new TelemetryPolicyError('TELEMETRY_ATTRIBUTE_VALUE_INVALID', key);
    }
    const stringValue = String(value);
    if (
      stringValue.length === 0 ||
      stringValue.length > telemetryPolicy.maxStringLength ||
      uuidPattern.test(stringValue) ||
      opaqueTokenPattern.test(stringValue)
    ) {
      throw new TelemetryPolicyError('TELEMETRY_ATTRIBUTE_VALUE_FORBIDDEN', key);
    }
    assertBoundedValue(key as TelemetryAttributeKey, stringValue);
  }
}

function isSensitiveIdentifierKey(key: string): boolean {
  return sensitiveIdentifierKeys.has(key.replace(/[._-]/gu, '').toLowerCase());
}

export class TelemetryCardinalityBudget {
  private readonly valuesByKey = new Map<TelemetryAttributeKey, Set<string>>();

  record(attributes: Record<string, unknown>): void {
    assertTelemetryAttributes(attributes);
    for (const [key, value] of Object.entries(attributes) as [TelemetryAttributeKey, string | number][]) {
      const values = this.valuesByKey.get(key) ?? new Set<string>();
      values.add(String(value));
      this.valuesByKey.set(key, values);
      if (values.size > telemetryPolicy.maxValuesPerKey) {
        throw new TelemetryPolicyError('TELEMETRY_CARDINALITY_LIMIT', key);
      }
    }
  }
}

function assertBoundedValue(key: TelemetryAttributeKey, value: string): void {
  switch (key) {
    case 'route':
      if (
        !routePattern.test(value) ||
        value.includes('?') ||
        value.includes('//') ||
        value.split('/').some((segment) =>
          uuidPattern.test(segment) || /^[0-9]+$/u.test(segment) || /^[A-Za-z0-9_-]{20,}$/u.test(segment),
        )
      ) {
        throw new TelemetryPolicyError('TELEMETRY_ROUTE_TEMPLATE_REQUIRED', key);
      }
      return;
    case 'error_class':
      if (!errorClassSet.has(value)) throw new TelemetryPolicyError('TELEMETRY_ERROR_CLASS_INVALID', key);
      return;
    case 'queue':
      if (!queueSet.has(value)) throw new TelemetryPolicyError('TELEMETRY_QUEUE_INVALID', key);
      return;
    case 'parser_state':
      if (!parserStateSet.has(value)) throw new TelemetryPolicyError('TELEMETRY_PARSER_STATE_INVALID', key);
      return;
    case 'result':
      if (!resultSet.has(value)) throw new TelemetryPolicyError('TELEMETRY_RESULT_INVALID', key);
      return;
    case 'security_state':
      if (!securityStateSet.has(value)) throw new TelemetryPolicyError('TELEMETRY_SECURITY_STATE_INVALID', key);
      return;
    case 'http_method':
      if (!/^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/u.test(value)) {
        throw new TelemetryPolicyError('TELEMETRY_HTTP_METHOD_INVALID', key);
      }
      return;
    case 'http_status':
      if (!/^[1-5][0-9]{2}$/u.test(value)) throw new TelemetryPolicyError('TELEMETRY_HTTP_STATUS_INVALID', key);
      return;
    case 'retry_count':
      if (!/^(?:0|[1-9][0-9]?)$/u.test(value)) throw new TelemetryPolicyError('TELEMETRY_RETRY_COUNT_INVALID', key);
      return;
    default:
      if (!genericValuePattern.test(value) || !enumValuePattern.test(value)) {
        throw new TelemetryPolicyError('TELEMETRY_ATTRIBUTE_VALUE_INVALID', key);
      }
  }
}
