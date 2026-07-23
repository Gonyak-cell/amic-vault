import { createHash } from 'node:crypto';
import pino, { type DestinationStream } from 'pino';
import { Inject, Injectable, Optional, type LoggerService } from '@nestjs/common';
import { currentRequestId } from './correlation.middleware';

export const REDACTED = '[REDACTED]';
export const STRUCTURED_LOGGER_DESTINATION = Symbol('STRUCTURED_LOGGER_DESTINATION');

export const SENSITIVE_LOG_KEYS = [
  'authorization',
  'body',
  'bodyText',
  'content',
  'contents',
  'cookie',
  'credential',
  'filename',
  'host',
  'ip',
  'normalizedFilename',
  'objectKey',
  'originalFilename',
  'password',
  'passwordHash',
  'password_hash',
  'path',
  'raw',
  'sessionToken',
  'secret',
  'snippet',
  'stack',
  'storageUri',
  'text',
  'token',
  'trace',
  'url',
] as const;

const sensitiveKeySet = new Set<string>(SENSITIVE_LOG_KEYS.map(normalizedKey));
const safeReferencePattern = /^ref:[a-f0-9]{16}$/u;
const rawUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const boundedScalarPattern = /^[A-Za-z0-9_.:+-]{1,160}$/u;
const boundedEventPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/u;
const canonicalInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const sensitiveValuePattern =
  /authorization|cookie|credential|password|private.?key|secret|session.?token|token/iu;
const identifierKeyPattern =
  /^(?:actor|client|correlation|document|email|event|file|fileobject|ingestionrequest|job|matter|node|queue|request|scan|session|target|tenant|user|version)(?:id|ids|ref|refs)$/u;

export interface CapturingLogWriter extends DestinationStream {
  lines: string[];
}

export function createCapturingLogWriter(): CapturingLogWriter {
  return {
    lines: [],
    write(line: string): void {
      this.lines.push(line.trim());
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedKey(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, '').toLowerCase();
}

function sensitiveKey(value: string): boolean {
  const normalized = normalizedKey(value);
  if (normalized === 'context') return false;
  return (
    sensitiveKeySet.has(normalized) ||
    /(?:authorization|cookie|credential|password|privatekey|secret|sessiontoken|token)$/u.test(
      normalized,
    ) ||
    /(?:body|bodytext|content|contents|filename|host|hostname|ip|ipaddress|objectkey|path|raw|snippet|stack|storageuri|text|trace|uri|url)$/u.test(
      normalized,
    )
  );
}

function identifierKey(value: string): boolean {
  const normalized = normalizedKey(value);
  return normalized === 'id' || normalized === 'nonce' || identifierKeyPattern.test(normalized);
}

export function safeReference(value: string): string {
  return `ref:${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)}`;
}

function sanitizedScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (safeReferencePattern.test(value)) return value;
  if (rawUuidPattern.test(value)) return safeReference(value.toLowerCase());
  if (canonicalInstantPattern.test(value)) return value;
  if (
    sensitiveValuePattern.test(value) ||
    value.length > 160 ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes('/') ||
    value.includes('\\') ||
    !boundedScalarPattern.test(value)
  ) {
    return REDACTED;
  }
  return value;
}

function hashedIdentifier(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => hashedIdentifier(item));
  if (typeof value === 'string') {
    return safeReferencePattern.test(value) ? value : safeReference(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return safeReference(String(value));
  if (value === null || value === undefined) return value;
  return REDACTED;
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (value instanceof Date) return value.toISOString();
  if (!isRecord(value)) {
    return sanitizedScalar(value);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (sensitiveKey(key)) return [key, REDACTED];
      if (identifierKey(key)) return [key, hashedIdentifier(item)];
      return [key, redactSensitive(item)];
    }),
  );
}

function boundedEventName(value: unknown): string {
  return typeof value === 'string' &&
    boundedEventPattern.test(value) &&
    !sensitiveValuePattern.test(value)
    ? value
    : 'LOG_EVENT';
}

function createPinoLogger(destination: DestinationStream) {
  return pino(
    {
      base: null,
      messageKey: 'msg',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    destination,
  );
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly logger: ReturnType<typeof createPinoLogger>;

  constructor(
    @Optional()
    @Inject(STRUCTURED_LOGGER_DESTINATION)
    destination?: DestinationStream,
  ) {
    this.logger = createPinoLogger(destination ?? process.stdout);
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace ? { trace } : undefined);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('trace', message, context);
  }

  private write(
    level: 'debug' | 'error' | 'info' | 'trace' | 'warn',
    message: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    const messageFields = isRecord(message) ? message : {};
    const eventName = boundedEventName(isRecord(message) ? (message.code ?? message.msg) : message);
    const requestId = currentRequestId();
    const payload = redactSensitive({
      context: boundedEventName(context ?? 'App'),
      ...(requestId ? { requestRef: safeReference(requestId) } : {}),
      ...extra,
      ...messageFields,
      msg: eventName,
    }) as Record<string, unknown>;
    const msg = typeof payload.msg === 'string' ? payload.msg : 'LOG_EVENT';

    switch (level) {
      case 'debug':
        this.logger.debug(payload, msg);
        break;
      case 'error':
        this.logger.error(payload, msg);
        break;
      case 'trace':
        this.logger.trace(payload, msg);
        break;
      case 'warn':
        this.logger.warn(payload, msg);
        break;
      case 'info':
        this.logger.info(payload, msg);
        break;
    }
  }
}
