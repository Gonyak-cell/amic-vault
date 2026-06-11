import { Inject, Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/logger';

export interface ErrorTrackerContext {
  requestId: string | undefined;
  method: string | undefined;
  path: string | undefined;
}

export interface ErrorTracker {
  capture(error: unknown, context: ErrorTrackerContext): Promise<void> | void;
}

function stackFrom(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

@Injectable()
export class LogErrorTracker implements ErrorTracker {
  constructor(@Inject(StructuredLogger) private readonly logger: StructuredLogger) {}

  capture(error: unknown, context: ErrorTrackerContext): void {
    this.logger.error(
      {
        msg: 'unhandled_exception',
        requestId: context.requestId,
        method: context.method,
        path: context.path,
      },
      stackFrom(error),
      'ErrorTracker',
    );
  }
}
