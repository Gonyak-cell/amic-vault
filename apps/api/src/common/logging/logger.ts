import pino, { type DestinationStream } from 'pino';
import { Inject, Injectable, Optional, type LoggerService } from '@nestjs/common';
import { currentRequestId } from './correlation.middleware';

export const REDACTED = '[REDACTED]';
export const STRUCTURED_LOGGER_DESTINATION = Symbol('STRUCTURED_LOGGER_DESTINATION');

export const SENSITIVE_LOG_KEYS = [
  'authorization',
  'body',
  'content',
  'cookie',
  'password',
  'passwordHash',
  'password_hash',
  'raw',
  'sessionToken',
  'snippet',
  'text',
  'token',
] as const;

const sensitiveKeySet = new Set<string>(SENSITIVE_LOG_KEYS.map((key) => key.toLowerCase()));

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

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeySet.has(key.toLowerCase()) ? REDACTED : redactSensitive(item),
    ]),
  );
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
    const payload = redactSensitive({
      context: context ?? 'App',
      requestId: currentRequestId(),
      ...extra,
      ...(isRecord(message) ? message : { msg: String(message) }),
    }) as Record<string, unknown>;
    const msg = typeof payload.msg === 'string' ? payload.msg : 'event';

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
