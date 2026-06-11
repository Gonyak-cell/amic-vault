import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ERROR_CODES, type ApiErrorResponse, type ErrorCode } from '@amic-vault/shared';
import { LogErrorTracker } from '../errors/error-tracker';
import { currentRequestId } from '../logging/correlation.middleware';

interface ResponseLike {
  status(code: number): { json(body: ApiErrorResponse & { reason?: string }): void };
}

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function standardCode(value: unknown): ErrorCode | undefined {
  return typeof value === 'string' && ERROR_CODES.includes(value as ErrorCode)
    ? (value as ErrorCode)
    : undefined;
}

function codeFromStatus(status: number): ErrorCode {
  if (status === HttpStatus.UNAUTHORIZED) return 'AUTH_REQUIRED';
  if (status === HttpStatus.FORBIDDEN || status === HttpStatus.NOT_FOUND) {
    return 'PERMISSION_DENIED';
  }
  return 'VALIDATION_FAILED';
}

function reasonFromResponse(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.reason !== 'string') return undefined;
  return /^[A-Za-z0-9_:-]{1,80}$/.test(value.reason) ? value.reason : undefined;
}

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LogErrorTracker) private readonly errorTracker: LogErrorTracker) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ResponseLike>();
    const request = http.getRequest<RequestLike>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const responseCode = isRecord(exceptionResponse)
      ? standardCode(exceptionResponse.code)
      : undefined;
    const code = responseCode ?? codeFromStatus(status);
    const reason = reasonFromResponse(exceptionResponse);
    const requestId = currentRequestId();

    if (!(exception instanceof HttpException) || status >= 500) {
      void this.captureSafely(exception, {
        requestId,
        method: request.method,
        path: request.originalUrl ?? request.url,
      });
    }

    response.status(status).json({
      code,
      ...(requestId ? { requestId } : {}),
      ...(reason ? { reason } : {}),
    });
  }

  private async captureSafely(
    exception: unknown,
    context: {
      requestId: string | undefined;
      method: string | undefined;
      path: string | undefined;
    },
  ): Promise<void> {
    try {
      await this.errorTracker.capture(exception, context);
    } catch {
      // Error tracking must never break the user response path.
    }
  }
}
